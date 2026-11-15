import { isHighRiskAdapter, isPlanItemExcluded, planAdapters, sectionsFromPlan, unitLabel, } from './selection-model.js';
/** 计划的纯诊断项（不写盘，不进选择列表，也不进逐项摘要）。 */
function isDiagnostic(item) {
    return item.kind === 'Warning' || item.kind === 'MissingDependency' || item.kind === 'Error';
}
/** 市场条目计划 → 级联树节点（与导入页同一个 sectionsFromPlan，不另写一套分组规则）。 */
export function marketPickerNodes(plan) {
    return plan === null ? [] : sectionsFromPlan(plan);
}
export function marketChangeRows(plan, selection) {
    const rows = [];
    for (const item of plan.items) {
        if (isDiagnostic(item))
            continue;
        rows.push({
            id: item.id,
            adapter: item.adapter,
            kind: item.kind,
            label: item.label ?? unitLabel(item.unitId ?? item.id, item.adapter),
            ...(item.detail !== undefined ? { detail: item.detail } : {}),
            highRisk: isHighRiskAdapter(item.adapter),
            selected: !isPlanItemExcluded(item, selection),
        });
    }
    return rows;
}
export function marketSelectionSummary(plan, selection) {
    let selected = 0;
    let total = 0;
    let willChange = 0;
    let unchanged = 0;
    let highRiskSelected = 0;
    let conflicts = 0;
    for (const item of plan.items) {
        if (isDiagnostic(item))
            continue;
        total += 1;
        if (isPlanItemExcluded(item, selection))
            continue;
        selected += 1;
        if (item.kind === 'Skip')
            unchanged += 1;
        else
            willChange += 1;
        if (item.kind === 'Conflict')
            conflicts += 1;
        if (isHighRiskAdapter(item.adapter))
            highRiskSelected += 1;
    }
    return { selected, total, willChange, unchanged, highRiskSelected, conflicts, canImport: selected > 0 };
}
/**
 * 已勾选且属高风险的分区（就地警示；顺序 = 计划中首次出现顺序）。
 * 只在**确有勾选项**时才报告 —— 未勾选的高风险分区不触发警示（它什么都不会写）。
 */
export function selectedHighRiskSections(plan, selection) {
    const out = [];
    for (const item of plan.items) {
        if (!isHighRiskAdapter(item.adapter))
            continue;
        if (isPlanItemExcluded(item, selection))
            continue;
        if (!out.includes(item.adapter))
            out.push(item.adapter);
    }
    return out;
}
/** 计划里的冲突项（逐项决策的输入；与导入向导 ConflictCollector 同一份数据源）。 */
export function marketConflictItems(plan) {
    return (plan?.items ?? []).filter((i) => i.kind === 'Conflict');
}
/**
 * 逐项冲突决策 → 市场条目的重计划决定集。
 *
 * 市场通道沿用与导入向导同一条路径：**决策变化后交给宿主重算计划**
 * （`createImportPlan(zipPath, decisions)`），而不是在 UI 里手改 planItem.kind ——
 * 后者等于把 analyzer 的 applyItemResolution 抄一份到前端，两处必然漂移。
 * strategy 固定 merge：市场通道不提供全局策略选择（与导入页一致，导入页也没有该控件）。
 */
export function marketDecisions(resolutions) {
    return { strategy: 'merge', resolutions, pathMappings: [] };
}
/** 当前计划涉及到的步骤序列（界面与「上一步/下一步」共读这一份，不各写一套判断）。 */
export function marketReviewSteps(hasConflicts) {
    return hasConflicts
        ? ['preview', 'select', 'conflicts', 'confirm', 'result']
        : ['preview', 'select', 'confirm', 'result'];
}
/** 下一步（末步返回末步）。 */
export function nextMarketStep(step, hasConflicts) {
    const steps = marketReviewSteps(hasConflicts);
    const i = steps.indexOf(step);
    return steps[Math.min(i + 1, steps.length - 1)] ?? step;
}
/** 上一步（首步返回首步）。 */
export function prevMarketStep(step, hasConflicts) {
    const steps = marketReviewSteps(hasConflicts);
    const i = steps.indexOf(step);
    return steps[Math.max(i - 1, 0)] ?? step;
}
export function marketUnitIndex(plan, selection) {
    const index = new Map();
    for (const item of plan.items) {
        if (isDiagnostic(item))
            continue;
        const unitId = item.unitId ?? item.id;
        let info = index.get(unitId);
        if (info === undefined) {
            info = { unitId, adapter: item.adapter, willChange: 0, unchanged: 0, selected: false, highRisk: false };
            index.set(unitId, info);
        }
        if (isHighRiskAdapter(item.adapter))
            info.highRisk = true;
        if (isPlanItemExcluded(item, selection))
            continue;
        info.selected = true;
        if (item.kind === 'Skip')
            info.unchanged += 1;
        else
            info.willChange += 1;
    }
    return index;
}
/** 按筛选档过滤树节点；单元判定全部来自 marketUnitIndex（组件里不重算）。 */
export function filterPickerNodes(nodes, index, filter) {
    if (filter === 'all')
        return [...nodes];
    const keep = (unitId) => {
        const info = index.get(unitId);
        if (info === undefined)
            return false;
        if (filter === 'willChange')
            return info.selected && info.willChange > 0;
        if (filter === 'highRisk')
            return info.highRisk;
        return !info.selected;
    };
    const out = [];
    for (const node of nodes) {
        const units = node.units.filter((u) => keep(u.id));
        // 不可细分分区（units 为空）在筛选态一律保留：它没有单元可判断，藏起来只会让人以为分区消失了
        if (node.units.length === 0 || units.length > 0)
            out.push({ ...node, units });
    }
    return out;
}
export function marketSectionSummaries(plan, selection) {
    const index = marketUnitIndex(plan, selection);
    const rows = marketChangeRows(plan, selection);
    const out = [];
    for (const adapter of planAdapters(plan)) {
        const units = [...index.values()].filter((u) => u.adapter === adapter);
        const items = rows.filter((r) => r.adapter === adapter);
        if (units.length === 0 && items.length === 0)
            continue;
        out.push({
            section: adapter,
            selectedUnits: units.filter((u) => u.selected).length,
            totalUnits: units.length,
            willChange: items.filter((r) => r.selected && r.kind !== 'Skip').length,
            unchanged: items.filter((r) => r.selected && r.kind === 'Skip').length,
            highRisk: units.some((u) => u.highRisk),
        });
    }
    return out;
}
//# sourceMappingURL=market-import.js.map