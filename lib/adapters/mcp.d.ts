import type { MsgFunc } from '../core/messages.ts';
import type { McpServerEntry } from '../schema/types.ts';
import type { ApplyResult, ConfigAdapter, ExportOptions, ExportSection, ExportUnit, HostContext, ImportContext, PlanItem, ValidationResult } from '../core/types.ts';
import type { McpConnectorExport } from '../core/mcp-connector-store.ts';
/** 导出记录：McpServerEntry 之外附加来源 patch 行 id 与所在层（导入写回定位用） */
export interface McpExportEntry extends McpServerEntry {
    sourceLineId: string;
    /**
     * 来源 patch 层（相对 homeDir 的 POSIX 路径；见 core/patch-layers.ts）。
     * 缺省 = 用户层（旧备份包没有该字段 → 按旧行为写回 home 层）。
     */
    sourceFile?: string;
}
export interface McpExportSection {
    version: 1;
    servers: McpExportEntry[];
    /**
     * MCP 连接器（\`dsh-mcp-connector\` 插件）的连接，第二个数据源。
     *
     * 为什么并列而不是新增分区：两条路径在 DSH 里都是「MCP 服务器」，用户心智里是一件事；
     * 而备份格式是追加字段 ⇒ 旧备份没有它 = 空，读旧包的代码不受影响。
     */
    connectors?: McpConnectorExport;
}
/**
 * 从 patch 行数组中提取 MCP server 条目（以 config.serverName 存在为判定）。
 *
 * 行对象可带 `file`（层身份）：带上时逐条目记录 `sourceFile`，导入写回落回原层。
 */
export declare function extractMcpServers(lines: {
    lineId: string;
    raw: unknown;
    file?: string;
}[]): McpExportEntry[];
/**
 * 反向操作：从一行 patch 里剔除 MCP 服务器条目（plugins 分区导出时用，2026-11「C8」）。
 *
 * 为什么需要：`cordis.patch.yml` 是一本**清单**，plugins 分区导出整本带走，于是「没勾 MCP
 * 连接器」也会把 dsh-mcp-client 行（command/args/env + 本机 cwd）推到远端 —— 违反
 * 「未勾选分区的数据不进推送」。判定必须与 extractMcpServers 完全同口径（config.serverName
 * 为非空字符串），否则两边会漂。返回 undefined = 该行只剩 MCP 条目，整行丢弃。
 */
export declare function stripMcpEntries(raw: unknown): unknown | undefined;
/**
 * 由导出条目构造写回 patch 行 raw（单行形态，与 dsh-mcp-client 组合 config 语义一致）。
 *
 * `config.transport` 必须显式写：读侧靠它判定 server 类型，只在「没有 transport 的旧行」
 * 上才回落 url 猜测（issue #133：此前写回丢了这个字段，stdio/http 只能靠 url 有没有值猜）。
 */
export declare function buildMcpPatchLine(lineId: string, server: McpServerEntry): Record<string, unknown>;
/**
 * 单元 id：两条数据源各自独立前缀。
 *
 * 为什么必须分开：patch 行的 `serverName` 与连接器的 `serverName` 完全可能同名（同一台服务器的两条
 * 历史配置路径），共用 id 会让「勾了其中一个」变成「两个一起勾」，与选择器「逐项可勾」的前提冲突。
 * 命名空间仍以 `mcp:` 开头 —— 与 ExportUnit 的「<section>:<单元>」约定一致。
 */
export declare function mcpServerUnitId(serverName: string): string;
export declare function mcpConnectorUnitId(key: string): string;
export declare class McpAdapter implements ConfigAdapter<McpExportSection> {
    readonly id: 'mcp';
    readonly displayName: string;
    readonly defaultIncluded: boolean;
    readonly portability: import("../schema/section-registry.ts").SectionPortability;
    export(ctx: HostContext, options: ExportOptions): Promise<ExportSection<McpExportSection>>;
    /**
     * 条目级单元清单（选择器靠它决定「能不能展开」）。
     *
     * 契约（core/types.ts:1211）：纯函数、零 I/O，且必须与 export(includeItems) 自洽 ——
     * 单元 id 就是 export 白名单里认的 id，两边共用 mcpServerUnitId / mcpConnectorUnitId。
     *
     * 单元 label 与 detail 只放「能帮用户认出是哪条」的信息：连接器的 detail 复用
     * describeConnector（stdio 给命令 + 参数、http 给 URL），**绝不**带出 env / header 值。
     */
    listUnits(section: ExportSection<McpExportSection>): ExportUnit[];
    analyzeImport(data: McpExportSection, ctx: ImportContext): Promise<PlanItem[]>;
    /**
     * 连接器来源的计划项。
     *
     * 三条纪律：
     *  ① 目标存储「存在但解析不了」→ 只报 warning、**零写入**（整文件改写会把 grants 等表一起抹掉）；
     *  ② 条目里还有占位符 → 不写，产出「需重填凭据」的 warning（写进去 = 给用户一个起不来的 Server）；
     *  ③ 同名 server 同时来自 patch 行与连接器 → 两条都保留，另加一条 warning（不隐式合并，
     *     两者在 DSH 里是两份独立配置，合并会悄悄改变用户的生效结果）。
     */
    private analyzeConnectors;
    applyItem(item: PlanItem, ctx: ImportContext): Promise<ApplyResult>;
    /**
     * 写入一条连接：读全文件 → 只替换 `tables.connections[<key>]` → 整文件原子写。
     *
     * 为什么整文件写而不是走宿主 storage 服务：本机没装 `@deepseek-ai/dsh-storage-domain`，
     * 我们拿不到 `mcp_connector` 域的表句柄；而直接改文件又会被运行中的宿主内存态覆盖 ⇒
     * 计划项与本结果都显式要求重启（needsRestart），写之前先把原文件整体快照（引擎侧按
     * `storages/` 前缀走文件类快照）。
     */
    private applyConnectorItem;
    validate(data: McpExportSection, msg?: MsgFunc): Promise<ValidationResult>;
}
