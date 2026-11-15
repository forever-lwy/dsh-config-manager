function isWorkspaces(data) {
    if (data === null || typeof data !== 'object')
        return false;
    const obj = data;
    return obj.version === 1 && Array.isArray(obj.workspaces);
}
function recordsById(list) {
    const map = new Map();
    for (const rec of list) {
        if (rec !== null && typeof rec === 'object' && typeof rec.id === 'string')
            map.set(rec.id, rec);
    }
    return map;
}
/** 深度判等（本分区只有标量与字符串数组，够用；不引入通用深比较的第二份实现）。 */
function sameValue(a, b) {
    if (a === b)
        return true;
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length)
            return false;
        for (let i = 0; i < a.length; i++)
            if (!sameValue(a[i], b[i]))
                return false;
        return true;
    }
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object')
        return false;
    const ao = a;
    const bo = b;
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
    for (const k of keys)
        if (!sameValue(ao[k], bo[k]))
            return false;
    return true;
}
/** sessionIds 并集：本地在前、远端新增按原序追加，按裸 id 去重。 */
function unionSessionIds(local, remote) {
    const out = [];
    const seen = new Set();
    for (const id of [...local, ...remote]) {
        if (typeof id !== 'string')
            continue;
        const key = id.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(id);
    }
    return out;
}
/**
 * 单个记录合并：字段级三方取舍 + sessionIds 并集。
 * @returns 合并后的记录与「相对本地改动的字段数」（供 autoMerged 计数）。
 */
function mergeRecord(id, local, remote, ancestor, conflicts) {
    const out = {};
    let changedFields = 0;
    const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
    for (const key of keys) {
        const lv = local[key];
        const rv = remote[key];
        const av = ancestor === undefined ? undefined : ancestor[key];
        let picked;
        if (key === 'id') {
            picked = id;
        }
        else if (key === 'sessionIds') {
            const union = unionSessionIds(Array.isArray(lv) ? lv : [], Array.isArray(rv) ? rv : []);
            if (!sameValue(union, lv))
                changedFields += 1;
            picked = union;
        }
        else if (sameValue(lv, rv)) {
            picked = lv;
        }
        else if (ancestor !== undefined && sameValue(lv, av)) {
            picked = rv; // 仅远端改了
            changedFields += 1;
        }
        else if (ancestor !== undefined && sameValue(rv, av)) {
            picked = lv; // 仅本地改了
        }
        else {
            // 双侧都改（或无祖先，无从判断谁改）→ 冲突，保留本地值供用户对照，绝不静默取舍
            conflicts.push({
                path: 'workspaces.' + id + '.' + key,
                kind: 'key',
                reason: ancestor === undefined ? 'no-ancestor' : 'both-modified',
                autoMergeAttempted: true,
                local: lv,
                remote: rv,
                ancestor: av,
            });
            picked = lv;
        }
        if (picked !== undefined)
            out[key] = picked;
    }
    return { rec: out, changedFields };
}
/** workspaces 分区记录级合并（`merge.ts` 的分区钩子）。 */
export const mergeWorkspacesSection = (local, remote, ancestor) => {
    if (!isWorkspaces(local) || !isWorkspaces(remote))
        return undefined;
    const a = isWorkspaces(ancestor) ? ancestor : undefined;
    const lMap = recordsById(local.workspaces);
    const rMap = recordsById(remote.workspaces);
    const aMap = a === undefined ? new Map() : recordsById(a.workspaces);
    // 记录顺序：本地既有顺序（用户看得见的稳定顺序）→ 远端新增 → 仅祖先有（等删除判定）
    const ids = [...lMap.keys()];
    for (const id of rMap.keys())
        if (!lMap.has(id))
            ids.push(id);
    for (const id of aMap.keys())
        if (!lMap.has(id) && !rMap.has(id))
            ids.push(id);
    const conflicts = [];
    const mergedRecords = [];
    let mergePoints = 0;
    for (const id of ids) {
        const l = lMap.get(id);
        const r = rMap.get(id);
        const anc = aMap.get(id);
        if (l !== undefined && r !== undefined) {
            const { rec, changedFields } = mergeRecord(id, l, r, anc, conflicts);
            mergedRecords.push(rec);
            mergePoints += changedFields;
            continue;
        }
        if (l !== undefined) {
            if (anc !== undefined && sameValue(l, anc))
                continue; // 远端删了、本地未改 → 跟随删除
            if (anc === undefined) {
                mergedRecords.push(l);
                continue;
            }
            conflicts.push({ path: 'workspaces.' + id, kind: 'key', reason: 'modify-delete', autoMergeAttempted: false, local: l, remote: undefined, ancestor: anc });
            mergedRecords.push(l);
            continue;
        }
        if (r !== undefined) {
            if (anc !== undefined && sameValue(r, anc))
                continue; // 本地删了、远端未改 → 跟随删除
            mergedRecords.push(r);
            mergePoints += 1; // 远端新增（或本地已删、远端改过：保留远端记录并记并入）
            continue;
        }
    }
    return { merged: { version: 1, workspaces: mergedRecords }, conflicts, mergePoints };
};
//# sourceMappingURL=workspace-merge.js.map