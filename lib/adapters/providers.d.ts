import type { MsgFunc } from '../core/messages.ts';
import type { ProviderEntry } from '../schema/types.ts';
import type { ApplyResult, ConfigAdapter, ExportOptions, ExportSection, ExportUnit, HostContext, ImportContext, PlanItem, ValidationResult } from '../core/types.ts';
import { type NamespaceProvider } from './settings.ts';
/** 导出记录：ProviderEntry 之外附加 namespace 级元数据（导入写回用），满足 ProvidersSection 形状 */
export interface ProviderExportEntry extends ProviderEntry {
    /** 来源 settings namespace（llm-deepseek / llm-pi-ai） */
    namespace: string;
    /** 乐观锁 revision（导入时检测并发修改） */
    revision: number;
    secrets?: {
        path: string[];
        set: boolean;
    }[];
    /** 该 namespace 的完整 redacted 值（导入整体写回，避免按字段重建丢失结构） */
    raw?: Record<string, unknown>;
}
export interface ProviderExportSection {
    version: 1;
    providers: Record<string, ProviderExportEntry>;
}
export declare const DEFAULT_PROVIDER_NAMESPACES: readonly string[];
export declare class ProvidersAdapter implements ConfigAdapter<ProviderExportSection> {
    readonly id: 'providers';
    readonly displayName: string;
    readonly defaultIncluded: boolean;
    readonly portability: import("../schema/section-registry.ts").SectionPortability;
    private readonly namespaces;
    constructor(namespaces?: string[] | NamespaceProvider);
    export(ctx: HostContext, options: ExportOptions): Promise<ExportSection<ProviderExportSection>>;
    /** 单元 id：`providers:<route>`（route 是 providers 记录的键，天然唯一） */
    private unitId;
    /**
     * 条目级单元清单（零 I/O）：一台 provider（记录里的一个 route）= 一个单元。
     *
     * detail 给来源 namespace —— 用户靠它区分「同一个模型走哪个 ns」，不放任何 key 值。
     */
    listUnits(section: ExportSection<ProviderExportSection>): ExportUnit[];
    /**
     * 白名单过滤 + raw 重建。
     *
     * 为什么必须重建 raw：每个 entry.raw 存的是**整个 namespace** 的快照（导入按 namespace 整体替换）。
     * 只勾 llm-pi-ai 下的一条 route 时若原样带走 raw，未勾的 route 会随 raw 一起进包、
     * 导入时又被整 namespace 写回目标机 —— 用户看到「没勾却没生效」，选择器等于撒谎。
     * 因此这里把每个 namespace 的 raw.providers 收窄成「该 ns 里被勾选的 route」集合。
     */
    private pickProviders;
    analyzeImport(data: ProviderExportSection, ctx: ImportContext): Promise<PlanItem[]>;
    applyItem(item: PlanItem, ctx: ImportContext): Promise<ApplyResult>;
    validate(data: ProviderExportSection, msg?: MsgFunc): Promise<ValidationResult>;
}
