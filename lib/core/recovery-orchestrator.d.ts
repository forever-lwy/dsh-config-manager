import { type JournalStore, type OperationJournal } from './journal.ts';
import { RunRegistry } from './run-registry.ts';
import type { HostContext } from './types.ts';
import type { MsgFunc } from './messages.ts';
/** 路由注入的恢复执行器（restore / rollback 引擎；测试注入 mock）。 */
export interface RecoveryExecutorFns {
    /** rollback-recommended：恢复到 trusted snapshot（restore.ts 引擎）。 */
    performRestore: (snapshotId: string) => Promise<{
        full: boolean;
        failed: string[];
    }>;
    /** rollback-continue：续跑中断回滚（rollback.ts 引擎）。 */
    performRollback: (snapshotId: string) => Promise<{
        full: boolean;
        failed: string[];
    }>;
}
export interface RecoveryOrchestratorDeps {
    store: JournalStore;
    runs: RunRegistry;
    snapshotsDir: string;
    host: HostContext;
    msg: MsgFunc;
    /** journal↔snapshot 正向校验（phase3Recovery.recoveryHooks.snapshotExists）。 */
    snapshotExists: (snapshotId: string | null, binding?: {
        operationId?: string;
        ownerInstanceId?: string;
        environmentFingerprint?: string;
    }) => Promise<boolean>;
    /**
     * 当前环境指纹（**动态 getter**，非创建时捕获快照）。
     * 原因：宿主启动 recovery 分类在 fire-and-forget 异步块中跑 `initFingerprint()`，
     * 未在 makeRoutes 前 await 完成；若此处捕获创建时的值会拿到 'unknown' 初值，
     * 导致后续所有 recovery API 判 WRONG_ENVIRONMENT（环境指纹不匹配）。动态读取
     * 保证 initFingerprint 完成后，API 调用时取到真实指纹。
     */
    getEnvironmentFingerprint: () => string;
    /**
     * 清除 SAFE MODE（解除阻断）。宿主注入 `phase3Recovery.clearSafeMode()`：
     * 同时重置内存 `safeModeActive` 标志（isBlocked 读它）与 durable 标记。
     * 仅在「无其他未解决 incident」时调用（判据见 resolveSafeMode，issue #56 起为单一实现）。
     */
    clearSafeMode: () => Promise<void>;
    /**
     * SAFE MODE durable 标记当前是否阻断（issue #56）。
     *
     * 必须以**动态探测**提供（读 durable 标记的 fail-closed 三态，与 mutation gate 的
     * `isBlocked` 同源），而不是创建期捕获的快照：RECOVERY_REQUIRED 的 durable 标记在
     * 启动分类阶段才落盘，创建期读取会恒为 false。
     *
     * 未注入 → 恒 false（等价改造前行为：status 不含 safeMode、clearSafeMode 不检查前置态）。
     * 有它之后：「已结案但保护仍开着」（dismiss 后的旧版本遗留态、手工删过 journal 的残留态）
     * 才能在界面上看得见、并有显式出口 —— 这正是 issue #56 里「面板显示无事可做、写操作却 423」的根因。
     */
    safeModeBlocked?: () => boolean;
    /**
     * 只读环境锁状态（issue #31）。**由宿主注入而非本模块 import**：本模块不依赖 env-lock，
     * 无锁环境（测试 mock 端口）可返回保守的 UNKNOWN_STATE。
     * detail / ownerInstanceId 含 owner pid/op/实例标识等内部诊断 → 只用于日志与
     * **本模块内部**的 journal↔锁归属匹配，绝不进响应体。
     */
    inspectLockState: () => Promise<{
        state: string;
        detail?: string;
        ownerInstanceId?: string;
    }>;
    /**
     * 显式回收 stale 残留锁（EnvironmentLockManager.recoverStaleLock）。
     * **调用方不得先 acquire 锁**：要回收的正是挡住 acquire 的那把锁，先取锁必然失败。
     * 该方法自身保证 inspect → 证明确证死亡 → 原子 rename 捕获 → 二次验证 → unlink，
     * 任一步不确定即拒绝（活锁绝不删）。
     */
    recoverStaleLock: () => Promise<{
        ok: boolean;
        removed: boolean;
        state: string;
        detail?: string;
    }>;
}
/** 编排结果（路由映射为 HTTP 响应）。 */
export type RecoveryResult = {
    status: 200;
    body: Record<string, unknown>;
} | {
    status: 400;
    body: Record<string, unknown>;
} | {
    status: 404;
    body: Record<string, unknown>;
} | {
    status: 409;
    body: Record<string, unknown>;
} | {
    status: 500;
    body: Record<string, unknown>;
};
export interface RecoveryOrchestrator {
    status(): Promise<RecoveryResult>;
    preview(operationId: string): Promise<RecoveryResult>;
    confirm(operationId: string, userConfirmed: boolean): Promise<RecoveryResult>;
    execute(operationId: string, userConfirmed: boolean, makeExecutors: (runId: string) => RecoveryExecutorFns): Promise<RecoveryResult>;
    verify(operationId: string): Promise<RecoveryResult>;
    retry(operationId: string, userConfirmed: boolean, makeExecutors: (runId: string) => RecoveryExecutorFns): Promise<RecoveryResult>;
    dismiss(operationId: string, userConfirmed: boolean): Promise<RecoveryResult>;
    /** issue #31：显式回收 stale 残留锁（无 operationId；非 journal 事项）。 */
    recoverStaleLock(userConfirmed: boolean): Promise<RecoveryResult>;
    /**
     * issue #56：显式解除 SAFE MODE（无 operationId；同样不是 journal 事项）。
     * 判据与 verify/dismiss 后的自动解除**同一个** resolveSafeMode：还有未解决 incident
     * 时拒绝清除（ok=false + reason），不让这个入口变成绕过恢复的旁路。
     */
    clearSafeModeBlock(userConfirmed: boolean): Promise<RecoveryResult>;
    /**
     * 续跑成功后收尾（自动续跑专用）：按**同一个** resolveSafeMode 判据解除 SAFE MODE。
     * 可选，是为了不破坏只 mock status 的既有桩（routes/recovery.test.ts）。
     */
    settleAfterResume?: () => Promise<boolean>;
}
/**
 * SAFE MODE 解除判据的**唯一实现**（编排器内部与 CLI 续跑收尾共用同一份）。
 *
 * 仅当**不存在其他未解决 active journal**（active 全部为已解决 terminal：COMMITTED /
 * ROLLED_BACK / RECOVERED；NEEDS_ATTENTION 视为未解决）时才清除 durable 标记。
 * fail-closed：扫描失败不清除。
 */
export declare function resolveSafeModeMarker(store: {
    scanActive(): Promise<string[]>;
    loadActive(operationId: string): Promise<OperationJournal | null>;
}, clearSafeMode: () => Promise<void>, probeOnly?: boolean): Promise<boolean>;
export declare function createRecoveryOrchestrator(deps: RecoveryOrchestratorDeps): RecoveryOrchestrator;
