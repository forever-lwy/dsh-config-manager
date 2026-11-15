import type { DiffHunk } from '../utils/line-diff.ts';
/** 只保留两态（S2）：工作区 + 会话。 */
export declare const ROLLBACK_STATES: readonly ['workspace', 'session'];
export type RollbackState = (typeof ROLLBACK_STATES)[number];
/** 段名 → 是否为受支持的段（出现别的段一律按未知处理，绝不假设它是第三态）。 */
export declare function isRollbackState(value: unknown): value is RollbackState;
/**
 * 回退范围三选一（冻结 wire contract 的 `mode`）：
 *  - `files+session`：工作区文件 + 会话（新子会话）一起回退；
 *  - `files`：只回退工作区文件；
 *  - `session`：只回退会话（fork 子会话）。
 */
export declare const ROLLBACK_MODES: readonly ['files+session', 'files', 'session'];
export type RollbackMode = (typeof ROLLBACK_MODES)[number];
export declare function isRollbackMode(value: unknown): value is RollbackMode;
/** mode → 段集合（workspace 段 = 工作区文件；session 段 = 会话）。 */
export declare function rollbackModeSegments(mode: string | null | undefined): RollbackState[];
/**
 * 该 mode 在当前可回退段集合下**是否可选**（界面据此禁用注定失败的选项）。
 *
 * 例：某点没有稳定边界（session 段 restorable=false）时，`session` 与 `files+session` 都不可选 ——
 * 绝不发一个宿主一定会拒绝的请求。
 */
export declare function rollbackModeAvailable(mode: string | null | undefined, availableSegments: readonly string[]): boolean;
/** 段集合 → mode（三选一；空集合回落 `files+session`，因为那正是自动点缺省该回退的两态）。 */
export declare function rollbackModeFromSegments(segments: readonly string[]): RollbackMode;
export declare const ROLLBACK_STATE_UNKNOWN_KEY = "rollback.state.unknown";
export declare const ROLLBACK_MODE_UNKNOWN_KEY = "rollback.mode.unknown";
export declare const ROLLBACK_CODE_UNKNOWN_KEY = "rollback.code.unknown";
export declare const ROLLBACK_GUIDANCE_UNKNOWN_KEY = "rollback.guidance.unknown";
export declare const ROLLBACK_KIND_UNKNOWN_KEY = "rollback.kind.unknown";
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
export declare const ROLLBACK_CODES: readonly string[];
/**
 * 已知指引码后缀（T1 引擎实际产出；白名单外回落 unknown）。
 *
 * 引擎回传的是**完整字典键**（rollback.guidance.workspaceRolledBack），旧检查点引擎回传的是
 * **裸后缀**（workspacePartial）—— 映射两种形态都认，避免把已知指引误判成 unknown
 * （那会让「工作区已回滚 / 已 fork 子会话」这类关键事实消失）。
 */
export declare const ROLLBACK_GUIDANCE_CODES: readonly string[];
/** 已知告警码后缀（warnings 走独立一族 rollback.warn.*；白名单外回落 rollback.warn.unknown）。 */
export declare const ROLLBACK_WARN_CODES: readonly string[];
export declare const ROLLBACK_WARN_UNKNOWN_KEY = "rollback.warn.unknown";
/** 段名 → 字典键（非两态回落 unknown，绝不裸渲染）。 */
export declare function rollbackStateKey(state: string | null | undefined): string;
/** mode → 字典键（三选一；其它回落 unknown）。 */
export declare function rollbackModeKey(mode: string | null | undefined): string;
/** 救援点策略（S5 guard）→ 字典键（未知回落 unknown）。 */
export declare function rollbackGuardPolicyKey(policy: string | null | undefined): string;
/** 机器码 → 字典键（白名单外回落 unknown）。 */
export declare function rollbackCodeKey(code: string | null | undefined): string;
export interface RollbackGuidance {
    code: string;
    detail?: string;
}
export interface RollbackGuidanceRowView {
    key: string;
    detail: string | null;
}
/** 指引 / 告警：code → rollback.guidance.* / rollback.warn.*（三种形态都认），detail 过 redact。 */
export declare function rollbackGuidanceRows(items: readonly RollbackGuidance[] | undefined): RollbackGuidanceRowView[];
/**
 * 每会话最多保留的**自动点**（超出只淘汰最旧的自动点 —— 引擎 selectPrune 的自动点桶）。
 * 救援点（guard）不占这个额度、也不被它淘汰，但有自己的**两道**上限
 * （每会话引擎 ROLLBACK_MAX_GUARDS_PER_SESSION / 全局 ROLLBACK_MAX_GUARDS）。
 */
export declare const ROLLBACK_MAX_POINTS_PER_SESSION = 20;
/** 全局最多保留的**自动点**（同上，只淘汰最旧的自动点）。 */
export declare const ROLLBACK_MAX_POINTS_TOTAL = 50;
/** 每会话最多保留的**救援点**（guard）：超出只淘汰最旧的救援点；数值 = 引擎 ROLLBACK_MAX_GUARDS_PER_SESSION。 */
export declare const ROLLBACK_MAX_POINTS_GUARDS_PER_SESSION = 20;
/**
 * **全局**最多保留的**救援点**（guard）：与 ROLLBACK_MAX_POINTS_TOTAL **互相独立**
 * （两类各计预算，谁也不吃谁额度；数值相同不是耦合），超出只淘汰最旧的救援点。
 * 数值 = 引擎 ROLLBACK_MAX_GUARDS（两侧必须同步，T17 用例逐句钉住）。
 */
export declare const ROLLBACK_MAX_POINTS_GUARDS_TOTAL = 50;
/**
 * 预览不可回退时的原因键（按宿主真实形状分派；**绝不回落 rollback.code.unknown**）。
 *
 * 注意（t22 冻结口径）：救援点**可以**作为回退目标 —— 引擎 canRestore = !protected && !incomplete &&
 * 至少一段可恢复（**不含** kind!=='guard'，见 src/core/rollback-point.ts:1531）。所以这个键**只在
 * 宿主真的拒绝了一个看起来可恢复的救援点**（canRestore=false 且不是 protected/incomplete/无可用段）时使用，
 * 不是「救援点一律不可回退」。
 */
export declare const ROLLBACK_PREVIEW_REASON_GUARD_KEY = "rollback.preview.reason.guard";
export declare const ROLLBACK_PREVIEW_REASON_INCOMPLETE_KEY = "rollback.preview.reason.incomplete";
export declare const ROLLBACK_PREVIEW_REASON_HOST_REFUSED_KEY = "rollback.preview.reason.hostRefused";
export type RollbackPointKind = 'auto' | 'guard';
export type RollbackOutcome = 'restored' | 'partial' | 'failed' | 'denied';
export type RollbackSegmentStatus = 'restored' | 'skipped' | 'failed';
export type RollbackGuardPolicy = 'require' | 'warn' | 'off';
/** 单段摘要（恒为 workspace / session 两项；state 用 string 以便未知值也能被映射成 unknown 键）。 */
export interface RollbackSegmentSummary {
    state: string;
    ok?: boolean;
    degraded?: boolean;
    capturedAt?: number;
    reasonCode?: string | null;
    /** 该段捕获的条目数（工作区文件数 / 会话 0|1） */
    entries?: number;
    bytes?: number;
    /** 会话段：游标（seq） */
    cursorBytes?: number | null;
    /** 该段**可回退**（有内容副本 / 有可写回条目） */
    restorable?: boolean;
    /** 留点时的**跳过条目总数**（工作区态：skipped + excludedDirs；会话态恒 0）—— S4「跳过并如实报告」 */
    skippedCount?: number;
    /** 该段捕获是否被上限截断（工作区态 = 单文件上限 / 字节预算 / 文件数预算任一命中） */
    truncated?: boolean;
}
export interface RollbackPointSummary {
    id: string;
    createdAt: number;
    /** 自动留点归属的会话（自动点必有；无会话的旧记录为 null） */
    sessionId?: string | null;
    /** 会话单元 id（宿主回传的 <projectKey>/<sessionId>；用于分组表头） */
    unitId?: string | null;
    /**
     * 对话标题：宿主从 DSH 会话缓存补的**只读装饰**（与 /recovery/sessions 同一份索引）。
     * 读不到就**不带该字段** —— 界面回落显示 `sessionId`，绝不编造标题。
     */
    title?: string | null;
    /** 该点对应的回合号（1-based；无法判定为 null） */
    turn?: number | null;
    /** fork 的 inclusive 边界 seq（null = 无前置边界） */
    boundarySeq?: number | null;
    /** auto = 回合结束自动留点；guard = 回退前救援点 */
    kind?: string;
    protected?: boolean;
    /** 两态缺一（缺省不允许回退） */
    incomplete?: boolean;
    note?: string | null;
    /** 两态 capturedAt 的跨度（诚实事实，无同点判定） */
    spreadMs?: number;
    segments?: RollbackSegmentSummary[];
}
/**
 * 台账占用（issue #89 P2：可观测）。
 * `bytes` = records/ + payloads/ 的实际字节数；`budgetBytes` = 触发淘汰的字节预算；
 * `evicted` = 本进程内被预算淘汰的自动点累计数。缺省（老宿主没这个字段）= 界面不渲染这一行。
 */
export interface RollbackLedgerStatus {
    records: number;
    bytes: number;
    budgetBytes: number;
    evicted: number;
    /**
     * 已超预算且**无处可淘汰**（典型：单条点本身就大于预算）。
     * 老宿主没有这个字段 ⇒ `undefined` 与 `false` 同义，绝不因为读不到就报警。
     */
    overBudget?: boolean;
}
export interface RollbackStorageStatus {
    available: boolean;
    root?: string;
    detail?: string;
    guidance?: RollbackGuidance[];
    requirements?: readonly string[];
    /** 磁盘偏好：回合自动留点开关（缺省 / false = 关闭） */
    rollbackEnabled?: boolean;
    /** 本进程此刻是否真的在留点（关闭后订阅已解绑）。与 rollbackEnabled 正常一致 */
    rollbackActive?: boolean;
    /** 台账占用（老宿主没有这个字段） */
    ledger?: RollbackLedgerStatus;
}
/** 开关读 / 写的结果（POST 成功才会改进程 gate）。 */
export interface RollbackPrefsResult {
    ok: boolean;
    rollbackEnabled: boolean;
    rollbackActive?: boolean;
}
/** 台账清理结果（只删自动点；guard 与 protected 保留）。 */
export interface RollbackPurgeResult {
    ok: boolean;
    code?: string;
    detail?: string;
    removedRecords?: number;
    removedPayloads?: number;
    removedObjects?: number;
    bytes?: number;
}
export interface RollbackListResult {
    ok?: boolean;
    points: RollbackPointSummary[];
    storage: RollbackStorageStatus;
    error?: string;
    /** 全局留存上限（S6：50） */
    maxRecords?: number;
    /** 每会话留存上限（S6：20） */
    maxRecordsPerSession?: number;
    /** **全局**救援点留存上限（S6 第二道 guard 预算：50） */
    maxGuards?: number;
}
export interface RollbackDetailResult {
    ok: boolean;
    id: string;
    point: RollbackPointSummary;
    storage: RollbackStorageStatus;
}
/** 计数或清单：宿主回传数字就取数字，回传清单就取长度（两者都是「有多少项」）。 */
export type RollbackCount = number | readonly string[];
/**
 * 预览里「回退会改动的一个文件」的动作。
 *
 * 与引擎（`src/core/rollback-point.ts` 的 `RollbackPreviewFileStatus`）**逐字同形**：
 *  · `overwrite` = 覆盖已有文件；`create` = 当前不存在（回退会重新创建）；
 *  · `delete` **不由 `files[]` 产出**：整文件删除走**另一条**清单
 *    （`RollbackWorkspacePreview.removals` = 会删的，`createdSkipped` = 拒删的）——
 *    那些路径不在该点的记录里，所以既不进这份逐文件统计、也读不出前后对照。
 *    保留该取值只为契约形状向前兼容 —— 界面不得为它编文案。
 */
export type RollbackPreviewFileStatus = 'overwrite' | 'create' | 'delete';
/**
 * E1：逐文件的行级统计（简洁版预览弹窗 `preview.workspace.files` 的元素形状）。
 *
 * **只列真的会被改动的文件** —— 已与快照一致的条目一个都不列（「353 项里 0 项不同」⇒ 空数组）。
 * `added` / `removed` 可能是 `null`（单文件超上限 / 单张预览累计超限 / Myers 步数超限 /
 * 非文本 / 对象仓读不出），此时 `truncated` 为 true：界面说「行数未统计」，
 * **绝不写成 0**（0 是一个会被证伪的具体数字，而「不知道」不是）。
 */
export interface RollbackPreviewFile {
    /** 绝对路径（界面只做展示）。 */
    path: string;
    status: RollbackPreviewFileStatus;
    /** 回退会让该文件**新增**的行数；null = 本次不给数字（见 truncated）。 */
    added: number | null;
    /** 回退会从该文件**删除**的行数；null = 同上。 */
    removed: number | null;
    /** true = 本次没有可信行数（added/removed 均为 null）。**宁可说「不知道」，也绝不谎报行数。** */
    truncated: boolean;
    /**
     * true = 该文件在留点**之后**是**别的会话**写的（写入归属台账证明；见 core/rollback-attribution.ts）。
     * 界面据此默认不勾选它（用户仍可勾上）。缺字段 / false = **没有归属证据**，
     * 而不是「本会话写的」——「未判定」与「确知是本会话」必须分开。
     */
    foreign?: boolean;
    /** 那些「别的会话」的会话 id（仅当 foreign 为 true） */
    foreignSessionId?: string;
    /** 那次写入的时间（毫秒；仅当 foreign 为 true） */
    foreignAt?: number;
    /**
     * true = 这次回退**不会改动它**（与其它对话的改动冲突 / 无法安全合并）。行级统计为 null ——
     * 「不改动」不是「0 行变化」，界面必须分开说。
     */
    skipped?: boolean;
    /** 不改动的机器原因（界面映射成字典键，绝不裸渲染） */
    mergeReason?: string;
}
export interface RollbackWorkspacePreview {
    /** 将被写回（覆盖）的条目数 */
    overwrite?: RollbackCount;
    /** 与当前内容不同、确实会被改动 */
    different?: RollbackCount;
    /** 记录里的文件当前已不存在（回退会重新创建） */
    missing?: RollbackCount;
    /**
     * 该点**未记录**的条目总数。**不是**「之后新建」，也**不是**「会被删除」——
     * 会被删的是 {@link removals} / {@link removalsCount}。
     */
    createdAfter?: RollbackCount;
    /** 该点**未记录**的路径清单（含被拒删的；宿主上限 20 条）—— **不是**删除清单 */
    leftovers?: string[];
    leftoversTruncated?: boolean;
    /** **会被删除**的路径（= 未记录 + 过了安全判据；宿主上限 20 条） */
    removals?: string[];
    /** 会被删除的**真实总数**（不受清单上限影响） */
    removalsCount?: RollbackCount;
    /** 删除逐条清单不完整（条数超上限 / 遍历被截断） */
    removalsTruncated?: boolean;
    /** 按安全判据**拒删**的路径（.git / node_modules / 数据区 / 越界 / 过大 / 捕获不完整时的全部候选） */
    createdSkipped?: string[];
    /** 拒删路径的**真实总数** */
    createdSkippedCount?: RollbackCount;
    createdSkippedTruncated?: boolean;
    /**
     * 非 null = 该点捕获**不完整** ⇒ **一条都没删**（安全拒删：绝不误删既有文件）。
     * 界面必须如实说，绝不把它渲染成「无事可做 / 已一致」。
     */
    createdRefusedReason?: string | null;
    /** 记录在案的分块（绝对路径；界面只做展示，不做判定） */
    chunks?: string[];
    /**
     * E1：逐文件的行级统计 —— **只含会被改动的文件**（内容已一致的条目一个都不列）。
     *
     * 可选（`?`）是**刻意的向后兼容**：老响应 / 老宿主不认识这个字段，缺省必须回落
     * 「没有这条信息」，而不是被当成「空数组＝全部一致」或抛错 —— 界面据「字段是否存在」
     * 决定是否显示文件列表，绝不把「缺字段」与「确知为空」混成同一件事。
     */
    files?: RollbackPreviewFile[];
    /** 捕获时被跳过的条目总数（skipped + excludedDirs；逐条列表的上限截断不影响本计数） */
    skippedCount?: RollbackCount;
    /** 捕获是否被上限截断（超单文件上限 / 字节预算 / 文件数预算任一命中即为 true） */
    truncated?: boolean;
    available?: boolean;
    reasonCode?: string | null;
    guidance?: RollbackGuidance[];
}
export interface RollbackSessionPreview {
    /** 回退目标边界：目标回合开始前最后一个事件的 seq（fork 的 inclusive 边界；无边界为 null） */
    from?: number | null;
    /** 该回合 turn/end 的 seq（无边界为 null） */
    to?: number | null;
    /** 该点对应的回合号 */
    turns?: number;
    /** 当前事件游标（seq） */
    cursorSeq?: number | null;
    /** 当前日志字节数 */
    cursorNowBytes?: number | null;
    /** 目标边界的字节数 */
    cursorTargetBytes?: number | null;
    /** 该段是否可回退（无边界 / 副本缺失 → false） */
    restorable?: boolean;
    /** 日志刚被写过（仅供参考：fork 只读，不会覆盖日志） */
    active?: boolean;
    reasonCode?: string | null;
    available?: boolean;
    guidance?: RollbackGuidance[];
}
export interface RollbackPreviewResult {
    ok: boolean;
    code?: string;
    detail?: string;
    id: string;
    storage: RollbackStorageStatus;
    workspace?: RollbackWorkspacePreview | null;
    session?: RollbackSessionPreview | null;
    /** 该点的两态摘要（宿主回传；缺失时界面用列表行里的同一份摘要） */
    point?: RollbackPointSummary | null;
    /** 宿主给出的权威判定（本层在此基础上再要求「至少有一段可回退」） */
    canRestore?: boolean;
    canRemove?: boolean;
    summary?: RollbackPointSummary;
    guidance?: RollbackGuidance[];
    warnings?: RollbackGuidance[];
}
/** 单文件差异里一侧（与引擎 `RollbackFileDiffSide` 逐字同形：字段名/含义都一致）。 */
export interface RollbackFileDiffSide {
    exists: boolean;
    bytes: number;
    /** 行数；null = 未读取（二进制 / 超限 / 不可读） */
    lines: number | null;
    binary: boolean;
    oversized: boolean;
    unreadable: boolean;
}
/** 无法逐行对比的原因（有值时 hunks 恒为空数组 —— 「不知道」不是「没有差异」）。 */
export type RollbackFileDiffReason = 'missing-blob' | 'binary' | 'too-large' | 'unreadable';
/**
 * 单文件前后对照（引擎 `fileDiff` 的镜像；只列一条记录）。
 *
 * 方向：`before` = **当前磁盘**，`after` = **回退点快照**（点下回退之后该文件的样子）——
 * 与预览行数统计同一口径，界面左右双栏与之一致，别读反。
 */
export interface RollbackFileDiffResult {
    ok: boolean;
    code?: string;
    detail?: string;
    id: string;
    path: string;
    status: RollbackPreviewFileStatus;
    before: RollbackFileDiffSide;
    after: RollbackFileDiffSide;
    hunks: DiffHunk[];
    added: number;
    removed: number;
    identical: boolean;
    degraded: boolean;
    reason?: RollbackFileDiffReason;
    /** true = 「回退后」一侧显示的是三方合并的结果（不是记录里的原文） */
    merged?: boolean;
    /** true = 这次回退不会改动它（冲突 / 无法安全合并）——此时两侧相同 */
    mergeSkipped?: boolean;
    /** 不改动的机器原因（界面映射成字典键） */
    mergeReason?: string;
}
export interface RollbackSegmentResult {
    state: string;
    status: string;
    reasonCode?: string;
    /** 逐条事实（技术细节，非用户可见文案） */
    detail?: string[];
    restored?: number;
    failed?: number;
    /** 该点**未记录**的路径（含被拒删的；宿主上限 20 条）。**不是**删除清单 —— 那一份是 removedPaths */
    leftovers?: string[];
    leftoversTruncated?: boolean;
    /** 本次真的删掉的「该点未记录」路径数（用户 2026-10-11 定案 A） */
    removed?: number;
    /** 已删除路径（有界清单；与预览的 workspace.removals 同源同序） */
    removedPaths?: string[];
    /** 想删但按安全判据拒删的路径（越界 / 数据区 / .git / node_modules / 过大 / 捕获不完整），如实报告 */
    createdSkipped?: string[];
    /** 拒删路径的**真实总数**（不受清单上限影响） */
    createdSkippedCount?: RollbackCount;
    createdSkippedTruncated?: boolean;
    /** 非 null = 该点捕获**不完整** ⇒ 一条都没删（安全拒删） */
    createdRefusedReason?: string | null;
    /** 工作区段：实际写回的字节数（宿主回传才有） */
    writtenBytes?: number;
    /** 因归属隔离（B）跳过的记录条目数：该文件在留点后被**别的会话**写过（宿主回传才有） */
    foreignSkipped?: number;
    /** 因路径选择（A）跳过的记录条目数（宿主回传才有） */
    selectionSkipped?: number;
    /** 三方合并成功、写回「撤销本会话 + 保留对方改动」的条目数（宿主回传才有） */
    mergedCount?: number;
    mergedPaths?: string[];
    /** 冲突：两侧改到同一处 ⇒ 未写（宿主回传才有） */
    conflictCount?: number;
    conflictPaths?: string[];
    /** 无法安全撤销 ⇒ 未写（宿主回传才有） */
    unavailableCount?: number;
    unavailablePaths?: string[];
    /**
     * **落点无人认领**（时间窗证据表明那一刻没有任何会话活跃：手改 / 外部工具 / 另一个进程）
     * ⇒ 未写（宿主回传才有）。与 unavailableCount 分开：成因不同，用户要做的事也不同。
     */
    externalCount?: number;
    externalPaths?: string[];
    /** 写入前发现又被改过（并发）⇒ 未写（宿主回传才有） */
    concurrentCount?: number;
    concurrentPaths?: string[];
    /** 兼容形态：宿主只回传计数时也算得出来 */
    createdAfter?: RollbackCount;
    createdAfterTruncated?: boolean;
    /** 会话段：回退产生的 fork 子会话 id */
    childSessionId?: string;
    guidance?: RollbackGuidance[];
}
export interface RollbackRewindResult {
    ok: boolean;
    outcome: string;
    code: string;
    detail?: string;
    id?: string;
    segments?: RollbackSegmentResult[];
    /** 因前段失败 / 未请求而未执行的段（只可能是两态） */
    skippedSegments?: string[];
    /** 会话回退结果：fork 出来的子会话 id（S3；原会话日志只读，绝不改写） */
    childSessionId?: string;
    /** 回退前自动留的救援点 id（S5 guard） */
    guardPointId?: string;
    storage?: RollbackStorageStatus;
    guidance?: RollbackGuidance[];
    warnings?: RollbackGuidance[];
}
export interface RollbackRemoveResult {
    ok: boolean;
    code: string;
    detail?: string;
    id: string;
}
/** 回退输入（冻结 wire contract 的 rewind body）。 */
export interface RollbackRewindOptions {
    /** fail-closed 确认门：必须**恰好** true（宿主缺省/假值一律 409 confirmation-required） */
    userConfirmed: boolean;
    mode?: RollbackMode;
    segments?: readonly RollbackState[];
    allowPartial?: boolean;
    preRewindGuard?: RollbackGuardPolicy;
    /**
     * 路径级选择性恢复（2026-10-17 定案 A）：只恢复这些路径。
     *
     * 缺省 = 全量口径（一字不变）。**空数组是无效输入**（宿主 400）—— 「一个都没勾」由界面拦住，
     * 绝不让它变成「整次回退静默 noop」。
     */
    onlyPaths?: readonly string[];
}
/** 端口：由 src/client/recovery/recovery-api.ts 实现（Partial 消费，缺失时界面如实说能力缺失）。 */
export interface RollbackPointPort {
    rollbackPoints(): Promise<RollbackListResult>;
    rollbackPointStorage(): Promise<RollbackStorageStatus>;
    rollbackPoint(id: string): Promise<RollbackDetailResult>;
    rollbackPointPreview(id: string): Promise<RollbackPreviewResult>;
    /**
     * 只读：该点里**一个记录在案文件**的前后逐行对照（预览弹窗按需拉取；未命中记录一律拒绝）。
     * 可选实现：端口缺失该方法时，界面**不显示**「查看」（绝不给一个点了没反应的入口）。
     */
    rollbackPointFileDiff?(id: string, path: string): Promise<RollbackFileDiffResult>;
    restoreRollbackPoint(id: string, opts: RollbackRewindOptions): Promise<RollbackRewindResult>;
    removeRollbackPoint(id: string, userConfirmed: boolean): Promise<RollbackRemoveResult>;
    /**
     * 回合自动留点开关（issue #88：它跟配置备份/同步是两件事，必须能关）。
     * 可选实现：端口缺失时界面**不渲染**开关（绝不给一个点了没反应的入口）。
     */
    rollbackPrefs?(): Promise<RollbackPrefsResult>;
    setRollbackEnabled?(enabled: boolean): Promise<RollbackPrefsResult>;
    /**
     * 清理台账（issue #89 P1/P2：把已经涨上去的占用收回来）。
     * **只删自动点**；`includeGuards` 为 true 时连 guard 也删，protected 永不删。
     */
    purgeRollbackPoints?(opts: {
        includeGuards: boolean;
    }): Promise<RollbackPurgeResult>;
}
/**
 * 聊天内「↺ 回退」入口是否可见（issue #88：关闭后**收起**入口，不是置灰）。
 *
 * 判据只有一条：**宿主回传的开关**。老宿主（storage 响应里没有 `rollbackEnabled` 字段）按
 * 「未提供 = 功能默认开」处理 —— 那一版的语义就是默认启用，此时把入口藏起来会让用户
 * 「有点但没有入口」。形状不符（不是布尔）同样按「未提供」处理，绝不因为一个坏字段藏掉入口。
 */
export declare function rollbackEntryVisible(storage: RollbackStorageStatus | null | undefined): boolean;
export interface RollbackSegmentView {
    state: string;
    labelKey: string;
    restorable: boolean;
    /** ok = 正常；warn = 捕获不完整（degraded）；error = 没捕到 / 失败 */
    badgeKind: 'ok' | 'warn' | 'error';
    entries: number;
    cursorBytes: number | null;
    reasonKey: string | null;
    /** 留点时被跳过的条目总数（S4：跳过必须可见，绝不静默） */
    skippedCount: number;
    /** 该段捕获被上限截断 */
    truncated: boolean;
    /** 该段要显示的告警键（有序；空数组 = 没有需要说的）—— 文案在字典里，本层只回键 */
    noticeKeys: string[];
}
/** 段级 / 点级「跳过 · 截断」告警键（S4：宿主已如实回传，界面必须说出来）。 */
export declare const ROLLBACK_NOTICE_SKIPPED_KEY = "rollback.row.notice.skipped";
export declare const ROLLBACK_NOTICE_TRUNCATED_KEY = "rollback.row.notice.truncated";
export declare const ROLLBACK_PREVIEW_NOTICE_SKIPPED_KEY = "rollback.preview.notice.skipped";
export declare const ROLLBACK_PREVIEW_NOTICE_TRUNCATED_KEY = "rollback.preview.notice.truncated";
export interface RollbackPointRowView {
    id: string;
    /** 来源：auto（回合结束自动留点）/ guard（回退前救援点）/ unknown */
    kind: RollbackPointKind | 'unknown';
    kindKey: string;
    createdAtMs: number;
    sessionId: string | null;
    /** 会话单元 id（宿主回传才有；分组表头显示用） */
    unitId: string | null;
    /** 对话标题（宿主补的只读装饰，**渲染前已过 redact**；null = 缓存里没有，界面回落显示 sessionId） */
    title: string | null;
    /** 该点对应的回合号（null = 未知，界面渲染 rollback.turnUnknown） */
    turn: number | null;
    protected: boolean;
    incomplete: boolean;
    badgeKind: 'ok' | 'warn' | 'error';
    spreadMs: number;
    segments: RollbackSegmentView[];
    /**
     * 至少有一段可回退、未保护、且两态齐全 —— 界面据此决定「回退」按钮可用性。
     * **救援点可以为 true**（t22：回退准入只拒 protected / incomplete；救援点正是「回到回退前」的唯一路径）。
     */
    rewindable: boolean;
    /**
     * 可删：受保护点与**救援点**都不可删（宿主 remove 一律 protected-point）。
     * 与 rewindable **互相独立**（引擎 canRemove / canRestore 两门，src/core/rollback-point.ts:1530-1531）。
     */
    removable: boolean;
    /** 用户自由文本：**渲染前已过 redact** */
    note: string | null;
}
/** 列表 → 展示行（台账已按时间倒序；本函数只做映射与判定，不重排）。 */
export declare function rollbackPointRows(list: RollbackListResult | null): RollbackPointRowView[];
export interface RollbackPointGroupView {
    /** 会话 id（宿主未回传则为 null —— 界面渲染 rollback.group.unknownSession，绝不猜归属） */
    sessionId: string | null;
    /** 会话单元 id（宿主回传才有） */
    unitId: string | null;
    /** 对话标题（组内任一记录带标题即取之；null = 无标题，界面回落显示 sessionId） */
    title: string | null;
    /** 组内最新时间（空组为 null；组间排序键） */
    latestAtMs: number | null;
    rows: RollbackPointRowView[];
}
/**
 * 台账 → **按会话分组**的时间线（组内保持台账顺序 = 时间倒序；组间按各组最新时间倒序）。
 *
 * 分组键 = sessionId；缺 sessionId 的记录归入「未知会话」组并排在最后 —— 绝不猜它属于哪个会话。
 */
export declare function rollbackPointGroups(list: RollbackListResult | null): RollbackPointGroupView[];
/** 该回滚点记下了多少个工作区文件（时间线上的「文件数」）。 */
export declare function rollbackRowFileCount(row: RollbackPointRowView): number;
/** 该回滚点是否有会话游标（时间线上的「是否有会话游标」—— 没有就只回退工作区）。 */
export declare function rollbackRowHasSessionCursor(row: RollbackPointRowView): boolean;
export interface RollbackCountRowView {
    key: string;
    n: number;
}
export interface RollbackPreviewRowView {
    state: string;
    labelKey: string;
    available: boolean;
    /** 宿主给出的原因码键（null = 没给；不可用时至少回落到 unknown，绝不裸渲染） */
    reasonKey: string | null;
    /** 有序计数文案：overwrite / different / missing / createdAfter（工作区段才有计数） */
    counts: RollbackCountRowView[];
    /** 该点**未记录**的路径清单（含被拒删的；已脱敏；宿主上限 20 条）—— **不是**删除清单 */
    leftovers: string[];
    leftoversTruncated: boolean;
    /**
     * **会被删除**的路径（已脱敏）—— **全量**（引擎不再切 20 条），与执行阶段同一份规划 ⇒ 逐条一致。
     * 界面直接把它渲染成「删除」行，**不需要**任何「清单可能不完整」的说明句。
     */
    removals: string[];
    /** 会被删除的条数（= {@link removals}.length） */
    removalsCount: number;
    removalsTruncated: boolean;
    /**
     * 按安全判据**拒删**的路径与条数、以及「**证明名单不完整** ⇒ 一条都没删」的原因。
     * **正文不渲染**（用户 2026-10-12：弹窗只要清单，不要说明句；文案克制 → DESIGN.md §7）——
     * 字段保留是引擎事实的投影，将来若放进 ⓘ / 工具提示可直接用。
     */
    createdSkipped: string[];
    createdSkippedCount: number;
    createdSkippedTruncated: boolean;
    createdRefusedReason: string | null;
    /** 留点时被跳过的条目总数（S4：跳过必须可见） */
    skippedCount: number;
    /** 捕获被上限截断 */
    truncated: boolean;
    /** 该行要显示的「跳过 · 截断」告警键（有序；空数组 = 没有要说的） */
    noticeKeys: string[];
    /**
     * **点级**告警（宿主 preview.warnings；走 rollback.warn.* 映射、未知码回落 unknown）。
     *
     * 引擎不给「告警属于哪一段」的键（detail 是自由文本，解析它等于猜），所以点级告警**两行都带同一份**，
     * 由界面在面板级渲染一次（rollbackPreviewWarnings()）—— 本层绝不猜归属。
     */
    warnings: RollbackGuidanceRowView[];
    /** 会话段：边界游标 from → to（seq；缺失为 null） */
    cursor: {
        from: number | null;
        to: number | null;
    } | null;
    /** 会话段：日志字节数 now → target（宿主给得出才有；界面据此显示「会话 now→target」） */
    cursorBytes: {
        now: number | null;
        target: number | null;
    } | null;
    /** 会话段：该点对应的回合号（null = 未知，界面渲染 rollback.turnUnknown 口径） */
    turns: number | null;
    /** 会话段：日志刚被写过（仅供参考：fork 只读，不会覆盖日志） */
    active: boolean;
    guidance: RollbackGuidanceRowView[];
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
export declare function rollbackPreviewFileLabel(filePath: string): string;
/**
 * 文件行的**目录前缀**（弱化色那一段）+ 基名。
 *
 * 为什么必须有它（2026-10-12 用户截图实测）：只显示基名时 `.git/index` / `.git/HEAD` /
 * `.git/COMMIT_EDITMSG` 在屏幕上就是三个孤零零的英文单词，用户第一眼读不出「这是什么、在哪」；
 * 而完整路径又太长会把 ±行数推走。折中 = **目录弱化 + 基名主色 + 完整路径仍在 title**（信息不丢）。
 *
 * 语义（两边界都是刻意的）：
 *  · 路径里没有分隔符（`AGENTS.md` 也在根目录）⇒ `dir === ''` —— 调用方**不画**那一段，
 *    不会出现一颗孤零零的 `/`；
 *  · 尾分隔符一律剥掉（`src/a/` ⇒ dir `src`、base `a`），与 rollbackPreviewFileLabel 同一口径；
 *  · 只在**最后一个**分隔符处切（Windows 盘符 `C:\\a\\b` ⇒ dir `C:\\a`）。
 */
export interface RollbackPathParts {
    /** 目录（含尾随分隔符）；根目录文件是空串 */
    dir: string;
    /** 基名 */
    base: string;
}
export declare function splitRollbackPath(filePath: string): RollbackPathParts;
/**
 * 预览**汇总**（弹窗顶部那一条）：这次回退到底动多少东西。
 *
 * 为什么这是这一屏最该先看的信息：用户点「↺ 回退」后来到弹窗，先要判断「规模」再逐行核文件；
 * 没有汇总就得爬到第 8 行才知道「原来是 8 个文件」。所以它不是装饰，是**决策信息**
 * （DESIGN §7：只留能改变决定的信息 —— 数字留，描述性句子不留）。
 *
 * 口径三条（逐条可证伪，界面不得超出这里说的）：
 *  · `files` = **会被改动**的文件数（= 传进来的行数本身，不减去任何东西）；
 *  · `added` / `removed` **只累加可信行数**：任一侧是 null（超限 / 非文本 / 读不出）的文件两列都不计，
 *    否则「行数未统计」的文件会被当成 0 行 —— 那是一个会被证伪的具体断言（见 ChatPreviewFileRow 注释）；
 *  · 删除集是另一条清单（`removals`，与执行阶段同一份规划），**单独计数**，不与上方混加。
 */
export interface RollbackPreviewScope {
    files: number;
    /** 新增行数合计（只含两侧都可信的行） */
    added: number;
    /** 删除行数合计（同上） */
    removed: number;
    /** 整文件删除条数（引擎 removals，真的会删） */
    removals: number;
}
export declare function rollbackPreviewScope(files: readonly {
    added: number | null;
    removed: number | null;
}[], removals: readonly unknown[]): RollbackPreviewScope;
/**
 * 预览里「能被单独勾选」的一行 —— `workspace.files` 的逐条映射（**只含会被改动的文件**）。
 *
 * 为什么要有这一层（2026-10-17 定案 A+B）：A 要求用户能**逐文件**决定这次动哪些；
 * B（写入归属）给出「哪几个文件在留点之后是别的会话写的」，用来决定**默认**勾不勾。
 * 两件事都收敛在这里、只在这一处（框架无关、node 可测），组件只负责渲染与点击。
 */
export interface RollbackSelectionRow {
    path: string;
    /** 目录前缀 + 基名（与文件行同口径；展示用） */
    parts: RollbackPathParts;
    /** true = 该文件在留点**之后**是别的会话写的（引擎 foreign 标记；缺字段 = 没有归属证据） */
    foreign: boolean;
    /** 那些会话的 id（仅 foreign 时给得出） */
    foreignSessionId?: string;
}
/** 从预览推出可勾选行（只读；绝不改任何判定） */
export declare function rollbackSelectionRows(preview: RollbackPreviewResult | null): RollbackSelectionRow[];
/**
 * 默认勾选 = **非 foreign** 的行（B 的自动隔离口径）。用户可在弹窗里逐个改回去。
 *
 * 为什么要在这里定而不在组件里：同一条默认值要在面板与聊天两个入口一致，
 * 且「默认排除别的会话的改动」是产品决定，必须可测。
 */
export declare function rollbackDefaultSelection(rows: readonly RollbackSelectionRow[]): string[];
/**
 * 勾选集 → `onlyPaths`：
 *  · **全选**（含空清单）⇒ `null`（不传字段 = 走既有全量口径，老宿主也照样工作）；
 *  · 真的少勾 ⇒ 把选中的清单原样传给宿主（空数组由调用方拦：宿主侧它是 400）。
 */
export declare function rollbackOnlyPaths(rows: readonly RollbackSelectionRow[], selected: readonly string[]): string[] | null;
/** 该不该拦住提交：清单非空、却一个都没勾（宿主会把空数组当 400） */
export declare function rollbackSelectionBlocksSubmit(rows: readonly RollbackSelectionRow[], selected: readonly string[]): boolean;
/**
 * 差异无法逐行展示时的字典键（本层**只回键**，文案在字典里）。
 * 未知 / 缺失原因回落 null —— 调用方按「未知原因」出话，绝不回落成「没有差异」（那是另一件事）。
 */
export declare function rollbackFileDiffReasonKey(reason: string | null | undefined): string | null;
/** 可渲染的 hunks（缺字段 / 非数组一律当空 —— 渲染层绝不因宿主形态差异崩掉）。 */
export declare function rollbackFileDiffHunks(result: RollbackFileDiffResult | null): DiffHunk[];
/** 两侧是否都真的读到了文本（否则说不出「无差异」）。 */
export declare function rollbackFileDiffComparable(result: RollbackFileDiffResult | null): boolean;
export declare function rollbackPreviewRows(preview: RollbackPreviewResult | null): RollbackPreviewRowView[];
export interface RollbackPreviewVerdict {
    /** 宿主允许回退 **且** 至少有一段可回退 */
    canRestore: boolean;
    canRemove: boolean;
    /** canRestore=false 时的原因键（null = 可回退） */
    reasonKey: string | null;
    /** 三选一 mode（按可用段推导，界面据此作为下拉默认值） */
    mode: RollbackMode;
    /** 可回退的段（只可能是 workspace / session） */
    segments: RollbackState[];
    /** 该点两态不全（缺省不允许回退；界面据此要求显式勾「允许部分回退」） */
    incomplete: boolean;
}
/** 点级告警（preview.warnings）→ 展示行；界面在面板级渲染一次（点级告警不归属任何段，绝不猜）。 */
export declare function rollbackPreviewWarnings(preview: RollbackPreviewResult | null): RollbackGuidanceRowView[];
/** 点级指引（preview.guidance）→ 展示行（同上，面板级渲染一次）。 */
export declare function rollbackPreviewGuidance(preview: RollbackPreviewResult | null): RollbackGuidanceRowView[];
/**
 * 预览态那句「工作区怎样怎样」的**四态**判别（T15）。
 *
 * 背景（用户截图抱怨的那一屏就是**预览态**）：点「回退」之前，三种**完全不同**的事实
 * 被同一句「工作区与该回退点一致，无需恢复」概括 —— 其中两种是不实陈述：
 *  · 该点压根没记录任何文件（工作区段 files=0）；
 *  · 工作区态没有可用记录（available=false）；
 *  · 而真正「一致」时，若**会话仍会回退**（fork 子会话），说「无需恢复」也是假尾句。
 *
 * 判据**只来自 preview 的字段**（available / overwrite / different / missing / reasonCode /
 * session.restorable）与宿主给的 canRestore，**禁止解析 detail**（技术细节不是接口）。
 * 优先级（与验收逐字一致）：① 工作区态不可用 → ⓪ 该点**未记录**的新建内容会被删除
 * （`removalsCount` > 0 = 真会删，宿主 removeCreated 缺省为真）→ ② available 且 overwrite===0
 * → ③a 工作区一致但会话仍可回退 → ③b 工作区一致且无事可做。另有前置的一条**不属于四态**：
 * 工作区**真会改动**（different>0 / missing>0 / 会删掉未记录的新建文件）时不上屏任何
 * 「一致/无需恢复」句（由文件列表说话）——
 * 这也是「假尾句禁令」在函数层面的落点：`changesSomething === true` 时，
 * 要么 `key === null`，要么该键的文案**不含**「无需恢复」。
 */
export type RollbackPreviewNoteKind = 
/** 工作区真会改动（写文件**或删掉该点未记录的新建文件**）⇒ 没有「一致」句可说，由文件列表说话。 */
'workspace-changes'
/** ① 工作区态没有可用记录（available=false）。 */
 | 'workspace-unavailable'
/** ② 该点没记录任何文件（available=true 且 overwrite===0）。 */
 | 'no-recorded-files'
/** ③a 工作区与该点一致，但会话仍会回退（fork 子会话）。 */
 | 'workspace-consistent-session'
/** ③b 工作区与该点一致，且无事可做（会话也不可回退）。 */
 | 'workspace-consistent-noop';
/** 预览态那句文案的判定结果（界面只负责把它翻译上屏，不在界面里重写判据）。 */
export interface RollbackPreviewNote {
    kind: RollbackPreviewNoteKind;
    /** 上屏文案键；**null = 本情形没有该类句子**（工作区有变更 ⇒ 由文件列表说话）。 */
    key: string | null;
    /** 需要插进 `{reason}` 的**字典键**（只有 ① 用；未知/缺失一律 `rollback.code.unknown`）。 */
    reasonKey: string | null;
    /** 点「回退」是否**真会改动什么**（工作区会写文件 or 会话会 fork）—— 假尾句禁令的判据。 */
    changesSomething: boolean;
    /** 会话仍会回退（= 会 fork 出新子会话）。 */
    sessionForks: boolean;
}
/**
 * 预览态文案判定（**一处实现**：聊天对话框调用它；将来设置页若要复用同一口径也走这里）。
 *
 * @param input.workspace preview.workspace（缺失按「不可用」处理：没有记录信息 ⇒ 不能说「一致」）
 * @param input.session   preview.session（只有 `restorable === true` 才算「会话仍会回退」）
 * @param input.segments  段摘要（`preview.point.segments`；只用于 ① 的原因键回落，读 reasonCode 字段）
 * @param input.canRestore 宿主/判定层的回退门（缺省按 true；传 false 时不得声称「会话仍会回退」）
 */
export declare function rollbackPreviewNote(input: {
    workspace?: RollbackWorkspacePreview | null;
    session?: RollbackSessionPreview | null;
    segments?: readonly {
        state?: string;
        reasonCode?: string | null;
    }[] | null;
    canRestore?: boolean;
}): RollbackPreviewNote;
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
export declare function rollbackPreviewVerdict(preview: RollbackPreviewResult | null): RollbackPreviewVerdict;
export interface RollbackRewindRowView {
    state: string;
    labelKey: string;
    statusKey: string;
    badgeKind: 'ok' | 'warn' | 'error';
    restored: number;
    failed: number;
    /** 该点**未记录**、**未删除**的内容数（引擎 scanLeftovers 语义，不是「之后新建」） */
    leftoversCount: number;
    /** 真的被删掉的「回退点之后新建」条数（段结果里的 removed） */
    removedCount: number;
    /** 同上，路径清单（已脱敏；宿主上限 20 条） */
    leftovers: string[];
    leftoversTruncated: boolean;
    /** 会话段：fork 出来的子会话 id（无则 null） */
    childSessionId: string | null;
    /** 逐条事实：**渲染前已逐条过 redact** */
    detail: string[];
    guidance: RollbackGuidanceRowView[];
    /**
     * 归属隔离（B）跳过的文件数：这些文件在留点之后是**别的会话**写的，回退没动它们。
     * 0 = 没有（或宿主没回传）—— 界面只在 > 0 时说这句话（绝不编造 0 的成就）。
     */
    foreignSkipped: number;
    /** 路径选择（A）跳过的文件数（用户自己没勾） */
    selectionSkipped: number;
    /** 三方合并成功、写回「撤销本会话 + 保留对方改动」的文件数 */
    mergedCount: number;
    /** 冲突（两侧改到同一处）未写的文件数 + 有界清单 */
    conflictCount: number;
    conflictPaths: string[];
    /** 无法安全撤销（无中间版本 / 二进制 / 降级 / 对方删了它）未写的文件数 */
    unavailableCount: number;
    /** 写入前发现又被改过（并发）未写的文件数 */
    concurrentCount: number;
    /**
     * **落点无人认领**未写的文件数 + 有界清单（2026-10-18）：时间窗表明改这条路径的那一刻
     * 没有任何会话活跃 ⇒ 手改 / 外部工具 / 另一个 DSH 进程。0 = 没有（或宿主没回传）。
     */
    unclaimedCount: number;
    unclaimedPaths: string[];
}
export declare function rollbackRewindRows(result: RollbackRewindResult | null): RollbackRewindRowView[];
/** 回退总体结论 → 字典键 + 徽章语义（未知回落 unknown，绝不裸渲染 outcome）。 */
export declare function rollbackOutcome(outcome: string | null | undefined): {
    key: string;
    badgeKind: 'ok' | 'warn' | 'error';
};
export interface RollbackRewindCounts {
    restored: number;
    failed: number;
    leftovers: number;
    /** 本次真的删掉的「回退点之后新建」路径数（用户 2026-10-11 定案 A） */
    removed: number;
}
/** 回退结果汇总计数（界面一句话说清「恢复多少 / 失败多少 / 没删多少」）。 */
export declare function rollbackRewindCounts(result: RollbackRewindResult | null): RollbackRewindCounts;
/**
 * 会话回退的 fork 结果（S3）：原会话日志**只读**，回退产出的是一个新子会话。
 * 返回 null = 本次没有会话回退（界面不渲染这一行，绝不编造子会话 id）。
 */
export declare function rollbackChildSession(result: RollbackRewindResult | null): {
    key: string;
    id: string;
} | null;
/** 本次因前段失败 / 未请求而未执行的段（只可能是两态；未知段回落 unknown 键）。 */
export declare function rollbackSkippedSegments(result: RollbackRewindResult | null): {
    state: string;
    key: string;
}[];
/** 删除成功文案键（delete 的 `code:'deleted'`）。 */
export declare const ROLLBACK_DELETED_KEY = "rollback.code.deleted";
/** 「没有可回退的内容」文案键（预览判定为否时的兜底原因）。 */
export declare const ROLLBACK_PREVIEW_NONE_KEY = "rollback.preview.none";
