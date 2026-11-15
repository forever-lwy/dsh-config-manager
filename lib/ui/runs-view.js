import { buildImportLogModel } from './import-log.js';
import { isSkippablePluginInstall } from './import-wizard.js';
/** 日志尾部保留行数（卡片里只给「最近发生了什么」，完整日志在所属页面）。 */
export const RUN_CARD_LOG_TAIL = 8;
/**
 * 终止请求等多久算「可能卡住」（2 分钟）。
 * 为什么要有阈值：协作式取消只能等到**项边界**，而插件安装可以跑几十分钟。
 * 2 分钟内大概率是在装插件（正常），超过就该把出路摆到用户面前（跳过当前项 / 重启），
 * 否则用户只能一遍遍点「终止…」——而那个按钮此刻已经没有任何作用了。
 */
export const CANCEL_STUCK_AFTER_MS = 2 * 60 * 1000;
/**
 * 相对时间（纯函数，now 显式传入 → 可单测）：刚刚 / N 分钟前 / N 小时前 / N 天前。
 * 键复用 config-manager 字典里既有的 overview.time.*（同字典，不新造文案）。
 */
export function relativeTimeLabel(updatedAt, now) {
    const diffMs = Math.max(0, now - updatedAt);
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1)
        return { key: 'overview.time.now' };
    if (minutes < 60)
        return { key: 'overview.time.min', params: { n: String(minutes) } };
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return { key: 'overview.time.hour', params: { n: String(hours) } };
    return { key: 'overview.time.day', params: { n: String(Math.floor(hours / 24)) } };
}
function percentOf(item, itemTotal) {
    if (item === null || itemTotal === null || itemTotal <= 0)
        return null;
    return Math.min(100, Math.max(0, Math.round((item / itemTotal) * 100)));
}
/** RunState[] → 卡片模型（按 updatedAt 倒序；终态与进行中同列，由 status 区分）。 */
export function runCards(runs, opts = {}) {
    const tail = opts.logTail ?? RUN_CARD_LOG_TAIL;
    const now = opts.now ?? Date.now();
    return [...runs]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((run) => {
        const log = run.log ?? [];
        const model = log.length > 0 ? buildImportLogModel(log) : null;
        const running = run.status === 'running';
        const awaitingDecision = running && run.pendingDecision === 'cancel';
        // 终止请求已到达、但还没走到安全点：把「等了多久」算出来给界面用（见 CANCEL_STUCK_AFTER_MS）
        const requestedAt = typeof run.cancelRequestedAt === 'number' ? run.cancelRequestedAt : null;
        const waitedMs = requestedAt === null ? 0 : Math.max(0, now - requestedAt);
        const cancelWait = requestedAt !== null && running && !awaitingDecision
            ? { minutes: Math.floor(waitedMs / 60_000), stuck: waitedMs >= CANCEL_STUCK_AFTER_MS }
            : null;
        return {
            runId: run.runId,
            kind: run.kind,
            kindLabelKey: `runs.kind.${run.kind}`,
            status: run.status,
            statusLabelKey: `runs.status.${run.status}`,
            awaitingDecision,
            // 只有导入实现了协作式取消；其余类型给禁用态（不给假按钮）。
            // 已请求过终止就不再给按钮：再点也不会有新效果（run 级信号是幂等的），
            // 留着一个亮着的主按钮只会让用户以为「多点几次就能好」。
            canCancel: running && run.kind === 'import' && !awaitingDecision && cancelWait === null,
            cancelWait,
            // 「跳过当前插件」复用向导的**同一判据**（isSkippablePluginInstall：detail 带 plugin: 前缀），
            // 绝不在这里另写一份「是不是插件安装项」的判断 —— 两份判据漂移会让两个页面对同一个 run
            // 给出不同的可操作性。skipRequested 由运行中心自己的在途状态抑制（见 RunsCenter）。
            canSkip: running && run.kind === 'import' && run.pendingDecision !== 'cancel'
                && isSkippablePluginInstall(run.detail ?? undefined, running, false),
            progress: {
                labelKey: `runs.progress.${running ? 'running' : run.status === 'done' ? 'done' : 'failed'}`,
                section: run.section,
                item: run.item,
                itemTotal: run.itemTotal,
                detail: run.detail,
                percent: percentOf(run.item, run.itemTotal),
            },
            counts: model === null ? null : model.counts,
            problems: model === null ? 0 : model.problems,
            logTail: log.slice(-Math.max(0, tail)),
            updatedAt: run.updatedAt,
            time: relativeTimeLabel(run.updatedAt, now),
        };
    });
}
/** 状态栏 / 面板徽章用的计数。 */
export function runSummary(runs) {
    let running = 0;
    let awaiting = 0;
    for (const run of runs) {
        if (run.status !== 'running')
            continue;
        running += 1;
        if (run.pendingDecision === 'cancel')
            awaiting += 1;
    }
    return { running, awaiting, total: runs.length };
}
/**
 * 终止决策框模型。默认选项跟随用户既有的 rollbackOnError 偏好：
 * 勾过「失败不回滚」→ 默认保留（与他的心智一致）；否则默认回滚（安全侧）。
 */
export function cancelDialogModel(run, opts) {
    const applied = run.item;
    const total = run.itemTotal;
    return {
        runId: run.runId,
        kindLabelKey: `runs.kind.${run.kind}`,
        appliedCount: applied,
        totalCount: total,
        pendingCount: applied !== null && total !== null ? Math.max(0, total - applied) : null,
        defaultDecision: opts.defaultRollbackOnError ? 'rollback' : 'keep',
        options: [
            { id: 'rollback', labelKey: 'runs.cancel.rollback', descKey: 'runs.cancel.rollbackDesc' },
            { id: 'keep', labelKey: 'runs.cancel.keep', descKey: 'runs.cancel.keepDesc' },
        ],
    };
}
//# sourceMappingURL=runs-view.js.map