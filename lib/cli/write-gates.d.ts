export type WriteRefusalCode = 'safe-mode' | 'stale-lock' | 'dsh-running' | 'nothing-to-do' | 'io-error';
/**
 * SAFE MODE 拒因码的**单点常量**：`src/cli/index.ts` 的源码守卫（P0-11-07）禁止
 * CLI 自带 `'safe-mode'` 字面量，判据必须复用本常量（否则改一处漏一处）。
 */
export declare const SAFE_MODE_REFUSAL_CODE: WriteRefusalCode;
export interface WriteGateRefusal {
    ok: false;
    code: WriteRefusalCode;
    /** 用户可读原因（页面直接展示） */
    reason: string;
    /**
     * 拒因的结构化明细（页面据此给出「怎么解除」的可操作指引，而不是只丢一句 reason）。
     *
     * 为什么要有：`dsh-running` 是最常被撞到的一道门，光给「请先关闭 DSH」用户会问
     * 「关哪个、怎么确认关掉了」。这里把**是谁在跑**（心跳台账里的 profile/pid/端口）
     * 如实带出来 —— 只读事实，不猜、不代关进程。
     */
    detail?: {
        kind: 'dsh-running' | 'stale-lock' | 'safe-mode';
        /** 正在运行的实例（心跳合并视图：本插件启动的 + 手动启动的） */
        instances?: Array<{
            name: string;
            pid: number;
            port: number | null;
        }>;
        /** 环境锁状态（kind = 'stale-lock'） */
        lock?: {
            state: string;
            locksDir: string;
        };
        /** SAFE MODE 标记文件（kind = 'safe-mode'） */
        markers?: string[];
        /** 与 CLI 逐字同源的等价命令（可复制去终端跑） */
        commands: string[];
    };
}
export type WriteGateOutcome = {
    ok: true;
} | WriteGateRefusal;
/**
 * 从控制面候选根派生**环境锁目录**（`<root>/locks`）。
 *
 * 为什么由根派生而不是让每个调用点多传一个参数：`checkWriteGates` 的 `locksDir` 是**可选**的，
 * 「少传一个参数」就静默退化成「不查环境锁」。审计 P11-4 正是这么漏掉的：就地修复（repairSessionLogInline）
 * 不传 locksDir，残留/被持有的环境锁存在时照样改写 `.zstd` 会话字节。
 * 派生顺序与 `resolveControlRoots` 同源：第一个真实持有 `locks/environment.lock` 的候选根；
 * 都没有就退回首个候选的 `locks`（读不到即视为无锁，判据仍只由 readLockState 给）。
 */
export declare function locksDirFromControlRoots(controlRoots: readonly string[]): string | undefined;
/**
 * 写动作的前置门（与 CLI `sessions repair --fix` 同一判据）。
 *
 * `needsDshStopped`：**改写/搬动会话字节**的动作（会话布局归位 repairSessions、字节级就地修复
 * repairSessionLogInline）与**快照恢复**（runSnapshotRestore 会覆盖/删除 `$DSH_HOME` 下正在使用的文件）
 * 都要「DSH 已停」这一条；磁盘清理不需要（只碰可重建缓存）。
 */
export declare function checkWriteGates(controlRoots: readonly string[], options?: {
    needsDshStopped: boolean;
    locksDir?: string;
}): Promise<WriteGateOutcome>;
