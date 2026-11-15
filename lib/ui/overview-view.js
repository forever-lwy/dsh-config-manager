/**
 * Overview 总览页纯渲染模型（2026-09 UX 重构）：框架无关，node 可测。
 *
 * 职责：把各只读 API 的响应（备份文件 / 快照 / 定时备份 / 同步状态 / 迁移历史 /
 * 恢复模式 / 活跃 run）映射为 UI 展示所需的纯数据——指标卡、健康状态、建议、
 * 最近活动。**非控制器**：不持有状态、不发起请求；HomePanel 只做装配
 * （渲染 + 交互状态 + 导航），把本模块纯函数输出绑定到 React 组件。
 *
 * 数据形状说明：输入全部是最小结构类型（结构兼容各 API 响应的字段子集），
 * null/undefined = 该数据源尚未加载或加载失败（UI 显示占位，不阻塞整页）。
 *
 * 安全（UI HARD RULES）：所有自由文本（history.summary）由上层在渲染前过
 * redact()；kind / result 均为枚举常量，无 secret 承载面；本模块不输出任何文案，
 * 只输出 i18n key 基名与纯数据（与 history-model.ts 同模式）。
 */
/**
 * 相对时间：now 与 at（ms）差值 → now/min/hour/day；超出 7 天或 at 无效 → null
 * （上层回退绝对日期）。
 */
export function relTime(now, at) {
    if (!Number.isFinite(at) || at <= 0 || now < at)
        return null;
    const diffMs = now - at;
    const MIN = 60_000;
    const HOUR = 60 * MIN;
    const DAY = 24 * HOUR;
    if (diffMs < MIN)
        return { unit: 'now', n: 0 };
    if (diffMs < HOUR)
        return { unit: 'min', n: Math.floor(diffMs / MIN) };
    if (diffMs < DAY)
        return { unit: 'hour', n: Math.floor(diffMs / HOUR) };
    if (diffMs < 7 * DAY)
        return { unit: 'day', n: Math.floor(diffMs / DAY) };
    return null;
}
/** ISO 字符串 → ms（无效返回 null）。 */
export function isoToMs(iso) {
    if (iso === undefined || iso === '')
        return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
}
/** 最近一次备份（mtime 最大者；空/未加载 → null）。 */
export function latestBackup(backups) {
    if (backups === null || backups.length === 0)
        return null;
    let best = backups[0];
    for (const b of backups)
        if (b.mtimeMs > best.mtimeMs)
            best = b;
    return best;
}
/** 最近一次快照（createdAt 最大者；空/未加载 → null）。 */
export function latestSnapshot(snapshots) {
    if (snapshots === null || snapshots.length === 0)
        return null;
    let best = snapshots[0];
    let bestMs = isoToMs(best.createdAt) ?? 0;
    for (const s of snapshots) {
        const ms = isoToMs(s.createdAt) ?? 0;
        if (ms > bestMs) {
            best = s;
            bestMs = ms;
        }
    }
    return best;
}
/**
 * 构建四张指标卡（备份文件 / 安全快照 / 定时备份 / 远程同步）。
 * 未加载的数据源 value='—' + metaKey=null；metaParams.time 是 ms 数字字符串，
 * 组件层用 relTime 渲染为相对时间文案。
 */
export function buildOverviewMetrics(inputs) {
    const { backups, snapshots, schedule, sync } = inputs;
    // 备份文件：数量 + 最近备份相对时间
    const lastBackupAt = latestBackup(backups)?.mtimeMs ?? null;
    const backupMetric = backups === null
        ? { key: 'backups', kind: 'count', value: '—', metaKey: null, metaParams: {}, metaTone: 'neutral' }
        : {
            key: 'backups',
            kind: 'count',
            value: String(backups.length),
            metaKey: lastBackupAt !== null ? 'meta.lastBackup' : 'meta.noBackup',
            metaParams: lastBackupAt !== null ? { time: String(lastBackupAt) } : {},
            metaTone: 'neutral',
        };
    // 快照：数量 + 最近快照相对时间
    const lastSnapshotMs = isoToMs(latestSnapshot(snapshots)?.createdAt);
    const snapshotMetric = snapshots === null
        ? { key: 'snapshots', kind: 'count', value: '—', metaKey: null, metaParams: {}, metaTone: 'neutral' }
        : {
            key: 'snapshots',
            kind: 'count',
            value: String(snapshots.length),
            metaKey: lastSnapshotMs !== null ? 'meta.lastBackup' : 'meta.noBackup',
            metaParams: lastSnapshotMs !== null ? { time: String(lastSnapshotMs) } : {},
            metaTone: 'neutral',
        };
    // 定时备份：开/关状态 + 上次运行（失败 → warn 附注）
    let scheduleMetric;
    if (schedule === null) {
        scheduleMetric = { key: 'schedule', kind: 'state', value: '', valueKey: undefined, metaKey: null, metaParams: {}, metaTone: 'neutral' };
    }
    else {
        const lastRunMs = isoToMs(schedule.lastRunAt);
        const failed = schedule.lastRunStatus === 'failed';
        scheduleMetric = {
            key: 'schedule',
            kind: 'state',
            value: '',
            valueKey: schedule.enabled ? 'state.on' : 'state.off',
            metaKey: !schedule.enabled
                ? 'meta.scheduleOff'
                : failed
                    ? 'meta.scheduleFail'
                    : lastRunMs !== null
                        ? 'meta.scheduleOn'
                        : 'meta.never',
            metaParams: lastRunMs !== null ? { time: String(lastRunMs) } : {},
            metaTone: schedule.enabled && failed ? 'warn' : 'neutral',
        };
    }
    // 远程同步：已配置/未配置状态 + 上次同步
    let syncMetric;
    if (sync === null) {
        syncMetric = { key: 'sync', kind: 'state', value: '', valueKey: undefined, metaKey: null, metaParams: {}, metaTone: 'neutral' };
    }
    else {
        const lastSyncMs = isoToMs(sync.lastSyncAt);
        syncMetric = {
            key: 'sync',
            kind: 'state',
            value: '',
            valueKey: sync.configured ? 'state.on' : 'state.off',
            metaKey: !sync.configured
                ? 'meta.syncOff'
                : lastSyncMs !== null
                    ? 'meta.syncOn'
                    : 'meta.never',
            metaParams: lastSyncMs !== null ? { time: String(lastSyncMs) } : {},
            metaTone: 'neutral',
        };
    }
    return [backupMetric, snapshotMetric, scheduleMetric, syncMetric];
}
/**
 * 配置健康判定（保守优先级）：
 * 1. SAFE MODE 激活（有未解决恢复事项）→ error（最高优先，需用户处理）；
 * 2. 已加载且备份与快照均为空 → warn「尚无任何备份」（新装机引导场景）；
 * 3. 定时备份开启但上次运行失败 → warn；
 * 4. 手上已有备份、但定时备份是关的 → warn「自动备份已关闭」（2026-11-01 视觉 pass 新增：
 *    此前关闭档不判定，于是「All healthy」与「Auto backup Off / Backups 1」同屏并列，
 *    状态条给出的结论与它脚下的指标自相矛盾 —— 一页只在回答「现在安全吗」，
 *    在没有任何后续保护时报健康等于放弃这个结论）；
 * 5. 其余 → ok。
 * 数据未加载（null）不降级健康状态（避免加载闪红）。
 */
export function overviewHealth(inputs) {
    if (inputs.recoveryRequired === true) {
        return { kind: 'error', textKey: 'health.recovery' };
    }
    if (inputs.backups !== null && inputs.snapshots !== null
        && inputs.backups.length === 0 && inputs.snapshots.length === 0) {
        return { kind: 'warn', textKey: 'health.noBackup' };
    }
    if (inputs.schedule !== null && inputs.schedule.enabled && inputs.schedule.lastRunStatus === 'failed') {
        return { kind: 'warn', textKey: 'health.scheduleFailed' };
    }
    if (inputs.schedule !== null && !inputs.schedule.enabled) {
        return { kind: 'warn', textKey: 'health.autoBackupOff' };
    }
    return { kind: 'ok', textKey: 'health.ok' };
}
/* ---------------- 最近活动 ---------------- */
/** 已知迁移操作 kind（与 core/migration-history.ts MIGRATION_KINDS 对齐；仅用于 key 归一）。 */
const KNOWN_KINDS = new Set([
    'import', 'restore', 'rollback',
    'profile-create', 'profile-select', 'profile-switch', 'profile-delete', 'profile-rename', 'profile-save', 'profile-import',
    'sync-apply', 'autosync', 'recovery',
    'backup', 'backup-manual', 'snapshot-delete', 'snapshot-prune',
]);
/**
 * kind → 概览活动行用的文案键（未知 kind 归一为 `overview.kind.other`）。
 * 独立成函数以便守卫测试枚举全部 MigrationKind 断言字典齐备（新增 kind 忘记配文案时，
 * 界面会直接显示裸 key —— 这正是 backup-manual 引入时的风险点）。
 */
export function overviewKindKey(kind) {
    return KNOWN_KINDS.has(kind) ? `overview.kind.${kind}` : 'overview.kind.other';
}
/** 最近活动列表：按时间倒序取前 limit 条（kindKey 归一 + 徽章语义映射）。 */
export function overviewActivity(history, limit = 5) {
    if (history === null || history.length === 0)
        return [];
    const sorted = [...history].sort((a, b) => {
        const ma = isoToMs(a.at) ?? 0;
        const mb = isoToMs(b.at) ?? 0;
        return mb - ma;
    });
    return sorted.slice(0, limit).map((e) => ({
        at: e.at,
        badge: e.result === 'success'
            ? 'ok'
            : e.result === 'failed'
                ? 'error'
                // pending：跑完了但仍有待裁决项（自动同步下行冲突未裁决）—— 首页必须说「待裁决」，
                // 既不能红成「失败」，也不该混进「跳过」（那一轮确有上传/应用发生）
                : e.result === 'pending'
                    ? 'pending'
                    : 'warn',
        kindKey: overviewKindKey(e.kind),
        summary: e.summary,
        // 待裁决 = 有具体分区等用户确认（宿主侧 pendingMerge）。首页不能只挂个颜色：
        // 有去处才给入口，其余徽章保持不可点。
        ...(e.kind === 'autosync' && e.result === 'pending' ? { jumpTo: 'sync' } : {}),
    }));
}
/** 空态判定：备份与快照均已加载且都为空 → 显示「开始保护你的配置」引导。 */
export function overviewEmptyState(inputs) {
    return inputs.backups !== null && inputs.snapshots !== null
        && inputs.backups.length === 0 && inputs.snapshots.length === 0;
}
/**
 * 首用空态的三步主线（固定顺序，非状态推断）：
 *   ① 创建第一份备份 → ② 导出 ZIP 带走 → ③ 在新机器导入回来。
 * 这是插件的主线用法（备份 → 迁移），而旧空态只给了「备份 / 同步」两个互不相干的按钮，
 * 新用户看不出「导出 → 在新机器导入」才是这个插件存在的理由。
 * 步骤**状态**由 UI 层给出（首用空态恒为「第一步 current、其余 todo」），本模块不推断。
 */
export function overviewFirstSteps() {
    return [{ key: 'step1' }, { key: 'step2' }, { key: 'step3' }];
}
//# sourceMappingURL=overview-view.js.map