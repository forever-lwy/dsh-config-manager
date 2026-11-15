const SESSION_PROJCACHE = 'storages/session_projcache.json';
const WORKSPACE_STORE = 'storages/workspace.json';
/**
 * **逐会话**投影存储目录（`storages/session_projcache/sessions/<会话目录名>.json`）。
 *
 * 与 `session_projcache.json` 的关系：那个是**会淘汰的近期聚合**（本机实测只覆盖 445/1347 条会话），
 * 这个目录才是 DSH 为**每条会话**留下的投影（本机 1349 份，其中 1150 份带标题）。只读聚合缓存会让
 * 其余会话在选择器 / 体检列表里退化成 uuid 目录名 —— 用户认不出哪条是哪条。
 */
const SESSION_PROJECTION_DIR = 'storages/session_projcache/sessions';
// projectKeyOf 已下移到**零依赖**模块 `session-select.ts`（客户端勾选联动要按 cwd 目录键认领工作区，
// 而本模块会用 Buffer 读 DSH 存储缓存，不能进浏览器 bundle）。这里 re-export，既有导入路径逐字不变。
import { projectKeyOf, sessionIdKey } from './session-select.js';
export { projectKeyOf };
/** 空索引（读不到任何缓存时的安全返回值）。 */
export function emptySessionMeta() {
    return { bySessionId: new Map(), workspaceTitleByProjectKey: new Map(), workspacePathByProjectKey: new Map() };
}
/** 读 JSON（失败 → null；不抛错）。 */
async function readJsonSafe(ctx, rel) {
    try {
        const text = Buffer.from(await ctx.fs.readFile(rel)).toString('utf8');
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
function asRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
/**
 * 进程内索引缓存。
 *
 * 为什么需要：一次交互里 `/export-preview`（sessions 分区有单元时）与 `/plan` 会各调一次
 * `readSessionMeta`，每次都要读 + 解析 1.57 MB 的 `session_projcache.json`（本机实测 7.3 ms/次）
 * 与 workspace.json，而这两份缓存在一次交互里不会变。
 *
 * 失效判据 = **两个存储文件各自的 mtime**；任一读不到（宿主未实现 `mtimeMs` / 文件缺失）
 * 就**完全不缓存** —— 宁可多读一次，也绝不拿陈旧索引去猜用户的会话归属。
 * 键含 `homeDir`（同进程可能服务多份 home）。
 */
const metaCache = new Map();
/**
 * 逐会话投影文件的**进程内缓存**（键含 homeDir + 相对路径，失效判据 = 该文件 mtime）。
 *
 * 为什么需要：导出选择器一次要补上千条会话的标题，而同一批会话在一次交互里会被反复查询
 * （打开选择器 → 勾选 → 会话↔工作区联动补跑）。每次重读 1300 个小文件会把「打开弹窗」拖成秒级。
 * 与 `metaCache` 同一条纪律：**读不到 mtime 就不缓存**（宁可贵一点，也绝不拿陈旧标题骗用户）。
 */
const projectionCache = new Map();
/** 清空索引与逐会话投影缓存（测试用；宿主在收到「DSH 存储已重载」信号时也可调用）。 */
export function clearSessionMetaCache() {
    metaCache.clear();
    projectionCache.clear();
}
/** 文件 mtime（毫秒；门面未实现 / 读不到 → null = 无法判定新鲜度，调用方不得缓存）。 */
async function mtimeOf(ctx, rel) {
    if (ctx.fs.mtimeMs === undefined)
        return null;
    try {
        return (await ctx.fs.mtimeMs(rel)) ?? null;
    }
    catch {
        return null;
    }
}
/**
 * 读取会话标题与工作区注册表（带 mtime 失效的进程内缓存，见 `metaCache`）。
 *
 * 语义与无缓存版**逐字相同**：任何一步失败都只让对应部分退化，绝不抛错。
 * 返回的索引视为**只读**（调用方 `applySessionMeta*` 不改它）——缓存会把同一份 Map 再发出去。
 */
export async function readSessionMeta(ctx) {
    const cacheId = `${ctx.homeDir}\u0000${SESSION_PROJCACHE}\u0000${WORKSPACE_STORE}`;
    const projMtime = await mtimeOf(ctx, SESSION_PROJCACHE);
    const wsMtime = await mtimeOf(ctx, WORKSPACE_STORE);
    const stamp = projMtime === null || wsMtime === null ? null : `${projMtime}|${wsMtime}`;
    if (stamp !== null) {
        const hit = metaCache.get(cacheId);
        if (hit !== undefined && hit.key === stamp)
            return hit.index;
    }
    const index = await loadSessionMeta(ctx);
    if (stamp === null)
        metaCache.delete(cacheId);
    else
        metaCache.set(cacheId, { key: stamp, index });
    return index;
}
/** 无缓存实现（`readSessionMeta` 的实体）。 */
async function loadSessionMeta(ctx) {
    const index = emptySessionMeta();
    const cache = asRecord(await readJsonSafe(ctx, SESSION_PROJCACHE));
    const sessions = asRecord(asRecord(cache?.['tables'])?.['sessions']);
    for (const [key, raw] of Object.entries(sessions ?? {})) {
        const entry = asRecord(raw);
        const identity = asRecord(entry?.['identity']);
        const rows = asRecord(entry?.['rows']);
        const title = asRecord(rows?.['title'])?.['val'];
        const listMeta = asRecord(asRecord(rows?.['sessionListMetadata'])?.['val']);
        const lastPromptAt = listMeta?.['lastPromptAt'];
        const createdAt = identity?.['createdAt'];
        const cwd = identity?.['cwd'];
        const meta = {};
        if (typeof title === 'string' && title.trim() !== '')
            meta.title = title.trim();
        if (typeof cwd === 'string' && cwd !== '')
            meta.cwd = cwd;
        const at = typeof lastPromptAt === 'number' ? lastPromptAt : (typeof createdAt === 'number' ? createdAt : undefined);
        if (at !== undefined)
            meta.lastActivityAt = at;
        if (listMeta?.['blank'] === true)
            meta.blank = true;
        // 键有 `session-<uuid>` 与裸 `<uuid>` 两种形态（实测同一台机器上都存在），统一去前缀存
        index.bySessionId.set(key.replace(/^session-/, ''), meta);
    }
    const store = asRecord(await readJsonSafe(ctx, WORKSPACE_STORE));
    const workspaces = asRecord(asRecord(store?.['tables'])?.['workspaces']);
    for (const raw of Object.values(workspaces ?? {})) {
        const rec = asRecord(raw);
        const path = rec?.['path'];
        const title = rec?.['title'];
        if (typeof path !== 'string' || path === '')
            continue;
        const key = projectKeyOf(path);
        if (typeof title === 'string' && title.trim() !== '')
            index.workspaceTitleByProjectKey.set(key, title.trim());
        index.workspacePathByProjectKey.set(key, path);
    }
    return index;
}
/**
 * 会话单元 id（`sessions:<项目键>/<目录名>`）或裸目录名 → **归一化裸键**（`sessionIdKey`）。
 *
 * 为什么要有：调用方手上是单元 id / 计划项 id（末段才是目录名），而索引与投影文件都按**裸键**存。
 */
export function sessionBareKeyOf(ref) {
    const slash = ref.lastIndexOf('/');
    return sessionIdKey(slash >= 0 ? ref.slice(slash + 1) : ref);
}
/** 逐会话投影文件的候选名（DSH 实测两种目录名形态并存：`session-<uuid>.json` 与 `<uuid>.json`）。 */
function projectionFileNames(bare) {
    return ['session-' + bare + '.json', bare + '.json'];
}
/**
 * 读一条会话的**逐会话投影文件**（`storages/session_projcache/sessions/<会话目录名>.json`）。
 *
 * 形状与聚合缓存略有差异：文件里是 `{ version, record: { identity, rows } }`，聚合里是 `{ identity, rows }`
 * —— 两种都认（`record` 缺省即顶层）。**只读、尽力而为、绝不抛错**：读不到 / 形状不认 → undefined。
 */
async function readProjectedSession(ctx, bare) {
    for (const name of projectionFileNames(bare)) {
        const rel = SESSION_PROJECTION_DIR + '/' + name;
        const cacheId = ctx.homeDir + '\u0000' + rel;
        const mtime = await mtimeOf(ctx, rel);
        if (mtime !== null) {
            const hit = projectionCache.get(cacheId);
            if (hit !== undefined && hit.key === String(mtime))
                return hit.facts;
        }
        let facts;
        const raw = asRecord(await readJsonSafe(ctx, rel));
        if (raw !== null) {
            const rec = asRecord(raw['record']) ?? raw;
            const rows = asRecord(rec['rows']);
            const title = asRecord(rows?.['title'])?.['val'];
            const listMeta = asRecord(asRecord(rows?.['sessionListMetadata'])?.['val']);
            const out = {};
            if (typeof title === 'string' && title.trim() !== '')
                out.title = title.trim();
            if (listMeta?.['blank'] === true)
                out.blank = true;
            facts = out;
        }
        if (mtime === null)
            projectionCache.delete(cacheId);
        else
            projectionCache.set(cacheId, { key: String(mtime), facts });
        if (facts !== undefined)
            return facts;
    }
    return undefined;
}
/** 一次并发读多少份投影文件（小文件；32 路实测把 1300 条压到百毫秒级）。 */
const PROJECTION_CONCURRENCY = 32;
/**
 * 「界面标题」的**全量**解析：聚合缓存优先，缺的按需读**逐会话投影文件**。
 *
 * 用户要求（2026-10-12）：「历史对话的文本**始终**用对话标题，而不是只取缓存里的标题」。
 * 只读聚合缓存（`session_projcache.json`）时，本机 1347 条会话里有 902 条拿不到标题 → 界面退化成
 * `session-<uuid>`，用户在同屏十几条里认不出哪条是自己的对话。
 *
 * 成本：只读「聚合缓存里没有标题」的那些（本机约 900 条小文件；实测全量顺序读 1349 份 = 361 ms），
 * 32 路并发 + mtime 缓存 —— 同一批会话重复查询（打开选择器 / 勾选 / 联动补跑）不再重复读盘。
 *
 * 语义：**只增不改** —— 已缓存的标题与 blank 一律保留；实在读不到的会话原样返回（界面回落目录名）。
 *
 * @param refs 会话单元 id（`sessions:<项目键>/<目录名>`）或裸目录名，混着传也行
 */
export async function readSessionMetaWithTitles(ctx, refs) {
    const index = await readSessionMeta(ctx);
    const need = [...new Set(refs.map((ref) => sessionBareKeyOf(ref)).filter((bare) => bare !== ''))]
        .filter((bare) => index.bySessionId.get(bare)?.title === undefined);
    if (need.length === 0)
        return index;
    const bySessionId = new Map(index.bySessionId);
    for (let i = 0; i < need.length; i += PROJECTION_CONCURRENCY) {
        const chunk = need.slice(i, i + PROJECTION_CONCURRENCY);
        const found = await Promise.all(chunk.map(async (bare) => [bare, await readProjectedSession(ctx, bare)]));
        for (const [bare, facts] of found) {
            if (facts === undefined)
                continue;
            const existing = bySessionId.get(bare) ?? {};
            bySessionId.set(bare, {
                ...existing,
                ...(facts.title !== undefined ? { title: facts.title } : {}),
                ...(facts.blank !== undefined ? { blank: facts.blank } : {}),
            });
        }
    }
    return { ...index, bySessionId };
}
/** 单元 id（`sessions:<项目键>/<会话目录名>`）→ 会话目录名；形状不符 → null。 */
function sessionIdOfUnit(sectionId, unitId) {
    const prefix = sectionId + ':';
    if (!unitId.startsWith(prefix))
        return null;
    const rest = unitId.slice(prefix.length);
    const slash = rest.lastIndexOf('/');
    if (slash <= 0 || slash === rest.length - 1)
        return null;
    return { projectKey: rest.slice(0, slash), sessionId: rest.slice(slash + 1) };
}
/**
 * 给 **导入计划项**（sessions 分区）补上「界面标题 + 工作区分组」。
 *
 * 与 `applySessionMeta` 的区别：导出侧富化 `ExportUnit`，导入侧富化 `PlanItem`；两者共用同一份
 * 索引与同一套 id 形状（`sessions:<项目键>/<会话目录名>`），所以标题口径完全一致（用户实测：
 * 导入页此前只显示会话**目录名**，因为计划项没有展示名可用）。
 *
 * 只写 `label`/`group`（纯展示字段），**不碰** id/kind/target —— 勾选与执行契约不受影响；
 * 缓存里没有标题的会话保持 `label` 缺省（UI 回退显示目录名，不编造）。
 */
export function applySessionMetaToPlanItems(items, index, sectionId = 'sessions') {
    return items.map((item) => {
        if (item.adapter !== sectionId)
            return item;
        const parsed = sessionIdOfUnit(sectionId, item.unitId ?? item.id);
        if (parsed === null)
            return item;
        // 索引键 = **去掉 `session-` 前缀**的裸键，而单元 id 末段是**目录名**（两种形态并存）→ 必须先归一化，
        // 否则 `session-<uuid>` 形态的会话永远拿不到标题（真机实测：同一项目 731 个会话目录里 164 个是这种形态）。
        const meta = index.bySessionId.get(sessionIdKey(parsed.sessionId));
        const group = index.workspaceTitleByProjectKey.get(parsed.projectKey) ?? parsed.projectKey;
        return {
            ...item,
            ...(meta?.title !== undefined ? { label: meta.title } : {}),
            // 空白会话（从未提问）：DSH 自己显示「新会话」而不是 uuid；标记随计划项下发，由界面本地化
            ...(meta?.blank === true ? { blank: true } : {}),
            group,
        };
    });
}
/**
 * 「子代理会话 → 父对话」映射（**裸键**）：DSH 会话存储的父子关系 → `Map<子会话裸键, 父对话裸键>`。
 *
 * 只收 `subagent === true` 的会话 —— origin 非 subagent 的会话即使带 parentSession 也是**顶层行**
 * （DSH 工作区列表口径，与 `SessionsAdapter.coupleSessionParents` 完全一致）；非法形状一律忽略。
 */
export function subagentParentMap(relations) {
    const out = new Map();
    if (relations === undefined)
        return out;
    for (const [childId, relation] of relations) {
        if (!relation.subagent)
            continue;
        const parent = sessionIdKey(relation.parent);
        const child = sessionIdKey(childId);
        if (parent === '' || child === '')
            continue;
        out.set(child, parent);
    }
    return out;
}
/**
 * 给 sessions 单元标出「父对话」（纯联动/展示字段，不动 id/kind/target）：只有子代理会话会有值。
 *
 * 用途：导出选择器的「父 ↔ 子会话」勾选联动（勾父自动勾上它的子代理会话、勾子自动带上父）。
 * 非 sessions 分区 / 形状不符 / 映射里查不到 → 原样返回（**不猜**：宁可不联动，也不凭 id 编关系）。
 */
export function applySessionParentLinks(units, parentOf, sectionId = 'sessions') {
    if (parentOf === undefined || parentOf.size === 0)
        return [...units];
    return units.map((unit) => {
        const parsed = sessionIdOfUnit(sectionId, unit.id);
        if (parsed === null)
            return unit;
        const parent = parentOf.get(sessionIdKey(parsed.sessionId));
        return parent === undefined ? unit : { ...unit, parentSessionId: parent };
    });
}
/**
 * 给**会话体检行**补上「界面标题」（行上的 `sessionId` = 会话目录名，索引键是裸键 → 查表前必须归一化）。
 *
 * 为什么需要：体检列表此前只显示目录名（`session-20d2722c-…`），用户在同一屏十几条里认不出哪条是自己的
 * 对话（2026-10-12 用户反馈截图实证）。标题的唯一可靠来源就是 DSH 自己的会话缓存
 * （`storages/session_projcache.json` 的 `rows.title.val`）—— 与导出选择器**同一份索引、同一套
 * `sessionIdKey` 归一化口径**，绝不另写一套查表规则。
 *
 * 只读、纯函数、**绝不编造**：索引里没有这条会话 / 没有标题 → 原样返回（界面回落显示目录名）。
 * 索引本身由 `readSessionMetaWithTitles()` 产出（聚合缓存 + **逐会话投影文件**兜底，见那里）。
 */
export function applySessionTitles(rows, index) {
    return rows.map((row) => {
        // 会话 id 缺失 / 空串的记录**一个字段都不加**（回滚台账里有这类历史记录：绝不猜它属于哪条对话）
        if (typeof row.sessionId !== 'string' || row.sessionId === '')
            return row;
        const meta = index.bySessionId.get(sessionIdKey(row.sessionId));
        if (meta === undefined)
            return row;
        return {
            ...row,
            ...(meta.title !== undefined ? { title: meta.title } : {}),
            // 空白会话（从未提问）：没有标题，界面据此显示本地化的「新会话」（与 DSH 的 session.new 同口径）
            ...(meta.blank === true ? { blank: true } : {}),
        };
    });
}
/**
 * 给 sessions 分区的单元补上「界面标题 + 工作区分组」，并按「工作区 → 最近在前」排序。
 *
 * - `label`：会话标题（缓存里没有 → 退回会话目录名，绝不编造）；
 * - `detail`：工作区绝对路径（未知 → 不回填）；
 * - `group`：工作区标题（未知 → 用项目键兜底，保证每个会话都有归属，不出现「未归类」坟场）；
 * - 其它分区的单元原样返回（ids 不变 —— 勾选/导出契约只认 id）。
 *
 * @param activityAt 会话**裸键**（`sessionIdKey`）→ 最近活跃时间（毫秒），由宿主在预览期用会话日志
 *   文件 mtime 现算（`ConfigAdapter.unitActivityTimes`）。为什么必须有这条兜底：元数据缓存
 *   （`storages/session_projcache.json`）只覆盖**一部分**会话（真机实测：同一项目 731 个会话目录里
 *   347 个不在缓存内），只用缓存时间会让这些会话全部落到组尾、退化成按 uuid 字典序排 ——
 *   用户看到的就是「历史对话没有按最新到最旧排序」。缓存里有精确的 lastPromptAt 时仍以它为第一口径。
 */
export function applySessionMeta(units, index, sectionId = 'sessions', activityAt) {
    const enriched = units.map((unit) => {
        const parsed = sessionIdOfUnit(sectionId, unit.id);
        if (parsed === null)
            return unit;
        // 同 applySessionMetaToPlanItems：索引键是裸键，单元 id 末段是目录名 → 查表前必须归一化
        const meta = index.bySessionId.get(sessionIdKey(parsed.sessionId));
        const workspaceTitle = index.workspaceTitleByProjectKey.get(parsed.projectKey);
        const workspacePath = index.workspacePathByProjectKey.get(parsed.projectKey);
        const detail = workspacePath ?? meta?.cwd ?? unit.detail;
        return {
            ...unit,
            label: meta?.title ?? unit.label,
            ...(detail !== undefined ? { detail } : {}),
            group: workspaceTitle ?? parsed.projectKey,
            // 空白会话（从未提问）：没有标题可显示，标记出来让界面显示本地化的「新会话」（与 DSH 同口径）
            ...(meta?.blank === true ? { blank: true } : {}),
        };
    });
    // 排序：先按工作区（保持首次出现顺序），组内最近活跃的在前；无时间的排在组内末尾。
    const groupOrder = new Map();
    for (const unit of enriched) {
        const g = unit.group;
        if (g !== undefined && !groupOrder.has(g))
            groupOrder.set(g, groupOrder.size);
    }
    const atOf = (unit) => {
        const parsed = sessionIdOfUnit(sectionId, unit.id);
        if (parsed === null)
            return -1;
        const bare = sessionIdKey(parsed.sessionId);
        // 第一口径 = 元数据缓存的「最后一次提问时间」；缓存里没有这条会话 → 退回宿主现算的日志 mtime
        return index.bySessionId.get(bare)?.lastActivityAt ?? activityAt?.get(bare) ?? -1;
    };
    return enriched.sort((a, b) => {
        const ga = a.group !== undefined ? (groupOrder.get(a.group) ?? 0) : -1;
        const gb = b.group !== undefined ? (groupOrder.get(b.group) ?? 0) : -1;
        if (ga !== gb)
            return ga - gb;
        const diff = atOf(b) - atOf(a);
        return diff !== 0 ? diff : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
}
//# sourceMappingURL=session-meta.js.map