import type { MsgFunc } from '../core/messages.ts';
import type { FilesSection } from '../schema/types.ts';
import type { ApplyResult, ConfigAdapter, ExportOptions, ExportSection, ExportUnit, HostContext, ImportContext, PlanItem, ValidationResult } from '../core/types.ts';
export declare const DEFAULT_PLUGIN_FILE_WHITELIST: readonly string[];
export declare class PluginFilesAdapter implements ConfigAdapter<FilesSection> {
    readonly id: 'pluginFiles';
    readonly displayName: string;
    readonly defaultIncluded: boolean;
    readonly portability: import("../schema/section-registry.ts").SectionPortability;
    private readonly whitelist;
    /** 约定配置目录（相对 ~/.dsh 根，如 'plugin-config'）；递归收集其下所有文件。undefined = 不收集。 */
    private readonly collectDir?;
    constructor(whitelist?: string[], collectDir?: string);
    export(ctx: HostContext, options: ExportOptions): Promise<ExportSection<FilesSection>>;
    /**
     * 读失败之后判定「这个路径本来就不存在」还是「存在但读不到」（ui-F2）。
     *
     * 为什么不用错误码：门面错误的形状并不统一（内存 mock 与各平台 EACCES 文案不同），
     * 而 `exists()` 是 FileSystemFacade 契约里唯一稳定的存在性判据。`exists()` 自己也失败时
     * 按「存在」处理（保守：宁可让这次导出显式失败，也不静默丢一个文件）。
     */
    private absentOnDisk;
    /** 单元清单（零 I/O）：逐文件单元，id 与导入侧 `pluginFiles:<relPath>` 一致。 */
    listUnits(section: ExportSection<FilesSection>): ExportUnit[];
    analyzeImport(data: FilesSection, ctx: ImportContext): Promise<PlanItem[]>;
    applyItem(item: PlanItem, ctx: ImportContext): Promise<ApplyResult>;
    validate(data: FilesSection, msg?: MsgFunc): Promise<ValidationResult>;
}
