/** 台账文件名（与回滚点库同目录：dataDir/rollback-points/activity.json） */
export declare const ROLLBACK_ACTIVITY_FILE_NAME = "activity.json";
/** 同一会话两条活动的间隔 <= 该值就并成一个窗口（缺省 10 分钟） */
export declare const ROLLBACK_ACTIVITY_DEFAULT_GAP_MS: number;
/** 窗口条目上限（超出按 to 淘汰最旧）—— 无界增长会把宿主拖垮（见 issue #89 的教训） */
export declare const ROLLBACK_ACTIVITY_MAX_INTERVALS = 20000;
/** 一条会话活跃窗口：会话 sessionId 在 [from, to] 之间有过活动 */
export interface RollbackActivityInterval {
    sessionId: string;
    from: number;
    to: number;
}
export interface RollbackActivityOptions {
    /** 台账文件绝对路径（引擎传 dataDir/rollback-points/activity.json） */
    file: string;
    /** 缺省时钟；`noteActivity` 不传 at 时用它（事件时间优先，取数时刻只是兜底） */
    now?: () => number;
    /** 同一会话两条活动间隔 <= gapMs 就合并（缺省 ROLLBACK_ACTIVITY_DEFAULT_GAP_MS） */
    gapMs?: number;
    /** 窗口总条数上限（缺省 ROLLBACK_ACTIVITY_MAX_INTERVALS），超出淘汰最旧的 */
    maxIntervals?: number;
    /** 落盘延迟（毫秒）；<= 0 表示不自动落盘（测试用） */
    flushDelayMs?: number;
    /** 读写失败只 warn，绝不抛 */
    warn?: (line: string) => void;
}
/**
 * 内存窗口表 + best-effort 落盘。
 *
 * 落盘的作用只有一个：**进程重启后**给旧会话回退时，活跃窗口还在（否则新进程只有本次启动后看到的窗口）。
 * 因此写入是延迟合并的（一次会话事件一行，立即落盘会把 I/O 打成筛子）。
 */
export declare class RollbackSessionActivity {
    private readonly table;
    private readonly file;
    private readonly now;
    private readonly gapMs;
    private readonly maxIntervals;
    private readonly flushDelayMs;
    private readonly warn;
    private loadPromise;
    private flushTimer;
    private writing;
    /** 内存变更计数：与 lastFlushedRevision 相等 ⇒ 没有未落盘数据（flush 幂等靠它，不靠时间戳） */
    private revision;
    private lastFlushedRevision;
    constructor(options: RollbackActivityOptions);
    /** 窗口总条数（诊断与测试用；上限见 maxIntervals。等价于「条目」，不是会话数） */
    get size(): number;
    /** 惰性读盘（幂等；读失败 = 空表，只 warn） */
    load(): Promise<void>;
    private read;
    /**
     * 记一次活动。窗口只增不减：与上一条间隔 <= gapMs 就并入同一条窗口，否则新开一条。
     *
     * `at` 缺省取注入时钟（`options.now`）：引擎把**事件时间**显式传进来时以它为准
     * （事件时间才是那次活动的真实时刻，取数时刻可能晚很多）。
     * 空会话 id、非有限数字、负数一律**忽略**（fail-closed：宁可少一个窗口，绝不记错归属）。
     */
    noteActivity(sessionId: string, at?: number): void;
    /** 缺省时钟：注入的 now 抛错或给出非有限值时 fail-closed（返回 NaN，由调用方校验丢弃） */
    private clockNow;
    /** 该会话最后一次活动时刻；没记过 = null（**不是 0**，0 会被误当成有效时间戳） */
    lastActivityAt(sessionId: string): number | null;
    /** 该会话是否有任何窗口（用于区分「确知没活动」与「根本没采到」） */
    hasDataFor(sessionId: string): boolean;
    /** 活跃窗口包含 at（可容忍 toleranceMs，缺省 0）的会话 id，按 id 升序、去重 */
    sessionsActiveAt(at: number, toleranceMs?: number): string[];
    /** 单个会话是否活跃（与 sessionsActiveAt 同口径，不另写一套判定） */
    isActiveAt(sessionId: string, at: number, toleranceMs?: number): boolean;
    /** 延迟落盘（多次调用只落一次） */
    scheduleFlush(): void;
    /** 内存快照（深拷一层：落盘期间的新活动不得改写正在序列化的数据） */
    private snapshot;
    /** 淘汰最旧的窗口（按 to 升序删到上限内；条目 = 窗口，不是会话） */
    private evictOldest;
    /**
     * 立刻落盘（原子：同目录临时文件 + rename；失败只 warn，绝不上抛）。
     *
     * 幂等：没有未落盘数据（revision == lastFlushedRevision）时**直接返回、不碰磁盘**；
     * 并发调用共用同一个在飞写入。
     */
    flush(): Promise<void>;
    /**
     * 关闭：取消待落盘的定时器，并把还没落盘的活动写下去。
     * 没有未落盘数据时不会重复写（flush 幂等）；写入失败只 warn，不透出（关停路径不得被台账拖垮）。
     */
    dispose(): Promise<void>;
}
