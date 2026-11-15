import type { MsgFunc } from '../core/messages.ts';
import './messages.ts';
import type { WorkspacesSection } from '../schema/types.ts';
import type { ApplyResult, ConfigAdapter, ExportOptions, ExportSection, ExportUnit, HostContext, ImportContext, PlanItem, ValidationResult } from '../core/types.ts';
/**
 * 可安全创建的绝对目录路径（issue #45 已知缺口①）。
 *
 * 路径来自备份 = **不可信输入**，所以只放行「完全限定 + 不含 `..` 段」的路径：
 * 相对路径会跟随进程 cwd，`..` 段则可能把目录建到预期之外的位置。
 */
export declare function isCreatableWorkspacePath(path: string, platform?: string): boolean;
export declare class WorkspacesAdapter implements ConfigAdapter<WorkspacesSection> {
    readonly id: 'workspaces';
    readonly displayName = "Workspaces";
    readonly defaultIncluded = true;
    readonly portability: 'platformSpecific';
    export(ctx: HostContext, options: ExportOptions): Promise<ExportSection<WorkspacesSection>>;
    /** 单元清单（零 I/O）：一条工作区记录 = 一个单元；标题缺失时退回 id。 */
    listUnits(section: ExportSection<WorkspacesSection>): ExportUnit[];
    analyzeImport(data: WorkspacesSection, ctx: ImportContext): Promise<PlanItem[]>;
    applyItem(item: PlanItem, ctx: ImportContext): Promise<ApplyResult>;
    /**
     * 全部分区收尾之后（finalizeImport）：把本次导入的工作区记录里声明的会话登记进工作区（issue #45 缺口②）。
     *
     * 为什么要等所有分区收尾：DSH 的 attachSession 要读会话日志的 header 并按 cwd 的 realpath 校验，
     * 而 workspaces 在 APPLY_ORDER 里排在 sessions 之前 —— 在 applyItem 里登记等于「会话还没写完/还没
     * 按映射改写」就去登记，必然被拒。所以这条动作必须等会话分区写完且首帧改写/归位完成之后。
     *
     * 登记目标 = 备份记录声明的 sessionIds **∪ 本包真正带数据的会话**（后者是 issue #45 ③ 的兜底：
     * 注册表 sessionIds 覆盖率极低，旧包甚至完全不含用户勾选那几次对话的 id）。
     *
     * 结果如实上报：**带数据却登记不上**（含 attach 能力缺失 / 找不到工作区实体）→ warning 并给出真实原因；
     * 只是「备份声明了、本次没带数据」的包外会话不计入失败（路径映射救不了它，误导用户去改映射更糟）。
     * 绝不静默失败（导入不因会话登记失败而整体失败，但报告里必须看得见）。
     */
    finalizeImport(ctx: ImportContext): Promise<ApplyResult[]>;
    validate(data: WorkspacesSection, msg?: MsgFunc): Promise<ValidationResult>;
}
