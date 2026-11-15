/**
 * #132：同步「跟随远端删除插件」的**唯一判据**与 plugins 分区的按名三方合并。
 *
 * 为什么必须单独一个模块：
 *  1. 删除判定是纯逻辑（开关 × 祖先 × 远端 × 本机），散进引擎里既测不了也说不清；
 *  2. plugins 分区不能走通用 JSON 合并 —— `merge.ts` 的 `mergeJsonValues` 对数组一律「两侧都改
 *     且不逐字相等 → 冲突」，而本分区的日常形态恰恰是「A 机卸载了 X、B 机新装了 Y」，通用路径
 *     会把它报成整分区冲突，于是删除永远进不了自动应用（issue #132 的行为表 A→B 走不通）。
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
import type { GranularMergeOutcome } from './workspace-merge.ts';
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
 * plugins 分区的按名三方合并（`merge.ts` 的 `GRANULAR_MERGES.plugins`）。
 *
 * 逐名规则与 git 同口径，祖先只用于判断「谁动了它」，绝不猜：
 *  - 两侧都有：身份相同 → 保留；某一侧与祖先相同 → 取另一侧；两侧都变（或没有祖先）→ both-modified 冲突；
 *  - 只有本机：有祖先且与祖先相同 → 跟随远端删除（真删除）；无祖先 → 本机独有，保留；有祖先且不同 →
 *    modify-delete 冲突（用户在 A 机卸载、B 机却升级过它，不能替用户选）；
 *  - 只有远端：有祖先且与祖先相同 → 本机删除，跟随（不复活）；无祖先 → 远端独有，采纳；有祖先且不同 →
 *    delete-modify 冲突；
 *  - 两侧都没有：消失。
 *
 * 插件列表以外的字段不一致时返回 `undefined`：patch 行/pnpm-workspace 有各自的既有口径，
 * 在这里再造一套合并只会和通用路径打架（通用路径会整分区处理，其中包含 plugins 数组的旧行为）。
 */
export declare function mergePluginsSection(local: SectionData, remote: SectionData, ancestor: SectionData | undefined, hooks?: {
    deletePlugins?: boolean;
}): GranularMergeOutcome | undefined;
