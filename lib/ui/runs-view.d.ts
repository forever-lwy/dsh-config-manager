/**
 * 运行中心（Run Center）纯渲染模型：把宿主 /runs 的 RunState 列表变成「一张卡片 + 一次决策」。
 *
 * 为什么单独一层：卡片要区分「在跑 / 在等人 / 已结束」，决策框要算「已应用多少 / 剩下多少」
 * 并给出默认选项 —— 这些判据都必须可单测（UI 分层铁律：逻辑在 src/ui，React 壳只装配）。
 *
 * 三条设计约束（读码得出，不是偏好）：
 *  1. **可终止 ≠ 所有 run**：只有导入引擎实现了「计划项边界协作式取消」（/runs/cancel）；
 *     其余 run 类型（同步/恢复/备份/自动同步）没有安全点，UI 必须如实禁用而不是给个假按钮。
 *  2. **待决策态优先于一切**：pendingDecision 非空时 run 并没有卡住，它在等人 —— 卡片必须显性提示，
 *     否则用户会以为任务死了（这正是「终止需弹窗」的功能入口）。
 *  3. **默认选项跟随既有偏好**：用户此前勾过「失败不回滚」（rollbackOnError=false）时，决策框默认落在
 *     「保留已应用项」；没勾过则默认「回滚」。不推翻用户已有的心智，也不替他做更危险的选择。
 */
import type { RunKind, RunState } from '../core/run-registry.ts';
import type { ImportLogCounts } from './import-log.ts';
/** 终止决策（与宿主 /runs/cancel/decision 的取值一一对应）。 */
export type CancelDecision = 'rollback' | 'keep';
/** 一张运行卡片的纯数据模型（文案一律给 key，由壳层翻译）。 */
export interface RunCardModel {
    runId: string;
    kind: RunKind;
    /** 卡片标题 key（`runs.kind.<kind>`）。 */
    kindLabelKey: string;
    status: 'running' | 'done' | 'failed';
    /** 状态徽章 key（`runs.status.<status>`；待决策时另由 awaitingDecision 覆盖显示）。 */
    statusLabelKey: string;
    /** 已到安全点、等用户选「回滚 / 保留」。 */
    awaitingDecision: boolean;
    /** 可手动终止（只有导入支持计划项边界协作式取消；已请求过就不再显示按钮）。 */
    canCancel: boolean;
    /**
     * 已请求终止、正等当前计划项结束（null = 未请求）。
     * `stuck` = 等待超过阈值 → 界面必须从「请稍候」升级为「给出路」。
     */
    cancelWait: {
        minutes: number;
        stuck: boolean;
    } | null;
    /** 可「跳过当前插件」（仅导入的插件安装阶段有意义）。 */
    canSkip: boolean;
    /** 进度（item/itemTotal 优先；导出用 section 计数）。 */
    progress: {
        labelKey: string;
        section: string | null;
        item: number | null;
        itemTotal: number | null;
        detail: string | null;
        percent: number | null;
    };
    /** 日志聚合计数（无日志时为 null）。 */
    counts: ImportLogCounts | null;
    /** 需要用户关注的项数（警告 + 失败）。 */
    problems: number;
    /** 最近日志行（已截断；供折叠查看，不含敏感内容：宿主侧落账前已 redact）。 */
    logTail: string[];
    updatedAt: number;
    /**
     * 「最近一次更新」的相对时间（复用 overview.time.* 字典）。
     * 为什么需要：没有它，「进行中」和「三小时前就结束的僵尸卡片」在界面上长得一模一样，
     * 用户只能得出「一直在加载」的结论（真机报告）。
     */
    time: {
        key: string;
        params?: {
            n: string;
        };
    };
}
/** 日志尾部保留行数（卡片里只给「最近发生了什么」，完整日志在所属页面）。 */
export declare const RUN_CARD_LOG_TAIL = 8;
/**
 * 终止请求等多久算「可能卡住」（2 分钟）。
 * 为什么要有阈值：协作式取消只能等到**项边界**，而插件安装可以跑几十分钟。
 * 2 分钟内大概率是在装插件（正常），超过就该把出路摆到用户面前（跳过当前项 / 重启），
 * 否则用户只能一遍遍点「终止…」——而那个按钮此刻已经没有任何作用了。
 */
export declare const CANCEL_STUCK_AFTER_MS: number;
/**
 * 相对时间（纯函数，now 显式传入 → 可单测）：刚刚 / N 分钟前 / N 小时前 / N 天前。
 * 键复用 config-manager 字典里既有的 overview.time.*（同字典，不新造文案）。
 */
export declare function relativeTimeLabel(updatedAt: number, now: number): {
    key: string;
    params?: {
        n: string;
    };
};
/** RunState[] → 卡片模型（按 updatedAt 倒序；终态与进行中同列，由 status 区分）。 */
export declare function runCards(runs: readonly RunState[], opts?: {
    logTail?: number;
    now?: number;
}): RunCardModel[];
/** 状态栏 / 面板徽章用的计数。 */
export declare function runSummary(runs: readonly RunState[]): {
    running: number;
    awaiting: number;
    total: number;
};
/** 终止决策框模型。 */
export interface CancelDialogModel {
    runId: string;
    kindLabelKey: string;
    /** 已经应用的计划项数（引擎回传的 executed 长度不可得，故用进度计数近似并如实标注）。 */
    appliedCount: number | null;
    /** 计划项总数（null = 宿主未上报）。 */
    totalCount: number | null;
    /** 未执行项数（total - applied；无法计算时 null）。 */
    pendingCount: number | null;
    defaultDecision: CancelDecision;
    options: {
        id: CancelDecision;
        labelKey: string;
        descKey: string;
    }[];
}
/**
 * 终止决策框模型。默认选项跟随用户既有的 rollbackOnError 偏好：
 * 勾过「失败不回滚」→ 默认保留（与他的心智一致）；否则默认回滚（安全侧）。
 */
export declare function cancelDialogModel(run: Pick<RunState, 'runId' | 'kind' | 'item' | 'itemTotal'>, opts: {
    defaultRollbackOnError: boolean;
}): CancelDialogModel;
