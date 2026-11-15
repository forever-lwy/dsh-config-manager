/**
 * 磁盘占用体检（disk-usage）—— 只读扫描 + 与清理同源的「已超保留期」判定。
 *
 * 为什么需要它：本插件的备份产物（exports）、临时暂存（tmp）、市场缓存（market）、
 * 快照安全网（snapshots）与同步工作副本（sync）全在 `$DSH_HOME/dsh-config-manager` 下，
 * 后台有自动清理（cache-cleaner 每日一次 + 备份保留策略），但界面上**没有任何数字**——
 * 用户无法回答「我的备份到底占了多少盘」「哪些是能删的」。本模块只做两件事：
 *   ① 按分区/子区递归统计字节数与文件数（**符号链接不跟随、不展开**，避免重复计数或成环）；
 *   ② 对「可回收」子区按各自保留期算出**已超期**的字节数与条目数（与 host 侧清理逻辑同口径，
 *      保留期由调用方注入 —— 本模块不读配置、不猜默认值）。
 *
 * 硬约束：**只读**。任何子路径缺失/不可读都不抛错，如实降级为该子区 0 字节、并把
 * `unreadable` 置真（界面显示「未统计」而不是 0）；扫描期间出现的竞态删除（readdir/stat
 * 失败）只终止那一支，不影响其余统计。
 *
 * 已补齐两块此前不可见的占用（都**只报告、绝不提供清理**）：
 *  - 回滚点库 `dataDir/rollback-points`：并进 `DISK_USAGE_AREAS`，`policy: 'protected'`；
 *  - 「遗留数据」`LEGACY_DATA_DIRS`（当前一条：旧检查点库 `dataDir/checkpoints`）：
 *    插件**已不再读取**该目录，也**不代删**（删除不可逆，需用户单独授权）。
 * 本模块与清理动作完全解耦：`IMMEDIATE_CLEAN_CATEGORIES` 只有可重建区，
 * `POST /disk-usage/cleanup` 的候选白名单也只有 'tmp' | 'expired-exports'。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
/**
 * 回滚点库目录名（`dataDir/rollback-points`）。
 *
 * 为什么不直接 import 引擎的 `ROLLBACK_POINTS_DIR_NAME`：本模块是**只读体检**，也是离线
 * 救急台（`dcm web` 的磁盘页）的依赖 —— 不该把整个回滚引擎（crypto / zlib / atomic-write /
 * 会话索引…）拉进它的运行时依赖图；引擎文件一旦有问题，救急台恰恰是最不该跟着挂的那个页面。
 * 「单一事实源」在这里靠**源码级守卫**而不是 import：`disk-usage.test.ts` 直接读
 * `src/core/rollback-point.ts` 的声明并与本常量逐字比对（改了那边、或改了这边，测试即红）
 * —— 与 `tests/packaging-contract.test.ts` 的 V-1（源码级读 `PLUGIN_VERSION`，不 import 宿主入口）
 * 同一种姿势。
 */
const ROLLBACK_POINTS_DIR = 'rollback-points';
/**
 * 只报告、**不提供清理**的子区（当前一条：回滚点库 = `dataDir/rollback-points`）。
 * 它只是「口径清单」：报告/展示一律用完备的 `DISK_USAGE_AREAS`，清理候选另有白名单
 * （`IMMEDIATE_CLEAN_CATEGORIES` / 清理入口 categories），两者不得混用。
 */
export const DISK_USAGE_EXTRA_AREAS = ['rollback-points'];
/** 体检子区（顺序即报告/展示顺序：先备份产物，再缓存/暂存，末位为只读保护的附加区） */
export const DISK_USAGE_AREAS = [
    'exports',
    'snapshots',
    'sync',
    'marketCache',
    'marketWork',
    'tmp',
    'logs',
    'bootState',
    'migrationHistory',
    'transactions',
    'locks',
    'vault',
    ...DISK_USAGE_EXTRA_AREAS,
];
/**
 * 遗留数据目录清单（当前一条：旧检查点库）。
 *
 * `checkpoints/` 是回滚点库改名（`rollback-points/`）之前的旧目录：新代码**不再读取**它，
 * 本插件也**不去删**它（删除是不可逆动作，需用户单独授权）。
 */
export const LEGACY_DATA_DIRS = [
    { id: 'legacy-checkpoints', relPath: 'checkpoints' },
];
/** 可立即整块清理的子区（转成磁盘使用分区 id；供清理路由映射回结果） */
export const IMMEDIATE_CLEAN_CATEGORIES = ['tmp', 'marketCache', 'marketWork'];
/** 子区 → 物理目录（单一映射点；展示与统计都不再重复挑目录）。
 *  回滚点库不在 `DiskUsageDirs` 里显式传：它的位置 = `dataDir` + `ROLLBACK_POINTS_DIR`
 *  （与引擎常量逐字一致，有源码级守卫），宿主路由与离线 CLI 两条构造路径因此不可能漂移。 */
export function diskUsageDirOf(dirs, area) {
    switch (area) {
        case 'exports': return dirs.exportsDir;
        case 'snapshots': return dirs.snapshotsDir;
        case 'sync': return dirs.syncDir;
        case 'marketCache': return dirs.marketCacheDir;
        case 'marketWork': return dirs.marketWorkDir;
        case 'tmp': return dirs.tmpDir;
        case 'logs': return dirs.logsDir;
        case 'bootState': return dirs.bootStateDir;
        case 'migrationHistory': return dirs.migrationHistoryDir;
        case 'transactions': return dirs.transactionsDir;
        case 'locks': return dirs.locksDir;
        case 'vault': return dirs.vaultDir;
        case 'rollback-points': return path.join(dirs.dataDir, ROLLBACK_POINTS_DIR);
    }
}
/**
 * 递归统计一个目录：字节数 / 文件数 / 最新 mtime / 已超期文件。
 *
 * 规则：
 *  - **不跟随符号链接**（lstat 判型、目录链接不展开）——避免 junction 成环与重复计数；
 *  - 缺 `stat` 信息的条目按 0 字节计（但计入文件数，宁可多算条目也不少算文件）；
 *  - 子项 readdir/stat 失败只跳过该子项；根目录失败**或根本不是目录**才标 unreadable
 *    （非目录 = 未统计，不是 0 字节；验收 F4）。
 */
async function walkDirectory(root, retentionMs, nowMs) {
    const result = { sizeBytes: 0, fileCount: 0, unreadable: false, newestMtimeMs: null, expiredBytes: 0, expiredCount: 0 };
    let rootStat;
    try {
        rootStat = await fs.lstat(root);
    }
    catch {
        // 目录不存在（首次启动前）或读不到 → 未统计，不是「0 字节」
        result.unreadable = true;
        return result;
    }
    // 路径存在但不是目录（被普通文件/其它东西占住）：这不是「0 字节」，而是**未统计**
    // —— 验收 F4：真不存在的子区显示「未统计（读不到）」，被占住的却显示 0，属自相矛盾的谎报。
    if (!rootStat.isDirectory()) {
        result.unreadable = true;
        return result;
    }
    const stack = [root];
    while (stack.length > 0) {
        const dir = stack.pop();
        if (dir === undefined)
            break;
        let entries;
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        }
        catch {
            result.unreadable = true;
            continue;
        }
        for (const entry of entries) {
            const target = path.join(dir, entry.name);
            // 符号链接/junction：只计链接本身（lstat 的 size 是链接长度，可忽略），绝不展开
            if (entry.isSymbolicLink())
                continue;
            if (entry.isDirectory()) {
                stack.push(target);
                continue;
            }
            let st;
            try {
                st = await fs.lstat(target);
            }
            catch {
                continue; // 竞态删除/不可读：跳过该条目
            }
            if (!st.isFile())
                continue;
            result.sizeBytes += st.size;
            result.fileCount += 1;
            if (result.newestMtimeMs === null || st.mtimeMs > result.newestMtimeMs)
                result.newestMtimeMs = st.mtimeMs;
            if (retentionMs !== null && nowMs - st.mtimeMs > retentionMs) {
                result.expiredBytes += st.size;
                result.expiredCount += 1;
            }
        }
    }
    return result;
}
/**
 * 单文件体积（读不到 → 0）。清理模块复用 —— 与 walkDirectory 共用「lstat 判文件」口径，
 * 避免两处各写一份 stat 包装后对「目录同名」等边界给出不同结果。
 */
export async function fileSize(file) {
    try {
        const st = await fs.lstat(file);
        return st.isFile() ? st.size : 0;
    }
    catch {
        return 0;
    }
}
/**
 * 导出产物的「已超期」统计：只认 `*.zip` 且**排除豁免前缀**（定时备份），
 * 与 cache-cleaner 的回收口径逐条一致（否则界面会给出用户照做也回收不到的数字）。
 */
async function expiredExports(dir, retentionMs, exemptPrefix, nowMs) {
    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    }
    catch {
        return { bytes: 0, count: 0 };
    }
    let bytes = 0;
    let count = 0;
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.zip'))
            continue;
        if (exemptPrefix !== undefined && entry.name.startsWith(exemptPrefix))
            continue;
        const target = path.join(dir, entry.name);
        try {
            const st = await fs.lstat(target);
            if (nowMs - st.mtimeMs > retentionMs) {
                bytes += st.size;
                count += 1;
            }
        }
        catch {
            continue;
        }
    }
    return { bytes, count };
}
/**
 * 执行一次只读磁盘体检（幂等、零写入）。
 * 任一子区失败不影响其余统计；返回的报告恒为完整结构（缺失子区记 unreadable）。
 */
export async function scanDiskUsage(options) {
    const nowMs = (options.now ?? Date.now)();
    const { dirs, policy } = options;
    /** 子区 → 保留期与豁免（null = 不参与「已超期」判定） */
    const retention = {
        exports: policy.exportsRetentionMs,
        snapshots: null,
        sync: null,
        marketCache: policy.marketRetentionMs,
        marketWork: policy.marketRetentionMs,
        tmp: policy.tmpRetentionMs,
        logs: null,
        bootState: null,
        migrationHistory: null,
        transactions: null,
        locks: null,
        vault: null,
        // 回滚点库没有「保留期」：只报告，绝不自动清理（工作区 + 会话两态的恢复入口）
        'rollback-points': null,
    };
    const policyOf = {
        exports: 'retained',
        snapshots: 'protected',
        sync: 'protected',
        marketCache: 'regenerable',
        marketWork: 'regenerable',
        tmp: 'regenerable',
        logs: 'protected',
        bootState: 'protected',
        migrationHistory: 'protected',
        transactions: 'protected',
        locks: 'protected',
        vault: 'protected',
        // 与 snapshots/sync 同语义：用户数据/恢复入口 —— 只报告，绝不提供清理
        'rollback-points': 'protected',
    };
    const areas = {};
    let totalBytes = 0;
    let totalFiles = 0;
    let reclaimableBytes = 0;
    let expiredBytes = 0;
    for (const area of DISK_USAGE_AREAS) {
        const dir = diskUsageDirOf(dirs, area);
        const walk = await walkDirectory(dir, retention[area], nowMs);
        const entry = {
            sizeBytes: walk.sizeBytes,
            fileCount: walk.fileCount,
            unreadable: walk.unreadable,
            policy: policyOf[area],
        };
        const retained = retention[area];
        if (retained !== null) {
            entry.retentionMs = retained;
            if (area === 'exports') {
                const ex = await expiredExports(dir, retained, policy.exportsExemptPrefix, nowMs);
                entry.expiredBytes = ex.bytes;
                entry.expiredCount = ex.count;
            }
            else {
                entry.expiredBytes = walk.expiredBytes;
                entry.expiredCount = walk.expiredCount;
            }
        }
        areas[area] = entry;
        totalBytes += walk.sizeBytes;
        totalFiles += walk.fileCount;
        expiredBytes += entry.expiredBytes ?? 0;
        if (entry.policy === 'regenerable')
            reclaimableBytes += walk.sizeBytes;
    }
    /**
     * 遗留数据：与子区**同一套**遍历口径（只读、不跟随符号链接、读不到即 unreadable），
     * 但**不计入 totalBytes**（与 areas 分列），且 policy 恒为 protected —— 本模块不提供
     * 任何删除动作，也不把它们的路径交给清理入口。
     */
    const legacy = [];
    for (const item of LEGACY_DATA_DIRS) {
        const dir = path.join(dirs.dataDir, item.relPath);
        const walk = await walkDirectory(dir, null, nowMs);
        legacy.push({
            id: item.id,
            relPath: item.relPath,
            path: dir,
            sizeBytes: walk.sizeBytes,
            fileCount: walk.fileCount,
            unreadable: walk.unreadable,
            policy: 'protected',
        });
    }
    return {
        dataDir: dirs.dataDir,
        totalBytes,
        totalFiles,
        reclaimableBytes,
        expiredBytes,
        areas,
        legacy,
        backupRetention: { keepLast: options.backupKeepLast ?? 10, latestBackupBytes: 0, latestBackupAt: null },
    };
}
//# sourceMappingURL=disk-usage.js.map