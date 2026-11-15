import type { ReconcileProbeHooks, ReconcileEnv, ReconcileOptions } from './reconcile.ts';
import type { JournalStore } from './journal.ts';
export type StartupRecoveryState = {
    kind: 'NORMAL';
} | {
    kind: 'LOCKED_LIVE';
    operationId?: string;
} | {
    kind: 'RECOVERY_REQUIRED';
    operationId?: string;
} | {
    kind: 'NEEDS_ATTENTION';
    operationId?: string;
} | {
    kind: 'UNKNOWN_STATE';
    reason: string;
};
export interface StartupClassifier {
    classify(): Promise<{
        state: StartupRecoveryState;
        safeModeRequired: boolean;
        recoveryRequired: boolean;
    }>;
}
/** 用 inspectStartup 结果构造分类器。lockState: 'LOCKED'|'STALE_LOCK_DETECTED'|'UNKNOWN_STATE'|'FREE'。 */
export declare function classifyStartup(opts: {
    store: JournalStore;
    hooks: ReconcileProbeHooks;
    env: ReconcileEnv;
    options?: ReconcileOptions;
    lockState: 'LOCKED' | 'STALE_LOCK_DETECTED' | 'UNKNOWN_STATE' | 'FREE';
}): StartupClassifier;
/**
 * 启动分类结束后如何处置 SAFE MODE（issue #87，单一判据，便于单测；宿主 apply() 只消费结论）。
 *
 * 为什么需要它：`probeSafeModeSync()` 读的是**上一轮**留下的 durable 标记，而分类结论才是本轮权威。
 * 分类判 `NORMAL` ⇒ 没有任何未决 journal 能解释那个标记 ⇒ 它是陈旧标记，必须**同时**复位内存标志与
 * durable 标记 —— 只复位内存会让本会话的写操作继续被 423 挡着（界面却说「无待处理事项」），只复位标记
 * 又会在下一次 probe 时重新置起（标记跨重启生效）。
 *
 * 为什么要求 `lockState === 'FREE'`：`LOCKED` 且无未决 journal 时分类同样返回 NORMAL，但那只说明
 * **另一个存活实例**正在持有环境锁 —— 此刻清标记等于替别人解除保护。**只有确认没有活锁者才清。**
 *
 * 为什么要求 `currentlyBlocked`（即 probe 读到 durable 标记确实是 'blocked'）：标记为 `'unknown'`
 * （存在但读不出/布局不可信）时不在这里清 —— 那属于无法判定，既不假装已解除，也不假装没看见；
 * 它本会话不阻断的语义由 `probeSafeModeSync` 的既有约定承担。
 */
export declare function resolveStartupSafeMode(input: {
    kind: StartupRecoveryState['kind'];
    lockState: 'LOCKED' | 'STALE_LOCK_DETECTED' | 'UNKNOWN_STATE' | 'FREE';
    /** 本轮 probe 之前的内存标志（probeSafeModeSync 的结论） */
    currentlyBlocked: boolean;
}): {
    blocked: boolean;
    clearStaleMarker: boolean;
};
export interface StartupSchedulers {
    start(): void;
}
/**
 * 启动分类/探测**抛错**时的 fail-closed 结论（单一来源，勿再各写一份）：
 *  - `state`：绝不默认 NORMAL，归为 RECOVERY_REQUIRED；
 *  - `safeModeRequired`：无法证明环境干净 → destructive 入口必须被阻断（内存标志 + durable 标记），
 *    与 `Phase3Recovery.runJournaled` 异常分支的姿态一致；
 *  - `startSchedulers`：一律 false。
 *
 * 消费方：`StartupRecoveryController.run()` 的 catch；宿主的启动分类 catch（src/index.ts apply()）。
 * 只置「调度器不启动」而不置 SAFE MODE 属半套 fail-open —— 审计 P0-10 的实测缺口。
 */
export declare const FAIL_CLOSED_STARTUP: {
    readonly state: StartupRecoveryState;
    readonly safeModeRequired: true;
    readonly startSchedulers: false;
};
/**
 * StartupRecoveryController：`await run()` 完成后调度器才可启动。
 * `startSchedulersIfAllowed()` 只在 NORMAL 启动（幂等）；否则（RECOVERY_REQUIRED/NEEDS_ATTENTION/UNKNOWN/LOCKED_LIVE）
 * 不启动 destructive schedulers（read-only host 仍活，diagnostics/recovery API 可用）。fail-closed：classify 抛错 → RECOVERY_REQUIRED。
 */
export declare class StartupRecoveryController {
    private state;
    private settled;
    private schedulersStarted;
    private readonly classifier;
    private readonly schedulers;
    constructor(classifier: StartupClassifier, schedulers: StartupSchedulers);
    run(): Promise<StartupRecoveryState>;
    get stateValue(): StartupRecoveryState;
    get isSettled(): boolean;
    /** 仅在 NORMAL 下启动 schedulers（幂等；返回是否已启动）。 */
    startSchedulersIfAllowed(): boolean;
}
