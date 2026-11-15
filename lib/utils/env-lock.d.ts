/** 锁目录相对 dataDir */
export declare const LOCKS_DIR = "locks";
/** 所有权记录文件名（immutable） */
export declare const OWNERSHIP_FILE = "environment.lock";
/** heartbeat sidecar 前缀 + 文件名模板：environment.heartbeat.<instanceId> */
export declare const HEARTBEAT_PREFIX = "environment.heartbeat.";
/** recovery 捕获文件名临时前缀 + 模板：environment.recovering.<recoveryInstanceId> */
export declare const RECOVERING_PREFIX = "environment.recovering.";
/** lock schema 版本 */
export declare const LOCK_SCHEMA_VERSION = 1;
/** 默认心跳间隔 ms */
export declare const DEFAULT_HEARTBEAT_INTERVAL_MS = 1000;
/** 默认 stale 阈值 ms（≥ 10 × heartbeatInterval） */
export declare const DEFAULT_STALE_AFTER_MS = 10000;
/** 默认 acquire 等待超时（等待活跃锁释放）ms；0 = 不等待直接返回 */
export declare const DEFAULT_ACQUIRE_TIMEOUT_MS = 0;
/** 「心跳长过期」下限 ms（issue #36）。实际阈值 = max(30 × staleAfterMs, 本值)。
 *  用途：Windows/macOS 默认拿不到 OS process identity，Windows 又会复用 PID，于是
 *  「心跳过期 + pid 存活」永远停在 UNKNOWN_STATE，用户只能手工删锁文件（issue #36 实测）。
 *  心跳长过期说明写方早已停摆 → 允许**显式**回收判为残留锁；acquire 侧仍绝不自动摘锁。 */
export declare const DEFAULT_LONG_EXPIRED_AFTER_MS: number;
/** 长持有告警阈值（缺省 2 分钟）：正常 mutation（导出/合并/推送）远短于此，超过即视为可疑，
 *  但**只告警不解锁** —— 活持有者可能真的在跑长任务，强拆会造出双持有（比卡死更难查）。 */
export declare const DEFAULT_HOLD_WARN_AFTER_MS = 120000;
/** 进程身份（可注入探测；OS 可验证的 process creation identity 才用于 PID reuse） */
export interface ProcessIdentity {
    /** OS 可验证的进程创建身份串（Linux /proc/<pid>/stat starttime、macOS ps、Windows Get-Process）；null = 无法可靠取得 */
    osProcessStartIdentity: string | null;
    /** 进程是否存活（best-effort） */
    alive: boolean;
}
/** 可注入的进程身份探测门面（默认实现跨平台；测试可注入）。
 * 契约：`alive:false` 只表示 **确证不存在**（ESRCH）；探测失败/不确定必须 **抛错**，
 * 由上层归为 UNKNOWN_STATE —— 绝不把失败误报为「确证死亡」（否则会成为误删许可）。 */
export interface ProcessIdentityProbe {
    /** 探测某 pid 的存活与 OS 身份；确证不存在返回 alive:false；不确定/失败抛错 */
    probe(pid: number): Promise<ProcessIdentity>;
    /** 是否能够可靠取得 OS process creation identity（该平台上实现能力） */
    canGetOsIdentity(): boolean;
}
/** 可注入 IO 门面（对齐 Phase 1 AtomicIo；默认包 node:fs/promises） */
export interface EnvLockIo {
    mkdir(dir: string, opts: {
        recursive: boolean;
    }): Promise<void>;
    /** open；flag 含 'x'（wx/wx+）用于独占创建 */
    open(p: string, flag: string, mode?: number): Promise<EnvLockHandle>;
    rename(src: string, dst: string): Promise<void>;
    unlink(p: string): Promise<void>;
    stat(p: string): Promise<{
        isFile(): boolean;
    } | null>;
    readFileText(p: string): Promise<string>;
    lstat?(p: string): Promise<{
        isSymbolicLink(): boolean;
    } | null>;
    /** 列出目录条目名（诊断；不存在 → 空） */
    listLocksDir?(dir: string): Promise<string[]>;
}
export interface EnvLockHandle {
    writeFile(data: Uint8Array): Promise<void>;
    sync(): Promise<void>;
    close(): Promise<void>;
}
export type LockState = 
/** 成功获得所有权 */
'ACQUIRED'
/**
 * 无锁：ownership 文件确实不存在（issue #79）。
 *
 * 此前这一态被保守归入 LOCKED（「可能在创建中」），于是 recovery/status 会在**根本没有锁**时
 * 回报 LOCKED —— 用户照着面板去找一个不存在的锁（真机反馈：自测 acquire/release 都正常，
 * 面板却一直显示 LOCKED）。真正需要保守的是 **acquire**（见 acquire 的 FREE 重试分支），
 * 而不是对用户的**报告**：「没看到锁」就如实说没有。
 */
 | 'FREE'
/** 锁被活跃 owner 持有 */
 | 'LOCKED'
/** 检测到确定 stale（heartbeat 超时 + 进程确证死亡 或 PID reuse）—— 只报告，不自动删除 */
 | 'STALE_LOCK_DETECTED'
/** 无法可靠判定（探测失败 / OS identity 缺失）—— 不删除、不 recover、destructive 不执行 */
 | 'UNKNOWN_STATE'
/** lock 目录 / 文件 IO 错误（非占用） */
 | 'LOCK_IO_ERROR'
/** 权限错误（EPERM/EACCES 且无法确认 lock 存在） */
 | 'PERMISSION_ERROR';
/** 所有权记录（immutable）：写入后直到 release 不再改名/替换 */
export interface LockOwnershipRecord {
    schemaVersion: number;
    owner: {
        instanceId: string;
        /** 本实例启动时刻（Date.now()，应用层时间戳；PID reuse 判断不使用它） */
        instanceStartedAt: number;
        pid: number;
        hostname: string;
        /** OS 可验证的进程创建身份（写入方 acquire 时探测自身）；可能为 null */
        osProcessStartIdentity: string | null;
    };
    op: string;
    target: string;
    acquiredAt: number;
    lockVersion: string;
    /** 预留 Phase 3 journal id；本阶段恒 null，不实现 */
    journalId: string | null;
}
/** heartbeat sidecar 内容（atomicWriteFile 更新；文件名含 instanceId） */
export interface HeartbeatRecord {
    ownerInstanceId: string;
    heartbeatAt: number;
    seq: number;
}
/** 一次 acquire 的返回 */
export interface AcquireResult {
    state: LockState;
    /** state === 'ACQUIRED' 时非 null */
    token: MutationLockToken | null;
    /** 诊断信息（非敏感）：占用方 op/hostname、或错误描述 */
    detail?: string;
    /** STALE_LOCK_DETECTED 的细分（只用于给用户的分类文案）：
     *  owner-gone = 结构可证（进程已死 / PID 复用 / 无 identity 能力但心跳长过期）；
     *  heartbeat-stopped = 进程仍活、identity 相同，但心跳长期停止（典型：release 失败留痕）。 */
    staleKind?: 'owner-gone' | 'heartbeat-stopped';
}
/** operation-scoped lock token：accepted 后只属于当前 mutation 调用链 */
export interface MutationLockToken {
    /** 本 token 唯一的不可伪造 id */
    readonly tokenId: string;
    /** 所属 manager 身份（防止 foreign token） */
    readonly managerId: string;
    /** owner instanceId（release 校验用） */
    readonly instanceId: string;
    /** acquire 时刻 */
    readonly acquiredAt: number;
}
/** nested operation 显式传递的 lock context */
export interface MutationLockContext {
    readonly token: MutationLockToken;
}
/**
 * core/CLI/ModelTools 依赖的最小锁契约（与具体 EnvironmentLockManager 解耦，便于 mock 测试）。
 * 满足：acquire → 无 token 时获取全局锁；reuseLock → nested 复用（不 reacquire）。
 */
export interface MutationLockPort {
    /**
     * 尝试获取 GLOBAL mutation lock。
     * @param parentContext 若提供且有效（validate=true），表示调用链已持锁 → 复用，不 reacquire，恒返回 {state:'ACQUIRED', token: parentContext.token}
     * @returns 未持锁时走完整 acquire；被占 → LOCKED；stale/unknown → 对应状态（不自动删）
     */
    acquire(opts: {
        op: string;
        target?: string;
        /** nested：若有效父 token → 复用（不 reacquire），否则正常 acquire */
        parentContext?: MutationLockContext;
    }): Promise<AcquireResult>;
    /** 校验 token 是否有效且属于当前持有（nested reuse 判断用） */
    validate(token: unknown): token is MutationLockToken;
    /** release（release 前校验 instanceId；mismatch 抛 EnvironmentLockOwnedByAnotherError） */
    release(token: MutationLockToken): Promise<void>;
    /**
     * 可选：只回收**结构性可证** stale 残留锁（owner 确证死亡 / PID 复用），其余一律不动。
     * 端口实现缺这个方法（mock / 远端代理）时调用方必须当作「不支持」跳过，不得自行 inspect+release。
     * @returns null = 无需/无权回收；否则为该次 recover 的结果
     */
    reclaimProvableStaleLock?(): Promise<RecoverResult | null>;
    /** 可选：同步兜底释放本实例持有的锁（进程 exit/dispose 用；永不抛错）。 */
    releaseOnExitSync?(): void;
}
/**
 * 便捷包装：核心引擎「无父 token → acquire；有有效父 token → reuse（不 reacquire）」。
 * 返回 { token, context, release }：调用方在 finally 中调用 release（仅当本次真正 acquire 才 release）。
 * 若未提供 port（测试/无锁环境）→ 恒成功、不锁定（token=null、release = no-op）。
 *
 * @example
 * const { context, release } = await withMutationLock(ctx.mutationLock, { op: 'import', target })
 * if (!context) throw new Error('环境锁被占用')   // token===null 且真正需要锁 → 被挡
 * try { ...mutation...; await rollback(..., { lockContext: context }) } finally { await release() }
 */
/**
 * 便捷包装：核心/宿主「无父 token → acquire；有有效父 token → reuse（不 reacquire）」。
 * 返回 { context, release }：
 *  - context 非 null = 有锁（或已传入有效父 token 复用）；release 仅当**本次真正 acquire**才实际释放；
 *  - context null = 锁不可得（被挡）或未配置锁环境。
 * 调用方必须区分：port 未配置（无锁环境）→ context null 且可放行；port 已配置但 context null → 被挡必须拒绝。
 */
export declare function withMutationLock(port: MutationLockPort | undefined, opts: {
    op: string;
    target?: string;
    parentContext?: MutationLockContext;
    isBlocked?: () => boolean;
}): Promise<{
    context: MutationLockContext | null;
    release(): Promise<void>;
    reason?: LockBlockReason;
    detail?: string;
}>;
/**
 * 直接执行式的 mutation 守卫：acquire（或复用父 token）→ 执行 → 释放。
 * - port 未配置（无锁环境/测试）→ 直接执行 fn(null)，不锁定。
 * - port 已配置但 acquire 失败 → **抛 EnvironmentLockUnavailableError**（destructive 不得执行）。
 * - 复用父 token 时（parentContext 有效）→ 不 reacquire、不释放父 token，fn 收到父 context。
 */
export declare function runWithMutationLock<T>(port: MutationLockPort | undefined, opts: {
    op: string;
    target?: string;
    parentContext?: MutationLockContext;
    isBlocked?: () => boolean;
}, fn: (ctx: MutationLockContext | null) => Promise<T>): Promise<T>;
/** 一次 recover 的返回 */
export interface RecoverResult {
    ok: boolean;
    /** 是否实际移除了 stale inode（ok=true 时为 true） */
    removed: boolean;
    /** 判定：STALE_LOCK_DETECTED / UNKNOWN_STATE（拒绝）/ LOCKED（拒绝，owner healthy）/ LOCK_IO_ERROR / PERMISSION_ERROR */
    state: LockState;
    /** 诊断 */
    detail?: string;
    /** 实际被回收的 owner（供自动路径记日志；corrupt 回收时为 undefined） */
    removedOwner?: {
        op: string;
        pid: number;
    };
}
/**
 * recover 的调用约束。
 *  - `'any'`（缺省）= 显式动作：沿用全部既有判据（含 corrupt 残留与心跳长过期启发式）。
 *  - `'provable'` = 自动路径：只承认 owner 确证死亡 / PID 复用，其余一律拒绝并保留现场。
 */
export interface RecoverOptions {
    require?: 'any' | 'provable';
}
/**
 * heartbeat 定时器注入面（缺省 = 全局 setInterval/clearInterval）。
 * 测试注入手动 tick 的假定时器后，心跳推进**完全确定**（不依赖墙钟/事件循环负载），
 * 断言可写成「tick 后读到的值」而不是「等 N 毫秒后猜测」。
 */
export interface LockTimerApi {
    /** 返回值即句柄（真实实现是 Timeout；测试实现可是任意对象） */
    setInterval(fn: () => void | Promise<void>, ms: number): unknown;
    clearInterval(handle: unknown): void;
}
export interface EnvLockManagerOptions {
    /** dataDir（缺省 ~/.dsh/dsh-config-manager）—— 锁在 <dataDir>/locks */
    dataDir?: string;
    /** 覆盖绝对 locks 目录（测试/CLI 注入） */
    locksDir?: string;
    /** 可注入 io */
    io?: EnvLockIo;
    /** 可注入进程探测 */
    probe?: ProcessIdentityProbe;
    /** 时钟（测试注入） */
    now?: () => number;
    /** 心跳间隔 ms（缺省 1000） */
    heartbeatIntervalMs?: number;
    /** stale 阈值 ms（缺省 10000） */
    staleAfterMs?: number;
    /** acquire 等待活跃锁释放的超时 ms（缺省 0=不等待） */
    acquireTimeoutMs?: number;
    /** 「心跳长过期」阈值 ms（issue #36；缺省 max(30 × staleAfterMs, 30 分钟)）。
     *  只影响「pid 存活但进程身份不可验证」这一类锁的**显式**回收与状态分类，不放松自动侧。 */
    longExpiredAfterMs?: number;
    /** 诊断用的当前 operation 描述（写入 ownership.op） */
    op?: string;
    /** 诊断用的 target 描述 */
    target?: string;
    /** 插件版本（写入 ownership.lockVersion） */
    lockVersion?: string;
    /** heartbeat 续期写失败回调（留痕；不中断 mutation） */
    onHeartbeatWriteFailure?: (err: unknown) => void;
    /** release 无法把 ownership 从盘上摘掉时留痕（unlink 反复失败 → 已 quarantine 解除阻塞；或彻底失败）。
     *  以前这条路径完全静默：调用方 `release().catch(() => {})` 把错误吞掉，锁留在盘上无人知道。 */
    onReleaseFailure?: (b: {
        err: unknown;
        quarantined: boolean;
    }) => void;
    /** heartbeat 定时器（测试可注入手动 tick 的假定时器；缺省用全局定时器） */
    timers?: LockTimerApi;
    /** 单次持有超过该时长只**告警**（缺省 120 s；0 = 关闭看门狗）。
     *  真机 issue：autosync 成功后 ownership 与 heartbeat 都没释放、seq 一直涨，recover-stale-lock
     *  判定「持有者还活着」拒绝回收，用户只能删 locks 目录或重启桌面端 —— 期间**没有任何线索**
     *  说明是哪个 op 卡住了。看门狗只补这一层可观测性，绝不强拆活持有者（那会造出双持有）。 */
    holdWarnAfterMs?: number;
    /** 长持有告警回调（留痕/上报；异常被吞，绝不影响锁状态） */
    onHoldExceeded?: (info: {
        op: string;
        heldMs: number;
        tokenId: string;
    }) => void;
}
/** 外部命令执行器（测试注入用）：只取 stdout；失败/超时抛错。 */
export type IdentityCommandRunner = (file: string, args: string[], timeoutMs: number) => Promise<string>;
/** 平台进程身份探测的可注入依赖（缺省 = 真实平台实现）。 */
export interface ProcessIdentityProbeOptions {
    /** 平台（缺省 process.platform；测试注入以覆盖 win32/darwin 分支） */
    platform?: NodeJS.Platform;
    /** 外部命令执行器（缺省 child_process.execFile；仅 win32/darwin 有查询命令） */
    runCommand?: IdentityCommandRunner;
    /** 自身进程 pid（缺省 process.pid；测试注入） */
    selfPid?: number;
}
/**
 * 解析 Linux `/proc/<pid>/stat` 的 starttime（进程创建时刻，单位 ticks）。
 *
 * stat 的格式是 `pid (comm) state ppid …`，而 **comm 可以包含空格与括号**（可执行文件名 / 线程名），
 * 所以必须先切掉 `(comm)`：字段 1=pid、2=comm、3=state … 22=starttime。以最后一个 `)` 之后的空白
 * 分隔数组下标 k 对应字段 k+3，因此 starttime = 下标 **19**。
 * （取 21 会拿到 rss —— 那是个随内存占用变化的值，同一个进程两次探测都能不同：CI 上实测因此
 * 把活着的 owner 判成「PID 被复用」的残留锁，见本函数被抽出来的原因。）
 *
 * 取不到（没有括号 / 字段不足 / 非数字）→ null。**绝不**退回一个恒定假身份 —— 那会把不同进程
 * 判成同一个 owner，比拿不到身份危险得多。
 */
export declare function parseLinuxProcessStarttime(statText: string): string | null;
/**
 * 平台进程身份探测（默认实现；issue #36 的精确判据）：
 *  - linux：读 `/proc/<pid>/stat` 的 starttime（第 22 字段）——不 spawn 任何进程；
 *  - win32：`Get-Process` 的 `StartTime.ToFileTimeUtc()`；
 *  - darwin：`ps -o lstart=`；
 *  - 其它平台：`canGetOsIdentity()` = false（退回「心跳长过期」启发式判据）。
 *
 * 代价（known-gaps G-15 的「代价不可接受」正是要解决的点）：自身进程的创建时间在进程生命周期内
 * **不变** → 命中一次即缓存（成功与失败都缓存：探测能力是环境属性），于是每次 acquire 不再 spawn shell；
 * 对**别的** pid 的探测只发生在「锁文件存在且心跳已过期」的少数路径上（心跳新鲜时先返回 LOCKED，不探测）。
 *
 * 失败语义：查询失败/超时/命令缺失 → **identity = null**，绝不抛错 —— 抛错会把分类推成 UNKNOWN_STATE，
 * 反而让 issue #36 里「长过期可显式回收」这条路径失效。identity = null 时上层自动退回长过期启发式。
 */
export declare function createPlatformProcessIdentityProbe(opts?: ProcessIdentityProbeOptions): ProcessIdentityProbe;
/**
 * EnvironmentLockManager：跨进程环境锁管理器。
 *
 * 用法：
 *   const mgr = new EnvironmentLockManager({ locksDir })
 *   const { state, token } = await mgr.acquire({ op: 'import' })
 *   if (state !== 'ACQUIRED') throw ...            // destructive 必须成功 acquire
 *   try { ...mutation... } finally { await mgr.release(token) }
 *   // nested rollback：mutation 内 rollback(..., { lockContext: { token } }) → reuse，不 reacquire
 */
export declare class EnvironmentLockManager {
    private readonly locksDir;
    private readonly io;
    private readonly probe;
    private readonly now;
    private readonly heartbeatIntervalMs;
    private readonly staleAfterMs;
    private readonly longExpiredAfterMs;
    private readonly acquireTimeoutMs;
    private readonly lockVersion;
    private readonly onHeartbeatWriteFailure;
    private readonly onReleaseFailure;
    /** 长持有看门狗阈值/回调（见 EnvLockManagerOptions.holdWarnAfterMs） */
    private readonly holdWarnAfterMs;
    private readonly onHoldExceeded;
    /** 看门狗定时器句柄（与 heartbeatTimer 分开：一个是续期，一个是「该不该还没释放」） */
    private holdWatchdogTimer;
    private holdStartedAt;
    private holdOp;
    /** 诊断用（acquire 时写 ownership.op/target） */
    private readonly defaultOp;
    private readonly defaultTarget;
    /** 本 manager 唯一 id（forever token 校验用） */
    private readonly managerId;
    /** heartbeat 定时器注入面（缺省全局定时器） */
    private readonly timers;
    /** 本 manager 持有的当前活跃 token（单锁单持有者） */
    private activeToken;
    /** heartbeat 定时器句柄（注入面返回值，类型未知 → 用 null 判「未启动」） */
    private heartbeatTimer;
    private heartbeatSeq;
    /** 在飞 acquire 计数：reclaimOwnLeftover 只在「本 manager 此刻没有别的 acquire 在飞」时动手。
     *  否则 A 刚 open('wx') 成功、还没写上 activeToken 的那一瞬，并发 B 会把 A 的**新锁**当成自己的
     *  残留挪走 —— §11.1-c23 实测会出现两个 ACQUIRED（双持有），那是比卡死更难查的错。 */
    private acquireInFlight;
    private readonly activeInstanceId;
    /** 串行化的 heartbeat 写链（**最后一次写**的 promise）；release 前用于 drain，见 drainHeartbeat */
    private pendingHeartbeat;
    /** 瞬时错误（EBUSY 等）有界重试计数 */
    private transientRetries;
    private readonly maxTransientRetries;
    /** 有界瞬时重试：EBUSY（Windows sharing violation / 杀软）后小退避重试；超限则返回 false（交由 classify） */
    private tryTransientRetry;
    constructor(opts?: EnvLockManagerOptions);
    get ownershipPath(): string;
    get locksDirectory(): string;
    /** 本 manager 是否当前持有锁（诊断用） */
    get isHolding(): boolean;
    /**
     * 尝试获取 GLOBAL mutation lock。
     * - 成功 → state=ACQUIRED，返回 token（token 只属于当前调用链）。
     * - 被活跃 owner 持有 → LOCKED（可选等待 acquireTimeoutMs 后仍失败）。
     * - 确定 stale → STALE_LOCK_DETECTED（**不自动删除**；destructive 不得执行）。
     * - 其它 → UNKNOWN_STATE / LOCK_IO_ERROR / PERMISSION_ERROR。
     *
     * 所有权用 `open(ownershipPath, 'wx')` 独占创建；**绝不用 atomicWriteFile 获取所有权**。
     */
    acquire(opts?: {
        op?: string;
        target?: string;
    }): Promise<AcquireResult>;
    /**
     * 校验 token 是否有效且属于当前持有（供 nested operation 判断能否 reuse）。
     * 返回 true = 该 token 授权本调用链 reuse 当前持有。
     */
    validate(token: unknown): token is MutationLockToken;
    /**
     * 释放锁：release 前**校验 ownership record 的 instanceId === token.instanceId**（以及 manager/tokenId）。
     * 匹配 → 清理 heartbeat + unlink ownership；不匹配 → **不 unlink**，记录 ownership-lost violation。
     *
     * 错误语义（F2 修复）：仅当磁盘 ownership 被确认成功删除后才清空 activeToken；unlink 失败/异常时
     * **保留 activeToken**（本调用链仍持有该 inode），允许调用方重试 release，绝不留下"令牌已失效但锁在磁盘上"的卡死态。
     */
    release(token: MutationLockToken): Promise<void>;
    /**
     * 把正式路径上的 ownership 记录挪到 `environment.recovering.*`（quarantine）。
     * 只用于**确证属于本 manager** 的路径：release 的 unlink 失败、acquire 发现盘上是自己的 instanceId。
     *
     * 为什么用 rename 而不是继续 unlink：unlink 删不掉说明「这个目录项删不动」（Windows 共享冲突 /
     * 杀软句柄），重复同一操作不会变好；rename 只移动目录项、不删 inode，能立刻把正式路径腾空，
     * 让后续 acquire 继续。挪走后二次读校验 captured 的 instanceId 仍是自己的才删副本；
     * 不符（异常：被他人写入）就保留副本可查 —— 阻塞已解除，这是本方法与「直接抛错」的关键区别。
     */
    private quarantineOwnership;
    /**
     * 回收「本 manager 自己上一次释放留下的残留」。
     *
     * 真机卡死态：release 的 unlink 失败被调用方 `release().catch(() => {})` 静默吞掉 →
     * ownership 留在盘上、心跳已停，而本进程仍活 ⇒ inspectLockState 判 LOCKED(owner alive degraded)
     * ⇒ 永不 STALE、显式回收也拒 ⇒ 所有 destructive 操作永久 423。
     *
     * 判据必须结构可证（否则就成了跨实例误删）：盘上 instanceId === 本 manager 的 activeInstanceId
     * （随机 16 字节、只有本 manager 会产生 ⇒ 宿主内不可能是别人的锁），并且本 manager 此刻
     * 没有在途临界区（activeToken === null），或 release 已进入但没走完（heartbeatTimer === null，
     * 即 stopHeartbeat() 已执行）。两者都不成立时一律返回 false。
     */
    private reclaimOwnLeftover;
    private startHeartbeat;
    private stopHeartbeat;
    /**
     * 长持有看门狗：持有时间超过阈值时**告警一次**，然后自行停掉。
     *
     * 只做观察，不做解锁。真机 issue（Windows 桌面端）：「autosync 成功后 ownership 与 heartbeat
     * 都没释放、heartbeat seq 一直在涨，recover-stale-lock 判定持有者还活着拒绝回收，只能手动删
     * locks 目录或重启桌面端」。那种状态下心跳是「活着」的，任何结构性 stale 判据都不会命中 ——
     * 所以最需要的是**一条能定位到 op 的日志**，而不是又一个自动回收器（强拆活持有者会造出双持有）。
     *
     * 定时器沿用注入面（LockTimerApi 只有 setInterval）：命中一次即 clearInterval，等价于一次性。
     */
    private startHoldWatchdog;
    private stopHoldWatchdog;
    /** 当前持有的操作与已持有时长（诊断用；未持有 → null）。持有超过阈值时它给出「是哪个 op」。 */
    get holdInfo(): {
        op: string;
        heldMs: number;
    } | null;
    /**
     * 等待**当前在途**的 heartbeat 写完成（不改变持有状态、不停定时器）。
     * 首写在 startHeartbeat() 中**同步**入链，故 acquire() 之后调用本方法必然等到首写落盘。
     *
     * 语义边界（本文件只保留这一套 drain，勿再引入第二套）：
     *  - 本方法 = **只等**：给「某次心跳必须已落盘」当确定性前提（测试的 waitHeartbeat / c6 / c9 / c10）。
     *  - `stopHeartbeatAndDrain()` = **停定时器再等**：收尾静止（测试 after-hook 删目录前）。
     *  - `release()` 内部复用同一个私有 `drainHeartbeat()`，且**每一条**退出路径（含各类抛错分支）都先 drain。
     */
    flushHeartbeat(): Promise<void>;
    /**
     * **收尾静止**：停掉 heartbeat 定时器并等待在途写结束。返回后本 manager 不会再产生任何文件写入，
     * 调用方可安全删除 locks 目录（`rmSync(recursive)` 不会在遍历途中被新写入打断 ——
     * 这正是 Windows 上 after-hook ENOTEMPTY 的根因）。不 unlink ownership/sidecar：
     * 锁的持有状态与磁盘内容由调用方的 release 决定。
     */
    stopHeartbeatAndDrain(): Promise<void>;
    /**
     * 等待**当前在途**的 heartbeat 写完成（release 清理 sidecar 前必须调用）。
     * 为什么必要：writeHeartbeat 走 atomicWriteFile（tmp 写入 → rename），是异步多步操作。
     * 若 release 只 stopHeartbeat + unlink sidecar 而不等待，一个已启动的写会在 unlink 之后才 rename，
     * 于是把刚删掉的 sidecar **重新创建**（或残留 .dshcm.*.tmp）——Windows 上即 after-hook rmSync ENOTEMPTY。
     * 调用点保证：release 开头**先同步 stopHeartbeat()**，其后任何时候都不会再排入新写，drain 因而有界且确定。
     * 因此 release 的**每一条**退出路径都必须先 drain 再返回/抛出（成功、ownership missing、corrupt、
     * instanceId 不匹配、unlink 失败）—— 漏掉任何一条，已启动的 tmp→rename 都会在 release 返回后落盘，
     * 与调用方的目录清理竞争（Windows 实测：after-hook rmSync ENOTEMPTY / .dshcm.*.tmp 残留；
     * 被漏掉的正是 ownership-lost 分支，200 次循环约 19% 复现）。置 activeToken=null 的路径仍须
     * **先清 token 再 drain**，否则 interval 可在 drain 返回后、cleanup 前再排入一次写，把刚删的 sidecar 复活。
     */
    private drainHeartbeat;
    /** 串行化并追踪一次 heartbeat 写：chain 保证不会有两个写并发 rename 同一个 sidecar */
    private trackHeartbeat;
    /** 写 heartbeat sidecar（atomicWriteFile 更新 sidecar，不影响 ownership；失败 → degraded，不中断 mutation） */
    private writeHeartbeat;
    /** 删除指定 instanceId 的 heartbeat sidecar（不受 activeToken 状态影响——F1 修复；调用方传自己的 instanceId）。 */
    private cleanupHeartbeat;
    /** 检查 environment.lock 是否确实存在（§8.1 分类用；stat 失败/无法确认 → null） */
    private statLockExists;
    /** ownership 三态读取：missing（缺失）/ corrupt（存在但空或非法）/ ok（有效 owner）。
     *  用于区分「无锁」与「崩溃残留的 0 字节/损坏锁」——后者可被显式 recovery 安全回收（无有效 owner 无从误删）。 */
    private readOwnershipState;
    /** 读取 owner instanceId 的 heartbeat sidecar（无 → null） */
    private readHeartbeat;
    /**
     * 判定锁状态（只分类）。按 Design §6.3 正式状态表：
     *  heartbeat fresh                    → LOCKED
     *  heartbeat expired + PID dead       → STALE_LOCK_DETECTED
     *  heartbeat expired + PID alive + identity 不同 → STALE_LOCK_DETECTED (PID reuse)
     *  heartbeat expired + PID alive + identity 相同 → LOCKED (owner alive / heartbeat degraded)
     *  probe 无法可靠确定                 → UNKNOWN_STATE
     */
    inspectLockState(): Promise<{
        state: LockState;
        detail?: string;
        corruptOwnership?: boolean;
        ownerInstanceId?: string;
        /** STALE_LOCK_DETECTED 的细分（供用户文案分类；见 AcquireResult.staleKind） */
        staleKind?: 'owner-gone' | 'heartbeat-stopped';
    }>;
    /**
     * 显式 stale recovery（独立动作；对应 CLI `--recover-stale-lock`）。
     * 只执行：inspect → prove definitely stale → 原子 rename 捕获 → 二次验证 → unlink。
     * **不自动触发**；仅当检测为 STALE_LOCK_DETECTED 才允许 capture。
     * 二次验证失败 → quarantine（保留 recovering 文件，不 rename 回环境锁，不覆盖 successor）。
     */
    recoverStaleLock(options?: RecoverOptions): Promise<RecoverResult>;
    /**
     * 自动回收入口（宿主启动 / 调度器本轮预检共用）：只删**可证** stale，其余返回 null（一动不动）。
     *
     * 为什么不直接让调用方 inspect + recoverStaleLock：判据分散在 inspect（长过期放宽）、recover（corrupt 分支）
     * 和调用方文案三处必然漂移。这里把「自动」的边界收在一处，并且先做两次廉价读（ownership + sidecar）：
     *  - 无 ownership / corrupt → null（corrupt 留给显式回收）；
     *  - heartbeat 仍新鲜（≤ staleAfterMs）→ null：**死进程写不出新鲜心跳**，新鲜就是「有人在干活」的证据，
     *    连进程探测都省掉（Windows 上探测活 pid 要 spawn 一次 PowerShell，不能每轮同步都付这个钱）。
     * 通过这两道之后再走结构性判定（kill(pid,0) 的 ESRCH 是快路径）。
     */
    reclaimProvableStaleLock(): Promise<RecoverResult | null>;
    /** 结构性可证 stale：owner pid 确证死亡，或 pid 存活但 OS identity 与 recorded 不同（PID 复用）。
     *  与 inspectLockState / reProveStale 的「长过期」放宽**刻意不同**：自动回收不承认启发式。
     *  探测失败/不确定 → false（保守，绝不构成误删许可）。 */
    private isProvablyStale;
    /** recovery 二次验证：重新探测 recorded pid 是否确证死亡（保守——任何不确定性 → 失败）。
     *  与 inspectLockState 同一套语义：alive:false 仅确证死亡 → stale 成立；
     *  alive 则需 OS identity 判断是否 reuse；无法确定 → 保守失败（不删除）。 */
    private reProveStale;
    /** 心跳「长过期」判据（issue #36）：达到阈值 → 返回可读原因，否则 null。
     *  heartbeat sidecar 缺失时返回 null（无从判断过期时长）——只对「确实读过 heartbeat
     *  且它早已停更」的锁放宽，避免把「sidecar 被清掉」误判成残留。 */
    private longExpiredReason;
    /**
     * 进程退出（exit 事件 / 插件 dispose）时的**同步**兜底释放：只删自己 instanceId 名下的 ownership + sidecar。
     *
     * 为什么必须同步：Node 的 'exit' 事件里不能 await，异步 fs 写不进去。为什么必须核对 instanceId：
     * 退出路径同样不许删别人的锁（与 release() 同一不变量）。语义 = best-effort：永不抛错、永不留半删态。
     * 覆盖的场景 = **正常关窗但后台同步正在跑**（此时 release() 永远不会被调用），这也是残留锁的主要来源。
     */
    releaseOnExitSync(): void;
    /**
     * 清理孤儿 heartbeat sidecar（P4）：只删「已不是当前持有者、且心跳早已停更」的 sidecar。
     *
     * 判据不需要 pid（sidecar 里本来就没有 pid）：sidecar 的生命周期被三处保证——acquire 时创建、
     * release 时删、recover 时删被回收者的那份。于是「instanceId 既不是当前 ownership 的持有者、
     * 心跳又超过 stale 窗口」只可能是崩溃/强杀留下的孤儿。心跳仍新鲜的跳过：那是接管竞态窗口。
     * 不碰 environment.lock 与 environment.recovering.*（那属于判定，不归清理）。
     * @returns 实际删除数量
     */
    cleanupOrphanHeartbeats(): Promise<number>;
    /** 列出 locks 目录内容（诊断；不存在 → 空） */
    listLockFiles(): Promise<string[]>;
}
/** 当 release/recover 发现 ownership 已不属于本 token（异常恢复/人工修改）时抛出 */
export declare class EnvironmentLockOwnedByAnotherError extends Error {
    constructor(msg: string);
}
/** release 时 IO 失败（unlink/读 ownership）抛出；保留 activeToken 以便调用方重试 release */
export declare class EnvironmentLockIOError extends Error {
    readonly underlyingCause: unknown;
    constructor(msg: string, underlying?: unknown);
}
/** 锁被挡时向用户呈现的分类（用户可读文案据此选择，绝不暴露环境锁/op/路径等内部细节）。 */
export type LockBlockReason = 
/** 被另一进程/任务活跃持有（LOCKED → 「另一个任务正在运行，请稍后重试」） */
'locked'
/** Phase 3 SAFE MODE 注入谓词阻断（isBlocked → 「配置修改已被保护，请先处理恢复事项」） */
 | 'blocked'
/**
 * 检测到 stale 残留锁（上次进程异常退出，持有者已确证死亡）——**重试不会自愈**，
 * 必须显式回收（GUI「事故恢复」/ CLI `recover-stale-lock`）。见 issue #27。
 */
 | 'stale'
/**
 * 残留锁的**降级形态**：记录里的进程仍活着、OS 身份也一致，但心跳已长期停止（远超窗口）。
 * 只有一种真实成因：持有者的 release 没能把 ownership 从盘上摘掉（Windows 句柄冲突），
 * 而调用方又把 release 的错误吞了。文案不能谎称「持有进程已不存在」，也不用「稍后重试」骗人。
 */
 | 'stale-degraded'
/** 锁不可用/IO/权限/UNKNOWN（→ 「操作暂时无法执行，请稍后重试」） */
 | 'unavailable';
/** 按分类生成用户可读的友好文案（内部诊断不进入此文案；op/reason 作为字段供日志使用）。
 *  导出：后台调度器（自动同步/定时备份）被挡时用同一份文案写日志，避免两处文案漂移。 */
export declare const LOCK_BLOCK_MESSAGE: Record<LockBlockReason, string>;
/** 分类的**简短**文案（单行、可用于表格单元格/迁移历史摘要/日志前缀）。
 *  与 LOCK_BLOCK_MESSAGE 同源同分类：长文案给「需要完整指引」的场景（423 响应/告警日志），
 *  短文案给「一行放不下长句」的场景。分开定义避免任一处再自造文案（issue #31 的漂移根因）。 */
export declare const LOCK_BLOCK_BRIEF: Record<LockBlockReason, string>;
/**
 * 锁分类 → 落进结果对象/历史记录的**机器token**（客户端据此本地化；不许再把所有被挡拍平成一个词）。
 *
 * issue：真机现场 SAFE MODE 被拒时 locks 目录是空的，界面却说「环境锁被占用」——
 * 因为宿主所有被挡路径都写死 'mutation-locked'，客户端只能照最坏情况解释，排查方向被带偏。
 * 现在按分类发 token：**只有真被另一项活任务占着（LOCKED）才叫 locked**。
 * - 'mutation-safe-mode'：被 SAFE MODE 阻断（锁目录通常为空，处置入口是事故恢复）
 * - 'mutation-lock-stale'：残留锁（含心跳降级形态）——重试/重启都不会自愈，必须显式回收
 * - 'mutation-lock-unavailable'：锁不可用（目录 IO/权限/未知，或 acquire 直接抛错）
 * 旧 token 'mutation-locked' 仍表示「被活跃任务持有」，客户端必须继续认它。
 */
export declare function lockSkipToken(reason: LockBlockReason | undefined): string;
/** destructive 必须成功获取 Environment Lock；否则抛此错（被另一进程/操作持有，或锁不可用）。
 *  携带 op 与 reason 供内部日志诊断；.message 恒为用户可读的友好文案（不暴露锁/op/路径）。 */
export declare class EnvironmentLockUnavailableError extends Error {
    readonly reason: LockBlockReason;
    readonly op: string;
    /**
     * 内部诊断（非敏感）：占用方 op/hostname 或 stale 判定依据。**只进日志**，
     * 绝不进入 .message（用户文案里不含 op/路径/主机名）。
     */
    readonly detail: string | undefined;
    constructor(op: string, reason?: LockBlockReason, detail?: string);
}
