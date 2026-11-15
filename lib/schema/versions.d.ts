import type { SectionId } from './types.ts';
/** 当前 Export Schema 版本（v1 起点；未来随迁移链演进） */
export declare const CURRENT_SCHEMA_VERSION: 1;
/** 本插件支持导入的最低 schema 版本 */
export declare const MIN_SUPPORTED_SCHEMA_VERSION: 1;
/** 版本不受支持（过新或过旧）时的错误；携带版本号便于 UI 提示升级/更新备份 */
export declare class UnsupportedSchemaError extends Error {
    readonly version: number;
    constructor(version: number, message?: string);
}
/** 恰好是当前版本 */
export declare function isCurrent(v: number): boolean;
/** 版本在支持范围内（含需要迁移的旧版本） */
export declare function isSupported(v: number): boolean;
/** 旧版本：低于当前但仍在支持范围内 → 需要沿迁移链升级 */
export declare function needsMigration(v: number): boolean;
/** 过新版本：高于当前 → 必须升级本插件才能导入 */
export declare function isTooNew(v: number): boolean;
/** 是否可导入（当前版本或可迁移的旧版本） */
export declare function canImport(v: number): boolean;
/** 版本的可读描述（报告/日志用） */
export declare function describeVersion(v: number): string;
/** 某分区的载荷版本（唯一来源：注册表 `dataVersion`） */
export declare function sectionDataVersion(sectionId: SectionId): number;
/**
 * 分区载荷版本是否受支持。
 * 当前语义：必须**恰好等于**注册表登记的版本（与历史 `data.version !== 1` 等价，但零字面量）；
 * 未来若要支持「旧版本可迁移」的多版本区间，只改这里，调用方不动。
 */
export declare function isSupportedSectionDataVersion(sectionId: SectionId, version: unknown): boolean;
/** 分区载荷版本问题描述（合法 → null）。文案与历史 `validateSectionData` 逐字一致。 */
export declare function sectionDataVersionIssue(sectionId: SectionId, version: unknown): string | null;
