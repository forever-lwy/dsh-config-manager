/** 相对路径归一化为 POSIX（反斜杠 → 正斜杠），保证单元 id 跨平台稳定。 */
export function toPosixRel(rel) {
    return rel.replace(/\\/g, '/');
}
/** 文件类分区的默认单元 = 首个路径段（目录 bundle 整体成一个单元；平铺文件 = 自身）。 */
export function defaultUnitId(rel) {
    const p = toPosixRel(rel);
    const i = p.indexOf('/');
    return i === -1 ? p : p.slice(0, i);
}
/**
 * 白名单判定：allow === undefined = 未指定 → 全量导出（向后兼容，旧调用方零改动）；
 * 空数组 = 什么都不允许（调用方应把该分区整体视为未勾选，见 Exporter.export）。
 */
export function unitAllowed(allow, id) {
    return allow === undefined || allow.includes(id);
}
/** 由「成员文件」归并出单元清单（体积 = 成员文件字节合计；零 I/O）。 */
export function unitsFromFiles(sectionId, files, unitIdOf) {
    return unitsFromEntries(sectionId, files.map((f) => ({ relativePath: f.relativePath, sizeBytes: f.data.byteLength })), unitIdOf);
}
/**
 * 由「路径 + 已知体积」归并出单元清单（零 I/O）。
 *
 * 为什么要有这一份：只读预览（`/export-preview`）拿不到文件内容（也不该读），体积来自
 * `ctx.fs.statSize`。若预览改用「data 为空的 FilesSection」喂 `unitsFromFiles`，
 * 每个单元的体积会变成 0，选择器显示的体积全错。两份实现必须**同一套聚合规则**，
 * 否则预览与导出会算出不同的单元体积（`file-collection.test.ts` 钉住两者逐项相等）。
 */
export function unitsFromEntries(sectionId, entries, unitIdOf) {
    const byUnit = new Map();
    for (const f of entries) {
        const unit = unitIdOf(f.relativePath);
        const cur = byUnit.get(unit) ?? { count: 0, size: 0 };
        cur.count += 1;
        cur.size += f.sizeBytes;
        byUnit.set(unit, cur);
    }
    return [...byUnit.entries()].map(([unit, agg]) => ({
        id: sectionId + ':' + unit,
        label: unit,
        fileCount: agg.count,
        sizeBytes: agg.size,
    }));
}
/**
 * JSON / 记录型分区的单元体积 = 该条目在包里的 UTF-8 字节数。
 *
 * 与文件类不同，这里不需要读盘：条目本身就是 export() 的产物，直接量它的序列化长度，
 * 预览与导出因此天然同口径（同一个函数量同一个对象）。
 */
export function entryByteSize(value) {
    return new TextEncoder().encode(JSON.stringify(value) ?? '').byteLength;
}
/**
 * 按单元白名单过滤条目（JSON / 记录型分区共用）。
 *
 * allow === undefined = 未指定 → 全量（旧调用方 / 旧备份零改动）；空数组 = 一条都不留。
 * 与 unitAllowed 同一判据，只是作用在整批条目上。
 */
export function filterByUnits(items, allow, idOf) {
    if (allow === undefined)
        return [...items];
    return items.filter((item) => allow.includes(idOf(item)));
}
/** 记录型分区的单元清单：一个顶层键 = 一个单元（零 I/O；体积 = 条目序列化长度）。 */
export function recordUnits(sectionId, record, detailOf) {
    return Object.entries(record).map(([key, value]) => {
        const unit = { id: sectionId + ':' + key, label: key, sizeBytes: entryByteSize(value) };
        const detail = detailOf?.(value, key);
        if (detail !== undefined && detail !== '')
            unit.detail = detail;
        return unit;
    });
}
/** 记录型分区的白名单过滤（键 → 单元 id 由 idOf 决定，与 recordUnits 同一规则）。 */
export function pickRecord(record, allow, idOf) {
    const out = {};
    for (const [key, value] of Object.entries(record)) {
        if (unitAllowed(allow, idOf(key)))
            out[key] = value;
    }
    return out;
}
//# sourceMappingURL=units.js.map