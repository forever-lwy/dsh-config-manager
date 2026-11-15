/**
 * 工作副本级互斥锁（git 通道；sync 工作副本与 market 仓库工作副本共用）。
 *
 * 为什么必须串行化同一个工作副本：
 * 一个工作副本会被**多个互不知情的消费者**同时驱动 —— 同一进程里自动同步持着
 * withMutationLock 跑 engine.push，而 GUI 的只读路由（/sync/snapshots-list、
 * /sync/download、/sync/pull…）各自 makeSyncEngine 后直接 transport.list()，
 * 根本不参与那把锁；多开 DSH 实例（desktop + web）共用同一 sync/work 时更是跨进程。
 * market 侧同理：市场读取（GitMarketReader.ensureRepo）与市场上传（GitFileWriter.writeFiles）
 * 都会驱动同一个 market 工作副本，两者互不知情。
 *
 * git 的 `pull --ff-only` 是「fetch 写 FETCH_HEAD + 读 FETCH_HEAD 合并」的两步动作。
 * 两个 pull 并发时 FETCH_HEAD 会留下多行 for-merge 记录，随后**每个** pull 都以
 * `fatal: Cannot fast-forward to multiple branches.`（exit 128）结束（本机实测 5 并发 → 5 个全败），
 * 该错误经 runExternalIntent 被判为「不可证明」⇒ 落盘 durable SAFE MODE，用户所有改配置的操作被阻断。
 * 并发 add/commit 还会撞 `index.lock`，同样是同一类「莫名其妙的失败 → 安全模式」。
 *
 * 实现要点：
 *  - 锁文件放 `os.tmpdir()`（按工作目录绝对路径哈希命名），**不写进工作副本**：
 *    工作副本还没 clone 出来也能先锁住，且绝不让 `git status` 看到脏文件；
 *  - 跨进程独占用 `open(path,'wx')`（O_EXCL，原子）；等待方轮询，超时抛 WorkdirLockError；
 *  - holder 崩溃留下的陈旧锁：先问 holder pid 是否还存在（ESRCH ⇒ 已被杀，立即回收），
 *    读不出 pid 或进程仍存活时才按 mtime 超过 staleMs 回收（避免误抢仍在跑的长时间任务）；
 *  - 等待方是**有界**的：等文件锁与进程内链上排队共用同一个 timeoutMs 上限，超时即抛，
 *    绝不在界面早已放弃之后仍去驱动工作副本；
 *  - 进程内再串一条 Promise 链：同进程两个 GitTransport 实例（autosync / 路由）共用同一条链，
 *    不依赖文件锁的轮询延迟。
 */
/** 默认最长等待时间：正常一次 git 往返十几秒，留足余量后仍失败说明真的被卡住了 */
export declare const DEFAULT_WORKDIR_LOCK_TIMEOUT_MS = 300000;
/** 陈旧锁判定阈值：超过它仍未释放才视为 holder 已崩溃（绝不轻易抢走长时间任务的锁） */
export declare const DEFAULT_WORKDIR_LOCK_STALE_MS = 900000;
/** 等锁超时（不是「同步失败」，而是「别人正在同步」）：调用方应换成可操作的提示文案 */
export declare class WorkdirLockError extends Error {
    readonly code = "workdir-busy";
    readonly workDir: string;
    constructor(workDir: string, waitedMs: number);
}
export interface WorkdirLockOptions {
    /** 最长等待毫秒数（缺省 DEFAULT_WORKDIR_LOCK_TIMEOUT_MS） */
    timeoutMs?: number;
    /** 陈旧锁阈值毫秒数（缺省 DEFAULT_WORKDIR_LOCK_STALE_MS） */
    staleMs?: number;
    /** 注入等待实现（测试用，缺省 setTimeout） */
    sleep?: (ms: number) => Promise<void>;
    /** 注入时钟（测试用） */
    now?: () => number;
}
/** 工作目录归一化键：Windows 大小写不敏感，必须折成小写，否则 D:\a 与 d:\a 会拿到两把不同的锁 */
export declare function workdirLockKey(workDir: string): string;
/** 锁文件路径（导出仅为测试与诊断；不要手工删一把可能被人持有的锁） */
export declare function workdirLockPath(workDir: string): string;
/**
 * holder 进程是否还活着（三态：true = 存活、false = 确定已死、null = 判不了）。
 *
 * 为什么必须问：holder 被强杀时（DSH 重启 / 崩溃 / 任务管理器结束进程）`finally` 不会执行，
 * 锁文件就留在 tmpdir 里；只按 mtime 判定要等满 staleMs（15 分钟）才接管。这段窗口里**所有**
 * 同步与只读自检都排在锁上 —— 真机 2026-10-27：DSH 重启踩在一次 push 中间，pid 28888 的锁留在
 * %TEMP%，之后每次打开同步页 `GET /sync/status` 都要等满 10 s 预算再 503。
 *
 * 误差方向：只有 `ESRCH`（pid 完全不存在）才判死；`EPERM`（进程存在但无权发信号，如 Linux 跨用户）
 * 判活；pid 复用也会把「别人的锁」判成活 —— 两种误判都偏向保守（最多退化成 mtime 规则），
 * 绝不会把仍在跑的 holder 的锁抢走。
 */
export declare function workdirLockHolderAlive(pid: unknown): boolean | null;
/**
 * 一次性清扫本机所有「holder 已死」的工作副本锁（每进程只跑一次）。
 *
 * 为什么需要：pid 回收只在**自己被这把锁挡住时**生效，而残留锁可能属于早已不再使用的工作目录
 * （换过仓库、换过数据目录、临时实例）—— 它们永远不会再被查询，却一直躺在 %TEMP%（真机 2026-10-27
 * 见到 8 个，最久 3.4 天）。只删 pid 确定不存在的锁：读不出 holder 的不动（保守，宁可留下）。
 */
export declare function pruneDeadWorkdirLocksOnce(): Promise<void>;
/**
 * 在指定工作副本上串行执行 fn（同一目录的调用排队，跨进程同理）。
 *
 * 只包**会碰工作副本的 git 操作**（clone/fetch/merge/add/commit/push/reset）。
 * 不要在里面再调用会等这把锁的其他工作副本操作 —— 可重入请由调用方用自己的 depth 计数处理。
 */
export declare function withWorkdirLock<T>(workDir: string, fn: () => Promise<T>, options?: WorkdirLockOptions): Promise<T>;
/** 仅供测试：清空进程内串行链与一次性清扫标记（不影响磁盘上的锁文件） */
export declare function resetWorkdirLockChainsForTest(): void;
