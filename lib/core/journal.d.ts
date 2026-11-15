/**
 * journal 专用文本脱敏（Security P1-1 / §29 已并入）：
 * 现有 redact()（结构字段 + 已知值形状）+ 高熵长 token 掩码。
 * 用于 error / recovery.reason 等可能嵌入任意值的字段。
 */
export declare function redactJournalText(text: string): string;
export declare const JOURNAL_SCHEMA_VERSION = 1;
export declare const TRANSACTIONS_DIR = "transactions";
export declare const ACTIVE_DIR = "active";
export declare const COMPLETED_DIR = "completed";
export declare const QUARANTINE_DIR = "quarantine";
export declare const RECOVERY_HISTORY_DIR = "recovery-history";
export declare const SAFE_MODE_MARKER = "safe-mode";
export declare const NEEDS_ATTENTION_SIDECAR_SUFFIX = ".needs-attention";
export declare const VALID_OPERATION_ID_RE: RegExp;
export type JournalState = 'CREATED' | 'SNAPSHOT_CREATED' | 'APPLYING' | 'VALIDATING' | 'COMMITTED' | 'ROLLING_BACK' | 'ROLLED_BACK' | 'RECOVERING' | 'RECOVERED' | 'NEEDS_ATTENTION';
/** terminal states：进入后 operation 不可再改向（只可 move/quarantine/retention） */
export declare const TERMINAL_STATES: ReadonlySet<JournalState>;
/** 合法状态迁移表（严格；禁止无效 transition）。纯函数，供单测。 */
export declare const ALLOWED_TRANSITIONS: Record<JournalState, JournalState[]>;
export declare function isValidTransition(from: JournalState, to: JournalState): boolean;
export declare function isTerminalState(s: JournalState): boolean;
export type StepStatus = 'planned' | 'done' | 'failed' | 'skipped' | 'attention';
/**
 * 指纹哨兵：「该路径**本就不该存在**」（删除类动作的期望态）。
 *
 * 为什么需要：文件类 step 的 beforeFp/afterFp 一直是「文件内容 sha256」，而**删除**动作的正确
 * 终态是「文件不存在」—— 没有任何 sha256 能表达它，于是删除项在 crash 后永远无法自证已应用
 * （reconcile 只能判 none → NEEDS_ATTENTION）。本哨兵把「应不存在」变成可比较的值：
 *  - beforeFp = ABSENT_FINGERPRINT ⇒ 「留点时不在」
 *  - afterFp  = ABSENT_FINGERPRINT ⇒ 「做完后不在」
 * 判定只有一处（phase3-host 的 verifyStepFingerprint）；importer 的指纹永远是十六进制 sha256
 * 或 null，因此本哨兵对导入链路零影响。
 */
export declare const ABSENT_FINGERPRINT = "absent";
export interface JournalStep {
    adapter: string;
    ref: string;
    kind: string;
    /** 外部副作用（插件/Git/WebDAV/reinstall）——crash 后不可证明，一律保守 */
    external: boolean;
    /** side effect 前目标内容指纹（null = 不可指纹） */
    beforeFp: string | null;
    /** side effect 完成后重读磁盘算出的指纹（null = 不可指纹） */
    afterFp: string | null;
    status: StepStatus;
    appliedAt: string | null;
    /** 该项的结论文案（issue #35：安装失败曾被记成 `skipped` 且无 message，
     *  事后审计只能看到「用户跳过了这些插件」的错误结论）。可选，历史 journal 无此字段。 */
    message?: string | null;
}
export interface JournalCommit {
    at: string | null;
    validated: boolean;
    validationWarnings: string[];
}
export interface JournalRollback {
    attemptedAt: string | null;
    full: boolean;
    failed: string[];
    /** 回滚 WAL：已补偿的 entry 序号（crash during rollback 判定用） */
    entryDone: Record<number, boolean>;
}
/** recovery 元数据；outcome 为 true 表示已达 terminal */
export interface JournalRecovery {
    attemptedAt: string | null;
    outcome: 'RECOVERED' | 'ROLLED_BACK' | 'NEEDS_ATTENTION' | null;
    reason: string;
    attempts: number;
}
/** Phase 5 post-recovery verification verdict（§6.3）。 */
export type RecoveryVerificationVerdict = 'MATCH' | 'PARTIAL_MATCH' | 'MISMATCH' | 'VERIFICATION_ERROR';
/** Phase 5 post-recovery verification 结果（journal 可选字段，additive，不 bump schema）。 */
export interface RecoveryVerification {
    verdict: RecoveryVerificationVerdict;
    /** 每项检查结果（写入前过 redactJournalText 强脱敏）。 */
    details: string[];
    /** 需人工处理项（凭据等；写入前过 redactJournalText 强脱敏）。 */
    manualHints: string[];
    at: string;
}
/** 单个 operation 的 durable journal。不保存任何 secret 值。 */
export interface OperationJournal {
    schemaVersion: number;
    operationId: string;
    operationType: string;
    createdAt: string;
    updatedAt: string;
    state: JournalState;
    /** Journal→Lock 单向绑定（不回填 environment.lock） */
    ownerInstanceId: string;
    lockId: string;
    packageVersion: string;
    environmentFingerprint: string;
    snapshotId: string | null;
    plannedSteps: string[];
    steps: Record<string, JournalStep>;
    commit: JournalCommit;
    rollback: JournalRollback;
    recovery: JournalRecovery;
    /** 最后错误/原因文本（已 redact；非 secret） */
    error: string;
    /**
     * Phase 5：post-recovery verification 结果（可选，additive）。
     * 旧 journal 无此字段（parseSafe 不受影响，schemaVersion 仍为 1）。
     * details/manualHints 写入前必须过 redactJournalText（journal 安全不变量：不保存 secret）。
     */
    recoveryVerification?: RecoveryVerification;
}
export declare function createJournalEntry(operationType: string, lockCtx: {
    operationId: string;
    ownerInstanceId: string;
    lockId: string;
    packageVersion: string;
    environmentFingerprint: string;
}, now: string): OperationJournal;
/** 把 journal 从旧状态迁移到新状态（校验合法 transition；非法抛错）。纯函数。 */
export declare function transitionJournalState(j: OperationJournal, to: JournalState): OperationJournal;
/** 可注入 IO（测 failure injection；默认包 node:fs/promises）。 */
export interface JournalIo {
    mkdir(dir: string, opts: {
        recursive: boolean;
    }): Promise<void>;
    readFileText(p: string): Promise<string>;
    writeAll(target: string, content: string): Promise<void>;
    rename(a: string, b: string): Promise<void>;
    readdirNames(dir: string): Promise<string[]>;
    readdirEntries(dir: string): Promise<Array<{
        name: string;
        isDirectory(): boolean;
    }>>;
    lstat(p: string): Promise<{
        isSymbolicLink(): boolean;
    } | null>;
    /**
     * stat 的 mtimeMs（cross-F2 的孤儿原子写判定用）。**可选**：注入 io 不提供时，
     * 孤儿回收整段跳过（绝不因为「判不了年龄」去删可能正在写的文件）。
     */
    statMtimeMs?(p: string): Promise<number | null>;
    rm(p: string, opts: {
        recursive?: boolean;
        force?: boolean;
    }): Promise<void>;
    exists(p: string): Promise<boolean>;
}
/** 引用集合的取证式扫描结果（P3-5）。`complete === false` 时 referenced 只是下界。 */
export interface JournalReferenceScan {
    /** 可解析 journal 引用的 snapshotId（不完整时是下界） */
    referenced: Set<string>;
    /** 读不到/解析不了的 journal 位置（相对 transactions 的 posix 形式） */
    unreadable: string[];
    /** true = 三个目录都读到、每条 journal 都可解析，referenced 可当完整集合使用 */
    complete: boolean;
}
/**
 * 引用集合读不完整（P3-5）：有 journal 但读不出/解析不了，或 journal 目录读不到。
 * 调用方必须 fail-closed —— 快照删除（409 recovery-reference-unreadable）与自动 prune
 * （放弃本轮清理）都依赖「读不到 ≠ 没有引用」。`unreadable` 是相对路径，供日志定位。
 */
export declare class JournalReferenceUnreadableError extends Error {
    readonly code = "journal-reference-unreadable";
    readonly unreadable: string[];
    constructor(unreadable: string[]);
}
export interface JournalStoreOptions {
    transactionsDir: string;
    io?: JournalIo;
}
/** journal 严格 UUID 校验（防文件名穿越）。 */
export declare function isValidOperationId(id: unknown): id is string;
/** 判断文件 basename 是否是可追踪的 journal（<uuid>.json）。忽略 tmp 及其它。 */
export declare function isJournalBasename(name: string): boolean;
/**
 * 原子写半成品判据（**有意保守宽判**，t65 / t60-O3）。
 *
 * 实际命名（`src/utils/atomic-write.ts:216`）是 `<TMP_PREFIX><base>.<pid>.<randomHex(8)>.tmp`
 * （randomHex(8) = 16 个 hex 字符；base 可含点，如 `settings.json`）。这里**只按前缀 + 后缀**判，
 * 比实际命名更宽 —— 有意为之，理由三条：
 *   ① `.dshcm.` 是本插件**专属保留前缀**（atomic-write.ts 的注释即写明「专属，用于 orphan 识别，
 *      不误删其他程序文件」）；transactions/ 下不会出现别的程序的文件；
 *   ② 判据只在 journal 的**三个目录**（active / completed / quarantine）内生效，且还要同时满足
 *      「年龄达到 STALE_JOURNAL_TEMP_MS」；这三处是插件私有状态目录，用户不会往里放东西；
 *   ③ 旧版/未来版若改动 tmp 命名形态，宽判仍能收尾，不必与 atomic-write 的命名同步演进。
 * 防跑偏护栏（由 journal.test.ts 的 t65-O3 用例钉住）：必须**同时**满足 `.dshcm.` 前缀与 `.tmp` 后缀；
 * 缺任一者一律不删（`.dshcm.notes.json` 无 .tmp → 保留；`notes.tmp` 无前缀 → 保留）。
 */
export declare function isJournalTempBasename(name: string): boolean;
/**
 * 孤儿原子写 tmp 的年龄阈值（cross-F2）：60 分钟。
 *
 * atomicWriteFile 的 tmp 生命周期是「毫秒级写 → rename」，任何**达到**（≥）一小时的都是被杀进程
 * 留下的孤儿（本进程/其它进程的**在写** tmp 都是新鲜的）—— 保守窗口保证绝不误删在途文件。
 *
 * 边界口径（t65 / t60-O1）：判据是 `age >= STALE_JOURNAL_TEMP_MS` —— **恰好 60:00.000 即视为陈旧**
 * （1ms 之差没有安全意义，阈值本身就取得极保守；「达到即收」比「再多等 1ms」更早收尾）。
 * 该边界由 journal.test.ts 的 t65-O1 用例钉住（恰好 60:00.000 删 / 差 1ms 留）。
 */
export declare const STALE_JOURNAL_TEMP_MS: number;
/** JournalStore：journal 持久化原语。不决定 transaction outcome。 */
export declare class JournalStore {
    private readonly transactionsDir;
    private readonly io;
    constructor(opts: JournalStoreOptions);
    private activeDir;
    private completedDir;
    private quarantineDir;
    private recoveryHistoryDir;
    private safeModePath;
    private activePath;
    private completedPath;
    private quarantinePath;
    ensureDirs(): Promise<void>;
    /**
     * 回收 active/completed/quarantine 三个目录里的孤儿原子写 tmp，返回删除条数。
     * 只删「名字是 TMP_PREFIX…tmp」且年龄**达到**（≥）STALE_JOURNAL_TEMP_MS 的条目；
     * 注入 io 未提供 statMtimeMs 时整体跳过（判不了年龄就不动可能正在写的文件）。
     */
    sweepStaleTemps(nowMs?: number): Promise<number>;
    /** 写 journal（atomic + 0600 + symlink reject）。返回写入后的 journal。 */
    persist(operationId: string, j: OperationJournal): Promise<OperationJournal>;
    /** 创建新 journal（CREATED）。调用方保证 active≤1。 */
    create(entry: OperationJournal): Promise<OperationJournal>;
    load(operationId: string): Promise<OperationJournal | null>;
    loadActive(operationId: string): Promise<OperationJournal | null>;
    /** 更新 journal（按 updater 修改后原子持久化）。不负责 transition 校验（调用方经 transitionJournalState）。 */
    update(operationId: string, updater: (j: OperationJournal) => OperationJournal): Promise<OperationJournal>;
    /** 原子迁移状态（校验合法 transition），并立即持久化。 */
    transition(operationId: string, to: JournalState): Promise<OperationJournal>;
    /** 扫描 active/ 下全部 journal op id（只认 <uuid>.json；忽略 tmp/损坏）。 */
    scanActive(): Promise<string[]>;
    /** 判断某 op 是否已 terminal（读 active 或 completed 的 journal state）。 */
    isTerminal(operationId: string): Promise<boolean>;
    isActive(operationId: string): Promise<boolean>;
    terminalStateOf(operationId: string): Promise<JournalState | null>;
    /** move active → completed（terminal journal 规整；复用 rename，失败抛错由调用方策略处理）。 */
    moveToCompleted(operationId: string): Promise<void>;
    /** quarantine 损坏/无法 parse/绑定失败的 journal（+ attention sidecar）。幂等。 */
    quarantine(operationId: string, reason: string): Promise<void>;
    /** 追加 recovery-history 事件（审计；best-effort 由调用方 try/catch 包裹）。 */
    appendRecoveryHistory(marker: string, entry: unknown): Promise<void>;
    listRecoveryHistory(): Promise<string[]>;
    /**
     * 收集已被「可恢复 / 未收敛 journal」引用的 snapshotId（Phase 4 F3 prune 保护）：
     * 扫描 active/ + quarantine/ + completed/ 下的 journal，凡「快照仍可能被 recovery/人工恢复用到」
     * 且 snapshotId 合法 → 收集。该集合用于 FileSnapshotStore.prune 豁免 ——
     * 引用的 recovery snapshot 绝不可被自动淘汰。
     *
     * 什么算「已消费」（不保护）：
     *  - COMMITTED：apply 成功，快照用完；
     *  - ROLLED_BACK 且 rollback.full === true：完整回滚，盘面已回到导入前状态。
     * 审计 P0-3：**半回滚态**（ROLLED_BACK + full === false）与 NEEDS_ATTENTION / ROLLING_BACK /
     * RECOVERING 仍需 recovery 或人工恢复 —— 它们会被规整进 completed/，所以 completed/ 必须一起扫，
     * 否则「已回滚但没回滚干净」的回滚点会在 10 次快照后被静默淘汰（而它正是用户唯一的退路）。
     *
     * 审计 P3-5：**读不到 ≠ 没有引用**。旧实现把目录读不到折成空、把单条读不出/解析不了折成跳过，
     * 于是「有 journal 但读不出」与「没有 journal」在上层无法区分：deleteSnapshot 的
     * recovery-reference-unreadable 保守分支永远不可达，快照会被真删。这里改为：
     *  - 目录 ENOENT（真没有）→ 空；其余目录错误 → 记进 unreadable（不折叠）；
     *  - 单条 journal 读不出（非 ENOENT）/解析不了 → 记进 unreadable；
     *  - 有任何 unreadable ⇒ 集合不完整，listReferencedSnapshotIds 显式抛错（调用方 fail-closed）。
     * 需要区分「具体哪条读不出」的诊断面用 scanSnapshotReferences()。
     */
    listReferencedSnapshotIds(): Promise<Set<string>>;
    /** 引用集合的**取证式**扫描：既给出可用的 snapshotId，也如实给出读不出的位置（P3-5）。
     *  `complete === false` 时 `referenced` 只是下界，调用方必须按 fail-closed 处理。 */
    scanSnapshotReferences(): Promise<JournalReferenceScan>;
    /** 诊断用位置标签（相对 transactions 的 posix 形式；绝不带绝对路径进日志/响应）。 */
    private referenceLabel;
    /** 祖先布局核对链（SAFE MODE 判定用）：<transactionsDir> → 其父目录。 */
    private safeModeLayoutRoots;
    /**
     * 读 SAFE MODE 标记（三态）。
     *
     * 审计 t26 收敛：本方法过去自带**第二份判定**（`/blocked|true/i` 正则 + `io.exists` 判存在），
     * 与宿主/CLI 的 `readSafeModeMarkerSync` 是两套判据 —— 同一 marker 在「无法判定」场景下结论相反
     * （旧实现把 IO 错误/目录占位当成「没有标记」→ 放行；同步侧返回 unknown 让调用方 fail-closed）。
     * 现在判定（含祖先布局核对）**只有 readSafeModeMarkerStateSync 一处实现**，两侧天然一致。
     */
    readSafeModeState(): Promise<SafeModeMarkerState>;
    /** 读 SAFE MODE（boolean 兼容面）：只有 'blocked' 视为阻断；'unknown' 的 fail-closed 决策由上层做
     *  （与 `Phase3Recovery.probeSafeModeSync` 同姿态：本层不把无法判定提升为阻断）。 */
    readSafeMode(): Promise<boolean>;
    /** 写/清 SAFE MODE 标记（atomic）。 */
    writeSafeMode(blocked: boolean): Promise<void>;
    /**
     * 保留策略：completed 保留 N，recovery-history 保留 M；**按真实时间删最旧**，幂等。
     *
     * 排序键（唯一来源，注释即实现）：
     *  - completed/：journal 记录内的 `updatedAt`（落盘/状态推进时刻）。刻意不用 mtime ——
     *    completed 文件名是 randomBytes UUID，与时间无关；而复制/恢复会重写 mtime，
     *    旧实现按文件名字典序「删最旧」，实际可能删掉最新的那条（审计 P3-7）。
     *  - recovery-history/：文件名前缀的 epoch 毫秒（appendRecoveryHistory 的命名口径；
     *    该目录没有记录内时间字段）。
     *
     * 判不了新旧的文件（读不出 / 解析不了 / 文件名带不出时间）**既不计入上限也不删**：
     * 宁可暂时超出上限，也不拿一个未知年龄的 journal 当「最旧」删掉。
     */
    retention(completedLimit?: number, historyLimit?: number): Promise<{
        completed: number;
        history: number;
    }>;
    /** completed journal 的时间键：记录内 updatedAt；读不出/解析不了 → null（判不了新旧）。 */
    private completedJournalAt;
    /** 按时间键升序删除超出上限的最旧项；键为 null 的项不参与计数、绝不被删。返回删除条数。 */
    private pruneOldestByAge;
}
/**
 * durable SAFE MODE 标记的**路径 + 内容判据 + 三态分类**（唯一来源）。
 *
 * 审计 t26：标记的三件事（路径 / 正则 / 「无法判定」如何处理）过去分散在 journal.ts（本类的
 * readSafeMode）与 phase3-host.ts（readSafeModeMarkerSync）两处，任一侧改动都会让同一 marker
 * 得出不同结论。现在：
 *  - 路径：本函数的 safeModeMarkerPath（phase3-host 只做 re-export）；
 *  - 内容判据：isSafeModeMarkerBlocking（**唯一正则**）；
 *  - 三态分类：classifySafeModeMarker（纯函数：IO 事实 → 三态；当前唯一采集方是
 *    syncSafeModeMarkerFacts —— 将来新增读取路径必须复用它，而不是再写一份判据）；
 *  - 读取实现：readSafeModeMarkerStateSync（宿主 apply() 同步阶段、CLI 离线门与
 *    JournalStore.readSafeModeState 共用同一份）。
 */
export type SafeModeMarkerState = 'blocked' | 'clear' | 'unknown';
/** durable SAFE MODE 标记的规范路径：`<dataDir>/transactions/safe-mode`。
 *  host 同步探测与 CLI 离线安全门必须走这一处定义，不得在别处再写一份字面量（审计 P0-11）。 */
export declare function safeModeMarkerPath(dataDir: string): string;
/** 标记内容判据（**唯一正则**）：内容含 blocked/true 即视为阻断。 */
export declare function isSafeModeMarkerBlocking(text: string): boolean;
/** 判定事实：两条 IO 后端各自采集，判定规则统一走 classifySafeModeMarker。 */
export type SafeModeMarkerFacts = {
    kind: 'file';
    text: string;
} | {
    kind: 'absent';
    layoutTrusted: boolean;
} | {
    kind: 'not-file';
} | {
    kind: 'unreadable';
};
/**
 * 标记判定的**单一分类规则**（纯函数；同步/异步两条读取路径共用）：
 *  - 普通文件 → 内容判据（blocked / clear）；
 *  - 不存在且祖先布局可信 → clear（数据目录里本来没有标记，不误伤正常路径）；
 *  - 其余（不存在但路径被挡、存在却读不出、非普通文件）→ **unknown**：
 *    调用方必须 fail-closed，绝不当成「没有标记」放行（审计 P0-11 / t15 实测教训）。
 */
export declare function classifySafeModeMarker(facts: SafeModeMarkerFacts): SafeModeMarkerState;
/**
 * 同步读取 SAFE MODE 标记（**唯一读取实现**）：宿主 apply() 同步阶段、CLI 离线门与
 * `JournalStore.readSafeModeState()` 共用，保证同一 marker 只有一种判定。
 *
 * **不得用 existsSync 判存在**：它对 ENOTDIR（祖先不是目录）/ 权限类 stat 失败一律返回 false，
 * 会把「无法判定」误判成「没有标记」而放行（审计 P0-11 残留；t15 实测 `transactions` 是普通文件
 * 时 existsSync=false → 旧实现判 clear → destructive 静默放行）。Windows 上路径穿过普通文件时
 * statSync 报 ENOENT（不是 ENOTDIR），故 errno 分类必须配合祖先目录核对。
 */
export declare function readSafeModeMarkerStateSync(markerPath: string, layoutRoots: readonly string[]): SafeModeMarkerState;
/** 便捷入口：按规范布局（`<dataDir>/transactions/safe-mode`，祖先核对 transactions → dataDir）。 */
export declare function readSafeModeMarkerSync(dataDir: string): SafeModeMarkerState;
/**
 * 环境指纹：hash(hostname + 持久化 per-install 随机 token)。
 * token 存 <dataDir>/environment-fingerprint.token（0600，atomic），重启稳定、跨安装不同。
 * 不能用 Date.now/pid/临时 id。
 */
export declare function environmentFingerprint(dataDir: string, io?: JournalIo): Promise<string>;
/** 生成 operationId（UUID v4，严格 <uuid>.json 形态）。 */
export declare function generateOperationId(): string;
