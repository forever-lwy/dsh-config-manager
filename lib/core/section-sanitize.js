/**
 * 扫描 + 剥离 + （如实现）归属标注。
 *
 * @param adapter 分区适配器；未实现 `annotateRedactions` 时行为与直接 `scanAndRedact` 逐字相同。
 */
export function sanitizeSectionData(adapter, scanner, data) {
    const scanned = scanner.scanAndRedact(data);
    const annotate = adapter?.annotateRedactions;
    if (annotate === undefined)
        return { sanitized: scanned.sanitized, hits: scanned.hits };
    return { sanitized: annotate.call(adapter, scanned.sanitized, scanned.hits), hits: scanned.hits };
}
//# sourceMappingURL=section-sanitize.js.map