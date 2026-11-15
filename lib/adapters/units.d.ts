/**
 * 分区内「最小可拆单元」的共享判定（Phase 1 条目级导出选择）。
 *
 * 为什么需要「单元」这一层：文件类分区（skills / agentPresets / sessions / pluginFiles / self）
 * 不能按裸文件勾选 —— 一个技能目录 bundle 拆开就失效，一个会话目录拆开就不再是会话。
 * 所以「哪些文件属于同一个可勾选整体」是 adapter 的知识，由本模块提供默认规则。
 *
 * 单元 id 规则（与导入侧 PlanItem.id 同一命名空间，保证「导出的勾选」将来可复用到导入）：
 *   - 文件类：<section>:<单元相对路径>
 *   - 插件：  plugin:<包名> / patch:<行 id> / plugins:patch:<rel> / plugins:pnpm-workspace
 *   - 工作区：workspace:<记录 id>
 *
 * 本模块全部为纯函数：零 I/O，因此预览端点可以在零额外读盘的前提下枚举单元
 * （输入即 export() 的产物，不需要第二次遍历目录/读文件）。
 */
import type { ExportUnit } from '../core/types.ts';
/** 相对路径归一化为 POSIX（反斜杠 → 正斜杠），保证单元 id 跨平台稳定。 */
export declare function toPosixRel(rel: string): string;
/** 文件类分区的默认单元 = 首个路径段（目录 bundle 整体成一个单元；平铺文件 = 自身）。 */
export declare function defaultUnitId(rel: string): string;
/**
 * 白名单判定：allow === undefined = 未指定 → 全量导出（向后兼容，旧调用方零改动）；
 * 空数组 = 什么都不允许（调用方应把该分区整体视为未勾选，见 Exporter.export）。
 */
export declare function unitAllowed(allow: readonly string[] | undefined, id: string): boolean;
/** 由「成员文件」归并出单元清单（体积 = 成员文件字节合计；零 I/O）。 */
export declare function unitsFromFiles(sectionId: string, files: readonly {
    relativePath: string;
    data: Uint8Array;
}[], unitIdOf: (rel: string) => string): ExportUnit[];
/**
 * 由「路径 + 已知体积」归并出单元清单（零 I/O）。
 *
 * 为什么要有这一份：只读预览（`/export-preview`）拿不到文件内容（也不该读），体积来自
 * `ctx.fs.statSize`。若预览改用「data 为空的 FilesSection」喂 `unitsFromFiles`，
 * 每个单元的体积会变成 0，选择器显示的体积全错。两份实现必须**同一套聚合规则**，
 * 否则预览与导出会算出不同的单元体积（`file-collection.test.ts` 钉住两者逐项相等）。
 */
export declare function unitsFromEntries(sectionId: string, entries: readonly {
    relativePath: string;
    sizeBytes: number;
}[], unitIdOf: (rel: string) => string): ExportUnit[];
/**
 * JSON / 记录型分区的单元体积 = 该条目在包里的 UTF-8 字节数。
 *
 * 与文件类不同，这里不需要读盘：条目本身就是 export() 的产物，直接量它的序列化长度，
 * 预览与导出因此天然同口径（同一个函数量同一个对象）。
 */
export declare function entryByteSize(value: unknown): number;
/**
 * 按单元白名单过滤条目（JSON / 记录型分区共用）。
 *
 * allow === undefined = 未指定 → 全量（旧调用方 / 旧备份零改动）；空数组 = 一条都不留。
 * 与 unitAllowed 同一判据，只是作用在整批条目上。
 */
export declare function filterByUnits<T>(items: readonly T[], allow: readonly string[] | undefined, idOf: (item: T) => string): T[];
/** 记录型分区的单元清单：一个顶层键 = 一个单元（零 I/O；体积 = 条目序列化长度）。 */
export declare function recordUnits<V>(sectionId: string, record: Record<string, V>, detailOf?: (value: V, key: string) => string | undefined): ExportUnit[];
/** 记录型分区的白名单过滤（键 → 单元 id 由 idOf 决定，与 recordUnits 同一规则）。 */
export declare function pickRecord<V>(record: Record<string, V>, allow: readonly string[] | undefined, idOf: (key: string) => string): Record<string, V>;
