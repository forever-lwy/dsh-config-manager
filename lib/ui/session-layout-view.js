/* ------------------------------------------------- ① 这一档的候选行（来自体检响应） */
/** 本入口覆盖的两类问题码（`blocksStartup` 里可布局修复的那一档）。 */
export const SESSION_LAYOUT_ISSUE_CODES = ['location-mismatch', 'duplicate-id'];
/**
 * 从体检响应里挑出可布局修复的行（`blocksStartup` + 两类码之一）。
 *
 * 只挑 `blocksStartup`：这一档才是「DSH 会直接拒绝启动」的硬故障（`corrupt session log` /
 * `duplicate JSONL session id`），也正是本入口存在的理由。其余严重级不在此列。
 */
export function sessionLayoutCandidates(response) {
    if (response === null)
        return [];
    return response.rows
        .filter((row) => row.severity === 'blocksStartup')
        .map((row) => {
        const codes = SESSION_LAYOUT_ISSUE_CODES.filter((code) => row.issues.some((issue) => issue.code === code));
        return {
            unitId: row.unitId,
            sessionId: row.sessionId,
            projectKey: row.projectKey,
            issueCodes: [...codes],
            mayNeedKeep: codes.includes('duplicate-id'),
        };
    })
        .filter((candidate) => candidate.issueCodes.length > 0);
}
/**
 * 面板入口的可见性判定。
 *
 * 为什么单独成一个纯函数：入口**只在有候选行时**渲染的话，本机没有这一档问题（真机 1218 单元全
 * `already-placed`）的用户**根本看不到这个功能** —— 发现性缺陷。口径：**扫过之后入口始终可见**
 * （用空态说明"本机没有这一档"），只有"还没扫过 + 手上没计划/结果"才隐藏；有计划/结果时更不能消失
 * （否则刚做完的逐条结果被吞掉）。
 */
export function sessionLayoutSectionState(input) {
    if (input.plan !== null || input.applied !== null)
        return 'ready';
    if (input.response === null)
        return 'hidden';
    return sessionLayoutCandidates(input.response).length > 0 ? 'ready' : 'empty';
}
function kindKeyOf(kind) {
    return SESSION_LAYOUT_KIND_KEYS[kind] ?? SESSION_LAYOUT_KIND_KEYS.unknown;
}
function planRowOf(item) {
    return {
        unitId: item.unitId,
        sessionId: item.sessionId,
        kind: item.kind,
        kindKey: kindKeyOf(item.kind),
        reason: item.reason,
        reasonKey: sessionLayoutReasonKey(item.reason),
        fromProjectKey: item.fromProjectKey,
        toProjectKey: item.toProjectKey ?? null,
        applies: item.applies,
        blockedByKeepSelection: item.kind === 'quarantine' && !item.applies,
    };
}
/** 计划全部动作 → 展示行（顺序 = 计划顺序，稳定）。 */
export function sessionLayoutPlanRows(plan) {
    if (plan === null)
        return [];
    return plan.actions.map(planRowOf);
}
/**
 * 计划里**要渲染**的行：只剔除 `ok`（「位置已经正确」是噪音）。
 *
 * 保留三类：真的会落盘的条（move）、被 keep 选择挡住的隔离条（用户正要去选）、
 * 以及规划器判定「只报告」的条（`skip`：缺 cwd / 加锁 / 多 generation 不一致）——
 * 界面必须如实说出「这几条本入口不动」。
 */
export function sessionLayoutPlanDisplayRows(plan) {
    return sessionLayoutPlanRows(plan).filter((row) => row.kind !== 'ok');
}
/** 计划里**将要执行**的条（move / rewrite-move / quarantine，且 applies）。 */
export function sessionLayoutPlanActionableRows(plan) {
    return sessionLayoutPlanRows(plan).filter((row) => row.applies && row.kind !== 'ok' && row.kind !== 'keep');
}
/** 某重复 id 的可选副本（`unitId` 列表，顺序 = 计划顺序）。 */
export function sessionLayoutKeepCandidates(plan, sessionId) {
    if (plan === null)
        return [];
    const out = [];
    for (const item of plan.actions) {
        if (item.sessionId !== sessionId)
            continue;
        if (item.kind !== 'quarantine' && item.kind !== 'keep')
            continue;
        if (!out.includes(item.unitId))
            out.push(item.unitId);
    }
    return out;
}
/**
 * keep 选择完整性（**判定只此一处**）。
 *
 * 重复 id 必须由用户显式选定保留哪一份：未选 ⇒ 不可提交（宿主也会拒绝 `missing-keep`）；
 * 选了但不在该 id 的候选副本里 ⇒ 同样不可提交（宿主 `keep-not-a-candidate`）。
 */
export function sessionLayoutKeepState(plan, keep) {
    if (plan === null)
        return { missing: [], complete: false, candidates: {} };
    const candidates = {};
    const missing = [];
    for (const sessionId of plan.needsKeep) {
        const options = sessionLayoutKeepCandidates(plan, sessionId);
        candidates[sessionId] = options;
        const picked = keep[sessionId];
        if (picked === undefined || !options.includes(picked))
            missing.push(sessionId);
    }
    return { missing, complete: missing.length === 0, candidates };
}
/**
 * 能否提交执行（**判定只此一处**，组件只读这个布尔量）：
 * 有计划 + 计划本身可用（ok）+ keep 选择已完整。任一不满足即不可提交。
 */
export function sessionLayoutPlanSubmittable(plan, keep) {
    return plan !== null && plan.ok && keep.complete;
}
/** 计划里被「只报告」的条数（缺 cwd / 加锁 / 多 generation 不一致），界面必须如实说明。 */
export function sessionLayoutPlanSkippedCount(plan) {
    if (plan === null)
        return 0;
    return plan.actions.filter((item) => item.kind === 'skip').length;
}
/** 状态 → 徽章语义（与 Badge 四态一一对应；**只报不修/回滚**绝不给 ok）。 */
export function sessionLayoutStatusBadgeKind(status) {
    if (status === 'moved')
        return 'ok';
    if (status === 'quarantined')
        return 'ok';
    if (status === 'kept')
        return 'info';
    if (status === 'rolledBack')
        return 'warn';
    if (status === 'skipped')
        return 'warn';
    return 'error';
}
/** 单条应用结果 → 状态（判定只此一处；组件不写这个分支）。 */
export function sessionLayoutItemStatus(item) {
    if (item.ok) {
        if (item.action === 'quarantine')
            return 'quarantined';
        if (item.action === 'keep')
            return 'kept';
        if (item.action === 'move' || item.action === 'rewrite-move')
            return 'moved';
        // 成功但类别未知：绝不当成「已归位」（宁可中性成功态也不谎称搬过）
        return 'kept';
    }
    if (item.rolledBack === false)
        return 'rollbackFailed';
    if (item.rolledBack === true)
        return 'rolledBack';
    if (item.action === 'skip')
        return 'skipped';
    return 'failed';
}
/** 应用结果 → 逐条展示项（组件只渲染）。 */
export function sessionLayoutApplyItems(result) {
    if (result === null)
        return [];
    return result.results.map((item) => {
        const status = sessionLayoutItemStatus(item);
        return {
            unitId: item.unitId,
            sessionId: item.sessionId,
            status,
            statusKey: SESSION_LAYOUT_STATUS_KEYS[status],
            badgeKind: sessionLayoutStatusBadgeKind(status),
            reasonKey: item.reason === undefined ? null : sessionLayoutReasonKey(item.reason),
            quarantineDir: item.quarantineDir ?? null,
            movedUnitId: item.movedUnitId ?? null,
            needsAttention: item.needsAttention === true,
        };
    });
}
export function sessionLayoutResultCounts(items) {
    let moved = 0;
    let quarantined = 0;
    let kept = 0;
    let skipped = 0;
    let failed = 0;
    let rolledBack = 0;
    let rollbackFailed = 0;
    for (const item of items) {
        if (item.status === 'moved')
            moved += 1;
        else if (item.status === 'quarantined')
            quarantined += 1;
        else if (item.status === 'kept')
            kept += 1;
        else if (item.status === 'skipped')
            skipped += 1;
        else if (item.status === 'rolledBack')
            rolledBack += 1;
        else if (item.status === 'rollbackFailed')
            rollbackFailed += 1;
        else
            failed += 1;
    }
    return { moved, quarantined, kept, skipped, failed, rolledBack, rollbackFailed, failedTotal: failed + rolledBack + rollbackFailed };
}
/**
 * 整体未执行的机器码 → 文案键（`reindex-unavailable` **不是**成功：
 * 宿主没给索引刷新端口时一条也不执行，界面必须如实说明「什么都没做」）。
 * 没有整体原因时返回 null（界面据此不渲染这一行）。
 */
export function sessionLayoutOverallReasonKey(reason) {
    if (reason === undefined || reason === '')
        return null;
    return sessionLayoutReasonKey(reason);
}
/* ------------------------------------------------- 文案键（config-manager-recovery） */
/** 动作类别 → 文案键。 */
export const SESSION_LAYOUT_KIND_KEYS = {
    ok: 'sessions.layout.kind.ok',
    move: 'sessions.layout.kind.move',
    'rewrite-move': 'sessions.layout.kind.rewriteMove',
    skip: 'sessions.layout.kind.skip',
    keep: 'sessions.layout.kind.keep',
    quarantine: 'sessions.layout.kind.quarantine',
    unknown: 'sessions.layout.kind.unknown',
};
/** 逐条状态 → 文案键。 */
export const SESSION_LAYOUT_STATUS_KEYS = {
    moved: 'sessions.layout.status.moved',
    quarantined: 'sessions.layout.status.quarantined',
    kept: 'sessions.layout.status.kept',
    skipped: 'sessions.layout.status.skipped',
    failed: 'sessions.layout.status.failed',
    rolledBack: 'sessions.layout.status.rolledBack',
    rollbackFailed: 'sessions.layout.status.rollbackFailed',
};
/** 计划原因（core 的 SessionRepairReason）+ 应用原因（E1 的 SessionLayoutApplyReason）+ 整体原因 → 文案键。 */
export const SESSION_LAYOUT_REASON_KEYS = {
    // 规划期（core/session-repair.ts）
    'no-cwd': 'sessions.layout.reason.noCwd',
    'inconsistent-generations': 'sessions.layout.reason.inconsistentGenerations',
    locked: 'sessions.layout.reason.locked',
    'already-placed': 'sessions.layout.reason.alreadyPlaced',
    'needs-move': 'sessions.layout.reason.needsMove',
    'needs-rewrite-move': 'sessions.layout.reason.needsRewriteMove',
    'duplicate-id': 'sessions.layout.reason.duplicateId',
    // 执行期（E1 session-layout-repair-service.ts）
    busy: 'sessions.layout.reason.busy',
    'missing-keep': 'sessions.layout.reason.missingKeep',
    'keep-not-a-candidate': 'sessions.layout.reason.keepNotACandidate',
    'target-exists': 'sessions.layout.reason.targetExists',
    'quarantine-exists': 'sessions.layout.reason.quarantineExists',
    'rewrite-failed': 'sessions.layout.reason.rewriteFailed',
    'missing-target-key': 'sessions.layout.reason.missingTargetKey',
    'move-failed': 'sessions.layout.reason.moveFailed',
    'reindex-failed': 'sessions.layout.reason.reindexFailed',
    'not-found': 'sessions.layout.reason.notFound',
    'io-error': 'sessions.layout.reason.ioError',
    // 整体未执行
    'reindex-unavailable': 'sessions.layout.reason.reindexUnavailable',
    'sessions-root-unreadable': 'sessions.layout.reason.sessionsRootUnreadable',
    unknown: 'sessions.layout.reason.unknown',
};
/** 机器可读原因 → 文案键（**未知一律回落 unknown，绝不把裸码渲染出去**）。 */
export function sessionLayoutReasonKey(reason) {
    if (reason !== undefined && Object.prototype.hasOwnProperty.call(SESSION_LAYOUT_REASON_KEYS, reason)) {
        return SESSION_LAYOUT_REASON_KEYS[reason];
    }
    return SESSION_LAYOUT_REASON_KEYS.unknown;
}
//# sourceMappingURL=session-layout-view.js.map