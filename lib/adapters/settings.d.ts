import type { MsgFunc } from '../core/messages.ts';
import type { NamespaceRecord, SettingsSection } from '../schema/types.ts';
import type { ApplyResult, ConfigAdapter, ExportOptions, ExportSection, ExportUnit, HostContext, ImportContext, NamespaceInfo, PlanItem, ValidationResult } from '../core/types.ts';
/** namespace 清单提供者：宿主从 settings.yaml 顶层 key / 插件注册表获得 */
export type NamespaceProvider = (ctx: HostContext) => Promise<string[]> | string[];
export declare function resolveNamespaces(namespaces: string[] | NamespaceProvider, ctx: HostContext): Promise<string[]>;
/**
 * 一次读回全部 namespace 的 redacted 记录（仅当宿主实现了 `SettingsFacade.describeAll`）。
 *
 * 为什么需要：真实 DSH 的 `SettingsProvider.describe()` 是「无参 = 全量」的 —— 每次调用都对
 * 全部注册项重跑 `schema.toJSON()` + 多次 `structuredClone` + `redactSecrets`，所以「按名单
 * 逐个 describe」实际是 O(N²)：真机 24 个 namespace 实测 ≈1.7 s，而一次全量只需 ≈70 ms。
 * 宿主未实现 describeAll（或调用抛错）时返回 `null`，调用方退回逐名 describe —— 与改造前逐字一致。
 */
export declare function readNamespaceMap(ctx: HostContext): Promise<Map<string, NamespaceInfo> | null>;
/**
 * 从全量 Map 取单个 namespace；缺失时抛出与逐名 `describe()` **逐字相同**的错误
 * （`namespace not found: <name>`），保证快慢两条路径的告警文案与条目一致。
 */
export declare function namespaceFromMap(all: Map<string, NamespaceInfo>, name: string): NamespaceInfo;
/** 批量读取 namespace 的 redacted 记录（settings/ui 共用；单项失败跳过并告警） */
export declare function collectNamespaceRecords(ctx: HostContext, names: string[], warnings: string[]): Promise<Record<string, NamespaceRecord>>;
/** 值是否“空”（目标已注册但从未配置 → 视为待初始化，Create 而非 Conflict） */
export declare function isEmptyValue(v: unknown): boolean;
/** 对比导入记录与目标当前值：一致（含两端皆空）→ Skip；目标为空且导入非空 → Create；其余不同 → Conflict；
 * 目标端 describe 抛错（命名空间未注册：提供它的插件在目标未激活/未安装）→ MissingDependency（§15 依赖检测），
 * 此时 Create/Update 必然失败，标记为“需注意”让导入继续，而不是整体失败。纯计算，零写入。
 *
 * **判定顺序不得回退**（issue #73）：一致判定必须排在「目标为空」之前 —— isEmptyValue({}) 为真，
 * 反序会把「{} 覆盖 {}」判成 Create，而写入 {} 是空写入 no-op，下一轮 describe 仍返回 {}，
 * 于是每次同步都重现同一项，永不收敛。 */
export declare function planNamespaceItems(data: Record<string, NamespaceRecord>, adapter: 'settings' | 'ui', ctx: ImportContext): Promise<PlanItem[]>;
/** 写入单个 namespace（settings/ui 共用）：读时锁 + expectedRevision 乐观锁，防覆盖并发修改 */
export declare function applyNamespaceItem(item: PlanItem, sectionId: 'settings' | 'ui', ctx: ImportContext): Promise<ApplyResult>;
export declare class SettingsAdapter implements ConfigAdapter<SettingsSection> {
    readonly id: 'settings';
    readonly displayName: string;
    readonly defaultIncluded: boolean;
    readonly portability: import("../schema/section-registry.ts").SectionPortability;
    private readonly namespaces;
    constructor(namespaces?: string[] | NamespaceProvider);
    export(ctx: HostContext, options: ExportOptions): Promise<ExportSection<SettingsSection>>;
    /** 单元 id：`settings:<namespace>`（同一命名空间下的唯一键） */
    private unitId;
    /** 条目级单元清单（零 I/O：输入即 export 产物）；一个 namespace = 一个单元 */
    listUnits(section: ExportSection<SettingsSection>): ExportUnit[];
    analyzeImport(data: SettingsSection, ctx: ImportContext): Promise<PlanItem[]>;
    applyItem(item: PlanItem, ctx: ImportContext): Promise<ApplyResult>;
    validate(data: SettingsSection, msg?: MsgFunc): Promise<ValidationResult>;
}
