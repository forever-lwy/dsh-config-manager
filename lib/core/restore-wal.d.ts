import type { JournalStepRecord } from './types.ts';
/** 插件类动作 = 外部副作用（不带文件指纹；reconcile 恒走保守分支）。 */
export declare function isExternalPluginKind(kind: string): boolean;
export declare function isWalActionKind(kind: string): boolean;
/**
 * 引擎侧最小 journal 端口（结构上兼容 phase3-host 的 JournalRunContext）。
 * 三个回调都**可选**：只给 recordStep 也能工作（只是崩溃后没有可信快照可比对）。
 */
export interface RestoreJournalPort {
    /** 逐动作 WAL step（fail-closed：持久化失败向上传播，绝不静默丢进度）。 */
    recordStep?: (step: JournalStepRecord) => Promise<void>;
    /** 记录本操作可信的快照 id（崩溃后 reconcile 据此判断「有没有可回滚的快照」）。 */
    bindSnapshot?: (snapshotId: string) => Promise<void>;
    /** 首个写之前把 journal 推进到 APPLYING（幂等）。 */
    markApplying?: () => Promise<void>;
}
/**
 * 目标文件的内容指纹。
 *  - 正常：sha256 十六进制
 *  - 文件不存在（ENOENT/ENOTDIR）：`ABSENT_FINGERPRINT`（= 可证明「本来就没有」）
 *  - 其它 IO/权限错误：null（不可指纹 → reconcile 走保守分支，绝不猜）
 */
export declare function restoreFingerprint(abs: string | null): Promise<string | null>;
/** 预登记的一个动作（restore 计划动作的子集：只有 kind ∈ WAL_KINDS 才需要）。 */
export interface RestoreWalEntry {
    kind: string;
    /** 相对 home 的目标（文件类动作；pluginRemove 无） */
    target?: string;
    /** 插件包名（pluginRemove） */
    pluginName?: string;
    /** 文件类动作的**绝对**目标路径（reconcile 直接拿它读盘算指纹）；pluginRemove 传 null */
    abs: string | null;
}
export interface RestoreWalHandle {
    id: string;
    kind: string;
    ref: string;
    external: boolean;
    beforeFp: string | null;
}
export type RestoreWalSettleStatus = 'done' | 'attention' | 'skipped';
export interface RestoreWal {
    /**
     * 预登记全部会动盘的动作（`planned` + beforeFp）。**必须在首个写之前**调用，
     * 且一次传齐 —— 分批登记会让「尚未登记的动作」在崩溃后不可见，从而把半成品判成完成。
     * 返回与入参**同序**的 handle（调用方按动作对象/下标自行对应）。
     */
    preRegister(entries: readonly RestoreWalEntry[]): Promise<(RestoreWalHandle | undefined)[]>;
    /** 动作结束（成功/失败）后更新终态。持久化失败向上抛（fail-closed），绝不吞。 */
    settle(handle: RestoreWalHandle | undefined, status: RestoreWalSettleStatus, message?: string | null): Promise<void>;
}
/**
 * 生成 WAL 句柄。`journal` 缺失或没有 recordStep ⇒ 返回 null（零开销，旧行为不变）。
 */
export declare function createRestoreWal(journal: RestoreJournalPort | undefined): RestoreWal | null;
/**
 * step id：**由动作语义派生**而非计划下标 —— 崩溃后磁盘状态变化会让计划下标漂移
 * （已经还原过的文件不再产生 restore 动作），语义 id 才能跨两次执行对上同一条 step。
 *
 * 导出（连同 restoreWalSubject）：续跑判定必须用**同一条规则**反查 journal 里的 step，
 * 两处各写一份就会在改规则时静默错位（判定说「计划漂移」而其实只是 id 算法不同）。
 */
export declare function restoreStepId(kind: string, subject: string): string;
/** step id 的 subject 段：插件卸载用包名，其余用绝对路径（拿不到绝对路径时退回流相对 target）。 */
export declare function restoreWalSubject(kind: string, pluginName: string | undefined, refOrTarget: string): string;
/** 计划动作 → step id（调用方比对「这条动作是否已证明完成」时必须用同一规则）。 */
export declare function restoreActionStepId(action: {
    kind: string;
    target?: string;
    pluginName?: string;
}, abs: string | null): string;
/**
 * 计划动作 → WAL 条目（只保留会动盘的动作）。`absOf` 把 home 相对目标解析成绝对路径，
 * 解析不了（越界/非法）给 null —— 这类动作在 journal 里恒为不可指纹项，续跑判定会拒绝。
 */
export declare function collectRestoreWalEntries<A extends {
    kind: string;
    target?: string;
    pluginName?: string;
}>(actions: readonly A[], absOf: (action: A) => string | null): {
    mutating: A[];
    entries: RestoreWalEntry[];
};
/**
 * 续跑时**不得**重新 preRegister（那会把已完成动作的 beforeFp 覆盖成「执行后内容」，证据全丢）。
 * 改为用 journal 里已有的 step 复原句柄：之后的动作执行完仍要 settle 成 done/attention。
 */
export declare function restoreWalHandlesFromSteps(entries: readonly RestoreWalEntry[], steps: Readonly<Record<string, {
    beforeFp: string | null;
}>>): (RestoreWalHandle | undefined)[];
