/**
 * 版本判定 —— 集中唯一出口（对齐 Docs/design/architecture.md §10.3）。
 *
 * 业务代码零版本判断：所有模块一律通过本文件函数判定，
 * 任何 `if (v === 1)` 式散落判断均为禁止项。
 *
 * 本文件管**两条版本轴**：
 *  1. bundle/Export Schema 版本（`CURRENT_SCHEMA_VERSION`，整个备份包格式）；
 *  2. 分区载荷版本（`sectionDataVersion` 一族，单个分区 JSON 的结构版本）——
 *     唯一来源是 `section-registry.ts` 各分区条目的 `dataVersion`，
 *     历史上有 11 处 `data.version !== 1` 字面量，现已收敛到此处两个函数。
 */
import { schemaMsg } from './messages.js';
import { SECTION_REGISTRY } from './section-registry.js';
/** 当前 Export Schema 版本（v1 起点；未来随迁移链演进） */
export const CURRENT_SCHEMA_VERSION = 1;
/** 本插件支持导入的最低 schema 版本 */
export const MIN_SUPPORTED_SCHEMA_VERSION = 1;
/** 版本不受支持（过新或过旧）时的错误；携带版本号便于 UI 提示升级/更新备份 */
export class UnsupportedSchemaError extends Error {
    version;
    constructor(version, message = `Export schema version ${version} is not supported (current: ${CURRENT_SCHEMA_VERSION})`) {
        super(message);
        this.name = 'UnsupportedSchemaError';
        this.version = version;
    }
}
/** 恰好是当前版本 */
export function isCurrent(v) {
    return v === CURRENT_SCHEMA_VERSION;
}
/** 版本在支持范围内（含需要迁移的旧版本） */
export function isSupported(v) {
    return v >= MIN_SUPPORTED_SCHEMA_VERSION && v <= CURRENT_SCHEMA_VERSION;
}
/** 旧版本：低于当前但仍在支持范围内 → 需要沿迁移链升级 */
export function needsMigration(v) {
    return v >= MIN_SUPPORTED_SCHEMA_VERSION && v < CURRENT_SCHEMA_VERSION;
}
/** 过新版本：高于当前 → 必须升级本插件才能导入 */
export function isTooNew(v) {
    return v > CURRENT_SCHEMA_VERSION;
}
/** 是否可导入（当前版本或可迁移的旧版本） */
export function canImport(v) {
    return isCurrent(v) || needsMigration(v);
}
/** 版本的可读描述（报告/日志用） */
export function describeVersion(v) {
    if (isTooNew(v))
        return schemaMsg('schema.versionTooNew', { version: v, current: CURRENT_SCHEMA_VERSION });
    if (needsMigration(v))
        return schemaMsg('schema.versionNeedsMigration', { version: v, current: CURRENT_SCHEMA_VERSION });
    if (isCurrent(v))
        return schemaMsg('schema.versionCurrent', { version: v });
    return schemaMsg('schema.versionBelowMinimum', { version: v, minimum: MIN_SUPPORTED_SCHEMA_VERSION });
}
/* ---------------------------------------------------------------- 分区载荷版本（第二条版本轴） */
/** 某分区的载荷版本（唯一来源：注册表 `dataVersion`） */
export function sectionDataVersion(sectionId) {
    return SECTION_REGISTRY[sectionId].dataVersion;
}
/**
 * 分区载荷版本是否受支持。
 * 当前语义：必须**恰好等于**注册表登记的版本（与历史 `data.version !== 1` 等价，但零字面量）；
 * 未来若要支持「旧版本可迁移」的多版本区间，只改这里，调用方不动。
 */
export function isSupportedSectionDataVersion(sectionId, version) {
    return typeof version === 'number' && version === SECTION_REGISTRY[sectionId].dataVersion;
}
/** 分区载荷版本问题描述（合法 → null）。文案与历史 `validateSectionData` 逐字一致。 */
export function sectionDataVersionIssue(sectionId, version) {
    if (isSupportedSectionDataVersion(sectionId, version))
        return null;
    return schemaMsg('schema.sectionDataVersionMismatch', { section: sectionId, expected: SECTION_REGISTRY[sectionId].dataVersion, actual: String(version) });
}
//# sourceMappingURL=versions.js.map