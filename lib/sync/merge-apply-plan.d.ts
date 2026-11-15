import type { ConfigAdapter, HostContext, ImportDecisions, ImportPlan, PathMapping, Snapshot, SnapshotStore } from '../core/types.ts';
import type { ReviewQueueItem } from './review-queue.ts';
export interface PlanMergeApplyInput {
    /** 本次合成的临时 ZIP（合并结果）。 */
    zipPath: string;
    /** 合并路径的映射（merge() 记下的远端 sourceHome + 用户映射，issue #45）。 */
    pathMappings: PathMapping[];
    /** 本次要应用的分区（autoApply + 伴随分区）。 */
    appliedIds: readonly string[];
    /** 复用宿主 Importer 的规划入口（纯计算，零写入）。 */
    createImportPlan: (zipPath: string, decisions: ImportDecisions) => Promise<ImportPlan>;
    /** 待裁决项的告警文案（i18n 留在调用方，键 `sync.mergeHeldConflicts`）。 */
    heldConflictMessage: (count: number, sections: string[]) => string;
}
export interface MergeApplyPlan {
    plan: ImportPlan;
    /** 叶级未裁决项的报告面：只给 id/分区/描述，**不带值**（值可能含敏感叶子）。 */
    heldReview: ReviewQueueItem[];
    /** 人读告警（空数组 = 没有待裁决项）。 */
    heldWarnings: string[];
}
export declare function planMergeApply(input: PlanMergeApplyInput): Promise<MergeApplyPlan>;
export type MergeApplySnapshotResult = {
    ok: true;
    store: SnapshotStore;
    snapshot: Snapshot;
} | {
    ok: false;
    error: unknown;
};
/** 执行前兜底快照（拿到 restoreId 给 UI 一键回滚）；失败时把原始错误交回调用方决定文案。 */
export declare function createMergeApplySnapshot(input: {
    ctx: HostContext;
    plan: ImportPlan;
    zipPath: string;
    storeDir: string;
    adapters: ConfigAdapter[];
}): Promise<MergeApplySnapshotResult>;
