import type { SessionRepairActionKind, SessionRepairReason, SessionRepairSummary } from '../core/session-repair.ts';
import type { PathMappingRule } from '../core/path-mapping.ts';
/** 计划里的一个动作（**不含绝对路径**：身份用 `<fromProjectKey>/<sessionId>`）。 */
export interface SessionLayoutPlanItem {
    unitId: string;
    sessionId: string;
    kind: SessionRepairActionKind;
    fromProjectKey: string;
    toProjectKey?: string;
    /** 需要改写首帧 cwd（面板入口不支持映射 ⇒ 恒缺席；字段与 core 同形，留给以后） */
    rewrite?: {
        from: string;
        to: string;
    };
    reason: SessionRepairReason;
    /** 是否真的落盘（false = 只报告：缺 cwd / 加锁 / 未点名 keep 的重复项） */
    applies: boolean;
}
export interface SessionLayoutPlan {
    ok: boolean;
    /** 只读计划：`POST /sessions/layout` 在 apply!==true 时只调这里，**零写入** */
    readOnly: true;
    /** 会话根读不出来（机器码；不含绝对路径） */
    reason?: 'sessions-root-unreadable';
    summary: SessionRepairSummary;
    actions: SessionLayoutPlanItem[];
    /** 与 core `sessionRepairNeedsAttention` 同源；另把「keep 被拒」也算作需要介入 */
    needsAttention: boolean;
    /** 有重复 id 但调用方未点名（或 keep 指向非候选副本）的 sessionId —— 面板据此要求用户选保留哪一份 */
    needsKeep: string[];
}
/** 逐条失败/拒绝的机器可读原因。 */
export type SessionLayoutApplyReason = 'locked' | 'busy' | 'no-cwd' | 'inconsistent-generations' | 'missing-keep' | 'keep-not-a-candidate' | 'target-exists' | 'quarantine-exists' | 'rewrite-failed' | 'missing-target-key' | 'move-failed' | 'reindex-failed' | 'not-found' | 'io-error';
export interface SessionLayoutApplyItem {
    unitId: string;
    sessionId: string;
    action: SessionRepairActionKind;
    ok: boolean;
    reason?: SessionLayoutApplyReason;
    /** 隔离去向（**相对 `<home>/sessions`**；不含绝对路径） */
    quarantineDir?: string;
    /** 归位后的新身份 `<toProjectKey>/<sessionId>` */
    movedUnitId?: string;
    /** 失败后是否已成功回滚（回到原状态） */
    rolledBack?: boolean;
    /** 该条需要用户介入（被门拒绝 / 无法判定 / 失败） */
    needsAttention?: boolean;
}
export interface SessionLayoutApplyResult {
    ok: boolean;
    applied: number;
    failed: number;
    skipped: number;
    results: SessionLayoutApplyItem[];
    /** 整体未执行的机器码（没有刷新端口 / 会话根读不出来） */
    reason?: 'reindex-unavailable' | 'sessions-root-unreadable';
}
export interface SessionLayoutPlanOptions {
    homeDir: string;
    /** sessionId → 要保留的副本 unitId（`<projectKey>/<sessionId>`）；缺 = 该 id 的重复项一律拒绝执行 */
    keep?: Record<string, string>;
    /**
     * 可选路径映射（CLI `--map` 语义，逐条交给 core 规划器）。**面板入口暂不暴露** ⇒ 缺省无映射、
     * `rewrite` 恒缺席（响应因此不含任何绝对路径）；留给以后需要「跨机重定基后归位」的调用方。
     */
    mappings?: readonly PathMappingRule[];
}
export interface SessionLayoutApplyOptions extends SessionLayoutPlanOptions {
    /** 只处理这些 unitId（缺省 = 计划里全部可执行项） */
    unitIds?: readonly string[];
    /**
     * 宿主注入的索引刷新（`SessionStoreFacade.reindexSessionHeader`）。
     * **缺省 = 一条也不执行**（如实拒绝：没有刷新能力就不动盘，否则运行中的 DSH 会看到错位状态）。
     */
    reindex?: (sessionId: string) => Promise<boolean>;
    /** 注入当前时间（静止期判定；测试固定用） */
    now?: () => Date;
    /** 测试注入隔离目录时间戳；缺省 = ISO 时间戳（与 CLI 同形：`:`/`.` 换成 `-`） */
    stamp?: string;
    /**
     * 改写原语（缺省 = `utils/session-log.ts` 的 `rewriteSessionLogDir`）。
     * 只为**故障注入测试**存在（「改写失败 → 不搬目录 / 回滚」这条路径否则无法覆盖）。
     */
    rewriteDir?: (dir: string, newCwd: string) => Promise<{
        ok: boolean;
        reason?: string;
    }>;
}
/** 计划视图（剥离绝对路径）：`POST /sessions/layout` 的 `apply!==true` 分支只调它。 */
export declare function planSessionLayoutRepair(options: SessionLayoutPlanOptions): Promise<SessionLayoutPlan>;
/**
 * 应用（逐条执行；失败逐条回滚）。
 *
 * 计数口径（与 CLI 的退出码同源）：`applied` = 真的写成/搬动的条数；`failed` = 被门拒绝 / 被护栏拒绝 /
 * 写失败（含回滚）的条数；`skipped` = 规划器判定「只报告」的条数（缺 cwd / 加锁 / 多 generation 不一致）。
 * `ok = failed === 0`。
 */
export declare function applySessionLayoutRepair(options: SessionLayoutApplyOptions): Promise<SessionLayoutApplyResult>;
