import type { Logger } from '../utils/logger.ts';
import type { WatchTarget } from './watch-scope.ts';
/** fs.watch 返回的句柄（只用到 close）。 */
export interface WatchHandle {
    close(): void;
}
/** fs.watch 的最小签名（测试注入假实现）。 */
export type WatchFactory = (absPath: string, opts: {
    recursive: boolean;
}, listener: (event: string, filename: string | null) => void) => WatchHandle;
/** 缺省去抖窗口：一次「保存配置」产生的连续事件合并为一次触发。 */
export declare const DEFAULT_WATCH_DEBOUNCE_MS = 1500;
/** 缺省自写回声窗口：resume 后这段时间内的事件一律忽略。 */
export declare const DEFAULT_WATCH_QUIET_MS = 2000;
export interface SyncWatcherOptions {
    /** `$DSH_HOME` 绝对路径 */
    homeDir: string;
    /** 监听目标（`watch-scope.buildWatchTargets` 的产物） */
    targets: readonly WatchTarget[];
    log: Logger;
    /** 去抖窗口到期：把这一批变更的 home 相对路径交给上层（已过滤噪声）。 */
    onFlush: (changed: readonly string[]) => void;
    debounceMs?: number;
    quietAfterSuspendMs?: number;
    watchFactory?: WatchFactory;
    /** 时间源 / 计时器（测试注入） */
    now?: () => number;
    setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
    clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}
export declare class SyncWatcher {
    private readonly homeDir;
    private readonly log;
    private readonly onFlush;
    private readonly debounceMs;
    private readonly quietAfterSuspendMs;
    private readonly watchFactory;
    private readonly now;
    private readonly setTimer;
    private readonly clearTimer;
    private targets;
    private attachments;
    private pending;
    private timer;
    private started;
    private suspended;
    private quietUntil;
    constructor(opts: SyncWatcherOptions);
    /** 是否已启动。 */
    isStarted(): boolean;
    /** 当前实际挂上的监听数（诊断/测试用）。 */
    attachmentCount(): number;
    /** 启动监听（重复调用是幂等的）。 */
    start(): void;
    /** 停止监听并丢弃未触发的变更（插件卸载 / 自动同步关闭时必须调）。 */
    stop(): void;
    /** 换监听目标（分区选择/配置变化）；已启动则原子重启。 */
    setTargets(targets: readonly WatchTarget[]): void;
    /**
     * 进入「自写中」：屏蔽事件并丢弃已积累的变更。
     *
     * 在 runOnce 开始时调用 —— 同步自家的 apply/push 会写 settings.yaml / patch / skills，
     * 那些写入不是用户改动。
     */
    suspend(): void;
    /** 退出「自写中」：随后进入静默窗口，避免收尾写入的回声立刻触发下一轮。 */
    resume(): void;
    /** 立即处理当前积累的变更（测试用；正常路径靠定时器）。 */
    flushNow(): void;
    private attachAll;
    private attach;
    private onRawEvent;
    private scheduleFlush;
    private flush;
    private clearPendingTimer;
}
