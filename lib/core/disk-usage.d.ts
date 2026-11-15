/**
 * 只报告、**不提供清理**的子区（当前一条：回滚点库 = `dataDir/rollback-points`）。
 * 它只是「口径清单」：报告/展示一律用完备的 `DISK_USAGE_AREAS`，清理候选另有白名单
 * （`IMMEDIATE_CLEAN_CATEGORIES` / 清理入口 categories），两者不得混用。
 */
export declare const DISK_USAGE_EXTRA_AREAS: readonly ['rollback-points'];
/** 体检子区（顺序即报告/展示顺序：先备份产物，再缓存/暂存，末位为只读保护的附加区） */
export declare const DISK_USAGE_AREAS: readonly ["exports", "snapshots", "sync", "marketCache", "marketWork", "tmp", "logs", "bootState", "migrationHistory", "transactions", "locks", "vault", "rollback-points"];
/** 全部体检子区 id（= `DISK_USAGE_AREAS` 的元素类型） */
export type DiskUsageScanArea = typeof DISK_USAGE_AREAS[number];
/**
 * 体检子区 id（**与 `DiskUsageScanArea` 同一集合**，13 键完备）。
 *
 * 2026-10-13 收口：文案登记（t6）落地后不再分叉 —— 按本类型写 `Record<DiskUsageArea, …>`
 * 时漏掉任一子区（含 rollback-points）都会在编译期报错，而不是静默缺项。
 */
export type DiskUsageArea = DiskUsageScanArea;
/** 子区回收策略语义（决定界面文案，不由界面自行判断） */
export type DiskUsagePolicy = 
/** 可随时重建/可重新下载：现在就能整块清掉（tmp、market/cache、market/work） */
'regenerable'
/** 有自动保留期（导出产物 7 天 / 定时备份保留最近 N 个） */
 | 'retained'
/** 用户数据/安全网（导入前快照、同步配置与工作副本）——只报告，不提供清理 */
 | 'protected';
/** 单个子区的体检结果 */
export interface DiskUsageAreaReport {
    /** 字节数（目录不可读/不存在 → 0） */
    sizeBytes: number;
    /** 文件数（目录不可读/不存在 → 0） */
    fileCount: number;
    /** 目录本身读不到（不存在或权限不足）：界面必须说明「未统计」而不是显示 0 字节 */
    unreadable: boolean;
    /** 可回收策略 */
    policy: DiskUsagePolicy;
    /** 自动回收的保留期（毫秒；仅 retained 语义有值） */
    retentionMs?: number;
    /** 已超过保留期、下次自动清理会删掉的字节数（仅 retained） */
    expiredBytes?: number;
    /** 已超过保留期的条目数（仅 retained） */
    expiredCount?: number;
}
/**
 * 已知的**遗留数据**目录（插件已不再读取、也绝不自动清理）。
 *
 * 为什么单列而不并进 `DISK_USAGE_AREAS`：它们不是「本插件的现役数据区」——不再被任何代码
 * 读取、也不参与清理；报告只用**相对 dataDir 的路径**把它们指认清楚，
 * 且结构必须能容纳未来更多条（数组，不是单条 object）。
 */
export interface LegacyDataDir {
    /** 稳定 id（界面/接口引用） */
    id: string;
    /** 相对 dataDir 的 POSIX 风格相对路径（如 `checkpoints`） */
    relPath: string;
}
/**
 * 遗留数据目录清单（当前一条：旧检查点库）。
 *
 * `checkpoints/` 是回滚点库改名（`rollback-points/`）之前的旧目录：新代码**不再读取**它，
 * 本插件也**不去删**它（删除是不可逆动作，需用户单独授权）。
 */
export declare const LEGACY_DATA_DIRS: readonly LegacyDataDir[];
/** 单条遗留数据的体检结果（只报告；`policy` 恒为 protected） */
export interface DiskUsageLegacyEntry {
    /** 稳定 id（与 `LEGACY_DATA_DIRS` 逐条对应） */
    id: string;
    /** 相对 dataDir 的路径（如 `checkpoints`） */
    relPath: string;
    /** 绝对路径（界面「在哪儿」展示） */
    path: string;
    /** 字节数（不存在/不可读 → 0，必须与 unreadable 一起看） */
    sizeBytes: number;
    /** 文件数（不存在/不可读 → 0） */
    fileCount: number;
    /** 读不到/不存在/被非目录占住 → true（界面必须显示「未统计」，绝不伪报 0 字节） */
    unreadable: boolean;
    /** 恒为 `protected`：只报告，绝不提供自动清理 */
    policy: 'protected';
}
/** 子区明细记录：`DISK_USAGE_AREAS` 的**每个**子区（含回滚点库等附加子区）逐键必填 ——
 *  报告运行时恒为完整结构，索引访问不可能拿到 undefined（`noUncheckedIndexedAccess` 下也成立，
 *  故只读消费者如离线救急台可直接 `report.areas[area]`，不需要缺失回退）。 */
export type DiskUsageAreasReport = Record<DiskUsageScanArea, DiskUsageAreaReport>;
/** 体检报告（路径字段供界面「在哪儿」展示；均为本机绝对路径，无敏感内容） */
export interface DiskUsageReport {
    /** dataDir（`$DSH_HOME/dsh-config-manager`） */
    dataDir: string;
    /** 全部**子区**合计字节数（含回滚点库等附加子区；**不含**遗留数据 —— 见 legacy） */
    totalBytes: number;
    /** 全部子区合计文件数（口径同 totalBytes） */
    totalFiles: number;
    /** 可立即清理（regenerable）子区合计字节数 */
    reclaimableBytes: number;
    /** 到达自动回收期的字节数（retained 子区） */
    expiredBytes: number;
    /** 各子区明细（恒含 `DISK_USAGE_AREAS` 的全部子区，逐键必填） */
    areas: DiskUsageAreasReport;
    /**
     * 遗留数据明细（插件**已不再读取**、也**不代删**；只报告）。
     * 结构可容纳多条（见 `LEGACY_DATA_DIRS`）；**不计入 totalBytes**（子区合计与遗留数据
     * 分开列，界面才不会把「能解释来源的占用」和「遗留占用」混成一个数）。
     * 类型上可选只是为了让既有报告字面量（测试/旧调用方）继续成立 —— 宿主
     * `GET /disk-usage` 恒回传本字段（无遗留目录时为空数组）。
     */
    legacy?: readonly DiskUsageLegacyEntry[];
    /** 定时备份产物的保留口径（「保留最近 N 个」；界面用它解释为什么有的备份不会自动回收） */
    backupRetention: {
        keepLast: number;
        /** 最新一个备份产物的字节数（无备份 → 0） */
        latestBackupBytes: number;
        /** 最新一个备份产物的时间（ISO-8601；无备份 → null） */
        latestBackupAt: string | null;
    };
}
/** 子区物理目录（市场缓存/工作副本各占一脚；其余为 dataDir 下的同名目录） */
export interface DiskUsageDirs {
    dataDir: string;
    exportsDir: string;
    snapshotsDir: string;
    syncDir: string;
    marketCacheDir: string;
    marketWorkDir: string;
    tmpDir: string;
    logsDir: string;
    bootStateDir: string;
    migrationHistoryDir: string;
    transactionsDir: string;
    locksDir: string;
    vaultDir: string;
}
/** 可立即整块清理的子区（转成磁盘使用分区 id；供清理路由映射回结果） */
export declare const IMMEDIATE_CLEAN_CATEGORIES: readonly ['tmp', 'marketCache', 'marketWork'];
/** 可立即清理的子区 id */
export type ImmediateCleanCategory = typeof IMMEDIATE_CLEAN_CATEGORIES[number];
/** 缓存清理结果里与子区对应的键（老字段快照/临时/市场沿用原语义） */
export type CleanupResultCategory = ImmediateCleanCategory | 'exports';
/** 子区 → 物理目录（单一映射点；展示与统计都不再重复挑目录）。
 *  回滚点库不在 `DiskUsageDirs` 里显式传：它的位置 = `dataDir` + `ROLLBACK_POINTS_DIR`
 *  （与引擎常量逐字一致，有源码级守卫），宿主路由与离线 CLI 两条构造路径因此不可能漂移。 */
export declare function diskUsageDirOf(dirs: DiskUsageDirs, area: DiskUsageScanArea): string;
/** 子区语义与保留期（界面据此选文案；retained 子区必带 retentionMs） */
export interface DiskUsagePolicyInput {
    /** 导出产物保留期（cache-cleaner 的 exportsRetentionMs） */
    exportsRetentionMs: number;
    /** 市场缓存/工作副本保留期 */
    marketRetentionMs: number;
    /** 临时暂存保留期（只用于报告展示；这些子区可随时手工整块清） */
    tmpRetentionMs: number;
    /**
     * 定时备份产物前缀（cache-cleaner 的 exportsExemptPrefix）：
     * 这批文件**不**按天回收，由备份保留策略管理 —— 计入「已超期」必须排除它们，
     * 否则界面会告诉用户可以回收一个其实不会被自动删的文件。
     */
    exportsExemptPrefix?: string;
}
/**
 * 单文件体积（读不到 → 0）。清理模块复用 —— 与 walkDirectory 共用「lstat 判文件」口径，
 * 避免两处各写一份 stat 包装后对「目录同名」等边界给出不同结果。
 */
export declare function fileSize(file: string): Promise<number>;
/** 体检选项 */
export interface DiskUsageScanOptions {
    dirs: DiskUsageDirs;
    policy: DiskUsagePolicyInput;
    /**
     * 定时备份的「保留最近 N 个」（缺省 10，与 backup-files 的 DEFAULT_BACKUP_RETENTION 同源）。
     * 只用于报告展示，不参与任何删除判定。
     */
    backupKeepLast?: number;
    /** 时间源（测试注入；缺省 Date.now） */
    now?: () => number;
}
/**
 * 执行一次只读磁盘体检（幂等、零写入）。
 * 任一子区失败不影响其余统计；返回的报告恒为完整结构（缺失子区记 unreadable）。
 */
export declare function scanDiskUsage(options: DiskUsageScanOptions): Promise<DiskUsageReport>;
