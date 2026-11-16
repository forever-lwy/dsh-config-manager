/**
 * 通用「按键三方合并」（issue #145）。
 *
 * 为什么单独一个模块：plugins 分区里除插件清单外还有几组**有序条目集**（patch 行、本地 tarball、
 * patch 文件），它们共同的语义是「同一键 = 同一条目」。通用 JSON 合并不认这个语义 —— 数组
 * 两侧各改一次就判整分区冲突，于是 patch 行永远合不进去（issue #145 的两道门之一）。规则三处
 * 完全相同，故只写一份。
 *
 * 规则（与 git 同口径；祖先只用来判断「谁动过它」，绝不猜）：
 *  - 两侧同键且内容身份相同 → 保留本机；
 *  - 某一侧与祖先相同 → 取另一侧（mergePoints + 1）；
 *  - 两侧都改（或没有祖先且两者不同）→ both-modified；
 *  - 只有本机：无祖先 = 本机独有 → 保留；有祖先且未改 → followDelete ? 跟随删除 : 保留并记进
 *    keptAgainstDelete（开关关着 = 一个都不删，见 issue #145 的裁决）；有祖先且已改 → modify-delete；
 *  - 只有远端：无祖先 = 远端独有 → 采纳；有祖先且未改 → 本机删过它，跟随删除；有祖先且已改 →
 *    delete-modify；
 *  - 顺序 = 本机顺序，远端独有的键按远端相对顺序追加；
 *  - keepLocal 命中的条目永远以本机为准（既删不掉，也不报冲突）。
 *
 * 冲突只回报、不进 merged：调用方拿到非空 conflicts 时按整分区冲突处置（与既有钩子同口径，
 * 绝不「合一半就落地」）。纯函数、零 I/O。
 */
import type { MergeConflict } from './merge.ts';
/** 单条目的冲突理由：只可能是这三种（跨侧改同一个键 / 一侧删一侧改）。 */
export type KeyedConflictReason = 'both-modified' | 'modify-delete' | 'delete-modify';
export interface KeyedMergeSpec<T> {
    /** 身份键（同键 = 同一条目）；返回空串 = 该条目没有身份，跳过不参与合并。 */
    keyOf(item: T): string;
    /**
     * 内容身份（相等 = 这一侧没改过它）。peers 是同一键上出现过的三侧原值，供「按需归一化」用
     * —— patch 行要按三侧 redactedPaths 并集把被剥空的叶子归零后再比（issue #145 门②）。
     */
    identityOf(item: T, peers: readonly T[], context?: unknown): string;
    /**
     * 一次算好同一键上三侧共用的身份上下文（如 patch 行的 redactedPaths 并集），
     * 由 identityOf 第三参取用 —— 每个键只算一次，不再每条目重算（性能，2026-11-15）。
     */
    identityContextOf?(peers: readonly T[]): unknown;
    /** 冲突路径（给人看的定位，如 `plugins.alpha`）。 */
    pathOf(key: string): string;
    /** 本机未改、远端删了：true = 跟随删除；false = 保留本机（不报冲突、不计合并点）。 */
    followDelete: boolean;
    /** 永远以本机为准的条目（本插件自己这类「删了会坏事」的东西）：不删、不报冲突。 */
    keepLocal?(item: T): boolean;
    /**
     * 采纳远端那一侧时怎么合成（缺省 = 直接取远端对象）。
     * 只有「本机没改、远端改了」这一条分支会调它；用途是把**本机态字段**（如插件启停）留在本机，
     * 其余字段听远端 —— 否则远端升一次版本就会把本机停用改回启用（issue #145 复审 P0-2）。
     */
    compose?(l: T, r: T): T;
}
export interface KeyedMergeResult<T> {
    merged: T[];
    conflicts: MergeConflict[];
    /** 自动并入的变更点（「两侧各自的改动都保住了」处数） */
    mergePoints: number;
    /**
     * 输入形状不支持按键合并（同键重复 / 没有身份键 / 非对象条目）：此时 merged 恒空，
     * 调用方**必须**退回通用路径 —— 绝不在这里「留一条丢一条」（复审 P1-2）。
     */
    malformed: boolean;
}
export declare function mergeKeyedList<T>(args: {
    local: readonly T[];
    remote: readonly T[];
    ancestor: readonly T[] | undefined;
    spec: KeyedMergeSpec<T>;
}): KeyedMergeResult<T>;
