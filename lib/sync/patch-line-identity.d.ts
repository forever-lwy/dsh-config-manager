import type { PatchLine } from '../schema/types.ts';
type Segment = string | number;
/** 同一行三侧声明的剥空路径并集（行内相对，带 `raw` 前缀）。 */
export declare function redactedUnion(lines: readonly (PatchLine | undefined)[]): string[];
/** 一次合并里三侧共用的身份上下文：并集路径只解析一次。 */
export interface PatchIdentityContext {
    /** 已解析的路径段（`raw` 前缀已剥掉，可直接作用在 `line.raw` 上）。 */
    readonly segments: readonly (readonly Segment[])[];
}
/** 为同一键的三侧行准备上下文；由 `mergeKeyedList` 的 `identityContextOf` 每键调一次。 */
export declare function patchIdentityContext(peers: readonly (PatchLine | undefined)[]): PatchIdentityContext;
/**
 * 一行的内容身份：file + lineId + 归一化后的 raw。
 *
 * 归一化只抹「三侧里有人声明过被剥空」的叶子 → 声明过的空串与明文视为同一内容；
 * 两侧真写了不同的值（都不在声明里）仍然不同 —— 那才是需要人裁决的改动。
 */
export declare function patchLineIdentity(line: PatchLine, peers: readonly PatchLine[], context?: PatchIdentityContext): string;
export {};
