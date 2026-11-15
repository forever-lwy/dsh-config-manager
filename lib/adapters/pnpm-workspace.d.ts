export interface PatchedDependency {
    /** 依赖名（patchedDependencies 的键） */
    name: string;
    /** 声明的 patch 路径（相对 profile 目录，已去引号；原始写法保留） */
    path: string;
}
export interface ParsePatchedResult {
    declared: PatchedDependency[];
    /** 无法安全改写的形态（如单行 flow 映射）→ 调用方据此告警，绝不猜着改 */
    unsupported: string | null;
}
/** 解析 patchedDependencies 的声明（纯函数；不校验文件是否存在）。 */
export declare function parsePnpmPatchedDependencies(text: string): ParsePatchedResult;
export interface SanitizeResult {
    /** 清理后的文本（无需修改时与入参逐字节相同） */
    text: string;
    declared: PatchedDependency[];
    /** 被移除的条目（目标机没有对应 patch 文件） */
    dropped: PatchedDependency[];
    unsupported: string | null;
}
/**
 * 删除 patchedDependencies 中「目标机不存在对应 patch 文件」的条目。
 * @param available 判断某相对路径（相对 profile 目录）在**导入后**是否存在
 */
export declare function sanitizePnpmWorkspacePatches(text: string, available: (relPath: string) => boolean): SanitizeResult;
/**
 * 机器相关 pnpm 设置键（根层）。camelCase 是 pnpm-workspace.yaml 的权威拼写；
 * kebab 变体是同一组设置的另一方言（.npmrc / 部分版本），根层出现同样是本机路径绑定。
 */
export declare const PNPM_MACHINE_PATH_KEYS: readonly string[];
export interface MachinePathStripResult {
    /** 剥离后的文本（无需改动时与入参**逐字节相同**；只做整行删除，EOL 原样保留） */
    text: string;
    /** 被剥离的键（按首次出现顺序去重） */
    stripped: string[];
}
/**
 * 剥掉机器相关路径键（行级过滤）。
 *
 * 值写在同行 → 只删这一行；值写在缩进块里（`storeDir:` / `storeDir: |`）→ 连它的缩进续行
 * 一起删，避免留下孤儿缩进行把文件变成坏 YAML。其余内容（含注释、空行、行尾缺换行）逐字不变。
 */
export declare function stripPnpmMachinePaths(text: string): MachinePathStripResult;
export interface MachinePathRestoreResult {
    /** 接回本机路径行后的文本（无需恢复时与入参逐字相同） */
    text: string;
    /** 接回的键（按首次出现顺序去重） */
    restored: string[];
}
/**
 * 把**目标机自己原有的**机器路径行接回将要写入的文本（写回侧）。
 *
 * 来源机的路径已在收集侧剥离（这里对老载荷再剥一次是纵深防御），所以本函数接回的只可能是
 * 目标机原本就有的设置 —— 既不搬运来源机的路径，也不让一次导入清掉本机自己的 store 位置。
 * `local` 为 null（目标机本来就没有该文件）时原样返回。接回行统一用 incoming 的 EOL。
 */
export declare function restorePnpmMachinePaths(incoming: string, local: string | null | undefined): MachinePathRestoreResult;
