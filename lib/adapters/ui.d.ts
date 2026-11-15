/**
 * ui 分区 adapter（设计 §3.3/§4.1/§4.3）：
 * 数据源 = settings.yaml 中「UI 类」namespace（pet / dsh-better-sidebar / remote-web-ui / ui-onboarding / skin 等）。
 * localStorage 等 Host 不可迁移的 UI 状态以 uiMigrationNotes 纯说明形式导出（不含任何值）。
 */
import type { UiSection } from '../schema/types.ts';
import type { MsgFunc } from '../core/messages.ts';
import type { ApplyResult, ConfigAdapter, ExportOptions, ExportSection, ExportUnit, HostContext, ImportContext, PlanItem, ValidationResult } from '../core/types.ts';
import { type NamespaceProvider } from './settings.ts';
/** UI 类 namespace 前缀名单（设计 §4.1；随新插件扩展，只影响「某一 namespace 归哪一边」，不影响数据完整性） */
export declare const KNOWN_UI_NAMESPACE_PREFIXES: readonly string[];
/** namespace 名是否属于 UI 类（大小写不敏感前缀匹配） */
export declare function isUiNamespace(name: string): boolean;
/** UI 迁移说明行（取文案在调用期现取；缺省 = 当前引擎语言的 engineMsg）。 */
export declare function uiMigrationNotes(msg?: MsgFunc): UiSection['uiMigrationNotes'];
export declare class UiAdapter implements ConfigAdapter<UiSection> {
    readonly id: 'ui';
    readonly displayName: string;
    readonly defaultIncluded: boolean;
    readonly portability: import("../schema/section-registry.ts").SectionPortability;
    private readonly namespaces;
    constructor(namespaces?: string[] | NamespaceProvider);
    export(ctx: HostContext, options: ExportOptions): Promise<ExportSection<UiSection>>;
    /** 单元 id：`ui:<namespace>` */
    private unitId;
    /** 条目级单元清单（零 I/O）：一个 UI namespace = 一个单元 */
    listUnits(section: ExportSection<UiSection>): ExportUnit[];
    analyzeImport(data: UiSection, ctx: ImportContext): Promise<PlanItem[]>;
    applyItem(item: PlanItem, ctx: ImportContext): Promise<ApplyResult>;
    validate(data: UiSection, msg?: MsgFunc): Promise<ValidationResult>;
}
