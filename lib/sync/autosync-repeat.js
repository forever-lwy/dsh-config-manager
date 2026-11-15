function sortedList(ids) {
    return ids === undefined ? '' : [...ids].sort().join(',');
}
/**
 * 返回本轮历史签名；null = 本轮必须照常记录（见文件头的不去重清单）。
 * 签名只用于进程内比较，永不落盘，故用 \u0000 分隔以避免字段拼接歧义。
 */
export function repeatHistorySignature(channel, entry) {
    if (entry.status === 'success' || entry.status === 'failed')
        return null;
    if (entry.pushedSnapshotId !== undefined || entry.pulledSnapshotId !== undefined)
        return null;
    return [
        channel,
        entry.status,
        entry.direction,
        entry.skipReason ?? '',
        sortedList(entry.conflictedSections),
        sortedList(entry.appliedSections),
        entry.error ?? '',
    ].join('\u0000');
}
//# sourceMappingURL=autosync-repeat.js.map