/**
 * 子区 → 字典键（标签 / 说明在字典里；本模块只挑键，不内嵌文案）。
 *
 * 键域 = `DiskUsageScanArea`（**含**只报告、不清理的附加子区，如 `rollback-points`）：
 * core 的 `DiskUsageArea` 刻意把附加子区排除在外 —— 它描述的是「**展示层已登记文案**的清单」，
 * 而登记文案正是本文件（`AREA_KEYS` 是穷尽 Record，少一个 id 就编译不过）。
 * 因此这里用更宽的 `DiskUsageScanArea`：新增附加子区时，core 加统计、本文件加文案，两边都必须动。
 */
const AREA_KEYS = {
    exports: { label: 'diskUsage.area.exports', desc: 'diskUsage.area.exportsDesc' },
    snapshots: { label: 'diskUsage.area.snapshots', desc: 'diskUsage.area.snapshotsDesc' },
    sync: { label: 'diskUsage.area.sync', desc: 'diskUsage.area.syncDesc' },
    marketCache: { label: 'diskUsage.area.marketCache', desc: 'diskUsage.area.marketCacheDesc' },
    marketWork: { label: 'diskUsage.area.marketWork', desc: 'diskUsage.area.marketWorkDesc' },
    tmp: { label: 'diskUsage.area.tmp', desc: 'diskUsage.area.tmpDesc' },
    logs: { label: 'diskUsage.area.logs', desc: 'diskUsage.area.logsDesc' },
    bootState: { label: 'diskUsage.area.bootState', desc: 'diskUsage.area.bootStateDesc' },
    migrationHistory: { label: 'diskUsage.area.migrationHistory', desc: 'diskUsage.area.migrationHistoryDesc' },
    transactions: { label: 'diskUsage.area.transactions', desc: 'diskUsage.area.transactionsDesc' },
    locks: { label: 'diskUsage.area.locks', desc: 'diskUsage.area.locksDesc' },
    vault: { label: 'diskUsage.area.vault', desc: 'diskUsage.area.vaultDesc' },
    // 只报告、**不提供清理**的附加子区（policy 恒 protected）：回滚点库
    'rollback-points': { label: 'diskUsage.area.rollbackPoints', desc: 'diskUsage.area.rollbackPointsDesc' },
};
/** 保留期 → 人类可读（7 天 / 24 小时；非整档按小时/分钟回落） */
export function formatRetention(ms, t) {
    if (!Number.isFinite(ms) || ms <= 0)
        return t('diskUsage.retention.none');
    const day = 24 * 60 * 60 * 1000;
    const hour = 60 * 60 * 1000;
    if (ms % day === 0)
        return t('diskUsage.retention.days', { count: String(ms / day) });
    if (ms % hour === 0)
        return t('diskUsage.retention.hours', { count: String(ms / hour) });
    return t('diskUsage.retention.minutes', { count: String(Math.max(1, Math.round(ms / 60000))) });
}
/**
 * 报告 → 视图模型。
 * `report` 为 null 时返回 null（界面显示加载态；调用方不必自己判空）。
 */
export function diskUsageViewModel(report, deps) {
    if (report === null)
        return null;
    const { t, formatBytes } = deps;
    const rows = [];
    let anyUnreadable = false;
    /**
     * 合计与「可回收」全部**由渲染出来的行现算**（不直接用报告里的聚合字段）。
     * 为什么：界面上的按钮数字必须与它旁边列出的行逐项对得上；一旦宿主聚合与明细漂移，
     * 用户会按「可释放 600 B」点下去却只释放 0 —— 宁可让两侧都基于同一份明细。
     */
    let totalBytes = 0;
    let totalFiles = 0;
    let reclaimableBytes = 0;
    let expiredBytesTotal = 0;
    for (const area of Object.keys(AREA_KEYS)) {
        const entry = report.areas[area];
        if (entry === undefined)
            continue;
        const keys = AREA_KEYS[area];
        if (entry.unreadable)
            anyUnreadable = true;
        const expiredBytes = entry.expiredBytes ?? 0;
        totalBytes += entry.sizeBytes;
        totalFiles += entry.fileCount;
        // ui-F4：只有 exports 的过期字节属于「回收过期备份文件」动作 —— 宿主 cleanup 的
        // expired-exports 只删 exports/**（cache-cleaner 显式注释「includeRecent 不作用于本区」）；
        // tmp / market 的过期项已由 tmp-market（整块清）覆盖，混进这里会让按钮/确认框数字虚高，
        // 且这些字节在行上（只有 retained 区渲染 expired）根本没有对应文本。
        if (area === 'exports')
            expiredBytesTotal += expiredBytes;
        if (entry.policy === 'regenerable')
            reclaimableBytes += entry.sizeBytes;
        rows.push({
            id: area,
            label: t(keys.label),
            desc: t(keys.desc),
            size: entry.unreadable ? '' : formatBytes(entry.sizeBytes),
            files: entry.unreadable ? '' : t('diskUsage.files', { count: String(entry.fileCount) }),
            unreadable: entry.unreadable,
            policy: entry.policy,
            retention: entry.policy === 'retained' && entry.retentionMs !== undefined ? formatRetention(entry.retentionMs, t) : '',
            expired: entry.policy === 'retained' && expiredBytes > 0 ? formatBytes(expiredBytes) : null,
            reclaimable: entry.policy === 'regenerable',
        });
    }
    /**
     * 遗留数据行：core 只报告（`policy` 恒 protected、**不计入**合计），界面如实分列。
     * 标签走字典，**绝不**把 id / relPath 当标签渲染（relPath 只作「在哪儿」的路径展示）。
     */
    const legacyRows = [];
    for (const entry of report.legacy ?? []) {
        if (entry.unreadable)
            anyUnreadable = true;
        legacyRows.push({
            id: entry.id,
            relPath: entry.relPath,
            label: t('diskUsage.legacy.label'),
            size: entry.unreadable ? '' : formatBytes(entry.sizeBytes),
            files: entry.unreadable ? '' : t('diskUsage.files', { count: String(entry.fileCount) }),
            unreadable: entry.unreadable,
            policy: 'protected',
        });
    }
    const actions = [
        {
            id: 'tmp-market',
            label: t('diskUsage.clean.tmpMarket'),
            bytes: reclaimableBytes,
            size: formatBytes(reclaimableBytes),
            desc: t('diskUsage.clean.tmpMarketDesc'),
        },
        {
            id: 'expired-exports',
            label: t('diskUsage.clean.expiredExports'),
            bytes: expiredBytesTotal,
            size: formatBytes(expiredBytesTotal),
            desc: t('diskUsage.clean.expiredExportsDesc'),
        },
    ];
    return {
        summary: {
            total: formatBytes(totalBytes),
            files: t('diskUsage.files', { count: String(totalFiles) }),
            dataDir: report.dataDir,
            anyUnreadable,
        },
        rows,
        legacy: legacyRows,
        clean: {
            reclaimable: formatBytes(reclaimableBytes),
            expired: formatBytes(expiredBytesTotal),
            actions,
        },
    };
}
/** 请求动作 → 该动作会碰到的子区（与 routes/backup.ts 的分区白名单同源）。 */
const REQUEST_AREAS = {
    tmp: ['tmp', 'marketCache', 'marketWork'],
    'expired-exports': ['exports'],
};
/** 目标区清理后是否**仍有内容**（判「真失败」还是「本来就没东西」）。 */
function targetStillHasContent(report, requested) {
    // 没有「清理后体检报告」就无法证明「本来就没东西」→ **保守**按「还有内容」处理（宁可报失败，不谎报成功）
    if (report === null || report === undefined)
        return true;
    for (const action of requested) {
        for (const area of REQUEST_AREAS[action] ?? []) {
            const entry = report.areas[area];
            if (entry !== undefined && entry.sizeBytes > 0)
                return true;
        }
    }
    return false;
}
/**
 * 清理回执 → 呈现分类（纯函数）。
 *
 * - `nothing`：一件都没删、也没有失败 → 「没有可释放的内容」（成功语义）；
 * - `nothing-absent`：有失败计数但目标区**已空** → 归为「没有需要清理的内容（目标目录不存在或已为空）」，
 *   **不报失败**（e2e-F3 的用户现场）；
 * - `cleaned`：全成；
 * - `partial`：删到了一些又失败了若干 → 成功 + 「N 项失败（已跳过）」；
 * - `failed`：一件都没删成、目标区**仍有内容** → 真失败。
 */
export function cleanupOutcome(input, deps) {
    const { t, formatBytes } = deps;
    const done = t('diskUsage.clean.done', { size: formatBytes(input.freedBytes), count: String(input.removed) });
    const failed = t('diskUsage.clean.failed', { count: String(input.errors) });
    if (input.removed === 0 && input.freedBytes === 0 && input.errors === 0) {
        return { kind: 'nothing', okText: t('diskUsage.clean.nothing'), warnText: '', warnKind: 'warn' };
    }
    if (input.errors === 0) {
        return { kind: 'cleaned', okText: done, warnText: '', warnKind: 'warn' };
    }
    if (input.removed > 0) {
        return { kind: 'partial', okText: done, warnText: failed, warnKind: 'warn' };
    }
    // 一件都没删成：看目标区是否还有内容 —— 没有内容就不是失败
    const stillHas = targetStillHasContent(input.report, input.requested ?? ['tmp']);
    if (!stillHas) {
        return { kind: 'nothing-absent', okText: t('diskUsage.clean.nothingAbsent'), warnText: '', warnKind: 'warn' };
    }
    return { kind: 'failed', okText: '', warnText: failed, warnKind: 'error' };
}
//# sourceMappingURL=disk-usage-view.js.map