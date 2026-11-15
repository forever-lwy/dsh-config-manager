/**
 * m-sync-flow：分级自动应用策略 + 首次强制预览（纯函数）。
 *
 * 数据源：P2a 的 MergePlan（每分区 decision + conflicts）。
 * 产出：SyncApplyPlan 三组（autoApply / review / skipped），供 SyncEngine.applyMergePlan 与 UI 使用。
 *
 * 规则：
 *  - 风险等级由**分区注册表**逐分区声明（`section-registry.ts` 的 `SectionMeta.riskTier`，必填）；
 *    本模块只做分流，`SECTION_RISK_TIER` 是注册表的派生视图（保留给既有调用方）；
 *  - 双向 conflict 分区永远进 review（无论风险与 firstSync 与否）；
 *  - firstSync=true 时所有非 skip 项一律进 review（安全第一：人工确认后才开启自动）；
 *  - firstSync=false 时按风险等级分流：决策明确（useRemote / keepLocal / **merge** 即三方精细
    合并成功）且「风险等级 ≤ maxAutoTier」的分区进 autoApply；超过阈值的、high、双向冲突 → review；
    skip 或无变化 → skipped。
 *  - 'merge' 与 useRemote/keepLocal 同等对待：它的 merged 是双方改动的合并结果（不是单侧原值）。
 *
 * maxAutoTier（真·自动同步，2026-10）：
 *  - 缺省 'low' = 改造前的口径（只有低风险分区自动落盘），既有调用方（预览/UI）行为不变；
 *  - 自动同步按用户配置传 'medium' ⇒ plugins / mcp 的中风险改动也自动落盘。
 *    这是用户拍板的产品决策：不改这条，「同步所有更改」就只是句口号（中风险分区永远停在待确认）。
 *  - **high 永远不参与自动应用**：类型上就只允许 low|medium，杜绝「传 high 顺手放行全部」。
 */
import type { MergePlan, MergeSectionResult } from './merge.ts';
import type { SectionId } from '../schema/types.ts';
import { type SectionRiskTier } from '../schema/section-registry.ts';
/**
 * 分区风险等级（驱动自动应用 vs 待审）—— 兼容别名：定义域在注册表（`SectionRiskTier`）。
 */
export type RiskTier = SectionRiskTier;
/**
 * 分区风险映射 —— **注册表的派生视图**（t34 起分级值声明在 `SectionMeta.riskTier`）。
 * 保留本导出只为既有调用方（sync/risk.test.ts、UI）不改 import 路径；分级本身只声明一次。
 * 编译期保证：`SectionMeta.riskTier` 是必填字段且注册表是 `Record<SectionId, SectionMeta>`，
 * 因此新增分区漏填 riskTier **编译失败** —— 不存在「默认 low」的静默兜底
 * （静默默认会让新分区被自动应用，是安全侧最坏结果）。
 */
export declare const SECTION_RISK_TIER: Readonly<Record<SectionId, RiskTier>>;
/**
 * 取分区风险等级：**先过注册表**（分区集合的唯一来源）再取分级。
 * 未注册 id（远端快照 manifest 可携带任意字符串）→ undefined，调用方一律按「待审」处理
 * （classifyMergePlan 已如此），绝不落回某个默认等级被自动应用。
 */
export declare function riskTierOf(id: SectionId): RiskTier | undefined;
export interface ClassifyOptions {
    /**
     * true = 首次同步：所有非 skip 项一律进 review（无论风险等级）；
     * false（默认）= 按风险等级分流。
     * 调用方在 SyncEngine 中维护 firstSyncCompleted 标志。
     */
    firstSync: boolean;
    /**
     * 允许自动落盘的最高风险等级（缺省 'low' = 改造前的行为）。
     *
     * 只有自动同步路径会传 'medium'（用户在配置里显式选的，缺省也是 medium）；
     * high 在类型层面就被排除 —— 那不是「配置项」，是安全边界。
     */
    maxAutoTier?: 'low' | 'medium';
}
/** 该风险等级是否在允许自动落盘的阈值之内。 */
export declare function tierWithinAutoApply(tier: RiskTier, maxAutoTier: 'low' | 'medium'): boolean;
/** 自动应用三组结果（互斥：同一 sectionId 只出现在一组） */
export interface SyncApplyPlan {
    autoApply: MergeSectionResult[];
    review: MergeSectionResult[];
    skipped: MergeSectionResult[];
}
/**
 * 按风险等级 + firstSync 标志将 MergePlan 分流到三组。
 * 纯函数：相同输入 → 相同输出；不读 fs、不发网络。
 */
export declare function classifyMergePlan(plan: MergePlan, opts: ClassifyOptions): SyncApplyPlan;
/**
 * 分流摘要计数（供 UI 徽章显示）。
 * 同一函数复用：纯函数无副作用。
 */
export interface SyncApplySummary {
    autoApplyCount: number;
    reviewCount: number;
    skippedCount: number;
    totalCount: number;
}
export declare function summarizeApplyPlan(apply: SyncApplyPlan): SyncApplySummary;
