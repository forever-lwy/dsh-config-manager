/**
 * 历史 fork 归位（t17）—— 把「有父会话、但**账内不含它**」的旧子会话收回到它该在的工作区。
 *
 * 背景（t10 真机复核）：本机 887 条有父会话的子会话里 58 条是回退 fork，其中能解析到已注册工作区的
 * 是 **58/58**，但只有 3 条在账内 —— 其余全部停在侧栏「未分组」。t10 的修复只管**新建** fork，
 * 历史遗留不会自动回收；本模块提供一次**显式触发**的归位动作（不是后台自动跑）。
 *
 * 三条纪律（逐条对应验收）：
 *  ① **判据只有一份**：cwd 解析 / 成员判定 / attach / 复核全部由宿主注入的 seam 提供 ——
 *     就是 t10 已落地的 `DshSessionStoreFacade.attachChildToParentWorkspace`（成员 / 血缘 / cwd 同目录三档
 *     + 写后 `list()` 复核）。core **不 import 宿主入口**（架构守卫），也不另写第二套 attach：
 *     第二套判据迟早与第一套漂移。
 *  ② **只读盘点 + 逐个归位 + 逐个复核**，逐条回执（attached / already / refused + **具体**理由）；
 *     任何一条失败都不静默 —— 异常也收成一条 refused（reason=`unexpected-error`）。
 *  ③ **绝不猜、绝不删、绝不动会话日志字节**：本模块自己不碰文件系统（IO 全在 seam 里），
 *     候选只认「有 `parentSession` 的子会话」；能不能归位由 seam 按 cwd/成员事实判定。
 *
 * 为什么收成「一次动作」而不是后台自动跑：归位是**写**（改工作区成员），必须由用户显式触发；
 * 而且它只影响侧栏分组观感，不该在后台悄悄改用户数据。
 */
/**
 * 回执列表上限。
 *
 * 为什么有界：候选是「本机全部有父会话的子会话」（真机 887 条），逐条回执全量回传会让响应体
 * 无谓地大；计数（attached/already/refused 与理由分布）**恒为精确值**，截断只影响明细列表。
 */
export const FORK_RECONCILE_RECEIPT_LIMIT = 500;
/** 一条候选 → 回执（分类只认 seam 给的事实，绝不从「看起来成功」推断）。 */
function receiptOf(child, outcome) {
    if (outcome.ok) {
        return {
            sessionId: child.sessionId,
            parentSessionId: child.parentSessionId,
            status: outcome.status === 'already' ? 'already' : 'attached',
            reason: outcome.status === 'already' ? 'already-attached' : 'attached',
            workspaceId: outcome.workspaceId ?? null,
        };
    }
    const receipt = {
        sessionId: child.sessionId,
        parentSessionId: child.parentSessionId,
        status: 'refused',
        reason: outcome.reason,
        workspaceId: null,
    };
    if (outcome.detail !== undefined)
        receipt.detail = outcome.detail;
    return receipt;
}
/**
 * 一次历史 fork 归位：只读盘点 → 逐个归位 → 逐个复核（复核在 seam 内，写后重读 `list()`）。
 *
 * **顺序执行**（不并发）：归位是写动作，且逐条失败理由要能按顺序对上号；候选规模（真机数百条）
 * 与每条的成本（一次 registry 读 + 一次 attach + 一次复核读）都不值得为并发牺牲可读性。
 */
export async function reconcileForkSessions(deps, options = {}) {
    const empty = {
        ok: false,
        scanned: 0,
        candidates: 0,
        attached: 0,
        already: 0,
        refused: 0,
        reasonCounts: {},
        skipped: { subagent: 0 },
        receipts: [],
        receiptsTruncated: false,
    };
    let listed;
    try {
        listed = await deps.childSessions();
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        deps.log?.('fork-reconcile: childSessions failed: ' + detail);
        return { ...empty, error: 'child-sessions-unavailable: ' + detail };
    }
    // 候选 = 有父会话的子会话（去重；形状不符的噪声项只计入 scanned）
    const candidates = [];
    const seen = new Set();
    let skippedSubagent = 0;
    for (const item of listed) {
        const sessionId = item?.sessionId;
        const parentSessionId = item?.parentSessionId;
        if (typeof sessionId !== 'string' || sessionId === '')
            continue;
        if (typeof parentSessionId !== 'string' || parentSessionId === '')
            continue;
        if (sessionId === parentSessionId)
            continue;
        if (seen.has(sessionId))
            continue;
        seen.add(sessionId);
        candidates.push(item.subagent === true
            ? { sessionId, parentSessionId, subagent: true }
            : { sessionId, parentSessionId });
    }
    const attempted = options.skipSubagentSessions === true
        ? candidates.filter((child) => child.subagent !== true)
        : candidates;
    skippedSubagent = candidates.length - attempted.length;
    if (skippedSubagent > 0) {
        deps.log?.('fork-reconcile: skipped ' + String(skippedSubagent) + ' subagent sessions (explicit narrowing)');
    }
    const receipts = [];
    const reasonCounts = {};
    let attached = 0;
    let already = 0;
    let refused = 0;
    let truncated = false;
    for (const child of attempted) {
        let outcome;
        try {
            outcome = await deps.reconcileOne(child);
        }
        catch (error) {
            // 一条失败绝不影响其余（逐条互不影响），且**如实记一条 refused**
            const detail = error instanceof Error ? error.message : String(error);
            deps.log?.('fork-reconcile: ' + child.sessionId + ' threw: ' + detail);
            outcome = { ok: false, reason: 'unexpected-error', detail };
        }
        const receipt = receiptOf(child, outcome);
        if (receipt.status === 'attached')
            attached += 1;
        else if (receipt.status === 'already')
            already += 1;
        else {
            refused += 1;
            reasonCounts[receipt.reason] = (reasonCounts[receipt.reason] ?? 0) + 1;
            deps.log?.('fork-reconcile: ' + child.sessionId + ' refused: ' + receipt.reason + (receipt.detail !== undefined ? ' ' + receipt.detail : ''));
        }
        if (receipts.length < FORK_RECONCILE_RECEIPT_LIMIT)
            receipts.push(receipt);
        else
            truncated = true;
    }
    return {
        ok: true,
        scanned: listed.length,
        candidates: attempted.length,
        attached,
        already,
        refused,
        reasonCounts,
        skipped: { subagent: skippedSubagent },
        receipts,
        receiptsTruncated: truncated,
    };
}
//# sourceMappingURL=fork-reconcile.js.map