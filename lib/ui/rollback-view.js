/**
 * rollback-point（**工作区 + 会话回滚**）的**展示模型**（框架无关纯函数，node 可测）。
 *
 * 数据来自宿主 /recovery/rollback-points 族的 6 条子路径（list / storage / <id> / <id>/preview /
 * <id>/rewind / <id>/delete；第 3 条 <id> 单条详情同样进端口 —— 面板要能深链到某个点）。
 * 宿主把它挂在既有 recovery **prefix 路由**内部按 path 分发，因此不新增注册路由条目。
 *
 * 三条纪律（与旧检查点展示模型同源，改名不改口径）：
 *  ① **不 import src/core/rollback-point.ts（或任何 core 模块）** —— 那条链经 node:fs 依赖宿主运行时，
 *     一旦进 client bundle，DSH loader 会报 missed the module table（AGENTS.md 的 client bundle 铁律）。
 *     因此这里按「线协议结构子集」重新声明类型（字段只取展示所需，缺字段一律回落安全值）。
 *  ② **本模块不产出任何用户可见文案**：只回传字典键（rollback.*），zh/en 在 recovery-locales.ts。
 *  ③ **未知码 / 未知态 / 未知来源一律回落 unknown 键，绝不裸渲染机器码**；用户自由文本（note）与
 *     宿主技术细节（detail / guidance.detail / 路径清单）一律先过 redact()（AGENTS.md UI 硬性规则 7）。
 *
 * 两态纪律（S2）：只有 `workspace` 与 `session`。第三态 `config` 与「同点判定」已随检查点一起删除：
 * 任何非两态的 state 字符串都回落 rollback.state.unknown，本模块**不出现** config 态。
 *
 * 线协议形状（与 T1 宿主侧 src/core/rollback-point.ts 逐字段对齐，2026-10-10 双人确认）：
 *  - points[] = { id, createdAt, sessionId, turn, kind, protected, incomplete, note, spreadMs, segments:[…] }，
 *    segments **恒为 [workspace, session] 两项**；
 *  - preview.workspace = { overwrite, different, missing, createdAfter(数), leftovers(路径清单,≤20), leftoversTruncated }，
 *    preview.session = { from, to, turns, cursorNow, cursorTarget, restorable, active, reasonCode }
 *    （from = 目标回合开始前最后一个事件的 seq，即 fork 的 inclusive 边界；turns = 回合号）；
 *  - rewind.segments[] = { state, status, reasonCode?, detail[], restored, failed, leftovers[], leftoversTruncated, childSessionId?, guidance? }。
 */
import { redact } from '../security/redaction.js';
/* ------------------------------------------------------------ 两态 / 三选一 mode */
/** 只保留两态（S2）：工作区 + 会话。 */
export const ROLLBACK_STATES = ['workspace', 'session'];
/** 段名 → 是否为受支持的段（出现别的段一律按未知处理，绝不假设它是第三态）。 */
export function isRollbackState(value) {
    return value === 'workspace' || value === 'session';
}
/**
 * 回退范围三选一（冻结 wire contract 的 `mode`）：
 *  - `files+session`：工作区文件 + 会话（新子会话）一起回退；
 *  - `files`：只回退工作区文件；
 *  - `session`：只回退会话（fork 子会话）。
 */
export const ROLLBACK_MODES = ['files+session', 'files', 'session'];
export function isRollbackMode(value) {
    return value === 'files+session' || value === 'files' || value === 'session';
}
/** mode → 段集合（workspace 段 = 工作区文件；session 段 = 会话）。 */
export function rollbackModeSegments(mode) {
    if (mode === 'files')
        return ['workspace'];
    if (mode === 'session')
        return ['session'];
    if (mode === 'files+session')
        return ['workspace', 'session'];
    return [];
}
/**
 * 该 mode 在当前可回退段集合下**是否可选**（界面据此禁用注定失败的选项）。
 *
 * 例：某点没有稳定边界（session 段 restorable=false）时，`session` 与 `files+session` 都不可选 ——
 * 绝不发一个宿主一定会拒绝的请求。
 */
export function rollbackModeAvailable(mode, availableSegments) {
    const needed = rollbackModeSegments(mode);
    return needed.length > 0 && needed.every((state) => availableSegments.includes(state));
}
/** 段集合 → mode（三选一；空集合回落 `files+session`，因为那正是自动点缺省该回退的两态）。 */
export function rollbackModeFromSegments(segments) {
    const hasWorkspace = segments.includes('workspace');
    const hasSession = segments.includes('session');
    if (hasWorkspace && !hasSession)
        return 'files';
    if (hasSession && !hasWorkspace)
        return 'session';
    return 'files+session';
}
/* ------------------------------------------------------------ 字典键映射（绝不裸渲染） */
export const ROLLBACK_STATE_UNKNOWN_KEY = 'rollback.state.unknown';
export const ROLLBACK_MODE_UNKNOWN_KEY = 'rollback.mode.unknown';
export const ROLLBACK_CODE_UNKNOWN_KEY = 'rollback.code.unknown';
export const ROLLBACK_GUIDANCE_UNKNOWN_KEY = 'rollback.guidance.unknown';
export const ROLLBACK_KIND_UNKNOWN_KEY = 'rollback.kind.unknown';
const STATE_KEYS = {
    workspace: 'rollback.state.workspace',
    session: 'rollback.state.session',
};
const MODE_KEYS = {
    'files+session': 'rollback.mode.filesAndSession',
    files: 'rollback.mode.filesOnly',
    session: 'rollback.mode.sessionOnly',
};
/**
 * code 白名单：**只有这些码进字典**，其余一律回落 unknown ——
 * 宿主若新增码而字典没跟上，界面显示「未识别的错误码」而不是把机器码拼上屏。
 *
 * 与宿主引擎 `src/core/rollback-point.ts` 的 `RollbackCode` 联合**逐条对应**（core 不能进
 * client bundle，所以只能在这里镜像一份；t3 已按 T1 的最终码表补齐 31 条，t10 补
 * `no-recorded-files` ⇒ 32 条）。顶层 code 与 segments[].reasonCode / warnings 共用同一枚举，
 * 所以一份白名单同时服务三处渲染。
 *
 * ⚠️ **这份镜像与引擎码表的等价性有守卫**：`rollback-view.test.ts` 的「码表镜像 != 引擎码表即红」
 * 用例从 `src/core/rollback-point.ts` 源码级读出 `RollbackCode` union，双向断言集合相等
 * （引擎新增码忘了补这里、或这里多写了引擎没有的码，都会立刻变红 —— 本次 t10 的
 * `no-recorded-files` 就是因为缺这条对照而静默漂移过一轮）。
 */
export const ROLLBACK_CODES = [
    'ok',
    'deleted',
    // 冻结契约的 9 条
    'confirmation-required',
    'protected-point',
    'record-not-found',
    'record-incomplete',
    'invalid-input',
    // 待删的「该点未记录」路径超上限 ⇒ 整套拒绝、零写入（绝不删一半；顶层 code，不是泛化的 invalid-input）
    'created-removals-limit',
    'no-boundary',
    'storage-unavailable',
    'mutation-locked',
    'method-not-allowed',
    // 台账 / 存储
    'ledger-unreadable',
    'ledger-write-failed',
    // 工作区写回（记录校验 / 对象仓 / 写后复验 / 无事可做）
    'invalid-path',
    'object-missing',
    'object-hash-mismatch',
    'restore-failed',
    'verify-failed',
    'nothing-to-restore',
    // T10：该态**没有记录任何文件**（工作区段 files=0）—— 与「记录了但全部已一致」严格分开，
    // 只出现在 segments[].reasonCode（不是顶层 code）；界面据此说两句不同的话（t11）。
    'no-recorded-files',
    // 救援点（S5 guard）
    'guard-failed',
    // 会话（fork 子会话；原会话日志只读）
    'session-missing',
    'session-out-of-root',
    'session-too-large',
    'session-active',
    // 子代理会话（origin=subagent）：**不自动留点** —— 出现即代表该会话被有意跳过（宿主日志留痕）
    'subagent-session',
    'session-fork-unavailable',
    'fork-failed',
    // 自动留点（工作区快照）
    'capture-failed',
    'capture-truncated',
    'capture-degraded',
    'no-chunks',
    'chunk-not-absolute',
    'chunk-not-found',
    // 单文件差异（「查看」的数据源）：该路径**不在**这个回滚点的记录里
    'file-not-recorded',
];
/**
 * 已知指引码后缀（T1 引擎实际产出；白名单外回落 unknown）。
 *
 * 引擎回传的是**完整字典键**（rollback.guidance.workspaceRolledBack），旧检查点引擎回传的是
 * **裸后缀**（workspacePartial）—— 映射两种形态都认，避免把已知指引误判成 unknown
 * （那会让「工作区已回滚 / 已 fork 子会话」这类关键事实消失）。
 */
export const ROLLBACK_GUIDANCE_CODES = [
    'mountStorage', 'fixDataDir', 'readOnlyFallback', 'probeDetail',
    'workspaceRolledBack', 'forkUnavailable', 'sessionForked', 'sessionNotAttached',
];
/** 已知告警码后缀（warnings 走独立一族 rollback.warn.*；白名单外回落 rollback.warn.unknown）。 */
export const ROLLBACK_WARN_CODES = [
    'ledgerUnreadable', 'trackMissing', 'trackDegraded', 'protected', 'guardFailed',
    // t2：删除集被整体拒绝的**成因**（忽略目录 / 路径索引缺失 / 目录读不出）—— 必须能说清为什么没删
    'createdRefused',
];
export const ROLLBACK_WARN_UNKNOWN_KEY = 'rollback.warn.unknown';
/**
 * 指引 / 告警码 → 字典键。三种形态都认：
 *  - 完整键 `rollback.guidance.X` / `rollback.warn.X`（T1 引擎）；
 *  - 裸后缀 `X`（旧检查点引擎）。
 * 未知一律回落 unknown 键，**绝不裸渲染机器码**。
 */
function rollbackNoticeKey(code) {
    if (typeof code !== 'string' || code === '')
        return ROLLBACK_GUIDANCE_UNKNOWN_KEY;
    if (code.startsWith('rollback.warn.')) {
        const bare = code.slice('rollback.warn.'.length);
        return ROLLBACK_WARN_CODES.includes(bare) ? 'rollback.warn.' + bare : ROLLBACK_WARN_UNKNOWN_KEY;
    }
    const bare = code.startsWith('rollback.guidance.') ? code.slice('rollback.guidance.'.length) : code;
    return ROLLBACK_GUIDANCE_CODES.includes(bare) ? 'rollback.guidance.' + bare : ROLLBACK_GUIDANCE_UNKNOWN_KEY;
}
/** 段名 → 字典键（非两态回落 unknown，绝不裸渲染）。 */
export function rollbackStateKey(state) {
    return isRollbackState(state) ? STATE_KEYS[state] : ROLLBACK_STATE_UNKNOWN_KEY;
}
/** mode → 字典键（三选一；其它回落 unknown）。 */
export function rollbackModeKey(mode) {
    return isRollbackMode(mode) ? MODE_KEYS[mode] : ROLLBACK_MODE_UNKNOWN_KEY;
}
const GUARD_KEYS = {
    require: 'rollback.guard.require',
    warn: 'rollback.guard.warn',
    off: 'rollback.guard.off',
};
/** 救援点策略（S5 guard）→ 字典键（未知回落 unknown）。 */
export function rollbackGuardPolicyKey(policy) {
    return policy === 'require' || policy === 'warn' || policy === 'off' ? GUARD_KEYS[policy] : 'rollback.guard.unknown';
}
/** 机器码 → 字典键（白名单外回落 unknown）。 */
export function rollbackCodeKey(code) {
    if (typeof code !== 'string' || code === '')
        return ROLLBACK_CODE_UNKNOWN_KEY;
    return ROLLBACK_CODES.includes(code) ? 'rollback.code.' + code : ROLLBACK_CODE_UNKNOWN_KEY;
}
/** 指引 / 告警：code → rollback.guidance.* / rollback.warn.*（三种形态都认），detail 过 redact。 */
export function rollbackGuidanceRows(items) {
    return (items ?? []).map((item) => ({
        key: rollbackNoticeKey(item.code),
        detail: item.detail !== undefined && item.detail !== '' ? redact(item.detail) : null,
    }));
}
/* ------------------------------------------------------------ 留存口径（S6） */
/**
 * 每会话最多保留的**自动点**（超出只淘汰最旧的自动点 —— 引擎 selectPrune 的自动点桶）。
 * 救援点（guard）不占这个额度、也不被它淘汰，但有自己的**两道**上限
 * （每会话引擎 ROLLBACK_MAX_GUARDS_PER_SESSION / 全局 ROLLBACK_MAX_GUARDS）。
 */
export const ROLLBACK_MAX_POINTS_PER_SESSION = 20;
/** 全局最多保留的**自动点**（同上，只淘汰最旧的自动点）。 */
export const ROLLBACK_MAX_POINTS_TOTAL = 50;
/** 每会话最多保留的**救援点**（guard）：超出只淘汰最旧的救援点；数值 = 引擎 ROLLBACK_MAX_GUARDS_PER_SESSION。 */
export const ROLLBACK_MAX_POINTS_GUARDS_PER_SESSION = 20;
/**
 * **全局**最多保留的**救援点**（guard）：与 ROLLBACK_MAX_POINTS_TOTAL **互相独立**
 * （两类各计预算，谁也不吃谁额度；数值相同不是耦合），超出只淘汰最旧的救援点。
 * 数值 = 引擎 ROLLBACK_MAX_GUARDS（两侧必须同步，T17 用例逐句钉住）。
 */
export const ROLLBACK_MAX_POINTS_GUARDS_TOTAL = 50;
/**
 * 预览不可回退时的原因键（按宿主真实形状分派；**绝不回落 rollback.code.unknown**）。
 *
 * 注意（t22 冻结口径）：救援点**可以**作为回退目标 —— 引擎 canRestore = !protected && !incomplete &&
 * 至少一段可恢复（**不含** kind!=='guard'，见 src/core/rollback-point.ts:1531）。所以这个键**只在
 * 宿主真的拒绝了一个看起来可恢复的救援点**（canRestore=false 且不是 protected/incomplete/无可用段）时使用，
 * 不是「救援点一律不可回退」。
 */
export const ROLLBACK_PREVIEW_REASON_GUARD_KEY = 'rollback.preview.reason.guard';
export const ROLLBACK_PREVIEW_REASON_INCOMPLETE_KEY = 'rollback.preview.reason.incomplete';
export const ROLLBACK_PREVIEW_REASON_HOST_REFUSED_KEY = 'rollback.preview.reason.hostRefused';
/**
 * 聊天内「↺ 回退」入口是否可见（issue #88：关闭后**收起**入口，不是置灰）。
 *
 * 判据只有一条：**宿主回传的开关**。老宿主（storage 响应里没有 `rollbackEnabled` 字段）按
 * 「未提供 = 功能默认开」处理 —— 那一版的语义就是默认启用，此时把入口藏起来会让用户
 * 「有点但没有入口」。形状不符（不是布尔）同样按「未提供」处理，绝不因为一个坏字段藏掉入口。
 */
export function rollbackEntryVisible(storage) {
    if (storage === undefined || storage === null)
        return false;
    return storage.rollbackEnabled !== false;
}
/* ------------------------------------------------------------ 内部小工具 */
function countOf(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (Array.isArray(value))
        return value.length;
    return 0;
}
function numberOrNull(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
/** 路径/事实清单：逐条脱敏（宿主技术细节不得明文上屏）。 */
function redactLines(values) {
    return (values ?? []).map((line) => redact(line));
}
/** 段可用性：显式 available/restorable 为 false 才算不可用（缺字段 = 宿主没给否定信号）。 */
function segmentAvailable(segment) {
    return segment.available !== false && segment.restorable !== false;
}
/** 段级 / 点级「跳过 · 截断」告警键（S4：宿主已如实回传，界面必须说出来）。 */
export const ROLLBACK_NOTICE_SKIPPED_KEY = 'rollback.row.notice.skipped';
export const ROLLBACK_NOTICE_TRUNCATED_KEY = 'rollback.row.notice.truncated';
export const ROLLBACK_PREVIEW_NOTICE_SKIPPED_KEY = 'rollback.preview.notice.skipped';
export const ROLLBACK_PREVIEW_NOTICE_TRUNCATED_KEY = 'rollback.preview.notice.truncated';
/** 跳过 / 截断事实 → 告警键（顺序固定：先「跳过多少」，再「被截断」）。 */
function noticeKeysOf(skippedCount, truncated, skippedKey, truncatedKey) {
    const keys = [];
    if (skippedCount > 0)
        keys.push(skippedKey);
    if (truncated)
        keys.push(truncatedKey);
    return keys;
}
function segmentView(segment) {
    const ok = segment.ok !== false;
    const degraded = segment.degraded === true;
    const badgeKind = ok ? (degraded ? 'warn' : 'ok') : 'error';
    const skippedCount = numberOrNull(segment.skippedCount) ?? 0;
    const truncated = segment.truncated === true;
    return {
        state: segment.state,
        labelKey: rollbackStateKey(segment.state),
        restorable: segment.restorable === true,
        badgeKind,
        entries: numberOrNull(segment.entries) ?? 0,
        cursorBytes: numberOrNull(segment.cursorBytes),
        reasonKey: ok ? null : rollbackCodeKey(segment.reasonCode),
        skippedCount,
        truncated,
        noticeKeys: noticeKeysOf(skippedCount, truncated, ROLLBACK_NOTICE_SKIPPED_KEY, ROLLBACK_NOTICE_TRUNCATED_KEY),
    };
}
/** 列表 → 展示行（台账已按时间倒序；本函数只做映射与判定，不重排）。 */
export function rollbackPointRows(list) {
    if (list === null)
        return [];
    const points = Array.isArray(list.points) ? list.points : [];
    return points.map((point) => {
        const segments = (Array.isArray(point.segments) ? point.segments : []).map(segmentView);
        const kind = point.kind === 'guard' ? 'guard' : point.kind === 'auto' ? 'auto' : 'unknown';
        const kindKey = kind === 'guard' ? 'rollback.kind.guard' : kind === 'auto' ? 'rollback.kind.auto' : ROLLBACK_KIND_UNKNOWN_KEY;
        return {
            id: point.id,
            kind,
            kindKey,
            createdAtMs: point.createdAt,
            sessionId: typeof point.sessionId === 'string' && point.sessionId !== '' ? point.sessionId : null,
            unitId: typeof point.unitId === 'string' && point.unitId !== '' ? point.unitId : null,
            title: typeof point.title === 'string' && point.title.trim() !== '' ? redact(point.title) : null,
            turn: numberOrNull(point.turn),
            protected: point.protected === true,
            incomplete: point.incomplete === true,
            badgeKind: point.incomplete === true ? 'warn' : 'ok',
            spreadMs: numberOrNull(point.spreadMs) ?? 0,
            segments,
            rewindable: point.protected !== true && point.incomplete !== true && segments.some((segment) => segment.restorable),
            // 宿主真值（引擎 preview/remove 同一判据）：protected 与 **guard** 一律不可删 ——
            // 只看 protected 会把救援点的「删除」按钮点亮，点了必得 protected-point（按钮与文案自相矛盾）。
            removable: point.protected !== true && kind !== 'guard',
            note: point.note !== null && point.note !== undefined && point.note !== '' ? redact(point.note) : null,
        };
    });
}
/**
 * 台账 → **按会话分组**的时间线（组内保持台账顺序 = 时间倒序；组间按各组最新时间倒序）。
 *
 * 分组键 = sessionId；缺 sessionId 的记录归入「未知会话」组并排在最后 —— 绝不猜它属于哪个会话。
 */
export function rollbackPointGroups(list) {
    const groups = [];
    const index = new Map();
    for (const row of rollbackPointRows(list)) {
        const key = row.sessionId ?? '\u0000unknown';
        let at = index.get(key);
        if (at === undefined) {
            at = groups.length;
            index.set(key, at);
            groups.push({ sessionId: row.sessionId, unitId: row.unitId, title: row.title, latestAtMs: null, rows: [] });
        }
        const group = groups[at];
        group.rows.push(row);
        if (group.unitId === null && row.unitId !== null)
            group.unitId = row.unitId;
        if (group.title === null && row.title !== null)
            group.title = row.title;
        if (group.latestAtMs === null || row.createdAtMs > group.latestAtMs)
            group.latestAtMs = row.createdAtMs;
    }
    return groups.sort((a, b) => {
        if (a.sessionId === null && b.sessionId !== null)
            return 1;
        if (b.sessionId === null && a.sessionId !== null)
            return -1;
        return (b.latestAtMs ?? 0) - (a.latestAtMs ?? 0);
    });
}
/** 该回滚点记下了多少个工作区文件（时间线上的「文件数」）。 */
export function rollbackRowFileCount(row) {
    let total = 0;
    for (const segment of row.segments)
        if (segment.state === 'workspace')
            total += segment.entries;
    return total;
}
/** 该回滚点是否有会话游标（时间线上的「是否有会话游标」—— 没有就只回退工作区）。 */
export function rollbackRowHasSessionCursor(row) {
    return row.segments.some((segment) => segment.state === 'session' && segment.cursorBytes !== null);
}
/**
 * 预览 → 展示行（<id>/preview 的只读结果）。
 *
 * 计数口径逐条对应「界面能看到什么」：覆盖多少项、其中多少项内容不同、多少项当前已不存在
 * （会被重新创建）、多少项是该点**未记录**的（引擎只统计「不在记录里」的文件，留点时被跳过的
 * 既有文件同样落在这里，所以不得声称「之后新建」）。
 *
 * 「未记录」与「会被删除」是**两件事**：会被删的只有过了安全判据的那一份
 * （`workspace.removals` / `removalsCount`），未记录清单里混着永不删除的 `.git` 等拒删项。
 */
/**
 * 文件行的**主标签** = 文件名（Cursor「Confirm Undo」式：一眼看是哪几个文件，而不是一屏绝对路径）。
 * 完整路径由组件放进 `title`（悬停可见），**信息一个都不丢**。
 */
export function rollbackPreviewFileLabel(filePath) {
    const trimmed = filePath.replace(/[\\/]+$/, '');
    const at = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
    return at < 0 ? trimmed : trimmed.slice(at + 1);
}
export function splitRollbackPath(filePath) {
    const trimmed = filePath.replace(/[\\/]+$/, '');
    const at = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
    if (at < 0)
        return { dir: '', base: trimmed };
    return { dir: trimmed.slice(0, at + 1), base: trimmed.slice(at + 1) };
}
export function rollbackPreviewScope(files, removals) {
    let added = 0;
    let removed = 0;
    for (const file of files) {
        if (file.added === null || file.removed === null)
            continue;
        added += file.added;
        removed += file.removed;
    }
    return { files: files.length, added, removed, removals: removals.length };
}
/** 从预览推出可勾选行（只读；绝不改任何判定） */
export function rollbackSelectionRows(preview) {
    const files = preview?.workspace?.files;
    if (!Array.isArray(files))
        return [];
    const out = [];
    for (const file of files) {
        if (file === null || typeof file !== 'object')
            continue;
        const path = typeof file.path === 'string' ? file.path : '';
        if (path === '')
            continue;
        const row = { path, parts: splitRollbackPath(path), foreign: file.foreign === true };
        if (row.foreign && typeof file.foreignSessionId === 'string' && file.foreignSessionId !== '') {
            row.foreignSessionId = file.foreignSessionId;
        }
        out.push(row);
    }
    return out;
}
/**
 * 默认勾选 = **非 foreign** 的行（B 的自动隔离口径）。用户可在弹窗里逐个改回去。
 *
 * 为什么要在这里定而不在组件里：同一条默认值要在面板与聊天两个入口一致，
 * 且「默认排除别的会话的改动」是产品决定，必须可测。
 */
export function rollbackDefaultSelection(rows) {
    return rows.filter((row) => !row.foreign).map((row) => row.path);
}
/**
 * 勾选集 → `onlyPaths`：
 *  · **全选**（含空清单）⇒ `null`（不传字段 = 走既有全量口径，老宿主也照样工作）；
 *  · 真的少勾 ⇒ 把选中的清单原样传给宿主（空数组由调用方拦：宿主侧它是 400）。
 */
export function rollbackOnlyPaths(rows, selected) {
    if (rows.length === 0)
        return null;
    const chosen = new Set(selected);
    const picked = rows.filter((row) => chosen.has(row.path)).map((row) => row.path);
    return picked.length === rows.length ? null : picked;
}
/** 该不该拦住提交：清单非空、却一个都没勾（宿主会把空数组当 400） */
export function rollbackSelectionBlocksSubmit(rows, selected) {
    if (rows.length === 0)
        return false;
    const chosen = new Set(selected);
    return !rows.some((row) => chosen.has(row.path));
}
/**
 * 差异无法逐行展示时的字典键（本层**只回键**，文案在字典里）。
 * 未知 / 缺失原因回落 null —— 调用方按「未知原因」出话，绝不回落成「没有差异」（那是另一件事）。
 */
export function rollbackFileDiffReasonKey(reason) {
    switch (reason) {
        case 'missing-blob': return 'rollback.diff.reason.missingBlob';
        case 'binary': return 'rollback.diff.reason.binary';
        case 'too-large': return 'rollback.diff.reason.tooLarge';
        case 'unreadable': return 'rollback.diff.reason.unreadable';
        default: return null;
    }
}
/** 可渲染的 hunks（缺字段 / 非数组一律当空 —— 渲染层绝不因宿主形态差异崩掉）。 */
export function rollbackFileDiffHunks(result) {
    const hunks = result?.hunks;
    return Array.isArray(hunks) ? hunks : [];
}
/** 两侧是否都真的读到了文本（否则说不出「无差异」）。 */
export function rollbackFileDiffComparable(result) {
    if (result === null || result.ok !== true)
        return false;
    if (result.reason !== undefined)
        return false;
    return result.before.binary !== true && result.after.binary !== true && result.before.oversized !== true && result.after.oversized !== true;
}
export function rollbackPreviewRows(preview) {
    if (preview === null)
        return [];
    const rows = [];
    const pointWarnings = rollbackGuidanceRows(preview.warnings);
    const workspace = preview.workspace;
    if (workspace !== undefined && workspace !== null) {
        const skippedCount = countOf(workspace.skippedCount);
        const truncated = workspace.truncated === true;
        rows.push({
            state: 'workspace',
            labelKey: rollbackStateKey('workspace'),
            available: segmentAvailable(workspace),
            reasonKey: workspace.reasonCode !== undefined && workspace.reasonCode !== null && workspace.reasonCode !== ''
                ? rollbackCodeKey(workspace.reasonCode)
                : null,
            counts: [
                { key: 'rollback.preview.overwrite', n: countOf(workspace.overwrite) },
                { key: 'rollback.preview.different', n: countOf(workspace.different) },
                { key: 'rollback.preview.missing', n: countOf(workspace.missing) },
                { key: 'rollback.preview.createdAfter', n: Math.max(countOf(workspace.createdAfter), countOf(workspace.leftovers)) },
            ],
            leftovers: redactLines(workspace.leftovers),
            leftoversTruncated: workspace.leftoversTruncated === true,
            removals: redactLines(workspace.removals),
            removalsCount: Math.max(countOf(workspace.removalsCount), Array.isArray(workspace.removals) ? workspace.removals.length : 0),
            removalsTruncated: workspace.removalsTruncated === true,
            createdSkipped: redactLines(workspace.createdSkipped),
            createdSkippedCount: Math.max(countOf(workspace.createdSkippedCount), Array.isArray(workspace.createdSkipped) ? workspace.createdSkipped.length : 0),
            createdSkippedTruncated: workspace.createdSkippedTruncated === true,
            createdRefusedReason: typeof workspace.createdRefusedReason === 'string' && workspace.createdRefusedReason !== '' ? workspace.createdRefusedReason : null,
            skippedCount,
            truncated,
            noticeKeys: noticeKeysOf(skippedCount, truncated, ROLLBACK_PREVIEW_NOTICE_SKIPPED_KEY, ROLLBACK_PREVIEW_NOTICE_TRUNCATED_KEY),
            warnings: pointWarnings,
            cursor: null,
            cursorBytes: null,
            turns: null,
            active: false,
            guidance: rollbackGuidanceRows(workspace.guidance),
        });
    }
    const session = preview.session;
    if (session !== undefined && session !== null) {
        rows.push({
            state: 'session',
            labelKey: rollbackStateKey('session'),
            available: segmentAvailable(session),
            reasonKey: session.reasonCode !== undefined && session.reasonCode !== null && session.reasonCode !== ''
                ? rollbackCodeKey(session.reasonCode)
                : null,
            counts: [],
            leftovers: [],
            leftoversTruncated: false,
            removals: [],
            removalsCount: 0,
            removalsTruncated: false,
            createdSkipped: [],
            createdSkippedCount: 0,
            createdSkippedTruncated: false,
            createdRefusedReason: null,
            skippedCount: 0,
            truncated: false,
            noticeKeys: [],
            warnings: pointWarnings,
            cursor: { from: numberOrNull(session.from), to: numberOrNull(session.to) },
            cursorBytes: { now: numberOrNull(session.cursorNowBytes), target: numberOrNull(session.cursorTargetBytes) },
            turns: numberOrNull(session.turns),
            active: session.active === true,
            guidance: rollbackGuidanceRows(session.guidance),
        });
    }
    return rows;
}
/** 点级告警（preview.warnings）→ 展示行；界面在面板级渲染一次（点级告警不归属任何段，绝不猜）。 */
export function rollbackPreviewWarnings(preview) {
    return rollbackGuidanceRows(preview?.warnings);
}
/** 点级指引（preview.guidance）→ 展示行（同上，面板级渲染一次）。 */
export function rollbackPreviewGuidance(preview) {
    return rollbackGuidanceRows(preview?.guidance);
}
/** ① 的原因键来源：workspace.reasonCode 优先 → 段摘要里的 workspace 段 → 未知（绝不编原因）。 */
function previewNoteReasonKey(workspace, segments) {
    const direct = workspace?.reasonCode;
    if (typeof direct === 'string' && direct !== '')
        return rollbackCodeKey(direct);
    const segment = segments?.find((item) => item.state === 'workspace');
    const code = segment?.reasonCode;
    if (typeof code === 'string' && code !== '')
        return rollbackCodeKey(code);
    return ROLLBACK_CODE_UNKNOWN_KEY;
}
/**
 * 预览态文案判定（**一处实现**：聊天对话框调用它；将来设置页若要复用同一口径也走这里）。
 *
 * @param input.workspace preview.workspace（缺失按「不可用」处理：没有记录信息 ⇒ 不能说「一致」）
 * @param input.session   preview.session（只有 `restorable === true` 才算「会话仍会回退」）
 * @param input.segments  段摘要（`preview.point.segments`；只用于 ① 的原因键回落，读 reasonCode 字段）
 * @param input.canRestore 宿主/判定层的回退门（缺省按 true；传 false 时不得声称「会话仍会回退」）
 */
export function rollbackPreviewNote(input) {
    const workspace = input.workspace ?? null;
    const session = input.session ?? null;
    const overwrite = countOf(workspace?.overwrite);
    const different = countOf(workspace?.different);
    const missing = countOf(workspace?.missing);
    /**
     * **会被删除**的条数（= 该点未记录 **且**过了安全判据的那些）。
     *
     * 为什么它必须参与「这句话说得说不说得」：宿主 rewind 的 `removeCreated` **缺省为真**
     * （src/routes/recovery.ts:459），所以「工作区与该点一致，无需恢复」在会删文件的点上同样是**假尾句**
     * —— 点下去真的会删文件（用户 2026-10-12 第 6 条）。
     *
     * 判据**只能**取 `removalsCount` / `removals`（引擎 `planCreatedRemovals` 的同一份规划）：
     * 拿「未记录总数」（`createdAfter` / `leftovers`）当删除数会**双向出错** —— 它把永不删除的
     * `.git` 路径也算进去，又把证明名单不完整时「一条都不删」的情形说成「工作区会变」。
     */
    const removals = Math.max(countOf(workspace?.removalsCount), Array.isArray(workspace?.removals) ? workspace.removals.length : 0);
    // 「会话仍会回退」两个条件都要：该段可回退 + 该点整体可回退（受保护点/两态不全时按钮本来就点不了，
    // 这时说「会话仍会回退到该点之前」同样是假话）
    const sessionForks = input.canRestore !== false && session?.restorable === true;
    // ① 工作区态没有可用记录
    if (workspace?.available !== true) {
        const reasonKey = previewNoteReasonKey(workspace, input.segments ?? undefined);
        return {
            kind: 'workspace-unavailable',
            key: sessionForks ? 'rollback.preview.files.unavailableSession' : 'rollback.preview.files.unavailable',
            reasonKey,
            changesSomething: sessionForks,
            sessionForks,
        };
    }
    // ⓪ 工作区态可用，但该点**未记录**的新建内容会被删掉 ⇒ 工作区真会变，
    //    「一致 / 无需恢复」在这里也是假尾句（宁可不说话：删掉的文件由列表逐条说出来）。
    if (removals > 0) {
        return { kind: 'workspace-changes', key: null, reasonKey: null, changesSomething: true, sessionForks };
    }
    // ② 该点没记录任何文件
    if (overwrite === 0) {
        return {
            kind: 'no-recorded-files',
            key: sessionForks ? 'rollback.preview.files.noFilesSession' : 'rollback.preview.result.noFiles',
            reasonKey: null,
            changesSomething: sessionForks,
            sessionForks,
        };
    }
    // 工作区真会写文件 ⇒ 没有「一致」句（由文件列表说话）；这也是假尾句禁令的前置保护
    if (different > 0 || missing > 0) {
        return { kind: 'workspace-changes', key: null, reasonKey: null, changesSomething: true, sessionForks };
    }
    // ③a 工作区一致，但会话仍会回退 ⇒ 只说工作区（**禁止**「无需恢复」：点下去真会 fork）
    if (sessionForks) {
        return { kind: 'workspace-consistent-session', key: 'rollback.preview.files.consistentSession', reasonKey: null, changesSomething: true, sessionForks: true };
    }
    // ③b 工作区一致且无事可做
    return { kind: 'workspace-consistent-noop', key: 'rollback.preview.files.empty', reasonKey: null, changesSomething: false, sessionForks: false };
}
/**
 * 预览里的「可回退 / 可删除」判定。
 *
 * **原因键按宿主真实形状分派**（引擎 preview 恒回 `code:'ok'`，靠 canRestore/canRemove 表达拒绝 ——
 * 见 src/core/rollback-point.ts:1530-1531：`canRemove = !protected && kind!=='guard'`（删除门）与
 * `canRestore = !protected && !incomplete && (workspaceRestorable || sessionRestorable)`（回退门）**互相独立**）：
 *   ① 受保护点 → rollback.code.protected-point（引擎 remove/rewind 都拒）
 *   ② 两态不全 → rollback.preview.reason.incomplete（引擎要 allowPartial 才放行）
 *   ③ 一段都不可回退 → 段自己的 reasonCode；没有就 rollback.preview.none
 *   ④ 宿主给了非 ok 的 code → 该 code 的键
 *   ⑤ 兜底：救援点 → rollback.preview.reason.guard（宿主拒绝了本可回退的救援点）；其余 → rollback.preview.reason.hostRefused
 *      —— **绝不回落 rollback.code.unknown**
 * 救援点（guard）在 ①②③ 之外**是可回退的**（t22）：它只在宿主真的拒绝时落到 ⑤。
 */
export function rollbackPreviewVerdict(preview) {
    if (preview === null) {
        return { canRestore: false, canRemove: false, reasonKey: ROLLBACK_CODE_UNKNOWN_KEY, mode: 'files+session', segments: [], incomplete: false };
    }
    const segments = [];
    if (preview.workspace !== undefined && preview.workspace !== null && segmentAvailable(preview.workspace))
        segments.push('workspace');
    if (preview.session !== undefined && preview.session !== null && segmentAvailable(preview.session))
        segments.push('session');
    const point = preview.point ?? preview.summary ?? null;
    const protectedPoint = point?.protected === true;
    const guardPoint = point?.kind === 'guard';
    const incomplete = point?.incomplete === true;
    const canRestore = preview.canRestore === true && segments.length > 0;
    let reasonKey = null;
    if (!canRestore) {
        const segmentReason = preview.session?.reasonCode ?? preview.workspace?.reasonCode;
        if (protectedPoint)
            reasonKey = 'rollback.code.protected-point';
        else if (incomplete)
            reasonKey = ROLLBACK_PREVIEW_REASON_INCOMPLETE_KEY;
        else if (segments.length === 0) {
            reasonKey = typeof segmentReason === 'string' && segmentReason !== '' ? rollbackCodeKey(segmentReason) : 'rollback.preview.none';
        }
        else if (preview.code !== undefined && preview.code !== '' && preview.code !== 'ok')
            reasonKey = rollbackCodeKey(preview.code);
        // 兜底：宿主拒绝了一个「看起来可恢复」的点。救援点在这里单独说清（它本来是可回退目标，t22）——
        // 绝不把它写成「受保护」或「一律不可回退」。
        else
            reasonKey = guardPoint ? ROLLBACK_PREVIEW_REASON_GUARD_KEY : ROLLBACK_PREVIEW_REASON_HOST_REFUSED_KEY;
    }
    return {
        canRestore,
        canRemove: preview.canRemove === true,
        reasonKey,
        mode: rollbackModeFromSegments(segments),
        segments,
        incomplete,
    };
}
export function rollbackRewindRows(result) {
    if (result === null)
        return [];
    const segments = Array.isArray(result.segments) ? result.segments : [];
    return segments.map((segment) => {
        const status = segment.status === 'restored' ? 'restored' : segment.status === 'skipped' ? 'skipped' : segment.status === 'failed' ? 'failed' : 'unknown';
        const statusKey = status === 'unknown' ? 'rollback.segment.unknown' : 'rollback.segment.' + status;
        const badgeKind = status === 'restored' ? 'ok' : status === 'skipped' ? 'warn' : 'error';
        const leftovers = redactLines(segment.leftovers);
        const childSessionId = typeof segment.childSessionId === 'string' && segment.childSessionId !== '' ? segment.childSessionId : null;
        return {
            state: segment.state,
            labelKey: rollbackStateKey(segment.state),
            statusKey,
            badgeKind,
            restored: numberOrNull(segment.restored) ?? 0,
            failed: numberOrNull(segment.failed) ?? 0,
            leftoversCount: Math.max(leftovers.length, countOf(segment.createdAfter)),
            removedCount: countOf(segment.removed),
            leftovers,
            leftoversTruncated: segment.leftoversTruncated === true || segment.createdAfterTruncated === true,
            childSessionId,
            detail: redactLines(segment.detail),
            guidance: rollbackGuidanceRows(segment.guidance),
            foreignSkipped: numberOrNull(segment.foreignSkipped) ?? 0,
            selectionSkipped: numberOrNull(segment.selectionSkipped) ?? 0,
            mergedCount: numberOrNull(segment.mergedCount) ?? 0,
            conflictCount: numberOrNull(segment.conflictCount) ?? 0,
            conflictPaths: redactLines(segment.conflictPaths),
            unavailableCount: numberOrNull(segment.unavailableCount) ?? 0,
            concurrentCount: numberOrNull(segment.concurrentCount) ?? 0,
            unclaimedCount: numberOrNull(segment.externalCount) ?? 0,
            unclaimedPaths: redactLines(segment.externalPaths),
        };
    });
}
/** 回退总体结论 → 字典键 + 徽章语义（未知回落 unknown，绝不裸渲染 outcome）。 */
export function rollbackOutcome(outcome) {
    if (outcome === 'restored')
        return { key: 'rollback.outcome.restored', badgeKind: 'ok' };
    if (outcome === 'partial')
        return { key: 'rollback.outcome.partial', badgeKind: 'warn' };
    if (outcome === 'failed' || outcome === 'denied')
        return { key: 'rollback.outcome.' + outcome, badgeKind: 'error' };
    return { key: 'rollback.outcome.unknown', badgeKind: 'error' };
}
/** 回退结果汇总计数（界面一句话说清「恢复多少 / 失败多少 / 没删多少」）。 */
export function rollbackRewindCounts(result) {
    const rows = rollbackRewindRows(result);
    let restored = 0;
    let failed = 0;
    let leftovers = 0;
    let removed = 0;
    for (const row of rows) {
        restored += row.restored;
        failed += row.failed;
        leftovers += row.leftoversCount;
        removed += row.removedCount;
    }
    return { restored, failed, leftovers, removed };
}
/**
 * 会话回退的 fork 结果（S3）：原会话日志**只读**，回退产出的是一个新子会话。
 * 返回 null = 本次没有会话回退（界面不渲染这一行，绝不编造子会话 id）。
 */
export function rollbackChildSession(result) {
    const direct = result?.childSessionId;
    if (typeof direct === 'string' && direct !== '')
        return { key: 'rollback.rewind.result.child', id: direct };
    for (const segment of result?.segments ?? []) {
        const id = segment.childSessionId;
        if (typeof id === 'string' && id !== '')
            return { key: 'rollback.rewind.result.child', id };
    }
    return null;
}
/** 本次因前段失败 / 未请求而未执行的段（只可能是两态；未知段回落 unknown 键）。 */
export function rollbackSkippedSegments(result) {
    const segments = Array.isArray(result?.skippedSegments) ? result.skippedSegments : [];
    return segments.map((state) => ({ state, key: rollbackStateKey(state) }));
}
/* ------------------------------------------------------------ 文案键常量（面板复用） */
/** 删除成功文案键（delete 的 `code:'deleted'`）。 */
export const ROLLBACK_DELETED_KEY = 'rollback.code.deleted';
/** 「没有可回退的内容」文案键（预览判定为否时的兜底原因）。 */
export const ROLLBACK_PREVIEW_NONE_KEY = 'rollback.preview.none';
//# sourceMappingURL=rollback-view.js.map