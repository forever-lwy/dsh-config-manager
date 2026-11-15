/**
 * 宿主生命周期的**调度接线**（tech-debt #23 下沉）：调度器启停、退出兜底释放环境锁、
 * 实例心跳。此前这些散在 src/index.ts 的 apply() 里，只能靠「装上宿主跑一遍」验证。
 *
 * 两条语义在这里被钉住（它们都是踩过的坑）：
 *
 * 1. **调度器只在启动分类为 NORMAL 后才启动**（P1-B）。分类是异步的、apply() 是同步的，
 *    两边谁先到都可能 —— 于是用「arm（接线就绪）+ classify（结论到达）」两个状态位收敛，
 *    任一顺序都能得出正确结果，且 `started` 保证只启动一次。
 * 2. **退出时必须兜底释放环境锁**。关窗时后台同步的 finally 等不到 ⇒ 锁留盘，
 *    下次启动整轮被判 STALE（见 core/env-lock-lifecycle.ts）。释放函数本身是幂等的。
 *
 * 边界：本文件只依赖 `node:`（core 子目录不得 import core 兄弟模块），
 * 因此调度器、心跳器、effect 注册口一律注入。
 */
/** 可启停的宿主调度器（AutoSyncScheduler / BackupScheduler 都满足）。 */
export interface StartStoppable {
    start(): void;
    stop(): void;
}
/** 实例心跳（DshProfileRuntimeRegistry 满足）：返回停止函数。 */
export interface HeartbeatRuntime {
    startHeartbeat(): () => void;
    withdraw(): void;
}
/** 卸载清理的注册口（宿主 Cordis 的 ctx.effect 注入薄壳）。 */
export type EffectRegistrar = (label: string, setup: () => () => void) => void;
export interface HostLifecycleOptions {
    scheduler: StartStoppable;
    backupScheduler: StartStoppable;
    /**
     * 退出兜底释放环境锁（`createExitLockReleaser(envLockManager)` 的绑定）。
     * 幂等：正常卸载时 effect 会再调一次。
     */
    releaseLockOnExit: () => void;
    profileRuntime: HeartbeatRuntime;
    effect: EffectRegistrar;
}
/** 启动分类结论：只有 NORMAL 放行调度器。 */
export type StartupVerdict = 'NORMAL' | 'BLOCKED';
export interface HostLifecycle {
    /** 注册全部卸载清理（幂等：重复调用不重复注册）。 */
    mount(): void;
    /** 接线就绪（scheduler / backupScheduler 已构造完成），可接受启动。 */
    arm(): void;
    /** 启动分类结论到达；NORMAL 且已 arm 时立即启动调度器。BLOCKED 为终态，不可翻案。 */
    onStartupClassified(verdict: StartupVerdict): void;
    /** 调度器是否真的启动过（只读，供诊断/测试） */
    started(): boolean;
}
export declare function createHostLifecycle(options: HostLifecycleOptions): HostLifecycle;
