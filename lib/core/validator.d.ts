import type { SectionId } from '../schema/types.ts';
import type { CompatibilityInput, CompatibilityReason, CompatibilityScore, ValidationResult } from './types.ts';
export { validateManifest } from '../schema/manifest.ts';
export { validateSectionData } from '../schema/config.ts';
/** 校验 ZIP 内分区数据集合（空对象=合法）；返回合并的校验结果 */
export declare function validateSections(sections: ReadonlyMap<SectionId, unknown>): ValidationResult;
/**
 * 语义化版本比较（-1 / 0 / 1；预发布版低于同名正式版）。
 *
 * 导出供 `core/update-check.ts` 复用**同一份**解析与比较规则 —— 插件版本比较若另写一套
 * （例如直接字符串比大小），`1.10.0` vs `1.9.0` 这类就会判错。
 */
export declare function compareVersionStrings(a: string, b: string): -1 | 0 | 1;
/**
 * semver 形态判定（`1.2.3` / `1.2.3-rc.1` / `1.2.3+build`；区间 `^1.2.3`、dist-tag 与空串一律 false）。
 *
 * 与上面的 `compareVersionStrings` 分工不同：那个是**容错比较**（为了让 `0.2.1` 与 `0.2.1-rc.2`
 * 也能排出大小，解析用宽松正则），这个是**严格形态判定** —— 只有它是具体版本时才允许拿来
 * 拼 `<pkg>@<version>` 精确安装（issue #101）。导出为唯一实现，`self-update.ts`（是否接受目标
 * 版本）与 `update-check.ts`（registry 返回值是否认得）都必须复用它，不许各留一份正则。
 */
export declare function isConcreteVersion(v: string): boolean;
/**
 * 兼容性判定的**结构化原因**（与 `computeCompatibility` 同源：评分由本函数派生）。
 *
 * 顺序固定为「跨平台 → 分区缺失 → 版本方向」，界面按此顺序逐条解释。
 * 注意：`sourceOlder` 与其它原因可**同时成立**（跨平台 + 备份更旧），
 * 评分口径见 `computeCompatibility` 的注释（历史行为：更旧 → good，覆盖跨平台的 partial）。
 */
export declare function compatibilityReasons(input: CompatibilityInput): CompatibilityReason[];
/**
 * 兼容性评分（规则驱动，不凭感觉）：
 *  unsupported — schema 超出本插件支持范围（过高/过低）
 *  partial     — 跨平台、分区缺失、或备份 DSH 比目标新
 *  good        — 备份 DSH 比目标旧（向后兼容）
 *  excellent   — 同平台、无缺失、schema 支持
 *
 * 2026-09：实现改为**由 `compatibilityReasons` 派生**（单一事实源 —— 界面解释与评分不可能漂移）。
 * 派生顺序刻意保持改造前的行为：`sourceOlder` 一旦成立即 good，**即使同时跨平台/分区缺失**
 * （旧实现的 `cmp < 0 → score = 'good'` 会覆盖先前的 partial）。这是有意的兼容性冻结：
 * 改它会让既有的导入报告与用户预期一起变脸，需要单独决策。
 */
export declare function computeCompatibility(input: CompatibilityInput): CompatibilityScore;
/** 兼容性得分的可读描述（UI 报告用） */
export declare function describeCompatibility(score: CompatibilityScore): string;
/** 用 describeVersion 生成 schema 状态的用户可读说明 */
export declare function describeSchemaStatus(schemaVersion: number): string;
