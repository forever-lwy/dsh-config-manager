/**
 * m-sync-transport：sync-state.json 模型。
 * 记录上次同步时间与各分区内容 hash，供变更检测（与远端快照对比决定是否重传）。
 * 纯逻辑 + 可注入 fs；不触碰真实 ~/.dsh。
 */
import { randomUUID } from 'node:crypto';
import { sha256Hex } from '../utils/hashing.js';
import { parseJsonSafe, stringifyJsonSafe } from '../utils/json.js';
import { zhMsg } from '../core/messages.js';
import { createSnapshotFs, joinFs } from './fs.js';
// 侧效应导入：注册同步域追加消息目录（sync.deviceNameFallback 等 ⑥ 新键必须能解析，绝不露裸键名）
import './messages.js';
export const SYNC_STATE_SCHEMA_VERSION = 3;
/**
 * 历史可读取版本（均在内存中迁移到当前版本，不就地改写磁盘）：
 * - v1：缺 lastSnapshotId → lastSnapshotId=''（无祖先指针）；
 * - v2：lastSnapshotId **混用**了「远端快照 id」与「本地祖先副本目录名」两种语义（P0-7）→
 *   原值同时补进 ancestorId，两边都不丢（v2 无法事后区分该值来自 push 还是 merge/apply）；
 * - v3：lastSnapshotId 只表示远端快照 id，ancestorId 只表示本地祖先副本目录名。
 */
export const SYNC_STATE_SUPPORTED_VERSIONS = [1, 2, 3];
export const SYNC_STATE_FILE = 'sync-state.json';
/** 文件类分区判定：{ version: 1, files: [...] }（duck-typing，与 JSON 分区区分） */
function isFilesSection(data) {
    const obj = data;
    return data !== null && typeof data === 'object' && obj.version === 1 && Array.isArray(obj.files);
}
/** 键序规范化的 JSON 序列化（跨机器/跨解析稳定，用于内容 hash） */
function canonicalJson(value) {
    if (value === null || typeof value !== 'object') {
        if (value === undefined)
            return 'null'; // 防御：不产生 undefined 字面量
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
    }
    const obj = value;
    const parts = [];
    for (const key of Object.keys(obj).sort()) {
        const v = obj[key];
        if (v === undefined)
            continue; // 与 JSON.stringify 一致：跳过 undefined 键
        parts.push(`${JSON.stringify(key)}:${canonicalJson(v)}`);
    }
    return `{${parts.join(',')}}`;
}
/**
 * 分区内容 hash：
 * - JSON 分区：键序规范化的 JSON 序列化 → SHA-256（同一内容不同键序 → 相同 hash）
 * - 文件类分区：文件相对路径 + 文件字节 SHA-256 的有序清单 → SHA-256
 *   （文件数组顺序无关；contentHash 字段不参与，以字节为准）
 */
export function hashSection(data) {
    if (isFilesSection(data)) {
        const files = [...data.files]
            .sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0))
            .map((f) => `${f.relativePath}\u0000${sha256Hex(f.data)}`)
            .join('\u0001');
        return sha256Hex(`files:v1\u0000${files}`);
    }
    return sha256Hex(canonicalJson(data));
}
/** P1-5：读取「字符串数组」字段（非数组/元素非字符串一律丢弃；空数组视为无记录）。 */
function readStringArray(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    const seen = new Set();
    for (const item of raw) {
        if (typeof item !== 'string' || item === '' || seen.has(item))
            continue;
        seen.add(item);
        out.push(item);
    }
    return out;
}
/**
 * 读取可选 pendingMerge（基线纪律）。
 *
 * 形状不符（损坏/被篡改/分区清单为空）→ undefined = 按「无待裁决冲突」处理：
 * 这里**绝不抛错**（一个诊断字段不该让 loadSyncState 整体失败），也绝不把空清单当成
 * 「所有冲突都解决了」—— 空清单只是没有内容可记录。
 */
function readPendingMerge(raw) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
        return undefined;
    const o = raw;
    if (typeof o['remoteSnapshotId'] !== 'string' || typeof o['since'] !== 'string')
        return undefined;
    const sections = readStringArray(o['sections']);
    if (sections.length === 0)
        return undefined;
    return { remoteSnapshotId: o['remoteSnapshotId'], sections: sections, since: o['since'] };
}
/**
 * 读取「远端观测」（分区 id → hash）。
 *
 * 形状不符（损坏/被篡改）或为空对象 → undefined：空集合无法证伪任何内容，
 * 按「没有观测」处理（调用方回落到 id 比较），绝不把空对象当成「远端什么都没有」。
 */
function readSectionHashes(raw) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
        return undefined;
    const out = {};
    for (const [sid, value] of Object.entries(raw)) {
        if (typeof value === 'string' && value !== '')
            out[sid] = value;
    }
    return Object.keys(out).length > 0 ? out : undefined;
}
/** 读取同步状态；文件不存在 → 返回缺省空状态（从未同步）。
 * 旧版本文件（v1/v2）→ 在内存中迁移到当前版本（见 SYNC_STATE_SUPPORTED_VERSIONS），
 * 不在磁盘上就地升级（首次 saveSyncState 时才写回新版本）。 */
export async function loadSyncState(dir, fsx = createSnapshotFs(), msg = zhMsg) {
    const file = joinFs(dir, SYNC_STATE_FILE);
    if (!(await fsx.exists(file))) {
        return { schemaVersion: SYNC_STATE_SCHEMA_VERSION, lastSyncAt: '', sections: {}, lastSnapshotId: '', ancestorId: '' };
    }
    const raw = Buffer.from(await fsx.readFile(file)).toString('utf8');
    const parsed = parseJsonSafe(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(msg('sync.state.notObject'));
    }
    const obj = parsed;
    if (typeof obj['schemaVersion'] !== 'number' || !SYNC_STATE_SUPPORTED_VERSIONS.includes(obj['schemaVersion'])) {
        throw new Error(msg('sync.state.schemaUnsupported', { version: String(obj['schemaVersion']), expected: String(SYNC_STATE_SUPPORTED_VERSIONS.join('/')) }));
    }
    if (typeof obj['lastSyncAt'] !== 'string') {
        throw new Error(msg('sync.state.lastSyncAt'));
    }
    if (obj['sections'] === null || typeof obj['sections'] !== 'object' || Array.isArray(obj['sections'])) {
        throw new Error(msg('sync.state.sections'));
    }
    const sections = {};
    for (const [sid, rec] of Object.entries(obj['sections'])) {
        if (rec === null || typeof rec !== 'object' || Array.isArray(rec)) {
            throw new Error(msg('sync.state.sectionRecord', { section: sid }));
        }
        const r = rec;
        if (typeof r['hash'] !== 'string' || typeof r['updatedAt'] !== 'string') {
            throw new Error(msg('sync.state.sectionFields', { section: sid }));
        }
        sections[sid] = { hash: r['hash'], updatedAt: r['updatedAt'] };
    }
    const fileVersion = typeof obj['schemaVersion'] === 'number' ? obj['schemaVersion'] : SYNC_STATE_SCHEMA_VERSION;
    const rawLastSnapshotId = typeof obj['lastSnapshotId'] === 'string' ? obj['lastSnapshotId'] : '';
    const rawAncestorId = typeof obj['ancestorId'] === 'string' ? obj['ancestorId'] : undefined;
    const state = {
        schemaVersion: SYNC_STATE_SCHEMA_VERSION,
        lastSyncAt: obj['lastSyncAt'],
        // P1-5：只有文件里确实写过才回填 —— 缺席 = 「从未跟踪」（区别于「跟踪了但为空」），
        // 也让既有 v3 文件的读回形状逐键不变（旧调用方/旧测试零感知）。
        ...(Array.isArray(obj['sessionUnits']) ? { sessionUnits: readStringArray(obj['sessionUnits']) } : {}),
        ...(Array.isArray(obj['deletedSessions']) ? { deletedSessions: readStringArray(obj['deletedSessions']) } : {}),
        sections,
        // v2 及更早：lastSnapshotId 混用两种语义 → 原值同时当作本地祖先副本目录名（迁移不丢既有基线）。
        // 非字符串的 ancestorId（损坏/被篡改）按「无本地祖先副本」处理：merge 退化为两方合并（安全侧），
        // 绝不采用一个来路不明的目录名。
        ancestorId: rawAncestorId ?? (fileVersion < SYNC_STATE_SCHEMA_VERSION ? rawLastSnapshotId : ''),
        lastSnapshotId: rawLastSnapshotId,
        // ⑥：只有文件里确实写过才回填（缺席 = 从未记录 → 下次推送才生成，绝不在这里凭空造一个 id）
        ...(typeof obj['deviceId'] === 'string' && obj['deviceId'] !== '' ? { deviceId: obj['deviceId'] } : {}),
        ...(typeof obj['deviceName'] === 'string' && obj['deviceName'] !== '' ? { deviceName: obj['deviceName'] } : {}),
        // 基线纪律：同样「写过才回填」—— 缺席 = 无待裁决冲突（旧文件读回形状逐键不变）
        ...(readPendingMerge(obj['pendingMerge']) !== undefined ? { pendingMerge: readPendingMerge(obj['pendingMerge']) } : {}),
        // issue #140：远端观测同样「写过才回填」—— 缺席/空 = 未知（判定层回落 id 比较）
        ...(readSectionHashes(obj['lastRemoteSections']) !== undefined
            ? { lastRemoteSections: readSectionHashes(obj['lastRemoteSections']) }
            : {}),
    };
    const t = obj['transport'];
    if (t !== undefined) {
        if (t === null || typeof t !== 'object' || typeof t['type'] !== 'string' || typeof t['ref'] !== 'string') {
            throw new Error(msg('sync.state.transport'));
        }
        state.transport = { type: t.type, ref: t.ref };
    }
    return state;
}
/**
 * 解析（必要时生成并持久化）本设备的同步身份（cloud-sync 借鉴项 ⑥）。
 *
 * - deviceId 一旦生成就持久化在 sync-state.json → 历史列表能认出「同一台设备」；
 * - deviceName 缺省取主机名，取不到（容器/无主机名）时用字典里的兜底文案，绝不写空串；
 * - **只在首次生成时写盘**（已有 id → 纯读，不产生额外写）。
 */
export async function resolveDeviceIdentity(dir, hostName, fsx = createSnapshotFs(), msg = zhMsg) {
    const state = await loadSyncState(dir, fsx, msg);
    const trimmedHost = typeof hostName === 'string' ? hostName.trim() : '';
    const name = (typeof state.deviceName === 'string' && state.deviceName !== '' ? state.deviceName : '')
        || (trimmedHost !== '' ? trimmedHost : msg('sync.deviceNameFallback'));
    if (typeof state.deviceId === 'string' && state.deviceId !== '')
        return { id: state.deviceId, name };
    const id = randomUUID();
    await saveSyncState(dir, { ...state, deviceId: id, deviceName: name }, fsx);
    return { id, name };
}
/** 保存同步状态（自动创建目录） */
export async function saveSyncState(dir, state, fsx = createSnapshotFs()) {
    await fsx.mkdir(dir);
    await fsx.writeFile(joinFs(dir, SYNC_STATE_FILE), new TextEncoder().encode(stringifyJsonSafe(state, { space: 2 })));
}
//# sourceMappingURL=sync-state.js.map