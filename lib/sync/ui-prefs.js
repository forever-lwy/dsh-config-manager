/**
 * m-self：插件自身 UI 偏好持久化（ui-prefs.json）。
 *
 * 与 sync-config.json / sync-selection.json 并列独立文件：语义清楚、schema 演进独立。
 * 当前存 lastSyncChannel（用户上次选择的同步通道 git/webdav）+ Star 引导弹窗状态
 * （starPromptFirstSeenAt / starPromptDismissed / starPromptClicked，见 src/ui/star-prompt.ts）。
 *
 * 背景（self 分区设计）：此前该偏好只存浏览器 localStorage（键
 * dsh.configManager.syncChannel），换浏览器/换机器即丢失，且 Host 进程读不到
 * （自动同步在浏览器关闭时也运行）。迁移到磁盘后：
 *  - Host 侧可读可写（status 响应回填、POST /sync/ui-prefs 保存）；
 *  - 随 self 分区进入导出备份，迁移到新机器时恢复；
 *  - localStorage 仅保留为前端同步读取的降级通道（status 未带回填时的兜底）。
 *
 * 字段 { schemaVersion, lastSyncChannel?: SyncTransportType（git / webdav）,
 *         starPromptFirstSeenAt?: number, starPromptDismissed?: boolean,
 *         starPromptClicked?: boolean }：
 * - 缺省/未配置 = undefined（UI 回退到 sync-config.transport / 首次进入页面）；
 * - 原子写（临时文件 + rename），损坏/不支持 schema 回退缺省；
 * - 多端点共写同一文件：一律经 updateUiPrefs（read → merge → write）原子更新，
 *   避免「sync/ui-prefs 写 lastSyncChannel」与「star-prompt 写弹窗状态」互相覆盖。
 */
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { parseJsonSafe, stringifyJsonSafe } from '../utils/json.js';
import { atomicWriteFile } from '../utils/atomic-write.js';
import { isValidHistoryRetention } from '../core/migration-history.js';
import { parseSyncChannel } from './sync-config.js';
export const UI_PREFS_FILE = 'ui-prefs.json';
export const UI_PREFS_SCHEMA_VERSION = 1;
/** 缺省配置（首次无文件 / 损坏 / 不支持 schema 时回退） */
export function defaultUiPrefs() {
    return { schemaVersion: UI_PREFS_SCHEMA_VERSION };
}
/** 读取 UI 偏好；文件不存在 / 损坏 / 不支持 schema → 缺省值（不抛错）。 */
export async function readUiPrefs(dir) {
    const file = path.join(dir, UI_PREFS_FILE);
    let raw;
    try {
        raw = await fs.readFile(file, 'utf8');
    }
    catch {
        return defaultUiPrefs();
    }
    let parsed;
    try {
        parsed = parseJsonSafe(raw);
    }
    catch {
        return defaultUiPrefs();
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return defaultUiPrefs();
    }
    const obj = parsed;
    if (obj['schemaVersion'] !== undefined && obj['schemaVersion'] !== UI_PREFS_SCHEMA_VERSION) {
        return defaultUiPrefs();
    }
    if (obj['schemaVersion'] === undefined) {
        return defaultUiPrefs();
    }
    const prefs = defaultUiPrefs();
    // 通道合法性只认唯一枚举（SYNC_CHANNELS）：新增通道无需在此补字面量
    const lastChannel = parseSyncChannel(obj['lastSyncChannel']);
    if (lastChannel !== undefined) {
        prefs.lastSyncChannel = lastChannel;
    }
    if (typeof obj['starPromptFirstSeenAt'] === 'number' && Number.isFinite(obj['starPromptFirstSeenAt'])) {
        prefs.starPromptFirstSeenAt = obj['starPromptFirstSeenAt'];
    }
    if (obj['starPromptDismissed'] === true) {
        prefs.starPromptDismissed = true;
    }
    if (obj['starPromptClicked'] === true) {
        prefs.starPromptClicked = true;
    }
    if (typeof obj['releaseNotesLastSeenVersion'] === 'string' && obj['releaseNotesLastSeenVersion'].trim().length > 0) {
        prefs.releaseNotesLastSeenVersion = obj['releaseNotesLastSeenVersion'].trim();
    }
    if (obj['releaseNotesDismissed'] === true) {
        prefs.releaseNotesDismissed = true;
    }
    // 处置值只认三个字面量（与其他字段同姿态：非法值一律丢，绝不猜）
    const disposition = obj['sessionFormatDisposition'];
    if (disposition === 'abort' || disposition === 'skip' || disposition === 'guide') {
        prefs.sessionFormatDisposition = disposition;
    }
    // 开关只认字面 true：false / 缺省 / 形状不符一律 = 关闭（fail-closed，绝不猜用户想开）
    if (obj['rollbackEnabled'] === true) {
        prefs.rollbackEnabled = true;
    }
    // 保留上限只认 0..100000 的整数（与路由校验同一口径）；字符串/小数/越界一律丢，回落缺省
    if (isValidHistoryRetention(obj['historyRetentionMaxEntries'])) {
        prefs.historyRetentionMaxEntries = obj['historyRetentionMaxEntries'];
    }
    return prefs;
}
/**
 * 同步读取「回滚点开关」（启动期专用）。
 *
 * 为什么必须有同步版本：宿主 `apply()` 是同步函数（`src/index.ts`），而开关必须在
 * **注册订阅之前**就定下来 —— 否则「关闭」只等于「订阅了什么都不做」，与 issue 要求的
 * 「关闭后不再订阅 `session/event`」不符。读一个几百字节的小文件，启动期一次，代价可忽略。
 *
 * 任何异常（不存在 / 损坏 / 形状不符）一律回 false = 关闭。
 */
export function readRollbackEnabledSync(dir) {
    try {
        const raw = fsSync.readFileSync(path.join(dir, UI_PREFS_FILE), 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
            return false;
        const obj = parsed;
        return obj['schemaVersion'] === UI_PREFS_SCHEMA_VERSION && obj['rollbackEnabled'] === true;
    }
    catch {
        return false;
    }
}
/** 写入 UI 偏好（原子写：临时文件 + rename；自动创建目录）。 */
export async function writeUiPrefs(dir, prefs) {
    await fs.mkdir(dir, { recursive: true });
    const payload = {
        schemaVersion: UI_PREFS_SCHEMA_VERSION,
        ...(prefs.lastSyncChannel !== undefined ? { lastSyncChannel: prefs.lastSyncChannel } : {}),
        ...(prefs.starPromptFirstSeenAt !== undefined ? { starPromptFirstSeenAt: prefs.starPromptFirstSeenAt } : {}),
        ...(prefs.starPromptDismissed === true ? { starPromptDismissed: true } : {}),
        ...(prefs.starPromptClicked === true ? { starPromptClicked: true } : {}),
        ...(prefs.releaseNotesLastSeenVersion !== undefined ? { releaseNotesLastSeenVersion: prefs.releaseNotesLastSeenVersion } : {}),
        ...(prefs.releaseNotesDismissed === true ? { releaseNotesDismissed: true } : {}),
        ...(prefs.sessionFormatDisposition !== undefined ? { sessionFormatDisposition: prefs.sessionFormatDisposition } : {}),
        ...(prefs.rollbackEnabled === true ? { rollbackEnabled: true } : {}),
        ...(isValidHistoryRetention(prefs.historyRetentionMaxEntries)
            ? { historyRetentionMaxEntries: prefs.historyRetentionMaxEntries }
            : {}),
    };
    const target = path.join(dir, UI_PREFS_FILE);
    const data = stringifyJsonSafe(payload, { space: 2 });
    await atomicWriteFile(target, data, { mode: 0o600 });
}
/**
 * 局部原子更新：read → merge → write。
 * 多端点共写 ui-prefs.json 时（sync/ui-prefs 与 star-prompt），任一端点写全量对象
 * 都会丢掉另一端点刚写入的字段；统一走本函数按补丁合并，杜绝互相覆盖。
 */
export async function updateUiPrefs(dir, patch) {
    const current = await readUiPrefs(dir);
    const next = { ...current, ...patch };
    await writeUiPrefs(dir, next);
    return next;
}
//# sourceMappingURL=ui-prefs.js.map