import { isBundlesOnlyEntry } from '../core/plugin-cli.js';
import { mergeKeyedList } from './merge-keyed.js';
import { patchIdentityContext, patchLineIdentity } from './patch-line-identity.js';
import { mergeJsonValues } from './text-merge.js';
function byName(list) {
    const map = new Map();
    for (const p of list ?? []) {
        if (p !== null && typeof p === 'object' && typeof p.name === 'string' && p.name !== '')
            map.set(p.name, p);
    }
    return map;
}
/** 判定「该不该删」。调用方只在 `applied` 含 plugins 时才真正执行。 */
export function planPluginRemovals(input) {
    const plan = { removals: [], conflicts: [], kept: [] };
    if (input.ancestor === undefined)
        return plan; // 没有祖先：无删除语义（无法区分「对方删了」与「本机独有」）
    const remote = byName(input.remote);
    const local = byName(input.local);
    for (const a of input.ancestor) {
        const name = a.name;
        if (typeof name !== 'string' || name === '')
            continue;
        if (remote.has(name)) {
            plan.kept.push({ name, reason: 'still-in-remote' });
            continue;
        }
        if (input.selfName !== undefined && name === input.selfName) {
            plan.kept.push({ name, reason: 'self' });
            continue;
        }
        const l = local.get(name);
        if (isBundlesOnlyEntry(a) || (l !== undefined && isBundlesOnlyEntry(l))) {
            plan.kept.push({ name, reason: 'bundles-only' });
            continue;
        }
        if (l === undefined) {
            plan.kept.push({ name, reason: 'not-installed' });
            continue;
        }
        if (!input.enabled) {
            plan.kept.push({ name, reason: 'switch-off' });
            continue;
        }
        if (l.version !== a.version) {
            plan.conflicts.push({ name, reason: 'version-changed', ancestorVersion: a.version, localVersion: l.version });
            continue;
        }
        plan.removals.push({ name, version: a.version, ...(a.spec === undefined ? {} : { spec: a.spec }) });
    }
    return plan;
}
/* --------------------------------------------------------------- 分区级三方合并 */
/** 形状闸门：不认识就交回通用路径（畸形数据由通用路径拒绝，这里不另造一套判定）。 */
function asPlugins(data) {
    if (data === null || typeof data !== 'object')
        return undefined;
    const obj = data;
    if (obj.version !== 1 || !Array.isArray(obj.plugins))
        return undefined;
    return data;
}
/** 决定「同一个插件是否还是同一个东西」的身份字段（version + 来源 spec + bundlesOnly 形态）。 */
function entryKey(e) {
    return [e.version ?? '', e.spec ?? '', e.bundlesOnly === true ? '1' : '0'].join('\u0000');
}
/** patch 行的键分隔符：file 与 lineId 各自可能含任意字符，用 NUL 才不会撞键。 */
const PATCH_KEY_SEP = '\u0000';
/** patch 行的身份键 = file + lineId（同一文件里 lineId 才是行身份；issue #145）。 */
function patchLineKey(line) {
    return [line.file ?? '', line.lineId ?? ''].join(PATCH_KEY_SEP);
}
/** 本地 tarball 的身份（同包名 = 同一条目；内容变了才算改过）。 */
function tarballIdentity(t) {
    return JSON.stringify({ version: t.version ?? '', relativePath: t.relativePath ?? '', base64: t.base64 ?? '' });
}
/** patch 文件的身份（同相对路径 = 同一条目）。 */
function patchFileIdentity(f) {
    return JSON.stringify({ relativePath: f.relativePath ?? '', base64: f.base64 ?? '' });
}
/**
 * plugins 分区的按键三方合并（`merge.ts` 的 `GRANULAR_MERGES.plugins`）。
 *
 * 逐条规则见 `merge-keyed.ts`；本函数只负责「四条有序集合各用什么键与身份」以及
 * `pnpmWorkspace` 原文的三方（两侧都改且不同 → overlap 交人工，与通用 JSON 合并同口径）。
 *
 * 形状不认识（`version !== 1` 或缺 plugins 数组）时返回 `undefined`：畸形数据交回通用路径的
 * 形状闸门，这里不另造第二套拒绝逻辑。
 */
export function mergePluginsSection(local, remote, ancestor, hooks = {}) {
    const l = asPlugins(local);
    const r = asPlugins(remote);
    if (l === undefined || r === undefined)
        return undefined;
    const a = ancestor === undefined ? undefined : asPlugins(ancestor);
    if (ancestor !== undefined && a === undefined)
        return undefined;
    // 开关只决定「远端删了要不要真删」，不再决定钩子是否介入（issue #145 解耦）。
    const followDelete = hooks.deletePlugins === true;
    const selfName = hooks.selfPluginName ?? '';
    const plugins = mergeKeyedList({
        local: l.plugins,
        remote: r.plugins,
        ancestor: a?.plugins,
        spec: {
            keyOf: (p) => (typeof p.name === 'string' ? p.name : ''),
            identityOf: (p) => entryKey(p),
            pathOf: (name) => `plugins.${name}`,
            followDelete,
            // 自身条目永不删、永不报冲突：删了等于把正在跑的宿主插件卸掉。
            keepLocal: (p) => selfName !== '' && p.name === selfName,
            // 版本/来源听远端（本机没改过它才走这条分支），启停是本机 UI 态 —— 恒留本机，
            // 否则远端升一次版本就把用户在本机关掉的插件改回启用（复审 P0-2）。
            compose: (local, remote) => ({ ...remote, enabled: local.enabled }),
        },
    });
    const patch = mergeKeyedList({
        local: l.patch ?? [],
        remote: r.patch ?? [],
        ancestor: a?.patch,
        spec: {
            keyOf: patchLineKey,
            // 身份按三侧 redactedPaths 并集归一化：本机被剥空、远端明文的同一行算「没改过」（门②）。
            // 并集路径每键只解析一次（上下文），三侧各自比较时复用 —— 行多时不再逐次重解析。
            identityContextOf: (peers) => patchIdentityContext(peers),
            identityOf: (line, peers, context) => patchLineIdentity(line, peers, context),
            // 冲突路径带 lineId：同一文件里两行各自冲突时必须能分辨（复审 P2）。
            pathOf: (key) => {
                const [file = '', lineId = ''] = key.split(PATCH_KEY_SEP);
                return `patch.${file}#${lineId}`;
            },
            // 外壳列表**不跟随删除**：deletePlugins 的语义是「远端删了插件」，不是「远端删了 MCP 配置」
            // —— 跟着删会把本机还在用的 patch 行 / tarball 一起丢掉（复审 P1-1）。
            followDelete: false,
        },
    });
    const tarballs = mergeKeyedList({
        local: l.localTarballs ?? [],
        remote: r.localTarballs ?? [],
        ancestor: a?.localTarballs,
        spec: {
            keyOf: (t) => (typeof t.packageName === 'string' ? t.packageName : ''),
            identityOf: (t) => tarballIdentity(t),
            pathOf: (key) => `localTarballs.${key}`,
            followDelete: false, // 同上：开关只管插件清单（复审 P1-1）
        },
    });
    const files = mergeKeyedList({
        local: l.patchFiles ?? [],
        remote: r.patchFiles ?? [],
        ancestor: a?.patchFiles,
        spec: {
            keyOf: (f) => (typeof f.relativePath === 'string' ? f.relativePath : ''),
            identityOf: (f) => patchFileIdentity(f),
            pathOf: (key) => `patchFiles.${key}`,
            followDelete: false, // 同上：开关只管插件清单（复审 P1-1）
        },
    });
    // 形状不支持按键合并（同键重复 / 非对象条目 / 无身份键）：交回通用路径，
    // 绝不在这里「留一条丢一条」（复审 P1-2）。
    if (plugins.malformed || patch.malformed || tarballs.malformed || files.malformed)
        return undefined;
    const conflicts = [
        ...plugins.conflicts,
        ...patch.conflicts,
        ...tarballs.conflicts,
        ...files.conflicts,
    ];
    let mergePoints = plugins.mergePoints + patch.mergePoints + tarballs.mergePoints + files.mergePoints;
    // pnpm-workspace 原文：标量/对象三方。两侧都改且不同 → overlap（不猜用哪一份）。
    // null 与「没有这个键」在语义上是同一件事（adapter 没有 patch 组时导出 null），
    // 但三方合并之后必须按**原始形态**写回：本机原本带这个键就继续写 null，不能抹成缺键（复审 P0-1）。
    const wsCarried = 'pnpmWorkspace' in l || 'pnpmWorkspace' in r;
    const wsLocal = l.pnpmWorkspace ?? null;
    const wsRemote = r.pnpmWorkspace ?? null;
    const wsAncestor = a?.pnpmWorkspace ?? null;
    const ws = mergeJsonValues(wsAncestor, wsLocal, wsRemote, 'pnpmWorkspace');
    const wsMerged = ws.ok ? ws.merged : undefined;
    if (!ws.ok) {
        for (const _ of ws.conflicts) {
            conflicts.push({
                path: 'pnpmWorkspace',
                kind: 'key',
                reason: 'overlap',
                autoMergeAttempted: true,
                local: wsLocal ?? null,
                remote: wsRemote ?? null,
                ancestor: wsAncestor ?? null,
            });
        }
    }
    else if (wsMerged !== wsLocal) {
        mergePoints += 1;
    }
    if (conflicts.length > 0)
        return { merged: l, conflicts, mergePoints };
    // 以远端为底再盖本机：远端独有的未知/将来字段被采纳，而不是被本机形状悄悄吞掉（复审 P2）。
    const next = { ...r, ...l };
    next.plugins = plugins.merged;
    next.patch = patch.merged;
    // 可选字段只在「本机或合并结果里确实有」时写回：不擅自在载荷里新增空字段。
    if (l.localTarballs !== undefined || tarballs.merged.length > 0)
        next.localTarballs = tarballs.merged;
    else
        delete next.localTarballs;
    if (l.patchFiles !== undefined || files.merged.length > 0)
        next.patchFiles = files.merged;
    else
        delete next.patchFiles;
    // 只有「两侧都没带这个键、合并也没产出值」才删键；否则原样写回（含 null）。
    // 把 null 抹成缺键会让合并结果与两侧都不等 ⇒ 每轮都判「已合并」，永不收敛（复审 P0-1）。
    if (wsMerged === undefined || (wsMerged === null && !wsCarried))
        delete next.pnpmWorkspace;
    else
        next.pnpmWorkspace = wsMerged;
    return { merged: next, conflicts: [], mergePoints };
}
//# sourceMappingURL=plugin-removals.js.map