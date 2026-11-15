/** 组定义（顺序即渲染顺序）。 */
const GROUP_DEFS = [
    { key: 'changes', statuses: ['modified', 'added'] },
    { key: 'deletes', statuses: ['deleted'] },
    { key: 'plugins', statuses: ['plugin'] },
    { key: 'hints', statuses: ['hint'] },
    { key: 'skips', statuses: ['skip'] },
];
/** 文件内容类动作（可展开逐行对照）。 */
export function isDiffableKind(kind) {
    return kind === 'hostFileRestore' || kind === 'fileRestore' || kind === 'hostFileRemove' || kind === 'fileRemove';
}
/** 无统计时的状态推断（旧宿主：还原类按「修改」展示，真实状态在打开 diff 后以宿主返回为准）。 */
function statusOfKind(kind) {
    switch (kind) {
        case 'hostFileRestore':
        case 'fileRestore':
            return 'modified';
        case 'hostFileRemove':
        case 'fileRemove':
            return 'deleted';
        case 'pluginRemove':
        case 'pluginInstall':
            return 'plugin';
        case 'credentialHint':
            return 'hint';
        default:
            return 'skip';
    }
}
/** 由 changeSummary 建索引（按 plan.actions 下标关联）。 */
function summaryByIndex(summary) {
    const map = new Map();
    for (const entry of summary?.entries ?? [])
        map.set(entry.index, entry);
    return map;
}
/** 恢复计划 → 分组视图 + 统计。 */
export function toRestorePlanView(plan, summary) {
    const byIndex = summaryByIndex(summary);
    const rows = plan.actions.map((action, index) => {
        const entry = byIndex.get(index);
        return {
            index,
            kind: action.kind,
            status: entry?.status ?? statusOfKind(action.kind),
            target: action.target,
            blobPath: action.blobPath,
            description: action.description,
            detail: action.detail,
            beforeExists: entry?.beforeExists ?? false,
            afterExists: entry?.afterExists ?? false,
            beforeBytes: entry?.beforeBytes,
            afterBytes: entry?.afterBytes,
            added: entry?.added,
            removed: entry?.removed,
            statSkipped: entry?.statSkipped,
            diffable: isDiffableKind(action.kind) && action.target !== undefined,
            summarized: entry !== undefined,
        };
    });
    const groups = [];
    for (const def of GROUP_DEFS) {
        const items = rows.filter((row) => def.statuses.includes(row.status));
        if (items.length === 0)
            continue;
        let added = 0;
        let removed = 0;
        let counted = 0;
        for (const item of items) {
            if (item.added !== undefined || item.removed !== undefined) {
                added += item.added ?? 0;
                removed += item.removed ?? 0;
                counted += 1;
            }
        }
        groups.push({ key: def.key, statuses: def.statuses, rows: items, added, removed, counted });
    }
    let modified = 0;
    let addedFiles = 0;
    let deleted = 0;
    let plugins = 0;
    let hints = 0;
    let skips = 0;
    let unstatted = 0;
    for (const row of rows) {
        if (row.status === 'modified')
            modified += 1;
        else if (row.status === 'added')
            addedFiles += 1;
        else if (row.status === 'deleted')
            deleted += 1;
        else if (row.status === 'plugin')
            plugins += 1;
        else if (row.status === 'hint')
            hints += 1;
        else
            skips += 1;
        if (row.diffable && row.added === undefined && row.removed === undefined)
            unstatted += 1;
    }
    return {
        groups,
        summarized: summary !== undefined,
        budgetExhausted: summary?.budgetExhausted ?? false,
        stats: {
            changed: modified + addedFiles,
            added: addedFiles,
            modified,
            deleted,
            plugins,
            hints,
            skips,
            addedLines: groups.reduce((sum, group) => sum + group.added, 0),
            removedLines: groups.reduce((sum, group) => sum + group.removed, 0),
            unstatted,
        },
    };
}
/** 打开某个文件后，用宿主返回的真实状态覆盖推断状态（返回新分组，便于 React 直接替换）。 */
export function withLoadedStatus(view, index, status, added, removed) {
    const rows = view.groups.flatMap((group) => group.rows);
    const target = rows.find((row) => row.index === index);
    if (target === undefined || target.status === status) {
        if (target === undefined)
            return view;
        return {
            ...view,
            groups: view.groups.map((group) => ({
                ...group,
                rows: group.rows.map((row) => (row.index === index ? { ...row, added, removed } : row)),
            })),
        };
    }
    // 状态变化（例如推断为 modified、实际是 added）→ 重新分组
    const patched = rows.map((row) => (row.index === index ? { ...row, status, added, removed } : row));
    const groups = [];
    for (const def of GROUP_DEFS) {
        const items = patched.filter((row) => def.statuses.includes(row.status));
        if (items.length === 0)
            continue;
        let addedSum = 0;
        let removedSum = 0;
        let counted = 0;
        for (const item of items) {
            if (item.added !== undefined || item.removed !== undefined) {
                addedSum += item.added ?? 0;
                removedSum += item.removed ?? 0;
                counted += 1;
            }
        }
        groups.push({ key: def.key, statuses: def.statuses, rows: items, added: addedSum, removed: removedSum, counted });
    }
    return { ...view, groups };
}
//# sourceMappingURL=restore-plan-view.js.map