import { readSafeModeMarkerSync } from '../core/phase3-host.ts';
/** 进程是否存活（不发送信号，只探测）。EPERM = 存在但无权限发信号 → 仍算存活。 */
export declare function isProcessAlive(pid: number): boolean;
/** 一个在跑的 DSH 实例（来自 `<root>/running/<profile>.json` 心跳）。 */
export interface RunningInstance {
    name: string;
    pid: number;
    port: number | null;
    startedAt: string;
    updatedAt: number;
}
/**
 * 读「本机正在跑的 DSH 实例」。
 *
 * **为什么按候选根扫描**：心跳在 `<插件 dataDir>/running/`，而 CLI 的 `--data-dir` 语义是
 * 「快照目录」（缺省 `$DSH_HOME/dsh-config-manager/snapshots`）。旧实现把快照目录当 dataDir 用，
 * 于是缺省路径下**永远找不到心跳** —— 那道「DSH 在跑就别写会话字节」的门形同虚设（fail-open）。
 * 这里改为复用 `resolveControlRoots` 的候选根：显式 `--data-root` 只认它，否则同时看
 * `--data-dir` 本身与它的父目录，再叠加缺省根；多查几处只会更保守。
 */
export declare function readRunningInstances(controlRoots: readonly string[]): Promise<RunningInstance[]>;
export interface SafeModeReport {
    /** 候选控制面根 */
    root: string;
    /** 标记文件绝对路径（写进界面，便于人工核对） */
    marker: string;
    /** clear = 明确没有标记；blocked = 有未结案的 transaction；unknown = 读不出来（按阻断处理） */
    state: ReturnType<typeof readSafeModeMarkerSync>;
    /**
     * 该候选根下是否已经存在有效的「控制面目录」（dataDir 或 transactions）。
     *
     * 为什么需要：候选根里绝大多数**本来就不存在**（`--data-dir` 的父目录、缺省根都可能没有），
     * 那些根的 'clear' 只是「这里什么都没建」，把它当成「SAFE MODE 未激活」的正面证据是把
     * 「没查」说成「没问题」。界面只在**有效根**上给绿灯，其余如实说「未建立 / 未发现标记」。
     */
    established: boolean;
}
/** 逐个候选根读 SAFE MODE 标记（fail-closed 的判定仍在 CLI/core；这里只报事实）。 */
export declare function readSafeMode(controlRoots: readonly string[]): SafeModeReport[];
export interface LockReport {
    locksDir: string;
    /** 锁文件是否存在（不存在 = 没有活动锁） */
    present: boolean;
    /** 没有锁时恒为 'NONE'；否则为 inspectLockState 的结论 */
    state: string;
    detail?: string;
}
/**
 * 读环境锁状态（只读）。
 *
 * 复用宿主/CLI 同一套 `inspectLockState`：**绝不**因为「看起来是残留」就自动回收 ——
 * 回收只有显式命令一条路（`recover-stale-lock`）。
 */
export declare function readLockState(locksDir: string): Promise<LockReport>;
