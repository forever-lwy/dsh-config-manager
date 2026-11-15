import { effectiveImportSelection } from './selection-model.js';
/** 初始态（idle）：轮询间隔缺省 5s（与 GitHub device flow 约定一致）。 */
export const INITIAL_MY_GITHUB_FLOW = {
    phase: 'idle', flowId: '', userCode: '', verificationUri: '', interval: 5, error: null,
};
/** 开始登录：进入 starting（清上一次错误）。 */
export function myGithubFlowStarting(prev) {
    return { ...prev, phase: 'starting', error: null };
}
/** 轮询请求进行中：进入 polling。 */
export function myGithubFlowPolling(prev) {
    return { ...prev, phase: 'polling' };
}
/** 宿主返回设备码：进入 waiting（携带 flowId / 用户码 / 授权页 / 轮询间隔）。 */
export function myGithubFlowFromStart(info) {
    return {
        phase: 'waiting',
        flowId: info.flowId,
        userCode: info.userCode,
        verificationUri: info.verificationUri,
        interval: info.interval,
        error: null,
    };
}
/** 首次轮询延时：宿主间隔（秒）→ ms；非正数/NaN 钳到 1 秒（防 0 延时空转）。 */
export function myGithubStartDelayMs(intervalSec) {
    const safe = Number.isFinite(intervalSec) ? intervalSec : 1;
    return Math.max(Math.floor(safe), 1) * 1000;
}
/** 后续轮询延时：宿主在轮询响应里给了 pollDelayMs 就用它，否则回落到 interval。 */
export function myGithubPollDelayMs(intervalSec, pollDelayMs) {
    if (typeof pollDelayMs === 'number' && Number.isFinite(pollDelayMs) && pollDelayMs > 0)
        return Math.floor(pollDelayMs);
    return myGithubStartDelayMs(intervalSec);
}
/** 由轮询响应状态得到三分结论（只认 pending/success，其余视为失败 —— 与既有一致）。 */
export function myGithubPollOutcome(status) {
    if (status === 'pending')
        return 'pending';
    if (status === 'success')
        return 'success';
    return 'failed';
}
/**
 * 一次轮询后的状态迁移（纯）：
 *  - pending → waiting 并给出下次轮询延时（宿主 pollDelayMs 优先，回落到 interval）；
 *  - success → 回到初始态（清设备码/错误），调用方随后刷新登录态与列表；
 *  - failed  → error 态 + 失败原因（调用方传入已 redact 的文案）。
 */
export function myGithubFlowAfterPoll(prev, poll, failureMessage) {
    const outcome = myGithubPollOutcome(poll.status);
    if (outcome === 'pending') {
        return { next: { ...prev, phase: 'waiting' }, outcome, delayMs: myGithubPollDelayMs(prev.interval, poll.pollDelayMs) };
    }
    if (outcome === 'success') {
        return { next: INITIAL_MY_GITHUB_FLOW, outcome, delayMs: null };
    }
    return { next: { ...prev, phase: 'error', error: failureMessage }, outcome, delayMs: null };
}
/** 失败（启动失败 / 轮询抛错）：进入 error 并记录原因（调用方传入前已 redact）。 */
export function myGithubFlowAfterFailure(prev, safeMessage) {
    return { ...prev, phase: 'error', error: safeMessage };
}
/** 取消登录：回到初始态，并回传需要通知宿主的 flowId（'' = 无需通知）。 */
export function myGithubFlowAfterCancel(prev) {
    return { flowId: prev.flowId, next: INITIAL_MY_GITHUB_FLOW };
}
/* ---------------------------------------------------------------- 收录/下架任务轮询步进 */
/** 收录任务轮询间隔（ms）：后台 fork + PR 约 2 分钟，3s 一轮足够轻。 */
export const MY_LISTING_POLL_INTERVAL_MS = 3000;
/** 收录任务轮询最大轮数（40 × 3s ≈ 2 分钟）；超时停止，用户可手动刷新/重新收录。 */
export const MY_LISTING_POLL_MAX_TICKS = 40;
/**
 * 轮询步进（纯）：给定本轮响应与已轮询轮数，算出「展示什么状态 / 是否停止 / 是否要告警 / 下一轮计数」。
 *
 * 三条分支必须分开（历史实现在组件体内，且把「请求抛错」与「远端明确回答 null」混在了一起）：
 *  - networkFailed=true（请求抛错）：不更新状态、不计告警，继续下一轮（直到上限）；
 *  - response===null（远端明确回答「没有该任务」：重启丢失/从未提交）：用 doneFallback 收尾并停止；
 *  - failed → 停止 **且** notifyFailure=true（调用方据此发常驻 Toast）；done/pending 见上。
 */
export function myListingPollStep(input) {
    const nextCount = input.count + 1;
    const exhausted = nextCount >= MY_LISTING_POLL_MAX_TICKS;
    if (input.networkFailed === true) {
        return { status: null, stop: exhausted, count: nextCount, notifyFailure: false };
    }
    const status = input.response ?? input.doneFallback;
    const notifyFailure = status.listing === 'failed';
    const terminal = input.response === null || status.listing !== 'pending';
    return { status, stop: terminal || exhausted, count: nextCount, notifyFailure };
}
/* ---------------------------------------------------------------- 展示派生 */
/** PR 链接来源（实时任务状态优先，其次向导结果）：url 为空 → null（不渲染链接）。 */
export function myPrLinkSource(live, result) {
    const liveUrl = live !== null && live.prUrl !== null && live.prUrl !== undefined && live.prUrl !== '' ? live.prUrl : null;
    const url = liveUrl ?? (result?.prUrl !== undefined && result.prUrl !== null && result.prUrl !== '' ? result.prUrl : null);
    if (url === null)
        return null;
    const number = live !== null && live.prNumber !== null && live.prNumber !== undefined
        ? live.prNumber
        : (result?.prNumber ?? null);
    return { url, number };
}
/** 条目仓库 URL：取条目自己的 repoUrl，缺失 → 兜底传入的默认仓库（供应链警示来源行）。 */
export function myEntryRepoUrl(entries, itemId, fallback) {
    const entry = entries.find((e) => e.id === itemId);
    const url = entry?.repoUrl;
    return url !== undefined && url !== null && url !== '' ? url : fallback;
}
/**
 * 装回本地向导的「编辑中勾选」：detail 未就绪 → null（不渲染勾选树）；
 * 否则走 selection-model.effectiveImportSelection（绑 zipPath，陈旧选择自动回落默认全选）。
 */
export function myPickerSelection(install) {
    const detail = install?.detail;
    if (detail === undefined || detail === null)
        return null;
    return effectiveImportSelection(detail.plan, detail.zipPath, install?.selectionState ?? null);
}
/**
 * 取消免责弹窗时是否要把向导重置回「一键上传」初始态：
 * 只有「用户点的是上传入口」且「向导仍停在 update 残留态」才重置（否则会凭空清掉别人的表单）。
 */
export function myShouldResetWizardOnDisclaimerCancel(action, wizardMode) {
    return action === 'upload' && wizardMode === 'update';
}
//# sourceMappingURL=my-configs-view.js.map