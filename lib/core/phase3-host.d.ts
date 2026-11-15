import { JournalStore } from './journal.ts';
import type { SafeModeMarkerState } from './journal.ts';
import { type ReconcileProbeHooks } from './reconcile.ts';
import { type LockState, type MutationLockContext } from '../utils/env-lock.ts';
import type { JournalStepRecord } from './types.ts';
/** 存在未收敛的 active transaction → 拒绝创建第二个（active≤1）。 */
export declare class TransactionRecoveryRequiredError extends Error {
    constructor(opId: string);
}
/**
 * Phase 4 生产 journal↔snapshot 绑定 API（deferred 模式）：
 *  fn 收到此 ctx，在【首个 destructive side effect 前】：
 *   - 用 plan 创建 op-bound snapshot（operationId/operationType/environmentFingerprint/ownerInstanceId）
 *   - `bindSnapshot(id)`：journal 记录 snapshotId，CREATED→SNAPSHOT_CREATED
 *   - 首个 mutation 前 `markApplying()`：SNAPSHOT_CREATED→APPLYING
 *  保证「快照 durable+verified 且 journal 已知」先于任何写。显式 ctx，无 process-global reentrancy。
 */
/** 引擎上报的「已就地回滚」结论（见 JournalRunContext.recordRollback）。 */
export interface JournalRollbackOutcome {
    /** true = 全部补偿成功（盘面已回到导入前状态）；false = 仍有补偿失败项（半回滚态） */
    full: boolean;
    /** 补偿失败项（非敏感描述；进 journal.rollback 供事后审计） */
    failed: readonly string[];
}
export interface JournalRunContext {
    operationId: string;
    operationType: string;
    environmentFingerprint: string;
    ownerInstanceId: string;
    /** 记录 journal.snapshotId 并推进 CREATED→SNAPSHOT_CREATED（或幂等）。 */
    bindSnapshot: (snapshotId: string) => Promise<void>;
    /** 首个 destructive side effect 前调用：SNAPSHOT_CREATED/CREATED→APPLYING。 */
    markApplying: () => Promise<void>;
    /** 逐计划项 WAL step 记录（P2-B，Phase 8）：文件类带 fp，非文件类 external=true。 */
    recordStep: (step: JournalStepRecord) => Promise<void>;
    /**
     * 引擎在 fn 内部**已完成回滚**后上报（审计 P0-3）。没有这条上报，runJournaled 只能凭
     * 「fn 是否返回」推断成功 —— 而导入失败的整体回滚正是「回滚完成 + 正常返回 ok:false」，
     * 于是整笔 operation 被误记成 COMMITTED 终态（回滚点随之失去 prune 豁免，事后审计读到与
     * 盘面相反的结论；测试专用那套编排对同一事件写的正是 ROLLED_BACK）。
     *
     * 上报后终态为 ROLLED_BACK；full === false（半回滚态）额外置 durable SAFE MODE，使下次启动
     * 不判 NORMAL。实现**不得抛错**：引擎此时正走「已回滚、正常 return」路径，抛错会把诚实的
     * 回滚报告换成异常。
     */
    recordRollback: (report: JournalRollbackOutcome) => Promise<void>;
}
/** 把环境锁分类映射到 startup 判定：ACQUIRED 视同 LOCKED（有活跃 owner），IO/PERMISSION 保守 LOCKED。 */
export declare function mapLockStateForStartup(state: LockState): 'LOCKED' | 'STALE_LOCK_DETECTED' | 'UNKNOWN_STATE' | 'FREE';
/**
 * 标记的**路径 / 内容判据 / 三态读取**唯一实现都在 `core/journal.ts`（标记的归属方）。
 * 本文件只 re-export，供宿主（src/index.ts）与 CLI 离线安全门沿用既有 import 路径。
 *
 * 审计 t26 收敛：此前这里自带一份 `/blocked|true/i` 判据 + 一份同步读取实现，与
 * `JournalStore.readSafeMode` 的第二份判据并存 —— 同一 marker 在「无法判定」场景下
 * 得出相反结论（一侧放行、一侧 fail-closed）。现在判定只有一处，谁改都不会漂移。
 */
export { isSafeModeMarkerBlocking, readSafeModeMarkerSync, safeModeMarkerPath } from './journal.ts';
export type { SafeModeMarkerState } from './journal.ts';
export interface Phase3RecoveryOptions {
    dataDir: string;
    packageVersion: string;
    /** 覆盖环境指纹（测试） */
    environmentFingerprint?: string;
    /** 环境指纹持久化 token 目录（缺省 dataDir） */
    fingerprintDataDir?: string;
    /**
     * Phase 4 F21/F11 生产正向校验：校验 journal 引用的 snapshot 是否「存在 + READY + verified +
     * op/env/owner binding 匹配」。缺省 = 保守 false（无法证明存在 → 不强推回滚）。
     * 宿主注入 FileSnapshotStore + verifySnapshot + manifest binding 校验实现。
     */
    snapshotExists?: (snapshotId: string | null, binding?: SnapshotBindingRef) => Promise<boolean>;
}
/** journal↔snapshot binding 引用（与 reconcile ReconcileProbeHooks.snapshotExists 的 binding 一致）。 */
export interface SnapshotBindingRef {
    operationId?: string;
    ownerInstanceId?: string;
    environmentFingerprint?: string;
}
export declare class Phase3Recovery {
    readonly store: JournalStore;
    readonly packageVersion: string;
    private readonly dataDir;
    private readonly fingerprintDataDir;
    private environmentFingerprint;
    private readonly snapshotExistsFn;
    /** 内存 SAFE MODE 标志（isBlocked 同步谓词用） */
    safeModeActive: boolean;
    /**
     * 最近一次 durable 标记判定的**三态**（t37）：'blocked' | 'clear' | 'unknown'。
     * 'unknown'（标记存在但无法判定 / 布局不可信 / 读不出）在 refreshSafeMode 与 startup 里按 fail-closed
     * 计入阻断，绝不再被压成「没有标记」；本字段供诊断与测试区分 unknown / clear。
     */
    private safeModeState;
    constructor(opts: Phase3RecoveryOptions);
    /** 计算环境指纹（持久化 token；跨启动稳定）。在 startup 前调用一次。 */
    initFingerprint(): Promise<string>;
    /** isBlocked 同步谓词（供 withMutationLock / runWithMutationLock 注入；env-lock 只问 blocked?） */
    isBlocked(): boolean;
    /**
     * 刷新 SAFE MODE 标志（读 durable 标记）。
     *
     * t37：消费**三态**而不是 boolean 兼容面 —— 'blocked' 与 **'unknown'（标记存在但无法判定 / 布局
     * 不可信 / 读不出）** 一律置为阻断（fail-closed），只有 'clear'（确实没有标记）才解除。旧实现
     * `readSafeMode().catch(() => false)` 把「无法判定」读成「没有标记」，是 fail-open 外观。
     * 清理通道不变：用户显式 recovery → clearSafeMode() 写标记后本方法才回到 'clear'。
     */
    refreshSafeMode(): Promise<void>;
    /** 最近一次 durable 标记判定的三态（诊断/测试用；阻断判定只用 'blocked' 与 'unknown' 的 fail-closed 语义）。 */
    get lastSafeModeState(): SafeModeMarkerState;
    /** 同步探测 durable SAFE MODE 标记（宿主 apply() 同步阶段、scheduler.start() 前调用，保证先阻断）。 */
    probeSafeModeSync(): boolean;
    /** 保守 hooks：无法证明默认 needs-attention（绝不自动恢复/回滚）。snapshotExists 用宿主注入的正向校验（若提供）。 */
    private conservativeHooks;
    /**
     * 启动只读 reconcile：返回是否需 SAFE MODE / RECOVERY_REQUIRED，并写 durable 标记。
     * @param lockState 宿主 EnvironmentLockManager 的 inspectLockState 结果（只分类，不自动 recover）
     * @param expectedOwnershipInstanceId 若在显式 recovery 前已捕获 stale ownership 的 owner.instanceId，传入以做 P1-A binding 校验
     *
     * 审计 P0-10：本方法是 `classifyStartup`（core/startup-barrier.ts）的**等价薄包装**，当前**无任何**
     * 生产/测试调用点 —— 宿主 apply() 直接消费 `classifyStartup` 并按 `FAIL_CLOSED_STARTUP` 处置异常。
     * 保留仅为历史 API 兼容；新增启动路径必须走 core/startup-barrier.ts，不要在宿主/本类里再写第三份分类
     * 或第四份「只关调度器」的半套 fail-open。
     */
    startup(lockState: LockState, expectedOwnershipInstanceId?: string | null): Promise<{
        safeModeRequired: boolean;
        recoveryRequired: boolean;
    }>;
    /** P1-A：读取 crashed stale ownership 的 owner.instanceId（environment.lock 的 owner 证据；不可用返回 null）。 */
    captureStaleOwnershipInstanceId(): Promise<string | null>;
    /** 用户确认恢复后清除 SAFE MODE（清空 durable 标记 + 内存标志）。清理通道语义不变（t37）。 */
    clearSafeMode(): Promise<void>;
    /** 保守 reconcile hooks（供启动 barrier / inspect 用） */
    get recoveryHooks(): ReconcileProbeHooks;
    /** 环境指纹（供启动 barrier 用） */
    get recoveryEnvFingerprint(): string;
    /**
     * 生产 journal 包装（关闭 P0-A）：在【已持 GLOBAL 锁】下，为该 destructive operation
     * 创建 durable journal（CREATED → snapshot → APPLYING → 执行真实引擎 → COMMITTED → 规整）。
     *
     *  - active≤1（§14）：创建前扫描 active/；存在非 terminal 残留（非当前 live owner）→ 抛错阻断，不建第二个 journal。
     *  - Journal→Lock 绑定（§15/P1-A）：ownerInstanceId = lockCtx.token.instanceId（= Phase 2 activeInstanceId，
     *      acquisition-specific）；lockId = 同一 ownership epoch identity（ownerInstanceId）。recovery 时强制校验。
     *  - 不 double-acquire（§6）：调用方（host gate）已持锁，本方法只负责 journal 生命周期，不 re-acquire、不 release（release 由 gate 负责）。
     *  - 异常 → NEEDS_ATTENTION + durable SAFE MODE + rethrow（不破坏既有错误/响应流）。
     *  - 返回 { operationId, result }。
     *
     *  Phase 4 snapshot 两种模式：
     *   - `snapshotProvider`（pre-fn）：journal CREATED → 调用 provider 创建并 verify snapshot → 绑定 snapshotId
     *     → SNAPSHOT_CREATED → APPLYING → fn（适合 provider 不依赖请求体 plan 的场景）。
     *   - `deferredSnapshot`（推荐，F20 生产接线）：plan 只在 handler 解析请求体后可用，因此 journal 停留在 CREATED，
     *     fn 收到 `ctx`（含 `bindSnapshot` / `markApplying`）。引擎在【首个 destructive side effect 前】用 plan 创建
     *     op-bound snapshot → ctx.bindSnapshot(id)（CREATED→SNAPSHOT_CREATED，记录 snapshotId）→ 首个 mutation 前
     *     ctx.markApplying()（SNAPSHOT_CREATED→APPLYING）。保证「快照 durable+verified 且 journal 已知」先于任何写。
     */
    runJournaled<T>(opts: {
        operationType: string;
        lockCtx: MutationLockContext;
        /** 可选：真实 pre-operation snapshot（回滚点），返回 snapshotId（pre-fn 模式）。 */
        snapshotProvider?(): Promise<string | null>;
        /** 可选：deferred 绑定模式——journal 停留 CREATED，fn 收到 ctx 自行 bindSnapshot/markApplying。 */
        deferredSnapshot?: boolean;
        fn: (ctx?: JournalRunContext) => Promise<T>;
    }): Promise<{
        operationId: string;
        result: T;
    }>;
    /**
     * 续跑一条已存在的 active journal（崩溃后重做被中断的恢复，见 core/restore-resume.ts 的判定）。
     *
     * 与 runJournaled 的差别：**不 create、不做 active ≤ 1 门禁** —— 要续的正是那条 active 记录；
     * 只有在「上次崩溃前已经写过至少一个动作」这一点被逐项证明后，调用方才允许走到这里。
     * 所有 reject 分支都抛错（调用方负责转成用户可见的「不续跑」原因），绝不静默重跑。
     */
    resumeJournaled<T>(opts: {
        operationId: string;
        operationType: string;
        lockCtx: MutationLockContext;
        fn: (ctx?: JournalRunContext) => Promise<T>;
    }): Promise<{
        operationId: string;
        result: T;
    }>;
    /**
     * runJournaled / resumeJournaled 共用的收尾：成功推进终态、失败置 SAFE MODE 并分类 durable 状态。
     * body 抛错即表示「副作用阶段失败」，由本方法决定 NEEDS_ATTENTION / 保持非终态 / ROLLED_BACK。
     */
    private runJournalTail;
    /**
     * 把「引擎已就地回滚」写成 durable 终态 ROLLED_BACK（审计 P0-3）。
     *
     * 允许从任何 pre-terminal 状态收敛：CREATED/SNAPSHOT_CREATED → APPLYING → ROLLING_BACK →
     * ROLLED_BACK；已在 ROLLING_BACK / RECOVERING / NEEDS_ATTENTION 时直接收敛。每一步只在
     * **合法迁移**时执行，因此读到意外的中间态也不会抛错（抛错会把已知的回滚结论丢掉，并把
     * journal 留在非终态）。COMMITTED 在此不可达：它只由 fn 返回后的尾操作写入，而本方法
     * 只在该尾操作之前被调用。
     */
    private recordRolledBackOutcome;
    /**
     * 构造一次 operation 的 journal 绑定面（runJournaled / runExternalIntent 共用）。
     *
     * 为什么必须共用：两条通道的上报语义要**逐字一致** —— 尤其是 `recordRollback`（审计 P0-3）：
     * 引擎在 fn 内部完成整体回滚后必须能被 journal 感知，否则「fn 正常返回 ⇒ COMMITTED」的尾操作
     * 会把一笔**已回滚**的 operation 记成成功。此前 runExternalIntent 只投递 `{ operationId }`，
     * 自动同步路径因此拿不到上报面，它的内部整体回滚被误记 COMMITTED（审计 P0-23）。
     *
     * 返回的 rollbackOutcome 用对象持有而非裸 let：赋值发生在 fn 内部的闭包里，TS 的控制流分析
     * 看不到那次写入，裸 let 会被窄化成 null → 读取处得到 never（编译报错）。
     */
    private buildJournalCtx;
    /**
     * 轻量 operation 包装（意图 journal，供外部/不可证明操作如 sync-push / autosync-apply / reinstall 用）：
     *   创建 CREATED → APPLYING（含 external intent step）→ 执行 → COMMITTED；异常 → NEEDS_ATTENTION + SAFE MODE。
     *
     * 审计 P0-23：fn 收到的上下文与 runJournaled **共用同一份绑定面**（含 `recordRollback`）。
     * 此前这里只投递 `{ operationId }`，自动同步的 applyMergePlan 因此拿不到上报面 —— 它在 fn
     * 内部完成整体回滚后正常返回，尾操作照样写 COMMITTED，把**已回滚**的 operation 记成成功。
     */
    runExternalIntent<T>(opts: {
        operationType: string;
        lockCtx: MutationLockContext;
        intent: {
            adapter: string;
            ref: string;
            kind: string;
        };
        fn: (ctx?: JournalRunContext) => Promise<T>;
    }): Promise<{
        operationId: string;
        result: T;
    }>;
}
