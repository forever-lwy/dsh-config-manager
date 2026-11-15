/** 台账文件名（与回滚点库同目录：dataDir/rollback-points/attribution.json） */
export declare const ROLLBACK_ATTRIBUTION_FILE_NAME = "attribution.json";
/** 条目上限（超出按 at 淘汰最旧）—— 台账无界增长会把宿主拖垮（见 issue #89 的教训） */
export declare const ROLLBACK_ATTRIBUTION_MAX_ENTRIES = 20000;
/**
 * 认得的**写类**工具名。
 *
 * 为什么用白名单而不是「参数里有 path 就算写」：`read` / `grep` / `ops_inspect_local_file`
 * 的参数里也有 path —— 把它们当写入者会让**读**污染归属，进而让回退误跳过本该恢复的文件。
 */
export declare const ROLLBACK_WRITE_TOOL_NAMES: readonly string[];
/** 一条写入归属：谁（会话）在什么时候用哪个工具写了这个路径 */
export interface RollbackWriteFact {
    sessionId: string;
    tool: string;
    callId: string;
    /** 毫秒时间戳（本进程时钟） */
    at: number;
    turn: number | null;
}
/** 引擎只读这一面 */
export interface RollbackWriteAttributionPort {
    /** 该路径最后一次的写入归属；undefined = **未判定**（不是「没人写过」） */
    writerOf(target: string): RollbackWriteFact | undefined;
}
/** 采集面（只有留点器的 noteEvent 用得上） */
export interface RollbackWriteRecorder {
    /**
     * 记一次 `tool/call` 事件载荷。返回**记录到的路径条数**：
     * 0 = 不是写类工具 / 解析不出路径 = **未判定**（绝不代表「没写过」）。
     */
    noteToolCall(sessionId: string, data: unknown): number;
}
/**
 * 从一次 `tool/call` 事件载荷里抽出**会被写的路径**。
 *
 * `arguments` 在 DSH 的事件里是 **JSON 字符串**（不是对象）——两种形态都收，
 * 解不出来就返回空数组（= 未判定），绝不抛错。
 */
export declare function toolCallWritePaths(name: unknown, argumentsValue: unknown): string[];
export interface RollbackWriteAttributionOptions {
    /** 台账文件绝对路径 */
    file: string;
    now?: () => number;
    maxEntries?: number;
    /** 落盘延迟（毫秒）；<= 0 表示不自动落盘（测试用） */
    flushDelayMs?: number;
    warn?: (line: string) => void;
}
/**
 * 内存台账 + best-effort 落盘。
 *
 * 落盘的作用只有一个：**进程重启后**打开旧会话回退时，归属还在。
 * 因此写入是延迟合并的（一次 tool/call 一行，立即落盘会把 I/O 打成筛子）。
 */
export declare class RollbackWriteAttribution implements RollbackWriteAttributionPort, RollbackWriteRecorder {
    private readonly entries;
    private readonly file;
    private readonly now;
    private readonly maxEntries;
    private readonly flushDelayMs;
    private readonly warn;
    private loadPromise;
    private flushTimer;
    private writing;
    constructor(options: RollbackWriteAttributionOptions);
    /** 台账条目数（测试与诊断用） */
    get size(): number;
    /** 惰性读盘（幂等；读失败 = 空表，只 warn） */
    load(): Promise<void>;
    private read;
    /** 记一次 tool/call（返回记录到的路径条数；0 = 不是写类工具或解析不出路径 = 未判定） */
    noteToolCall(sessionId: string, data: unknown): number;
    /** 淘汰最旧条目（按 at 升序删到上限内） */
    private evictOldest;
    writerOf(target: string): RollbackWriteFact | undefined;
    /** 延迟落盘（多次调用只落一次） */
    scheduleFlush(): void;
    /** 立刻落盘（原子：同目录临时文件 + rename；失败只 warn，绝不上抛） */
    flush(): Promise<void>;
}
