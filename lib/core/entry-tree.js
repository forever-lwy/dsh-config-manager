export const MISSING_ENTRY_ID = '<missing-id>';
export function entryTreeRows(entries) {
    const rows = [];
    const ancestors = new Set();
    const visit = (values) => {
        for (const value of values) {
            if (value === null || typeof value !== 'object' || Array.isArray(value) || ancestors.has(value))
                continue;
            const row = value;
            rows.push(row);
            if (row.group === true && Array.isArray(row.config)) {
                ancestors.add(value);
                visit(row.config);
                ancestors.delete(value);
            }
        }
    };
    visit(entries);
    return rows;
}
/** Counts allow a writer to distinguish existing defects from newly introduced ones. */
export function entryTreeIssues(entries) {
    const issues = new Map();
    const seen = new Set();
    for (const entry of entryTreeRows(entries)) {
        if (typeof entry.id !== 'string' || entry.id === '') {
            issues.set(MISSING_ENTRY_ID, (issues.get(MISSING_ENTRY_ID) ?? 0) + 1);
            continue;
        }
        const pureGroup = entry.group === true && Array.isArray(entry.config) && entry.name === undefined;
        const count = Number(seen.has(entry.id)) + Number(!pureGroup && (typeof entry.name !== 'string' || entry.name === ''));
        if (count > 0)
            issues.set(entry.id, (issues.get(entry.id) ?? 0) + count);
        seen.add(entry.id);
    }
    return issues;
}
//# sourceMappingURL=entry-tree.js.map