import { SECTION_IDS, SECTION_REGISTRY, sectionMetaOf } from '../schema/section-registry.js';
/**
 * 分区风险映射 —— **注册表的派生视图**（t34 起分级值声明在 `SectionMeta.riskTier`）。
 * 保留本导出只为既有调用方（sync/risk.test.ts、UI）不改 import 路径；分级本身只声明一次。
 * 编译期保证：`SectionMeta.riskTier` 是必填字段且注册表是 `Record<SectionId, SectionMeta>`，
 * 因此新增分区漏填 riskTier **编译失败** —— 不存在「默认 low」的静默兜底
 * （静默默认会让新分区被自动应用，是安全侧最坏结果）。
 */
export const SECTION_RISK_TIER = Object.fromEntries(SECTION_IDS.map((id) => [id, SECTION_REGISTRY[id].riskTier]));
/**
 * 取分区风险等级：**先过注册表**（分区集合的唯一来源）再取分级。
 * 未注册 id（远端快照 manifest 可携带任意字符串）→ undefined，调用方一律按「待审」处理
 * （classifyMergePlan 已如此），绝不落回某个默认等级被自动应用。
 */
export function riskTierOf(id) {
    return sectionMetaOf(id)?.riskTier;
}
/** 风险等级序（用于「等级 ≤ 阈值」比较；high 永不满足自动应用，因为阈值上限就是 medium）。 */
const TIER_RANK = { low: 0, medium: 1, high: 2 };
/** 该风险等级是否在允许自动落盘的阈值之内。 */
export function tierWithinAutoApply(tier, maxAutoTier) {
    return TIER_RANK[tier] <= TIER_RANK[maxAutoTier];
}
/**
 * 按风险等级 + firstSync 标志将 MergePlan 分流到三组。
 * 纯函数：相同输入 → 相同输出；不读 fs、不发网络。
 */
export function classifyMergePlan(plan, opts) {
    const autoApply = [];
    const review = [];
    const skipped = [];
    const maxAutoTier = opts.maxAutoTier ?? 'low';
    for (const r of plan.sections) {
        // 跳过：决策为 skip（远端缺且本地未改 / 完全无变化）
        if (r.decision === 'skip') {
            skipped.push(r);
            continue;
        }
        // 双向冲突永远进 review（最高优先级）
        if (r.decision === 'conflict') {
            review.push(r);
            continue;
        }
        // 首次同步强制预览：所有非 skip 项一律进 review
        if (opts.firstSync) {
            review.push(r);
            continue;
        }
        // 先过注册表（分区集合唯一来源）再取分级；未注册分区一律进 review 而非自动应用
        const tier = riskTierOf(r.id);
        if (tier === undefined) {
            review.push(r);
            continue;
        }
        if (tierWithinAutoApply(tier, maxAutoTier)) {
            // 决策明确（useRemote / keepLocal / merge）且等级在阈值内 → 自动应用
            autoApply.push(r);
        }
        else {
            // 超过阈值（缺省阈值下即 medium / high）→ 待审
            review.push(r);
        }
    }
    return { autoApply, review, skipped };
}
export function summarizeApplyPlan(apply) {
    return {
        autoApplyCount: apply.autoApply.length,
        reviewCount: apply.review.length,
        skippedCount: apply.skipped.length,
        totalCount: apply.autoApply.length + apply.review.length + apply.skipped.length,
    };
}
//# sourceMappingURL=risk.js.map