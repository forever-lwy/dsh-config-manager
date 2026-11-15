import type { MsgFunc } from './msg-types.ts';
export declare const MIGRATION_HISTORY_SCHEMA_VERSION = 1;
export declare const MIGRATION_HISTORY_DIR = "migration-history";
/** 默认保留上限（retention 删最旧）。 */
export declare const DEFAULT_MIGRATION_RETENTION = 1000;
/** 用户可配置的保留上限区间（0 = 不限制；上限防「一次填 10 亿」把 UI 输入当系统限制用）。 */
export declare const HISTORY_RETENTION_MIN = 0;
export declare const HISTORY_RETENTION_MAX = 100000;
/**
 * 保留上限字面量校验（路由/偏好共用的唯一口径）：只接受区间内的整数。
 * 非法（字符串 / 小数 / 负数 / 越界）一律 false —— 调用方不得自行 Math.trunc 后放行。
 */
export declare function isValidHistoryRetention(value: unknown): value is number;
/**
 * 有效保留上限：用户配置值合法则用它，否则回落默认（1000）。
 * 0 = 不限制（由 retention 自己短路），缺省/损坏 → 默认档。
 */
export declare function resolveHistoryRetention(configured: unknown): number;
/** 合法 kind 集合（§5 COMPLETE 清单 + 评审补 'profile-import'）。 */
declare const MIGRATION_KINDS: readonly ['import', 'restore', 'rollback', 'profile-create', 'profile-select', 'profile-switch', 'profile-delete', 'profile-rename', 'profile-save', 'profile-import', 'sync-apply', 'autosync', 'recovery', 'backup', 'backup-manual', 'snapshot-delete', 'snapshot-prune'];
/** §5 覆盖的操作 kind（COMPLETE 不变量；常量枚举，天然非敏感）。 */
export type MigrationKind = (typeof MIGRATION_KINDS)[number];
/**
 * 操作结果。
 *
 * 'pending'（0.4.1）：操作**跑完了但仍有待裁决项**（自动同步上传成功、下行冲突未裁决；
 * 合并已应用一部分）。它不是 failed —— 网络/凭据/repo 都是好的；也不是 skipped ——
 * 那一轮确实做了事。旧实现把 partial 直接折成 'failed'，用户看到「自动同步 失败」而
 * 实际只需要在同步页确认一次冲突。读侧（parseEntry / query 解析）必须接受该值，
 * 否则含 pending 的历史条目会被整条丢弃。
 */
export type MigrationResult = 'success' | 'failed' | 'skipped' | 'pending';
/**
 * 自动同步一轮的状态 → 历史 result（宿主 appendHistoryFn 的唯一映射，0.4.1）。
 *
 * 关键一条：`partial`（跑完了但仍有待裁决分区）**不是** failed —— 通道与凭据都正常，
 * 只是需要用户在同步页确认一次冲突。落成 failed 会让首页红字报「同步失败」，
 * 用户据此去查网络/凭据，方向完全错。
 */
export declare function historyResultFromAutosyncStatus(status: 'success' | 'skipped' | 'partial' | 'failed'): MigrationResult;
/**
 * 自动同步「空检查轮」判定：这一轮既没上传也没下行、更没应用任何分区（sections 恒空），
 * 它只是 realtime 通道缺省每 60s 一次（remoteCheckMs）的远端探测 —— 是**轮询**，不是活动。
 *
 * 为什么必须挡在统一历史之外（2026-11-08 真机实测，desktop 档案）：
 *  ① 1 条/分钟把首页「最近活动」刷成与真推**完全同形**的 success 行（用户据此报告
 *     「每隔 1 分钟都在推送」，而同期 git 工作副本只有 4 次真实 add/deletes）；
 *  ② 统一历史保留额度（缺省 1000 条）被空轮吃满：实测 1009 条里 934 条是 autosync，
 *     其中 688 条正是 upToDate 空轮，真实事件（备份 22 / 档案操作 40）被最旧淘汰；
 *  ③ /history 是目录全量扫描（条目越多首页越慢），空轮只会让它线性变慢。
 *
 * 不丢诊断：sync-history.json 仍逐轮记录（含 upToDate），同步页「上次运行 / 跳过原因」照常显示。
 */
export declare function isAutosyncIdleRound(entry: {
    status: string;
    skipReason?: string;
}): boolean;
/**
 * 自动同步方向 → 字典键（`both`/`push`/`pull`/`none` 是机器 token，不得直接铺到界面上）。
 * 未知方向返回 null，由调用方原样回显（不猜、不吞）。
 */
export declare function autosyncDirectionMessageKey(direction: unknown): string | null;
/** 自动同步一轮 → 统一历史条目的载荷（不写则为 null）。 */
export type AutosyncHistoryInput = Pick<MigrationHistoryEntry, 'result' | 'sections' | 'source' | 'summary' | 'error'>;
/**
 * 自动同步一轮 → 统一历史条目；空检查轮返回 null（调用方直接 return，不写）。
 *
 * 规则落在 core 而不是宿主闭包里：宿主 src/index.ts 有体量棘轮（tests/file-size-ratchet.test.ts），
 * 且这几条判断本身要能单测（空轮不写 / 方向本地化 / failed 带原因）。
 * msg 由调用方注入（宿主传 engineMsg），本模块只管查表不引入新状态。
 */
export declare function autosyncUnifiedHistoryInput(entry: {
    status: 'success' | 'skipped' | 'partial' | 'failed';
    direction?: unknown;
    skipReason?: string;
    transport?: string;
    error?: string;
    appliedSections?: string[];
}, msg?: MsgFunc): AutosyncHistoryInput | null;
/** 触发来源（常量）。 */
export type MigrationSource = 'api' | 'autosync' | 'backup-scheduler' | 'recovery' | 'cli' | 'internal';
/** 一条不可变的迁移历史记录（磁盘形态；schemaVersion 内联）。 */
export interface MigrationHistoryEntry {
    schemaVersion: number;
    at: string;
    kind: MigrationKind;
    result: MigrationResult;
    /** 涉及分区 adapter id（常量集合）。 */
    sections: string[];
    /** Journal operation id（UUID，BOUND）。 */
    operationId?: string;
    /** 快照 id（UUID，BOUND）。 */
    snapshotId?: string;
    /** run-registry runId（UUID，BOUND）。 */
    runId?: string;
    source: MigrationSource;
    /** 非敏感摘要（redact + high-entropy 后）。 */
    summary: string;
    /** 失败原因（redact + high-entropy 后）。 */
    error?: string;
}
/**
 * 磁盘形态：schemaVersion + contentHash（对除 contentHash 外全字段的 SHA-256）。
 * contentHash 用于 **append-only 篡改检测**：合法 JSON 内改字段值（含 result/summary/at）
 * → 读回 hash 不符 → 该文件被识别为损坏并跳过（满足「篡改必须被拒绝或检测」）。
 * 仅是内联字段（非 MAC/签名 / 非第二套 integrity framework；审计史非对抗性安全边界）。
 */
export interface StoredMigrationHistoryEntry extends Omit<MigrationHistoryEntry, 'schemaVersion'> {
    schemaVersion: number;
    contentHash: string;
}
/** 查询条件（纯函数过滤）。 */
export interface MigrationQuery {
    kinds?: MigrationKind[];
    /** 起始时间（epoch ms，含）。 */
    from?: number;
    /** 结束时间（epoch ms，含）。 */
    to?: number;
    result?: MigrationResult[];
    /** sections 子集匹配（条目 sections 含任一查询分区即命中）。 */
    sections?: string[];
}
/** 统计（纯函数）。 */
export interface MigrationHistoryStats {
    total: number;
    byKind: Partial<Record<MigrationKind, number>>;
    byResult: Partial<Record<MigrationResult, number>>;
}
export type ExportFormat = 'json' | 'markdown';
/** 读取历史的结果：合法条目 + 被识别为损坏/跳过的文件名（append-only 篡改检测）。 */
export interface ReadMigrationResult {
    entries: StoredMigrationHistoryEntry[];
    /** 被跳过/损坏的文件名（读取时识别，UI 可选警示；不静默接受）。 */
    corrupted: string[];
    /** 目录内**合法历史文件**总数（含被 limit 窗口挡在外的旧条目；未统计时为 undefined）。 */
    total?: number;
}
/** 追加写入结果（best-effort 调用方据此判断降级）。 */
export interface AppendResult {
    ok: boolean;
    entry: StoredMigrationHistoryEntry;
    file?: string;
    error?: string;
}
/** 可注入 IO 门面（测试注入失败点）；默认包 node:fs/promises。 */
export interface MigrationIo {
    mkdir(dir: string, opts: {
        recursive: boolean;
    }): Promise<void>;
    readdirNames(dir: string): Promise<string[]>;
    readFileText(p: string): Promise<string>;
    writeAll(target: string, content: string): Promise<void>;
    rm(p: string, opts: {
        recursive?: boolean;
        force?: boolean;
    }): Promise<void>;
    lstat(p: string): Promise<{
        isSymbolicLink(): boolean;
    } | null>;
    exists(p: string): Promise<boolean>;
}
/**
 * 历史文本强脱敏：redact（结构化字段 + 已知值形状）+ 高熵长 token 掩码。
 * 用于 summary / error 等可能嵌入任意值的字段（REDACTED 不变量）。
 */
export declare function redactHistoryText(text: string): string;
/**
 * 构造安全条目：对 summary / error 做强脱敏（scanAndRedact 高熵档 + redactHistoryText），
 * 做白名单字段规范化，并计算 contentHash（对除 contentHash 外全字段的 SHA-256）。
 * **历史写入的唯一出口入口**，禁止绕过。
 */
export declare function sanitizeEntry(raw: Omit<MigrationHistoryEntry, 'schemaVersion'> & {
    schemaVersion?: number;
}): StoredMigrationHistoryEntry;
/** 合法 kind 判定（类型守卫 + 运行时校验）。 */
export declare function isValidMigrationKind(k: unknown): k is MigrationKind;
/** 判断文件 basename 是否是可追踪历史文件（<sortable>-<hex>.json）。忽略 tmp 及其它。 */
export declare function isHistoryBasename(name: string): boolean;
/** 文件名安全：仅 basename（不含目录分隔符/穿越）。 */
export declare function isSafeHistoryFilename(name: string): boolean;
/**
 * 生成排序文件名（Windows-safe 定宽时间戳 + 随机后缀 + kind 标记）。
 *
 * 时间戳契约（Windows/排序可靠性）：`toISOString().replace(/[:Z]/g,'')`
 * → `2026-08-30T120000.123`（UTC 定宽、仅 ASCII、无 Windows 非法字符 `<>:"/\|?*`、
 * 字典序== 时间序）。**禁止**以原始 `toISOString()`（含 `:`）直接落文件名（Windows rename 失败）。
 * 与既有 `dateStamp`（`YYYYMMDD-HHmmss`）语义同为「定宽 + 仅 ASCII + 可排序」，本实现用 UTC 含毫秒
 * 以获得更高时序精度；排序可靠性一致。
 */
export declare function makeHistoryFilename(now: Date, kind: MigrationKind): string;
export interface MigrationStoreOptions {
    /** history 存放目录（<dataDir>/migration-history）。 */
    dir: string;
    io?: MigrationIo;
    /** 保留上限（retention 用；调用方可覆盖）。 */
    retention?: number;
}
/** MigrationHistory：per-file append-only 历史存储。 */
export declare class MigrationStore {
    private readonly dir;
    private readonly io;
    constructor(opts: MigrationStoreOptions);
    /** 追加一条历史（原子写）。best-effort：调用方须经 tryAppendHistory 处理失败降级。 */
    append(raw: Omit<MigrationHistoryEntry, 'schemaVersion' | 'at' | 'kind'> & {
        kind: MigrationKind;
        at?: string;
    }): Promise<AppendResult>;
    /**
     * 读取合法历史条目（旧→新；损坏/非史文件跳过并计数）。
     *
     * limit>0 时只读**最近 limit 条**（按文件名排序的尾部窗口）——首屏只要最近几十条活动，
     * 整目录 readFile+parse 是历史目录唯一的慢点（真机 2360 条 ≈ 650 ms 纯 IO/解析，
     * 叠上全量 JSON 回传即首页骨架 ~9.7 s 冷启动）。total 恒为目录内合法文件总数，
     * 调用方据此区分「共 N 条，本页只含最近 M 条」。
     */
    read(opts?: {
        limit?: number;
    }): Promise<ReadMigrationResult>;
    /** 目录内合法历史文件总数（只 readdir，不读文件内容；供「自动清理」行展示）。 */
    count(): Promise<number>;
    /**
     * 保留清理：按文件名排序删除最旧合法历史文件，幂等。只删合法历史文件（防误删）。
     * 返回本次删除的文件名。
     */
    retention(limit?: number): Promise<string[]>;
}
/** 纯函数过滤（无 IO）。 */
export declare function queryHistory(entries: StoredMigrationHistoryEntry[], q: MigrationQuery): StoredMigrationHistoryEntry[];
/** 纯函数统计（kind/result 计数）。 */
export declare function summarizeHistory(entries: StoredMigrationHistoryEntry[]): MigrationHistoryStats;
/** 导出报告（纯函数）。渲染文本统一过 redact() 兜底（安全不变量）。 */
export declare function renderExport(entries: StoredMigrationHistoryEntry[], format: ExportFormat, locale?: 'zh' | 'en'): string;
/** 解析查询参数为 MigrationQuery（宿主路由复用；过滤非法输入）。 */
export declare function parseHistoryQuery(raw: Record<string, unknown>): MigrationQuery;
export {};
