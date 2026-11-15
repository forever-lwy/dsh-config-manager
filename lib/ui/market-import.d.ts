/**
 * 市场通道导入审阅模型（纯函数，零依赖，node 可测）。
 *
 * 定位：市场通道（浏览条目详情 / 我的配置→装回本地）与本地导入向导**共用同一套选择内核**
 * （`selection-model.ts` 的 Selection / sectionsFromPlan / buildSelectedPlan）。本模块只补两件
 * 市场特有、导入页没有的展示关切 —— 它们不是第二套选择逻辑：
 *
 *  1. 条目计划的**逐项摘要**（「本次将改动什么」，且随勾选实时变化）；
 *  2. **已勾选的高风险分区**清单（就地警示：市场条目来自公共仓库，未经审核）。
 *
 * 为什么市场不再有「高风险默认不勾」：用户 2026-09 决定市场导入与导入页行为完全一致
 * （默认全选、全选含高风险），风险由「就地警示 + 免责声明 + 快照回滚」承担，
 * 而不是靠一个容易被误读为「这些内容不会导入」的默认勾选态。原市场专用的
 * `MarketApprovals` 布尔批准表已随之删除。
 */
import type { ImportPlan, ImportDecisions, ItemResolution, PlanItem, PlanItemKind } from '../core/types.ts';
import type { SectionId } from '../schema/types.ts';
import { type Selection, type SelectionSection } from './selection-model.ts';
/** 市场条目计划 → 级联树节点（与导入页同一个 sectionsFromPlan，不另写一套分组规则）。 */
export declare function marketPickerNodes(plan: ImportPlan | null): SelectionSection[];
/** 逐项「本次将改动什么」行（按计划顺序；渲染前 label/detail 均须再过 redact）。 */
export interface MarketChangeRow {
    /** 计划项 id（React key / 去重） */
    id: string;
    adapter: SectionId;
    kind: PlanItemKind;
    /** 展示名：宿主给的单元名优先，回退单元 id / 计划项 id */
    label: string;
    detail?: string;
    highRisk: boolean;
    /** 该项当前是否会被写入（false = 用户取消勾选，将不写入） */
    selected: boolean;
}
export declare function marketChangeRows(plan: ImportPlan, selection: Selection): MarketChangeRow[];
/** 选择感知的计数摘要（导入按钮旁与确认提示用；与执行口径同源 —— 同一个 isPlanItemExcluded）。 */
export interface MarketSelectionSummary {
    /** 当前会写入的项数 */
    selected: number;
    /** 可勾选项总数（不含诊断项） */
    total: number;
    /** 其中属新建/更新/安装/冲突（即真正会改动配置的） */
    willChange: number;
    /** 其中属「已一致」（Skip） */
    unchanged: number;
    /** 已勾选项里涉及高风险分区的项数 */
    highRiskSelected: number;
    /** 未决策冲突项（kind === 'Conflict' 且被勾选） */
    conflicts: number;
    /** 是否存在至少一个会写入的项（K-07「全不选」守卫） */
    canImport: boolean;
}
export declare function marketSelectionSummary(plan: ImportPlan, selection: Selection): MarketSelectionSummary;
/**
 * 已勾选且属高风险的分区（就地警示；顺序 = 计划中首次出现顺序）。
 * 只在**确有勾选项**时才报告 —— 未勾选的高风险分区不触发警示（它什么都不会写）。
 */
export declare function selectedHighRiskSections(plan: ImportPlan, selection: Selection): SectionId[];
/** 计划里的冲突项（逐项决策的输入；与导入向导 ConflictCollector 同一份数据源）。 */
export declare function marketConflictItems(plan: ImportPlan | null): PlanItem[];
/**
 * 逐项冲突决策 → 市场条目的重计划决定集。
 *
 * 市场通道沿用与导入向导同一条路径：**决策变化后交给宿主重算计划**
 * （`createImportPlan(zipPath, decisions)`），而不是在 UI 里手改 planItem.kind ——
 * 后者等于把 analyzer 的 applyItemResolution 抄一份到前端，两处必然漂移。
 * strategy 固定 merge：市场通道不提供全局策略选择（与导入页一致，导入页也没有该控件）。
 */
export declare function marketDecisions(resolutions: Record<string, ItemResolution>): ImportDecisions;
/** 审阅步骤（顺序即界面顺序；conflicts 仅在确有冲突项时出现）。 */
export type MarketReviewStep = 'preview' | 'select' | 'conflicts' | 'confirm' | 'result';
/** 当前计划涉及到的步骤序列（界面与「上一步/下一步」共读这一份，不各写一套判断）。 */
export declare function marketReviewSteps(hasConflicts: boolean): MarketReviewStep[];
/** 下一步（末步返回末步）。 */
export declare function nextMarketStep(step: MarketReviewStep, hasConflicts: boolean): MarketReviewStep;
/** 上一步（首步返回首步）。 */
export declare function prevMarketStep(step: MarketReviewStep, hasConflicts: boolean): MarketReviewStep;
/**
 * 单元级索引：把一个单元下的全部计划项归并成「将改动 / 已一致 / 未勾选 / 高风险」四件事。
 * 树内徽章与选择步筛选**共用这一份判定**，且与执行口径同源（同一个 isPlanItemExcluded）。
 */
export interface MarketUnitInfo {
    unitId: string;
    adapter: SectionId;
    /** 该单元下会写盘的项数（已勾选且 kind !== 'Skip'） */
    willChange: number;
    /** 该单元下「本机已一致」的项数（已勾选且 kind === 'Skip'） */
    unchanged: number;
    /** 该单元是否会被导入（至少一项未被排除） */
    selected: boolean;
    highRisk: boolean;
}
export declare function marketUnitIndex(plan: ImportPlan, selection: Selection): Map<string, MarketUnitInfo>;
/** 选择步的筛选档（只影响渲染，不改变勾选语义：全选本来就作用于当前可见集合）。 */
export type MarketPickerFilter = 'all' | 'willChange' | 'highRisk' | 'unselected';
/** 按筛选档过滤树节点；单元判定全部来自 marketUnitIndex（组件里不重算）。 */
export declare function filterPickerNodes(nodes: readonly SelectionSection[], index: ReadonlyMap<string, MarketUnitInfo>, filter: MarketPickerFilter): SelectionSection[];
/** 详情步的**分区级小结**（逐项摘要降维：一行一个分区，不再一次铺 61 行）。 */
export interface MarketSectionSummary {
    section: SectionId;
    selectedUnits: number;
    totalUnits: number;
    willChange: number;
    unchanged: number;
    highRisk: boolean;
}
export declare function marketSectionSummaries(plan: ImportPlan, selection: Selection): MarketSectionSummary[];
