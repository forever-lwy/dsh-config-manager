import { hashSection } from './sync-state.js';
/** 分区导出载荷 → 分区哈希（推送上行 / 本地观测共用；与 sync-state 记的基线同口径） */
export function hashSections(sections) {
    const out = {};
    for (const [sid, data] of Object.entries(sections)) {
        if (data === undefined)
            continue;
        out[sid] = hashSection(data);
    }
    return out;
}
/** 是否「有观测」（undefined / 空对象都算没有：空集合无法证伪任何内容） */
function hasObservation(hashes) {
    return hashes !== undefined && hashes !== null && Object.keys(hashes).length > 0;
}
/**
 * 远端快照内容 vs 对照观测（`local` 优先，缺省用 `baseline`）。
 *
 * @param remote 远端快照元数据（transport.list() 的元素；`undefined` = 远端没有快照/列表读不到）
 * @param baseline 上次记录的**远端**分区哈希（sync-state.lastRemoteSections）
 * @param local 本次刚导出的本地分区哈希（推送路径用；拉取路径不传）
 */
export function diffSnapshotContent(remote, baseline, local) {
    const reference = local ?? baseline;
    if (remote === undefined || remote === null)
        return { changed: false, reason: 'unknown' };
    const remoteHashes = remote.sections;
    // 加密快照的 sections 恒为空对象（transport.ts:53-55）→ 无从比较，回落 id。
    if (!hasObservation(remoteHashes))
        return { changed: false, reason: 'unknown' };
    if (!hasObservation(reference))
        return { changed: false, reason: 'unknown' };
    // 键集对称：任一侧缺键都算内容变了（新增/收窄分区的推送必须产生新快照）。
    for (const sid of Object.keys(remoteHashes)) {
        const recorded = reference[sid];
        if (recorded === undefined || recorded !== remoteHashes[sid]) {
            return { changed: true, reason: 'content-changed' };
        }
    }
    for (const sid of Object.keys(reference)) {
        if (remoteHashes[sid] === undefined)
            return { changed: true, reason: 'content-changed' };
    }
    return { changed: false, reason: 'same-content' };
}
//# sourceMappingURL=content-diff.js.map