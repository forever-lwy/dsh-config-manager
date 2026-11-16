/** 生效链上的一层：层身份 + 已解析的文档。 */
export interface PatchChainSource {
    /**
     * 层身份。前两种与 `patch-layers.ts` 同口径（相对 homeDir 的 POSIX 路径）；bundle 层用
     * `bundles:<包名>/<patch 文件>` —— 它不是本机可写的层，只用于判重与取 name。
     */
    file: string;
    doc: unknown;
}
/** 读不出来的层（fail-open：判定只做加强，但缺口必须能上报，不能静默变成「确知没有」）。 */
export interface PatchChainFailure {
    file: string;
    reason: string;
}
/** 门面读到的整条链（宿主合并序）与读失败的层。 */
export interface PatchChainRead {
    /** 宿主合并序：bundle 层在前，然后 profile 层、home 层 */
    sources: PatchChainSource[];
    /** 读不出来 / 解析不了的层 */
    failures: PatchChainFailure[];
}
/** 链上某个 id 的合流结果。 */
export interface PatchChainEntry {
    id: string;
    /** 条目声明的 name（写顶层覆盖行时必须与之一致，否则宿主整行跳过；`alignOverrideNames` 用它校正） */
    name?: string;
    /** 提供该 id 的层（按合并序去重） */
    layers: string[];
    /** 其中**以 `- insert:` 成员形式**提供该 id 的层（>=2 就是「两条新增抢同一 id」的坏状态） */
    insertLayers: string[];
}
/** 写回结果（`applyPatchChanges` 的返回值）：被降级的 insert id。 */
export interface PatchWriteOutcome {
    /**
     * 本次被**降级为顶层覆盖行**的 id：调用方要求 insert，但链上已有其他层提供该 id
     * （issue #144 的存量修复；正常路径在计划阶段就已判定，这里只是最后一道兜底）。
     */
    downgraded: string[];
}
/** 把整条链折成 id → 层/形态索引（顺序 = 宿主合并序，先出现者优先记 name）。 */
export declare function patchChainIndex(read: PatchChainRead): Map<string, PatchChainEntry>;
/** 链上「**本文件之外**的层」提供的 id（写这一层时的判据）。 */
export declare function providedByOtherLayers(index: Map<string, PatchChainEntry>, file: string): Map<string, PatchChainEntry>;
/**
 * 把待写的**顶层行**里的 `name` 校正成链上既有条目的 name（issue #144 的验收标准之一）。
 *
 * 为什么必须校正：宿主对覆盖行做 `name === target.name` 校验，不一致就
 * `patch: name mismatch … skipping` 把整行丢掉 —— 快照来自另一台机器（裸名）而目标机由
 * bundle 提供（scoped 名）时，导入会报「成功」但一个字节都没生效，原报错照旧。
 * `insert` 块成员不动（那是新增，name 由来源决定）。
 */
export declare function alignOverrideNames(items: readonly unknown[], index: Map<string, PatchChainEntry>): unknown[];
/** 读整条链的结果：索引 + 读不出来的层（后者供报告面提示「判据不完整」）。 */
export interface PatchChainIndexRead {
    /** 门面没实现该能力（老宿主 / 测试替身）→ `null`（判定退化为两层） */
    index: Map<string, PatchChainEntry> | null;
    failures: PatchChainFailure[];
}
/**
 * 读整条链并折成索引。门面没实现 `readPatchChain`、或读链本身抛错 → `index: null`
 * （判定退化为两层 patch 文件，绝不因为链读失败阻断写入）。
 */
export declare function readPatchChainIndex(patchFile: {
    readPatchChain?: () => Promise<PatchChainRead>;
}): Promise<PatchChainIndexRead>;
