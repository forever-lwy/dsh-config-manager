import type { RollbackPointKind, RollbackPointRecord, RollbackPointSummary, RollbackSegmentSummary, RollbackStateKind, RollbackWorkspacePayload } from './rollback-point.ts';
/** 清单格式版本（与**记录**的 schemaVersion 无关：后者是记录内容的版本，恒为 2） */
export declare const ROLLBACK_LEDGER_SCHEMA_VERSION = 3;
/** 单条记录目录名 */
export declare const ROLLBACK_RECORDS_DIR_NAME = "records";
/** 内容寻址载荷目录名 */
export declare const ROLLBACK_PAYLOADS_DIR_NAME = "payloads";
/**
 * 回退前像暂存目录名（`<root>/undo/<pid>-<ts36>-<8hex>/`）。
 * 名字以 pid 开头是**清理判据的一部分**（见 cleanupOrphanTempFiles）；改命名必须同步改 `UNDO_DIR_RE`。
 */
export declare const ROLLBACK_UNDO_DIR_NAME = "undo";
/** v2 单文件迁移成功后的保留名（改名，不是删除） */
export declare const ROLLBACK_LEDGER_BACKUP_NAME = "index.v2.backup.json";
/**
 * 台账（records/ + payloads/）缺省字节预算。
 *
 * 为什么需要它：ROLLBACK_MAX_RECORDS（50）只限**条数**，一条记录的工作区载荷可以到几十 MB
 * （本机实测 50 条 = 473 MB，直接把宿主撑爆）。字节预算与条数预算**互相独立**，两者都生效。
 */
export declare const ROLLBACK_DEFAULT_LEDGER_BYTES: number;
/** 记录文件名 = 记录 id；只允许可自证安全的字符（防篡改清单把路径引出去） */
export declare const LEDGER_RECORD_ID_RE: RegExp;
/** 台账里一条记录的**纯标量**头（与 RollbackTrack 的可序列化部分逐字对应） */
export interface RollbackLedgerTrackHeader {
    kind: RollbackStateKind;
    capturedAt: number;
    ok: boolean;
    degraded: boolean;
    fingerprint: string | null;
    reasonCode: string | null;
    reasonDetail: string | null;
}
/**
 * 清单条目：**绝不含大数组**。段摘要（segments）在写入时由注入的 summarize 算出，
 * list() 直接回放 —— 口径只有一份，且清单大小与工作区文件数无关。
 */
export interface RollbackLedgerManifestEntry {
    id: string;
    kind: RollbackPointKind;
    createdAt: number;
    spreadMs: number;
    protected: boolean;
    incomplete: boolean;
    note: string | null;
    sessionId: string | null;
    unitId: string | null;
    turnSeq: number | null;
    boundarySeq: number | null;
    /** 该条记录文件的字节数（预算淘汰时用于估算可释放空间） */
    recordBytes: number;
    workspace: RollbackLedgerTrackHeader & {
        /** 内容寻址载荷哈希；null = 该态没有载荷（捕获失败） */
        payload: string | null;
        /** 载荷文件字节数（**同一哈希只算一次**，预算与统计用） */
        payloadBytes: number;
        /**
         * 这份点**解析所需的全部载荷哈希**（自身在前、基准依次在后）。
         * 增量载荷依赖基准 ⇒ 回收（prunePayloads）必须按链保活，否则链一断这个点就读不出来了。
         * 老清单没有该字段 ⇒ 视为 `[payload]`（老载荷都是全量、无依赖）。
         */
        payloadChain?: string[];
    };
    session: RollbackLedgerTrackHeader & {
        /** 会话字节副本的对象仓键；null = 没有副本（回收对象时用，不必读记录文件） */
        object: string | null;
    };
    /** 冻结口径的段摘要（= summarizeRollbackPoint(record).segments） */
    segments: RollbackSegmentSummary[];
}
/** 清单条目 -> 列表投影（逐字等于旧的 summarizeRollbackPoint(record)，因为它是写入时算好的） */
export declare function entrySummaryOf(entry: RollbackLedgerManifestEntry): RollbackPointSummary;
export interface RollbackLedgerMigration {
    /** 是否真的改了磁盘布局（v2 -> v3，或从 records/ 重建清单） */
    migrated: boolean;
    /** 成功落盘的记录条数 */
    records: number;
    /** 形状不合格被跳过的条数（如实计数，绝不静默） */
    skipped: number;
    /** 非空 = 迁移失败（原文件未动，下次启动重试） */
    error?: string;
}
export interface RollbackLedgerOptions {
    /** 回滚点库根目录（= dataDir/rollback-points） */
    root: string;
    /** 冻结口径的摘要（rollback-point.ts 的 summarizeRollbackPoint） */
    summarize: (record: RollbackPointRecord) => RollbackPointSummary;
    /** 冻结口径的记录校验（rollback-point.ts 的 isRollbackPointRecord） */
    isLedgerRecord: (value: unknown) => value is RollbackPointRecord;
    /** 字节预算；缺省 ROLLBACK_DEFAULT_LEDGER_BYTES */
    bytesBudget?: number;
    now?: () => number;
    /** best-effort 日志（绝不抛给调用方） */
    log?: (line: string) => void;
    /**
     * 每次「读一条记录文件 / 一份载荷文件」前的观测钩子（生产不传）。
     * 为什么要有它：内存护栏需要**确定性**证据 —— 「单次 append 绝不读别人的记录文件」
     * 只能靠数读盘次数来钉，而不是靠不可复现的堆采样。
     */
    onFileRead?: (file: string) => void;
    /** 写 seam（缺省 = atomicWriteFile）；测试用它注入「第 N 次写失败」以验证迁移中断可重试 */
    writeFile?: (target: string, bytes: Uint8Array) => Promise<void>;
}
/** 一次「准备写一条记录」的产物（先把清单条目算出来，预算淘汰才能在写之前决策） */
export interface RollbackLedgerPrepared {
    entry: RollbackLedgerManifestEntry;
    /** 记录文件内容（workspace.payload 已换成哈希引用） */
    recordJson: string;
    /** 载荷文件内容；null = 该态没有载荷 */
    payloadJson: string | null;
    payloadHash: string | null;
}
export interface RollbackLedgerStats {
    /** records/ 下的文件数 */
    records: number;
    /** records/ + payloads/ 的总字节 */
    bytes: number;
}
export interface RollbackTempCleanupResult {
    removed: number;
    bytes: number;
    /** 形似临时文件但**判据不足**（判不准就不删） */
    skipped: number;
}
export declare function cleanupOrphanTempFiles(root: string): Promise<RollbackTempCleanupResult>;
/** 清单条目校验：形状不对就**丢掉并计数**（与 v2 的 records.filter(isRollbackPointRecord) 同一条路） */
export declare function normalizeManifestEntry(value: unknown): RollbackLedgerManifestEntry | null;
export declare class RollbackLedger {
    readonly root: string;
    readonly manifestPath: string;
    readonly backupPath: string;
    readonly recordsDir: string;
    readonly payloadsDir: string;
    readonly objectsDir: string;
    readonly bytesBudget: number;
    private readonly summarize;
    private readonly isLedgerRecord;
    private readonly nowFn;
    private readonly log;
    private readonly onFileRead;
    private readonly writeSeam;
    /**
     * 被**字节预算**淘汰的自动点累计数（可观测；与「条数上限」淘汰分开计数）。
     *
     * 为什么必须**持久化**而不是只记在实例上：宿主每个请求都新建一个引擎（路由侧），
     * 只记在实例上的话这个数字永远是 0 —— 界面就永远看不到「已经因为预算淘汰过 N 个」。
     * 值随清单落盘（`evicted` 字段），读清单时取「磁盘值与内存值的大者」，
     * 这样「先 markEvicted 再读清单」的时序也不会把刚加上的计数抹掉。
     */
    private evicted;
    constructor(options: RollbackLedgerOptions);
    get evictedCount(): number;
    markEvicted(count: number): void;
    private warn;
    private write;
    private readText;
    private exists;
    private recordPath;
    private payloadPath;
    /**
     * 清单文件的**代际戳**（mtimeMs + 字节数）。跨进程乐观并发用：留点侧在读清单前后各取一次，
     * 不一致说明另一个实例写过 ⇒ 重读重试，绝不拿自己的快照覆盖别人的清单。
     * 读不到返回 null = **不参与判定**（可选探针失败绝不阻塞留点）。
     */
    manifestStamp(): Promise<string | null>;
    /** 这份载荷是否已经落过盘（内容寻址 ⇒ 已存在就是同一份，可零写入；也是「本次新增字节」的判据） */
    hasPayload(hash: string): Promise<boolean>;
    readManifest(): Promise<{
        entries: RollbackLedgerManifestEntry[];
        error?: string;
    }>;
    private findMissingRecordFiles;
    /** 原子写清单（小文件；条目由调用方决定） */
    writeManifest(entries: readonly RollbackLedgerManifestEntry[]): Promise<void>;
    /** 把完整记录拆成「清单条目 + 记录文件内容 + 载荷文件内容」（**不做 IO**，纯函数） */
    prepareRecord(record: RollbackPointRecord, reuse?: {
        hash: string;
        bytes: number;
        chain?: string[];
    }): RollbackLedgerPrepared;
    /**
     * 落盘：载荷（内容寻址；同一哈希已存在则**零写入**）+ 记录文件。
     * 先载荷后记录：中途失败只留一份没人引用的载荷（垃圾，不是坏数据），下次 prune 回收。
     */
    writePrepared(prepared: RollbackLedgerPrepared): Promise<void>;
    /** 读校验过的载荷（哈希不符 / 形状不符 -> error，绝不返回半个） */
    /**
     * **原始**读取一份载荷（形状校验 + 内容寻址自证）。
     * `files` 可能只是「相对基准的增量子集」（`payload.delta` 非空）—— **只给解析器用**，
     * 消费者一律走 {@link resolvePayload} 拿物化后的完整清单。
     */
    private readStoredPayload;
    /**
     * 解析一份载荷：增量视图**物化**成完整 `files`（含 `object` 字段补回），全量视图原样返回。
     *
     * 任何一环不成立（基准缺失 / 哈希不符 / 形状不符 / 链成环）⇒ **如实失败**：绝不返回半个清单 ——
     * 半份清单会让「留点后新建」的判据把绝大多数文件当成新建的，回退就会删掉它们。
     */
    resolvePayload(hash: string): Promise<{
        payload?: RollbackWorkspacePayload;
        error?: string;
    }>;
    private materializePayload;
    /** 读一条**完整**记录（引用解析对调用方透明）；任何一步不成立就如实失败 */
    readRecord(id: string): Promise<{
        record?: RollbackPointRecord;
        error?: string;
    }>;
    /** 删记录文件（返回实际释放字节；ENOENT 不计），**不**动载荷与对象 */
    deleteRecords(ids: readonly string[]): Promise<{
        removed: number;
        bytes: number;
    }>;
    /** 没人引用的载荷文件一律删（引用计数靠扫清单得到，**不读载荷内容**） */
    prunePayloads(entries: readonly RollbackLedgerManifestEntry[]): Promise<{
        removed: number;
        bytes: number;
    }>;
    /**
     * 内容寻址对象仓回收（**重写版，内存 ∝ 单份载荷 + 对象键集合**）。
     *
     * 旧实现要先在内存里拿到「所有记录的全部 files 数组」，于是回收一次就等于把整份台账读进内存
     * （issue #89 的 OOM 现场之一）。现在：扫清单 -> **逐个读引用到的载荷文件（一次只驻留一份）**
     * -> 累计 referenced 对象键 -> 扫 objects/ 删无引用项。
     *
     * 任何一份被引用的载荷读不出来（缺失 / 哈希不符 / 形状不符）⇒ **整体放弃回收**（aborted 非空）：
     * 读不到的载荷里有什么对象谁也不知道，此时删对象可能删掉活数据 —— fail-closed。
     */
    collectObjects(entries: readonly RollbackLedgerManifestEntry[]): Promise<{
        removed: number;
        bytes: number;
        referencedPaths: Set<string>;
        aborted: string | null;
    }>;
    /** records/ + payloads/ 的**实际**磁盘占用与文件数（诚实：含尚未回收的孤儿文件） */
    stats(): Promise<RollbackLedgerStats>;
    private sniffSchemaVersion;
    private acquireMigrationLock;
    /**
     * v2 单文件 -> v3：**流式**切记录、逐条落盘，最后才动原文件。
     *
     * 幂等与崩溃安全：
     *  · 步骤 1（流式落 records/ + payloads/）可重复执行 —— id 稳定，重复写是覆盖，不产生重复条目；
     *  · 步骤 2 才把 v2 文件改名为 index.v2.backup.json（**成功之前原文件一动不动**）；
     *  · 若在步骤 2 与 3 之间崩溃（没有 index.json、有 index.v2.backup.json），下次启动走
     *    rebuildManifest() 从 records/ 重建清单 —— 清单自证：每条 id 必须在 records/ 找得到。
     */
    /**
     * 清单**读不出来**时从 `records/` 重建，并返回重建后重新读到的清单。
     *
     * 为什么公开：留点侧（`appendRecord`）在 `readManifest` 报错时**必须**走这里 —— 旧点的最终真相
     * 在记录文件里，而拿一个空 entries 直接覆盖清单会把旧点整批抹掉、紧接着 `prunePayloads` 还会删掉
     * 它们的载荷（永久不可恢复）。重建后仍读不出来才由调用方拒写（fail-closed）。
     */
    recoverManifest(): Promise<{
        entries: RollbackLedgerManifestEntry[];
        error?: string;
    }>;
    migrateIfNeeded(): Promise<RollbackLedgerMigration>;
    private migrateV2;
    /** 从 records/ 重建清单（崩溃恢复；清单自证：找不到记录文件的 id 一律跳过并计数） */
    private rebuildManifest;
    private listRecordIds;
    private readEntriesFromRecords;
}
