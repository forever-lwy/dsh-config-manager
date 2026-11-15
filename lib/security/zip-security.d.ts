import { ZipArchive, type ZipSafetyLimits } from '../utils/zip.ts';
export { isPathSafe } from '../utils/paths.ts';
/** 可执行文件扩展名黑名单（§19.6：只警告，本插件不执行任何脚本） */
export declare const EXECUTABLE_EXTENSIONS: Set<string>;
/** 条目名是否疑似可执行文件（按扩展名） */
export declare function isExecutableName(name: string): boolean;
/**
 * 兼容别名 —— **强化检查已并入 core `parseZip`（默认解析器）**，本导出仅为兼容既有调用方
 * （src/core/consult-source.ts 等）与 `ImporterOptions.parseZipOverride` 注入点：
 * 注入它 ≡ 注入默认解析器，行为与「不注入」完全一致。
 */
export declare const parseZipHardened: (buf: Uint8Array, limits?: ZipSafetyLimits) => ZipArchive;
/** 工厂：带默认限额的解析器（对齐 ImporterOptions.parseZipOverride 签名）。
 *  不传 defaultLimits 时展开等价于 core 默认限额（parseZip 内部再与 DEFAULT_ZIP_SAFETY_LIMITS 合并），
 *  因此与「不注入 parseZipOverride」的默认路径逐项等价。 */
export declare function createHardenedZipParser(defaultLimits?: ZipSafetyLimits): (buf: Uint8Array, limits?: ZipSafetyLimits) => ZipArchive;
export interface SafeExtractResult {
    /** 已解压条目的 ZIP 相对路径（正斜杠） */
    files: string[];
    /** 非阻塞告警（可执行文件条目等） */
    warnings: string[];
}
/**
 * 安全解压到受控目录（对齐 core safeExtract 语义 + 强化）：
 *  - 条目名/限额/symlink/重复名/本地文件头检查（parseZipHardened = core 默认 parseZip）；
 *  - 逐条 CRC32/尺寸/预算校验（ZipArchive.readEntry）；
 *  - 解压后 lstat 复查「全部产物必须是普通文件」（防符号链接/非常规写入）；
 *  - 任何异常 → 中止并**完整清理** destDir 后抛出（不残留部分落盘）。
 */
export declare function safeExtractHardened(zipPath: string, destDir: string, limits?: ZipSafetyLimits): Promise<SafeExtractResult>;
