import type { ImportPlan } from '../core/types.ts';
import { type ImportSelectionState, type Selection } from './selection-model.ts';
/**
 * 「我的配置」视图的**框架无关纯逻辑**（t44：从 MyConfigsView.tsx 下沉，node 可测）。
 *
 * 为什么单独一个模块（审计 client-views F-02/F-05）：此前 GitHub device flow 状态机、收录轮询步进、
 * PR 链接来源与仓库 URL 兜底等**判定逻辑**都写在 React 组件体内 —— 组件不可导出、node 测不到，
 * 且违反仓库「业务逻辑必须放 src/ui/」铁律。本模块只放纯函数/纯数据：
 *  - 不 import React、不 import node 内置模块、不 import src/client/**（保持 ui 层只向下依赖）；
 *  - 不发起任何请求、不碰定时器（定时器由组件持有，本层只算「下一次什么时候」）；
 *  - 不新增文案：需要文案时由调用方传入已翻译好的字符串（失败消息）或使用既有 key 的 UiT。
 *
 * 与 src/client/market/my-configs-view.ts 的分工：那份是客户端的**渲染装配模型**（表单/向导切片/
 * 条目徽章等，也已 node 可测），本模块承接的是组件体内残留的状态机与派生计算。
 * 本文件刻意用**结构类型**描述输入（不 import 客户端/宿主模块的类型），既避免层级反向依赖，
 * 也让测试无需构造整套客户端模型。
 */
/**
 * device flow 阶段（与 src/client/sync/sync-view.ts 的 GithubLoginPhase 同构 ——
 * 结构完全一致，故可直接互传；此处自行声明以免 ui 层反向依赖 client 层）。
 */
export type MyGithubLoginPhase = 'idle' | 'starting' | 'waiting' | 'polling' | 'success' | 'error';
/** device flow 运行时状态（仅内存；token 只存宿主凭据槽，绝不在这里）。 */
export interface MyGithubFlowState {
    phase: MyGithubLoginPhase;
    flowId: string;
    userCode: string;
    verificationUri: string;
    /** 宿主给的轮询间隔（秒）；缺省 5 */
    interval: number;
    /** 失败原因（调用方传入前已 redact） */
    error: string | null;
}
/** 初始态（idle）：轮询间隔缺省 5s（与 GitHub device flow 约定一致）。 */
export declare const INITIAL_MY_GITHUB_FLOW: MyGithubFlowState;
/** 开始登录：进入 starting（清上一次错误）。 */
export declare function myGithubFlowStarting(prev: MyGithubFlowState): MyGithubFlowState;
/** 轮询请求进行中：进入 polling。 */
export declare function myGithubFlowPolling(prev: MyGithubFlowState): MyGithubFlowState;
/** 宿主返回设备码：进入 waiting（携带 flowId / 用户码 / 授权页 / 轮询间隔）。 */
export declare function myGithubFlowFromStart(info: {
    readonly flowId: string;
    readonly userCode: string;
    readonly verificationUri: string;
    readonly interval: number;
}): MyGithubFlowState;
/** 首次轮询延时：宿主间隔（秒）→ ms；非正数/NaN 钳到 1 秒（防 0 延时空转）。 */
export declare function myGithubStartDelayMs(intervalSec: number): number;
/** 后续轮询延时：宿主在轮询响应里给了 pollDelayMs 就用它，否则回落到 interval。 */
export declare function myGithubPollDelayMs(intervalSec: number, pollDelayMs?: number | null): number;
/** 轮询结果三分：pending（继续等）/ success（已登录）/ failed（其它一律失败）。 */
export type MyGithubPollOutcome = 'pending' | 'success' | 'failed';
/** 由轮询响应状态得到三分结论（只认 pending/success，其余视为失败 —— 与既有一致）。 */
export declare function myGithubPollOutcome(status: string): MyGithubPollOutcome;
/**
 * 一次轮询后的状态迁移（纯）：
 *  - pending → waiting 并给出下次轮询延时（宿主 pollDelayMs 优先，回落到 interval）；
 *  - success → 回到初始态（清设备码/错误），调用方随后刷新登录态与列表；
 *  - failed  → error 态 + 失败原因（调用方传入已 redact 的文案）。
 */
export declare function myGithubFlowAfterPoll(prev: MyGithubFlowState, poll: {
    readonly status: string;
    readonly pollDelayMs?: number | null;
}, failureMessage: string): {
    next: MyGithubFlowState;
    outcome: MyGithubPollOutcome;
    delayMs: number | null;
};
/** 失败（启动失败 / 轮询抛错）：进入 error 并记录原因（调用方传入前已 redact）。 */
export declare function myGithubFlowAfterFailure(prev: MyGithubFlowState, safeMessage: string): MyGithubFlowState;
/** 取消登录：回到初始态，并回传需要通知宿主的 flowId（'' = 无需通知）。 */
export declare function myGithubFlowAfterCancel(prev: MyGithubFlowState): {
    flowId: string;
    next: MyGithubFlowState;
};
/** 收录任务轮询间隔（ms）：后台 fork + PR 约 2 分钟，3s 一轮足够轻。 */
export declare const MY_LISTING_POLL_INTERVAL_MS = 3000;
/** 收录任务轮询最大轮数（40 × 3s ≈ 2 分钟）；超时停止，用户可手动刷新/重新收录。 */
export declare const MY_LISTING_POLL_MAX_TICKS = 40;
/**
 * 轮询步进（纯）：给定本轮响应与已轮询轮数，算出「展示什么状态 / 是否停止 / 是否要告警 / 下一轮计数」。
 *
 * 三条分支必须分开（历史实现在组件体内，且把「请求抛错」与「远端明确回答 null」混在了一起）：
 *  - networkFailed=true（请求抛错）：不更新状态、不计告警，继续下一轮（直到上限）；
 *  - response===null（远端明确回答「没有该任务」：重启丢失/从未提交）：用 doneFallback 收尾并停止；
 *  - failed → 停止 **且** notifyFailure=true（调用方据此发常驻 Toast）；done/pending 见上。
 */
export declare function myListingPollStep<S extends {
    listing: string;
}>(input: {
    /** 本轮响应；null = 远端明确回答「没有该任务」（≠ 网络失败） */
    readonly response: S | null;
    /** 本轮请求是否抛错（网络/超时）：与 response=null 语义不同，必须继续轮询 */
    readonly networkFailed?: boolean;
    /** 已轮询轮数（0 起） */
    readonly count: number;
    /** response=null 时的收尾状态（done 形态，由调用方构造以避免本层依赖宿主类型） */
    readonly doneFallback: S;
}): {
    status: S | null;
    stop: boolean;
    count: number;
    notifyFailure: boolean;
};
/** PR 链接来源（实时任务状态优先，其次向导结果）：url 为空 → null（不渲染链接）。 */
export declare function myPrLinkSource(live: {
    readonly prUrl?: string | null;
    readonly prNumber?: number | null;
} | null, result: {
    readonly prUrl?: string | null;
    readonly prNumber?: number | null;
} | null | undefined): {
    url: string;
    number: number | null;
} | null;
/** 条目仓库 URL：取条目自己的 repoUrl，缺失 → 兜底传入的默认仓库（供应链警示来源行）。 */
export declare function myEntryRepoUrl(entries: readonly {
    readonly id: string;
    readonly repoUrl?: string | null;
}[], itemId: string, fallback: string): string;
/**
 * 装回本地向导的「编辑中勾选」：detail 未就绪 → null（不渲染勾选树）；
 * 否则走 selection-model.effectiveImportSelection（绑 zipPath，陈旧选择自动回落默认全选）。
 */
export declare function myPickerSelection(install: {
    readonly detail: {
        readonly plan: ImportPlan | null;
        readonly zipPath: string | null;
    } | null;
    readonly selectionState: ImportSelectionState | null;
} | null | undefined): Selection | null;
/**
 * 取消免责弹窗时是否要把向导重置回「一键上传」初始态：
 * 只有「用户点的是上传入口」且「向导仍停在 update 残留态」才重置（否则会凭空清掉别人的表单）。
 */
export declare function myShouldResetWizardOnDisclaimerCancel(action: string | null, wizardMode: string): boolean;
