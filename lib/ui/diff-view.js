/** 块头文本（与 git unified diff 一致；UI 直接展示，不参与 i18n）。 */
export function hunkHeader(hunk) {
    return `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`;
}
function rowsOfHunk(hunk) {
    const rows = [];
    const lines = hunk.lines;
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (line === undefined)
            break;
        if (line.kind === 'context') {
            rows.push({ kind: 'context', left: line, right: line });
            i += 1;
            continue;
        }
        const dels = [];
        while (i < lines.length && lines[i]?.kind === 'del') {
            const current = lines[i];
            if (current !== undefined)
                dels.push(current);
            i += 1;
        }
        const adds = [];
        while (i < lines.length && lines[i]?.kind === 'add') {
            const current = lines[i];
            if (current !== undefined)
                adds.push(current);
            i += 1;
        }
        const pairs = Math.max(dels.length, adds.length);
        for (let k = 0; k < pairs; k += 1) {
            const left = dels[k] ?? null;
            const right = adds[k] ?? null;
            const kind = left !== null && right !== null ? 'change' : left !== null ? 'del' : 'add';
            rows.push({ kind, left, right });
        }
    }
    return rows;
}
/** hunks → 左右双栏渲染模型（每块带块头）。 */
export function toSideBySide(hunks) {
    return hunks.map((hunk) => ({ header: hunkHeader(hunk), rows: rowsOfHunk(hunk) }));
}
/**
 * 行号最大位数（双栏行号列宽的档位依据）：取实际渲染的行号里最长的那个，
 * 让行号列只占「最宽行号」需要的宽度，剩余空间全部留给代码列。
 */
export function maxLineDigits(hunks) {
    let max = 1;
    for (const hunk of hunks) {
        for (const line of hunk.lines) {
            if (line.oldNo !== null && line.oldNo > max)
                max = line.oldNo;
            if (line.newNo !== null && line.newNo > max)
                max = line.newNo;
        }
    }
    return String(max).length;
}
/** 行对总数（渲染层做「超长截断」提示时的分母）。 */
export function countSideRows(groups) {
    return groups.reduce((sum, group) => sum + group.rows.length, 0);
}
/**
 * 一侧的行数统计：**只数 unidiff 语义的增删行**（与 git 的 `+A −R` 同口径）。
 * 成对修改在 unidiff 里本来就是「一删一增」，所以这里不需要按行对再折算。
 */
export function diffLineCounts(hunks) {
    let added = 0;
    let removed = 0;
    for (const hunk of hunks) {
        for (const line of hunk.lines) {
            if (line.kind === 'add')
                added += 1;
            else if (line.kind === 'del')
                removed += 1;
        }
    }
    return { added, removed };
}
//# sourceMappingURL=diff-view.js.map