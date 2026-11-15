/**
 * 报告渲染（规范 §21 导出报告 / §22 导入报告 / §17 回滚报告，m6-ui）。
 *
 * 纯文本渲染：输出用户可读的多行文本（未来 React 客户端可直接替换为组件渲染）。
 * 导入报告按分区统计：从 ExecutedItem.itemId 前缀推断所属分区（与 adapters 的 id 规则一致）。
 */
import type { SectionId } from '../schema/types.ts';
import type { ExecutedItem, ExportReport, ImportResult, RollbackReport } from '../core/types.ts';
import type { ImportResultAction, ImportSectionStat } from './types.ts';
import type { UiT } from './i18n.ts';
/**
 * 一个分区的 counts → 一行中文计数文本（如「18 个命名空间，3 条说明」）。
 * 空 counts → 空串（调用方按「—」渲染，不要在这里编一个 0）。
 */
export declare function exportCountsText(counts: Record<string, number>, t: UiT): string;
export declare function renderExportReport(report: ExportReport, t: UiT): string;
/** 从 itemId 前缀推断所属分区（与 adapters id 规则对齐；未知归 'other'） */
export declare function sectionFromItemId(itemId: string): SectionId | 'other';
/** 按分区聚合执行结果（统计 + 明细） */
export declare function importSectionStats(executed: readonly ExecutedItem[]): ImportSectionStat[];
/** 导入结果总数（跨分区合计口径；结果页顶部「总览」徽章用，替代逐分区 `settings: 6✓ 12≈` 天书）。 */
export interface ImportTotals {
    ok: number;
    skipped: number;
    warned: number;
    failed: number;
    /** 需要用户关注的项数 = 警告 + 失败（跳过是「按预期未写」，不算问题）。 */
    problems: number;
}
/** 汇总 executed 的总数（与 importSectionStats 同源口径：ok / skipped / warning / failed）。 */
export declare function importTotals(executed: readonly ExecutedItem[]): ImportTotals;
/** 结果页「需要你关注」清单条目（失败 / 警告项 + 所属分区）。 */
export interface ImportProblem {
    section: SectionId | 'other';
    itemId: string;
    status: 'failed' | 'warning';
    message?: string;
}
/**
 * 跨分区抽出失败 / 警告项（保持执行顺序）。
 *
 * 为什么需要：原先这些项的原因只以纯文本行埋在 `renderImportReport` 的等宽块里
 * （`  说明: 插件 x 安装失败…`），用户看到「⚠ 5 需要注意」却不知道是哪 5 个；结构化
 * 清单直接把「哪一项 + 什么原因」摆出来。
 */
export declare function importProblems(executed: readonly ExecutedItem[]): ImportProblem[];
/** 导入报告渲染（含回滚状态；§22 动作按钮由 suggestedActions 给出） */
export declare function renderImportReport(result: ImportResult, t: UiT): string;
/** 结果页动作按钮（§22）。报告已内联展示全部失败/警告项的原因与回滚详情（§23），
 * 不再提供空操作的 Fix Issues / View Details 按钮——仅保留「完成」。 */
export declare function suggestedActions(_result: ImportResult): ImportResultAction[];
/** 回滚报告渲染（full / partial + 人工恢复清单） */
export declare function renderRollbackReport(rr: RollbackReport, t: UiT): string;
/**
 * 字节 → 人类可读体积（B / KB / MB / GiB）。
 *
 * 口径与 `session-inventory-view.ts` 的 `formatSessionBytes` 对齐，但后缀沿用报告既有的
 * KB/MB 写法（报告文本曾被测试与文档引用）：
 *   - 非有限值（NaN/Infinity）或负数 → 空串：此前 `NaN` 会渲染成「NaN MB」，把缺数据
 *     伪装成 0 体积之外的另一条假信息（审计 P10-2）；
 *   - ≥1 GiB 单独一档：`2048.0 MB` 让用户自己换算，且 3 位数 MB 在报告行里最容易读错。
 */
export declare function formatBytes(n: number): string;
