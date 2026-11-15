/**
 * m-sync-selection：远程同步分区选择持久化（sync-selection.json）。
 *
 * 与 sync-config.json / sync-autosync.json 并列独立文件：语义清楚、schema 演进独立。
 * schemaVersion:2 —— 按同步通道拆分（git / webdav 各自独立的模式与分区勾选）：
 * ```
 * { "schemaVersion": 2,
 *   "channels": {
 *     "git":    { mode: 'default'|'advanced', sections: SectionId[], sessionsLimit, encrypt, includeSecrets },
 *     "webdav": { ... } } }
 * ```
 * - mode='default'（快速导出）：推送/自动同步使用全部 portable 推荐分区（sections 可空）；
 * - mode='advanced'（自定义导出）：推送/自动同步只处理勾选的 sections（非 portable 由
 *   SyncEngine portableAdapters 过滤兜底；空 sections 回退全量，避免自动同步卡死）。
 * v1（顶层单通道）→ 读取时归一为 v2 的 git 通道（webdav 回退缺省）。
 *
 * 原子写（临时文件 + rename），损坏/不支持 schema 回退缺省（mode='default', sections=[]）。
 * 持久化原因：自动同步调度器运行于 Host 进程（浏览器关闭也在跑），必须从磁盘读
 * 用户选择，而不是依赖浏览器 localStorage。
 */
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AUTO_SYNC_OPT_IN_SECTION_IDS, OPT_IN_SYNC_SECTION_IDS } from '../schema/section-registry.js';
import { channelMap } from './sync-config.js';
import { parseJsonSafe, stringifyJsonSafe } from '../utils/json.js';
import { atomicWriteFile } from '../utils/atomic-write.js';
export const SYNC_SELECTION_FILE = 'sync-selection.json';
export const SYNC_SELECTION_SCHEMA_VERSION = 2;
/**
 * 显式勾选才允许进入同步通道的「可选分区」。
 *
 * **单一事实源 = 分区注册表**（\`SectionMeta.syncOptIn !== 'off'\`）。本文件此前手写
 * \`['sessions']\`，与 \`section-registry.ts\` 的同名字段是**两份字面量、零护栏**
 * （改一处漏一处不会报错）—— issue #78 收敛为派生视图，并在测试里钉住。
 *
 * 当前 = mcp（'auto'，命令 / 路径可能机器相关）
 *      + workspaces（'manual'，路径与机器绑定，但会话要显示在工作区里就必须随行）
 *      + sessions（'manual'，内容敏感 + 设备相关）。
 * 凭据 / 密钥分区不在此列（结构性拒绝，永不进同步）。
 */
export const OPT_IN_SYNC_SECTIONS = OPT_IN_SYNC_SECTION_IDS;
/**
 * 「可选分区」里**允许参与自动同步**的子集（当前 = mcp）。
 *
 * 手动与自动的差别只在这里：sessions 是内容隐私 / 设备相关、workspaces 与本机路径绑定，
 * 两者自动同步绝不带（「会话绝不悄悄下行」从注释变成可测断言）；mcp 只是命令 / 路径可能与
 * 目标机不同，用户显式勾选后手动与自动都带。
 */
export const AUTO_SYNC_OPT_IN_SECTIONS = AUTO_SYNC_OPT_IN_SECTION_IDS;
/** sessions 分区默认同步「最新 N 个会话」（用户可在弹窗里改；0 = 不带）。 */
export const DEFAULT_SYNC_SESSIONS_LIMIT = 5;
/** sessionsLimit 归一化：非整数 / 缺失 / 负数 → 默认值；超大 → 上限钳制。 */
export function normalizeSessionsLimit(value) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0)
        return DEFAULT_SYNC_SESSIONS_LIMIT;
    return Math.min(value, 10000);
}
/** 缺省配置（首次无文件 / 损坏 / 不支持 schema 时回退） */
export function defaultSyncSelection() {
    return {
        schemaVersion: SYNC_SELECTION_SCHEMA_VERSION,
        mode: 'default',
        sections: [],
        sessionsLimit: DEFAULT_SYNC_SESSIONS_LIMIT,
        sessionsInclude: [],
        encrypt: false,
        includeSecrets: false,
        deletePlugins: false,
    };
}
/**
 * sessionsInclude 归一化：非数组 → []；元素必须是非空字符串；按首次出现去重保序；
 * 上限 5000 条（防止被篡改的持久化文件把 UI/请求体撑爆）。
 *
 * 只做形状归一化，不校验单元是否真实存在 —— 清单是执行期的输入，勾选是计划期的意图，
 * 会话可能在两次同步之间被本机删掉（此时 adapter 的 includeItems 白名单自然匹配不到它，
 * 结果是「少带一次对话」而不是报错）。
 */
export function normalizeSessionsInclude(value) {
    if (!Array.isArray(value))
        return [];
    const out = [];
    const seen = new Set();
    for (const item of value) {
        if (typeof item !== 'string' || item === '')
            continue;
        if (seen.has(item))
            continue;
        seen.add(item);
        out.push(item);
        if (out.length >= 5000)
            break;
    }
    return out;
}
/**
 * 生效的同步分区范围：
 * - mode='advanced' 且 sections 非空 → sections（自定义导出）；
 * - 其余（default / advanced 但未勾选）→ undefined（= 全部 portable 推荐分区）。
 */
export function effectiveSections(sel) {
    if (sel.mode === 'advanced' && sel.sections.length > 0)
        return [...sel.sections];
    return undefined;
}
/** 从单通道对象解析（v1 顶层或 v2 channels 命名空间共用；非法字段回退缺省）。 */
function parseChannelSelection(obj) {
    const sel = defaultSyncSelection();
    if (obj['mode'] === 'advanced' || obj['mode'] === 'default')
        sel.mode = obj['mode'];
    if (Array.isArray(obj['sections'])) {
        sel.sections = obj['sections'].filter((s) => typeof s === 'string' && s !== '');
    }
    sel.sessionsLimit = normalizeSessionsLimit(obj['sessionsLimit']);
    sel.sessionsInclude = normalizeSessionsInclude(obj['sessionsInclude']);
    if (typeof obj['encrypt'] === 'boolean')
        sel.encrypt = obj['encrypt'];
    if (typeof obj['includeSecrets'] === 'boolean')
        sel.includeSecrets = obj['includeSecrets'];
    // issue #132：缺字段 = 旧文件 = 关（绝不把「没这个字段」解释成「用户同意删插件」）
    if (typeof obj['deletePlugins'] === 'boolean')
        sel.deletePlugins = obj['deletePlugins'];
    // 安全兜底：持久化数据被篡改导致 includeSecrets 但未 encrypt → 强制关掉导出密钥
    if (sel.includeSecrets && !sel.encrypt)
        sel.includeSecrets = false;
    return sel;
}
/** 解析持久化文本（v1/v2、损坏、不支持 schema 全在这里归一）；同步/异步两条读取路径共用这一份。 */
function parseSelectionFile(raw) {
    let parsed;
    try {
        parsed = parseJsonSafe(raw);
    }
    catch {
        return channelMap(() => defaultSyncSelection());
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return channelMap(() => defaultSyncSelection());
    }
    const obj = parsed;
    // schemaVersion：缺省视为 v1；非缺省但 != 2 → 回退缺省
    const ver = typeof obj['schemaVersion'] === 'number' ? obj['schemaVersion'] : 1;
    if (ver !== 1 && ver !== SYNC_SELECTION_SCHEMA_VERSION) {
        return channelMap(() => defaultSyncSelection());
    }
    if (ver === 1) {
        // v1 迁移：顶层字段 → git 通道（webdav 缺省；首次按 v2 写回时持久化）
        return channelMap((ch) => (ch === 'git' ? parseChannelSelection(obj) : defaultSyncSelection()));
    }
    const channels = obj['channels'];
    const ch = channels !== null && typeof channels === 'object' && !Array.isArray(channels)
        ? channels
        : {};
    return channelMap((channel) => {
        const ns = ch[channel];
        return ns !== null && typeof ns === 'object' && !Array.isArray(ns)
            ? parseChannelSelection(ns)
            : defaultSyncSelection();
    });
}
/** 读取全部通道的分区选择配置；文件不存在 / 损坏 / 不支持 schema → 缺省值（不抛错）。 */
export async function readAllSyncSelections(dir) {
    let raw;
    try {
        raw = await fs.readFile(path.join(dir, SYNC_SELECTION_FILE), 'utf8');
    }
    catch {
        return channelMap(() => defaultSyncSelection());
    }
    return parseSelectionFile(raw);
}
/**
 * 同步读取全部通道的分区选择（apply 期「同步种入缓存」用，2026-11「C6」）。
 *
 * 为什么必须是同步：`apply()` 是同步的，而缓存消费者（调度器首轮 / 手动 push 路由 /
 * model tool）都**同步**读缓存。异步种入会留下一个窗口：窗口内 `selectionCache[ch]` 是
 * undefined ⇒ 引擎兜底 `defaultSyncSelection()` ⇒ `effectiveSections` 返回 undefined
 * （全部 portable），用户 advanced 勾的收窄在那一轮被吞掉（探针
 * `.tmp/probe-c6-race.ts` 复现：同一 tick 读到 undefined，20ms 后才变 `["settings"]`）。
 * 解析与 `readAllSyncSelections` 完全同一份（`parseSelectionFile`），不是第二套口径。
 */
export function readAllSyncSelectionsSync(dir) {
    let raw;
    try {
        raw = readFileSync(path.join(dir, SYNC_SELECTION_FILE), 'utf8');
    }
    catch {
        return channelMap(() => defaultSyncSelection());
    }
    return parseSelectionFile(raw);
}
/** 读取指定通道的分区选择配置；文件不存在 / 损坏 / 不支持 schema → 缺省值（不抛错）。 */
export async function readSyncSelection(dir, channel) {
    const all = await readAllSyncSelections(dir);
    return all[channel];
}
/** 写入指定通道的分区选择配置（原子写：临时文件 + rename；保留另一通道；自动创建目录）。 */
export async function writeSyncSelection(dir, channel, sel) {
    await fs.mkdir(dir, { recursive: true });
    const existing = await readAllSyncSelections(dir);
    const channels = channelMap((ch) => (ch === channel ? sel : existing[ch]));
    const payload = {
        schemaVersion: SYNC_SELECTION_SCHEMA_VERSION,
        channels: channelMap((ch) => ({
            mode: channels[ch].mode,
            sections: channels[ch].sections,
            sessionsLimit: channels[ch].sessionsLimit,
            // P0-3：显式点名的会话单元（空数组 = 「最新 N 个」模式）—— 落盘白名单必须含它，
            // 否则写回时被静默丢掉（读回永远是空 = 用户点名白点了）
            sessionsInclude: channels[ch].sessionsInclude,
            encrypt: channels[ch].encrypt,
            includeSecrets: channels[ch].includeSecrets,
            // issue #132：落盘白名单漏写 = 用户勾了开关、重启后静默变回关（P0-3 的同一类错）
            deletePlugins: channels[ch].deletePlugins,
        })),
    };
    const target = path.join(dir, SYNC_SELECTION_FILE);
    const data = stringifyJsonSafe(payload, { space: 2 });
    await atomicWriteFile(target, data, { mode: 0o600 });
}
//# sourceMappingURL=sync-selection.js.map