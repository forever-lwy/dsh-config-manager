import type { ImportDecisions, ImportPlan } from './types.ts';
/**
 * 指纹只消费三方合并预览的这几个字段 —— 这里用结构化最小类型声明，
 * 而不是 import `../sync/sync-engine.ts` 的 MergePreview：
 * core 不得反向依赖 sync 层（架构边界），且指纹只需要「结论 + 冲突位置」。
 */
interface MergePreviewShape {
    readonly ok: boolean;
    readonly snapshotId?: string | null;
    readonly hasAncestor?: boolean;
    readonly sections: readonly {
        readonly id: string;
        readonly decision: string;
        readonly autoMerged?: number;
        readonly conflicts: readonly {
            readonly path: string;
            readonly kind: string;
            readonly reason?: string | null;
        }[];
    }[];
}
export type ModelPlanKind = 'restore' | 'sync-merge' | 'import';
export interface ModelPlanRecord {
    /** planId = 指纹本身（同一计划重复预览得到同一个 id，天然幂等） */
    id: string;
    kind: ModelPlanKind;
    fingerprint: string;
    /** 重放材料：只放 id / 路径 / 决策，绝不放密码或凭据值 */
    payload: Record<string, string>;
    createdAt: number;
    expiresAt: number;
}
/** 计划句柄存活时长（与同步会话的 30 分钟同档）。 */
export declare const MODEL_PLAN_TTL_MS: number;
/** 同时在册的计划上限（超出淘汰最旧的一条）。 */
export declare const MODEL_PLAN_MAX = 8;
export declare class ModelPlanStore {
    private readonly records;
    private readonly now;
    constructor(now?: () => number);
    /** 登记一份预览过的计划；返回 planId（= fingerprint）。同一指纹重复登记只刷新时间。 */
    set(kind: ModelPlanKind, fingerprint: string, payload: Record<string, string>): string;
    get(id: string): ModelPlanRecord | undefined;
    delete(id: string): void;
    get size(): number;
    /** 惰性清理过期项 + 按插入序淘汰最旧（不做定时器：无人调用时不需要清理）。 */
    private evict;
}
/** 稳定序列化：对象键按字典序，保证同一份材料在任何构造顺序下得到同一个指纹。 */
export declare function stableStringify(value: unknown): string;
/**
 * 同步合并计划的指纹：只取「分区 id + 结论 + 冲突位置」。
 *
 * **刻意不含三侧预览文本**（localPreview / remotePreview / ancestorPreview）：那是给人看的，
 * 同一份计划在不同时刻被截断/脱敏的方式可能变，纳入指纹会让「什么都没变的计划」被误判成变化。
 * 反过来，冲突多出一处路径 = 远端或本机真的动了，必须重新确认。
 */
export declare function syncMergeFingerprint(preview: MergePreviewShape): string;
/**
 * 导入计划的指纹：取「每条 item 的身份 + 结论」与用户决策。
 *
 * 不含 description / detail 文案（改文案不该让预览失效），但含 target.ref 与 kind ——
 * 计划项从 Create 变成 Conflict、或目标路径变了，都是用户需要重新看一眼的变化。
 */
export declare function importPlanFingerprint(plan: ImportPlan, decisions: ImportDecisions): string;
export {};
