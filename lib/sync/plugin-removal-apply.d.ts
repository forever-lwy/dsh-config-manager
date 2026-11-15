import type { MsgFunc } from '../core/messages.ts';
import type { SnapshotPluginRemoval } from '../core/types.ts';
import type { SectionData, SectionId } from '../schema/types.ts';
import type { PluginRemovalEntry, PluginRemovalPlan } from './plugin-removals.ts';
/** 一条插件卸载结果（reinstallTarget 供 undo 与人工补装使用）。 */
export interface PluginRemovalReportItem {
    name: string;
    version: string;
    /** 重装目标：`name@version`（版本未知时退回裸包名） */
    reinstallTarget: string;
    ok: boolean;
    /** 失败原因（已由 CLI 分类器给出可操作文案）；ok=true 时缺省 */
    message?: string;
}
/** 预览侧的删除视图（确认页据此单列「将删除：X@1.2.3」，用户可整轮取消）。 */
export interface PluginRemovalPreviewView {
    pluginRemovals: {
        name: string;
        version: string;
    }[];
    pluginRemovalConflicts: {
        name: string;
        ancestorVersion: string;
        localVersion: string;
    }[];
    pluginRemovalSkipped: {
        name: string;
        reason: string;
    }[];
}
/** 判据输入侧的「已装插件」最小形状（PluginInfo 与 PluginEntry 都能直接传）。 */
type InstalledPlugin = {
    name: string;
    version: string;
    enabled?: boolean;
    spec?: string;
    bundlesOnly?: boolean;
};
/**
 * 把某个分区载荷里的插件清单抽成判据要的形状（不认识 = undefined）。
 *
 * 为什么直接从「本轮合并的三方输入」读而不是再 export 一次：那三个载荷就是本轮合并的真实输入，
 * 再 export 会拿到「已经写了一半」的状态，判据与合并结论就会打架。
 */
export declare function pluginEntriesOf(data: SectionData | undefined): PluginRemovalEntry[] | undefined;
/** 三方输入 + 本机已装 → 删除计划（预览与执行共用同一份判据）。 */
export declare function pluginRemovalPlanOf(args: {
    ancestor?: SectionData;
    remote?: SectionData;
    installed: readonly InstalledPlugin[];
    enabled: boolean;
    selfName?: string;
}): PluginRemovalPlan;
/**
 * 执行删除（逐项失败不阻断）。
 *
 * 为什么只在 plugins 分区真的被应用时才动：分区冲突/跳过 = 本轮还没确定「远端删了它」，
 * 此时删本机插件等于拿未裁决的远端差异动用户机器。
 */
export declare function applyPluginRemovalStep(args: {
    appliedIds: readonly SectionId[];
    plan: PluginRemovalPlan | undefined;
    enabled: boolean;
    uninstall: (name: string) => Promise<unknown>;
    msg: MsgFunc;
}): Promise<{
    removals: PluginRemovalReportItem[];
    warnings: string[];
}>;
/**
 * 把「本轮删掉哪些插件」写进本次回滚快照（undo 线索）。
 *
 * 写不进去不中止同步（分区已落地且已重导出），但必须留一条可见告警 ——
 * 报告里的 reinstallTarget 仍可人工执行，静默丢失 undo 线索才是真问题。
 */
export declare function recordPluginRemovalUndo(args: {
    removals: readonly PluginRemovalReportItem[];
    snapshotId: string;
    record?: (id: string, entries: SnapshotPluginRemoval[]) => Promise<void>;
    msg: MsgFunc;
}): Promise<string[]>;
/**
 * 预览侧的删除视图：确认页必须能单列「将删除：X@1.2.3」让用户整轮取消，
 * 也必须如实说明「开关关着，所以没删」与「远端删了但本机改过」两种不删的原因。
 *
 * plugins 分区本轮不可应用（conflict / skip）时不列删除项：那时「远端删了它」还没被用户确认。
 */
export declare function pluginRemovalPreviewOf(args: {
    plan: PluginRemovalPlan | undefined;
    sections: readonly {
        id: SectionId;
        decision: string;
    }[];
}): PluginRemovalPreviewView | undefined;
export {};
