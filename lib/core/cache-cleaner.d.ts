/** 临时文件缺省保留期：24 小时（覆盖跨会话「刷新恢复导入」窗口，昨天的残留自动清） */
export declare const TMP_RETENTION_DEFAULT_MS: number;
/** 导出产物缺省保留期：7 天（导出时用户已通过浏览器下载/另存到本地，host 端副本按周回收） */
export declare const EXPORTS_RETENTION_DEFAULT_MS: number;
/** 市场缓存/工作副本缺省保留期：7 天（重建成本 = 一次网络拉取） */
export declare const MARKET_RETENTION_DEFAULT_MS: number;
/**
 * 原子写半成品判据（**单一事实源**，cross-F1）。
 *
 * 这些名字只可能来自「写盘 → rename」中途被强杀留下的孤儿：`src/utils/atomic-write.ts` 产出
 * `.dshcm.<base>.<pid>.<rand>.tmp`，导出/打包侧产出 `<base>.zip.tmp-hso-<rand>`。
 * 它们没有任何读取路径（`journal.ts` 的 isJournalBasename 显式排除 TMP_PREFIX），
 * 因此在**可回收分区**里发现它们就必须清掉 —— 否则 /disk-usage 把整块分区算进「可回收」，
 * 而清理按钮永远删不掉它们（界面数字与按钮效果长期不一致）。
 */
export declare function isAtomicTempName(name: string): boolean;
export interface CacheCleanupOptions {
    /** 临时目录（$DSH_HOME/dsh-config-manager/tmp） */
    tmpDir: string;
    /** 导出产物目录（$DSH_HOME/dsh-config-manager/exports） */
    exportsDir: string;
    /** 市场缓存根（$DSH_HOME/dsh-config-manager/market/cache） */
    marketCacheRoot: string;
    /** 市场工作副本根（$DSH_HOME/dsh-config-manager/market/work） */
    marketWorkRoot: string;
    /** 临时文件保留期（缺省 24h） */
    tmpRetentionMs?: number;
    /** 导出产物保留期（缺省 7 天） */
    exportsRetentionMs?: number;
    /**
     * exports 清理豁免的文件名前缀（如定时备份的 dsh-config-auto-）：
     * 匹配该前缀的 ZIP 不按保留期回收 —— 其生命周期由业务保留策略管理
     * （BackupScheduler.pruneAutoBackups「保留最近 N 个」）。缺省不豁免。
     */
    exportsExemptPrefix?: string;
    /** 市场缓存/工作副本保留期（缺省 7 天） */
    marketRetentionMs?: number;
    /**
     * true = 忽略保留期，**立即整块清空可重建的缓存**（tmp / market cache / market work）；
     * exports 仍只按保留期回收（导出产物是用户可能还要下载/导入的备份文件，绝不「立即清空」）。
     * 缺省 false —— 定时自动清理必须沿用保留期（保留窗口内的文件还要供跨请求流程消费）。
     */
    includeRecent?: boolean;
    /**
     * 只跑这些分区（缺省 = 全部四个）。手动清理必须传 —— 用户只勾了「清理缓存」时
     * **导出产物一个都不能碰**（即使有过期项；否则界面说「只清缓存」却删了他的备份）。
     */
    sections?: readonly CacheCleanupSection[];
    /** 时间源（测试注入；缺省 Date.now） */
    now?: () => number;
}
/** 清理分区（与 disk-usage 的子区 id 对齐；presence 口径见 cachedSections） */
export type CacheCleanupSection = 'tmp' | 'exports' | 'marketCache' | 'marketWork';
export interface CacheCleanupResult {
    /** 删除条目数（文件 + 目录） */
    removed: number;
    /** 释放字节数（仅被删文件的 size 累计；目录删除统计为 0） */
    freedBytes: number;
    /**
     * 释放字节数（含目录递归：目录按删除前递归统计）。
     * 与 freedBytes 并存 —— freedBytes 逐字保持旧语义（避免历史调用方/日志口径漂移），
     * 界面用本字段（删整块缓存目录时 freedBytes 恒为 0，展示会误导）。
     */
    freedBytesRecursive: number;
    /** 单项失败数（不影响主流程） */
    errors: number;
    /** 每条删除记录（相对 dataDir 的描述 + 字节数），供日志/审计 */
    detail: string[];
    /** 本次实际清理过的分区（只含**确实执行**清理的分区；供路由把结果映射回界面子区） */
    sections: CacheCleanupSection[];
}
/** 新建空结果（导出给调用方拼装「无操作」回执，保证形状单点） */
export declare function emptyCleanupResult(): CacheCleanupResult;
/**
 * 执行一次缓存清理（幂等；可重复调用）。
 *
 * 缺省（`includeRecent` 未开）：只清理**超期**（超过保留期）的缓存/临时条目，其余一律保留 ——
 * 定时自动清理必须走这条（保留窗口内的文件还要供「刷新恢复导入/下载」跨请求流程消费）。
 * `includeRecent: true`（用户点「立即清理」）：tmp / market cache / market work **忽略保留期整块清空**
 * （都可重建/可重新下载），exports **仍只按保留期回收** —— 导出产物是用户可能还要下载/导入的备份文件。
 */
export declare function cleanupCaches(opts: CacheCleanupOptions): Promise<CacheCleanupResult>;
