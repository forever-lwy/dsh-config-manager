import { type SectionMeta } from './section-registry.ts';
import type { SectionData, SectionId } from './types.ts';
export { SECTION_IDS, SECTION_JSON_PATHS, SECTION_FILE_PREFIXES, isFileSection, SECTION_REGISTRY, SECTION_DATA_VERSION, sectionMeta, sectionMetaOf, isSectionId, jsonPathOf, filePrefixOf, PORTABLE_SECTION_IDS, OPT_IN_SYNC_SECTION_IDS, DEFAULT_INCLUDED_SECTION_IDS, } from './section-registry.ts';
export type { SectionMeta, SectionPayload, SectionPortability, } from './section-registry.ts';
/**
 * 拿不到元数据就**显式失败**（绝不让未注册分区按其它分区语义继续）。
 * core 侧修正「未知分区静默记成 settingsNamespace」时用它替代 default 分支。
 *
 * t7：本函数原在 `section-registry.ts`；该模块受「只 import 一个类型」的零依赖铁律约束
 * （client bundle 侧 `ui/export-flow.ts` 也在用它），故把唯一的用户可见文案抛出点迁到本文件
 * （已持有本域消息目录）。public surface 不变：`config.ts` 与 `schema/index.ts` 仍照旧导出它。
 */
export declare function requireSectionMeta(id: string): SectionMeta;
/** 从 ZIP 内 JSON 解析分区数据（深度保护 + 结构校验） */
export declare function parseSectionJson<T extends SectionData>(sectionId: SectionId, raw: string): T;
export interface SectionIssue {
    path: string;
    message: string;
    severity: 'error' | 'warning';
}
/**
 * 分区数据结构基础校验（载荷版本 + 顶层形状）—— **由注册表驱动**：
 *  - 版本轴 → `versions.ts` 的 `sectionDataVersionIssue`（注册表 dataVersion 唯一来源）；
 *  - 形状 → `SECTION_REGISTRY[id].payload.kind` 判别联合穷尽 switch（新增载荷形态编译期可见）；
 *  - 未注册 id（只可能来自运行期强转）→ **显式报错**，绝不落到按其它分区语义处理的 default
 *    （历史缺陷在 `core/backup.ts` 的 `engineSnapshotEntry` default 分支：曾把未知分区静默记成
 *    settingsNamespace，导致该分区写入无法回滚；core/config-snapshot.ts:430 附近有对应修复注释）。
 */
export declare function validateSectionData(sectionId: SectionId, data: unknown): SectionIssue[];
