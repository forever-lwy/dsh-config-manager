/**
 * #132 / #145：同步「跟随远端删除插件」的**唯一判据**，以及 plugins 分区的按键三方合并。
 *
 * 为什么必须单独一个模块：
 *  1. 删除判定是纯逻辑（开关 × 祖先 × 远端 × 本机），散进引擎里既测不了也说不清；
 *  2. plugins 分区不能走通用 JSON 合并 —— `merge.ts` 的 `mergeJsonValues` 对数组一律「两侧都改
 *     且不逐字相等 → 冲突」，而本分区的日常形态恰恰是「A 机卸载了 X、B 机新装了 Y」，通用路径
 *     会把它报成整分区冲突，于是删除永远进不了自动应用（issue #132 的行为表 A→B 走不通）。
 *
 * issue #145 把两件事彻底解耦（本条是 #132 的语义修正）：
 *  - **合并恒参与**：开关不再决定钩子是否介入。以前关着开关 = 整个分区交回通用 JSON 合并，
 *    于是与卸载无关的改动（patch 行新增一行）也会因为「数组两侧都改」而整分区冲突；
 *  - **开关只管删除**：`deletePlugins` 只决定「远端删了、本机未改的条目要不要真的删」，关着就
 *    保留本机条目（包还在盘上，删了也只会下一轮复活）。
 *  - 外壳条目（patch 行 / 本地 tarball / patch 文件）同一口径：跟随三方合并，删除也受同一个开关。
 *
 * 删除判据（缺一不可，全部满足才删）：
 *  - 开关打开（`SyncSelection.deletePlugins`，缺省关）；
 *  - **祖先**里有它（A 机那轮同步见过的状态）——没有祖先就没有「谁删了它」的证据；
 *  - **远端**没有它（= 有人在另一台机器上卸载了）；
 *  - **本机装着**（卸载才有意义）；
 *  - 本机版本**仍等于祖先版本**（本地改过 = 用户在自己这台机器上动过它，绝不替用户做决定，
 *    报 `version-changed` 冲突交人裁决）；
 *  - 不是本插件自己、不是 bundlesOnly 条目（后者由 DSH 自身安装位置解析，`dsh plugin remove`
 *    对它无意义，见 `core/plugin-cli.ts` 的 `isBundlesOnlyEntry`）。
 *
 * 纯函数、零 I/O：引擎调用它拿计划，UI 调用它拿「将删除」清单。
 */
import type { SectionData } from '../schema/types.ts';
import type { GranularMergeHooks, GranularMergeOutcome } from './workspace-merge.ts';
/** 一条「该卸载」的结论（version = 祖先/本机一致的版本，用于报告与回滚重装目标）。 */
export interface PluginRemoval {
    name: string;
    version: string;
    /** 祖先条目里的安装源（github:/git+/file:/link: 等）；重装目标要用它，否则装不回同一来源 */
    spec?: string;
}
/** 未删的原因：每一条都要能对用户解释（报告里逐项列出，绝不静默跳过）。 */
export type PluginRemovalKeptReason = 'still-in-remote' | 'self' | 'bundles-only' | 'not-installed' | 'switch-off';
export interface PluginRemovalConflict {
    name: string;
    reason: 'version-changed';
    ancestorVersion: string;
    localVersion: string;
}
export interface PluginRemovalPlan {
    /** 该执行 `dsh plugin remove` 的插件（顺序 = 祖先顺序，便于报告比对） */
    removals: PluginRemoval[];
    /** 本机改过、远端删了 → 交人裁决（不删也不静默保留） */
    conflicts: PluginRemovalConflict[];
    /** 考察过但不删的条目及原因 */
    kept: {
        name: string;
        reason: PluginRemovalKeptReason;
    }[];
}
/**
 * 判据只需要这几个字段：`PluginEntry` 与宿主的 `PluginInfo`（listInstalled 的返回值）都能直接传入，
 * 不必为了调用它先拼一个完整的分区条目。
 */
export interface PluginRemovalEntry {
    name: string;
    version: string;
    spec?: string;
    bundlesOnly?: boolean;
}
export interface PluginRemovalInput {
    /** 同步选择里的开关（缺省关）；关 = 一个都不删 */
    enabled: boolean;
    /** 共同祖先快照里的插件清单（undefined = 没有祖先副本） */
    ancestor: readonly PluginRemovalEntry[] | undefined;
    /** 远端快照里的插件清单（undefined = 远端没有该分区） */
    remote: readonly PluginRemovalEntry[] | undefined;
    /** 本机当前已装（plugins 分区导出的口径） */
    local: readonly PluginRemovalEntry[];
    /** 本插件自己的包名（永不删） */
    selfName: string | undefined;
}
/** 判定「该不该删」。调用方只在 `applied` 含 plugins 时才真正执行。 */
export declare function planPluginRemovals(input: PluginRemovalInput): PluginRemovalPlan;
/**
 * plugins 分区的按键三方合并（`merge.ts` 的 `GRANULAR_MERGES.plugins`）。
 *
 * 逐条规则见 `merge-keyed.ts`；本函数只负责「四条有序集合各用什么键与身份」以及
 * `pnpmWorkspace` 原文的三方（两侧都改且不同 → overlap 交人工，与通用 JSON 合并同口径）。
 *
 * 形状不认识（`version !== 1` 或缺 plugins 数组）时返回 `undefined`：畸形数据交回通用路径的
 * 形状闸门，这里不另造第二套拒绝逻辑。
 */
export declare function mergePluginsSection(local: SectionData, remote: SectionData, ancestor: SectionData | undefined, hooks?: GranularMergeHooks): GranularMergeOutcome | undefined;
