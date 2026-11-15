/** 可选的路径映射（oldPrefix → newPrefix；appliesTo 由导入侧决定，这里不需要）。 */
export interface PathMappingRule {
    oldPrefix: string;
    newPrefix: string;
}
/**
 * 应用路径映射。
 *
 * @returns 映射后的路径（已规范化）；没有命中或与原文等价 → null（调用方按「不需要改写」处理）。
 */
export declare function applyPathMapping(path: string, mappings: readonly PathMappingRule[]): string | null;
