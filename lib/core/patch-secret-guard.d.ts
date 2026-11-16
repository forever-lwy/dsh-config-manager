/**
 * patch 行写回守卫（issue #136 A + C）。
 *
 * 背景：导出侧 SecretScanner 会把命中字段名/值形状的字符串叶子替换成空串（占位符），语义是
 * 「需补录」。同步/导入落盘时，若照抄这个空串，就会**静默**抹掉本机同一行里用户手写的明文
 * —— 行是整行写回的，行内没有粒度。
 *
 * 本模块是那条「最后一个能拒绝写入」的纯逻辑：比对导入值与本机当前行，把「被脱敏剥空」的
 * 叶子换回本机值；声明过脱敏或名称属于密钥字段的叶子始终保留；其它未知空值仍可逐行确认清空。
 *
 * 两条分支（issue #136 C 的载荷字段决定）：
 *  - `redactedPaths` 存在（新载荷）：只保护**声明过的**路径，精确、可解释；
 *  - 缺省（旧载荷 / 未知）：保守口径 —— 导入值为空串且本机同叶子非空即保留本机值。
 *    绝不反过来假定「空值一定来自用户主动清空」（旧载荷没有能力区分剥空与真空）。
 *
 * 纯函数：不读盘、不打日志、不抛错；返回值不含任何值本身（只有路径），可直接进报告。
 */
/** 路径段（对象键或数组下标）。 */
type Segment = string | number;
export interface PatchSecretGuardInput {
    /** 备份/远端载荷里的整行值（可能含被剥空的叶子）。 */
    importedRaw: unknown;
    /** 本机当前同一行的值；`undefined` = 本机没有这一行（Create 语义，无可保护对象）。 */
    localRaw: unknown;
    /** 载荷声明的剥空路径（行内相对，如 `raw.mcp.args.token`）；缺省 = 未知（旧载荷）。 */
    redactedPaths?: readonly string[] | undefined;
    /** 调用方逐行确认；仅允许清空未声明脱敏的非密钥字段。 */
    confirmed: boolean;
}
export interface PatchSecretGuardResult {
    /** 实际应写入的行值（受保护叶子已换回本机值）。 */
    raw: unknown;
    /** 被保留的本机值路径（行内相对，展示用）。 */
    kept: string[];
    /** 逐行确认后真的写空的路径（同一份事实进报告）。 */
    cleared: string[];
    /** true = 载荷没带剥空路径，走的是保守推断分支。 */
    conservative: boolean;
}
/** 解析扫描器路径语法（`a.b[0].c`）→ 路径段；语法不认识返回 null（宁可放过，不误判）。 */
export declare function parsePath(path: string): Segment[] | null;
/** 路径段 → 展示用相对路径（与扫描器语法同形，如 `raw.mcp.args.token`）。 */
declare function formatPath(segs: readonly Segment[]): string;
export declare function applyPatchSecretGuard(input: PatchSecretGuardInput): PatchSecretGuardResult;
export declare const __test: {
    parsePath: typeof parsePath;
    formatPath: typeof formatPath;
};
export {};
