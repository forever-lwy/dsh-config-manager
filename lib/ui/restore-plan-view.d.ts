/**
 * 恢复计划预览的展示模型（框架无关纯函数，node 可测）。
 *
 * 输入：RestorePlan（动作清单）+ RestoreChangeSummary（宿主附带的变更状态/行数统计，可为空）
 * 输出：git 风格的分组视图 ——
 *   「将被还原/修改」→「将被删除」→「卸载插件」→「需人工处理」→「无动作（跳过）」
 * 每组带行数合计，供顶部摘要条渲染成「N 个文件 · +X −Y · M 项无动作」。
 *
 * 本层不产出文案；不安全文本（description/detail）的脱敏由渲染层负责（redact）。
 */
import type { RestoreActionKind, RestorePlan } from '../core/restore.ts';
import type { ChangeStatSkipReason, RestoreChangeSummary, SnapshotChangeStatus } from '../core/snapshot-diff.ts';
/** 分组键（渲染顺序 = 变更 → 删除 → 插件 → 人工 → 跳过）。 */
export type RestoreGroupKey = 'changes' | 'deletes' | 'plugins' | 'hints' | 'skips';
/** 组内条目（合并 plan.actions 与 changeSummary；summary 缺失时按 kind 推断）。 */
export interface RestorePlanRow {
    /** plan.actions 下标（打开逐行 diff 时回传给宿主） */
    index: number;
    kind: RestoreActionKind;
    status: SnapshotChangeStatus;
    target?: string;
    blobPath?: string;
    description: string;
    detail?: string;
    beforeExists: boolean;
    afterExists: boolean;
    beforeBytes?: number;
    afterBytes?: number;
    added?: number;
    removed?: number;
    statSkipped?: ChangeStatSkipReason;
    /** 该行是否可展开逐行对照 */
    diffable: boolean;
    /** 统计是否来自宿主（false = 旧宿主或未统计） */
    summarized: boolean;
}
export interface RestorePlanGroup {
    key: RestoreGroupKey;
    statuses: readonly SnapshotChangeStatus[];
    rows: RestorePlanRow[];
    added: number;
    removed: number;
    /** 组内已统计行数的条目数（0 = 无可显示的行数） */
    counted: number;
}
export interface RestorePlanStats {
    /** 将被还原 / 新增的文件数（git 语义的 changed） */
    changed: number;
    added: number;
    modified: number;
    deleted: number;
    plugins: number;
    hints: number;
    skips: number;
    /** 所有分组的行数合计 */
    addedLines: number;
    removedLines: number;
    /** 因体积 / 二进制 / 预算未统计行数的条目数 */
    unstatted: number;
}
export interface RestorePlanView {
    groups: RestorePlanGroup[];
    stats: RestorePlanStats;
    /** 宿主是否提供了统计（旧宿主 = false，UI 需要弱化行数展示） */
    summarized: boolean;
    /** 统计因预算触顶被截断 */
    budgetExhausted: boolean;
}
/** 文件内容类动作（可展开逐行对照）。 */
export declare function isDiffableKind(kind: RestoreActionKind): boolean;
/** 恢复计划 → 分组视图 + 统计。 */
export declare function toRestorePlanView(plan: RestorePlan, summary?: RestoreChangeSummary): RestorePlanView;
/** 打开某个文件后，用宿主返回的真实状态覆盖推断状态（返回新分组，便于 React 直接替换）。 */
export declare function withLoadedStatus(view: RestorePlanView, index: number, status: SnapshotChangeStatus, added: number, removed: number): RestorePlanView;
