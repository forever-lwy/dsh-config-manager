/** 应用用户冲突决策 + 全局策略（纯函数，返回新数组）。语义与导入路径逐条一致。 */
export function applyItemResolution(item, decisions, msg) {
    if (item.kind !== 'Conflict')
        return item;
    const resolution = decisions.resolutions[item.id];
    if (resolution === 'keepCurrent') {
        return { ...item, kind: 'Skip', severity: 'info', detail: `${item.detail ?? ''}${msg('import.conflictKeepCurrent')}` };
    }
    if (resolution === 'useImported') {
        // decidedBy: 'item' —— 来源是用户对该计划项的逐项决策（写回守卫据此允许清空被剥空叶子）
        return { ...item, kind: 'Update', severity: 'info', conflict: { itemId: item.id, resolution, decidedBy: 'item' } };
    }
    // review / 未决策：按全局策略兜底
    if (decisions.strategy === 'skipExisting') {
        return { ...item, kind: 'Skip', severity: 'info', detail: `${item.detail ?? ''}${msg('import.conflictSkipExisting')}` };
    }
    if (decisions.strategy === 'replace') {
        return { ...item, kind: 'Update', severity: 'info', detail: `${item.detail ?? ''}${msg('import.conflictReplace')}` };
    }
    return item; // merge + 未决策 → 保持 Conflict，由报告列明
}
//# sourceMappingURL=conflict-decisions.js.map