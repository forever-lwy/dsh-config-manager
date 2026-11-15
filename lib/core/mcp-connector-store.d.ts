/** 连接器存储文件（$DSH_HOME 相对路径；也是快照/回滚的文件类 ref） */
export declare const MCP_CONNECTOR_STORE_REL = "storages/mcp_connector.json";
/** 需要用户重填的凭据占位符（与连接器插件同名同形，便于用户/文档互认） */
export declare const REDACTED_VALUE = "<REDACTED:REENTER>";
/** 本机专属值占位符（绝对命令、cwd、userinfo） */
export declare const REDACTED_LOCAL_VALUE = "<REDACTED:LOCAL_VALUE>";
/** 本项目导出的连接器块标识（与连接器插件自己的 dsh-mcp-connector.redacted 区分：我们的还带 key/connectorId） */
export declare const MCP_CONNECTOR_EXPORT_FORMAT = "dsh-config-manager.mcp-connector";
export declare const MCP_CONNECTOR_EXPORT_VERSION = 1;
/** storage domain 里的一条连接记录（只保留本模块用到的字段，其余字段原样透传） */
export interface ConnectorRecord {
    key: string;
    connectorId: string;
    kind: 'oauth' | 'manual' | 'json';
    name: string;
    serverKey?: string;
    serverName: string;
    transport: 'streamable-http' | 'sse' | 'stdio';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
    url?: string;
    allowInsecurePrivateNetwork?: boolean;
    headers?: Record<string, string>;
    auth?: {
        mode: 'oauth' | 'bearer' | 'api-key';
        bearerToken?: string;
        apiKeyHeader?: string;
        apiKeyValue?: string;
        grantKey?: string;
    };
    enabled?: boolean;
    injectionMode?: 'always' | 'session';
    createdAt?: number;
    updatedAt?: number;
    [key: string]: unknown;
}
/** 导出的连接（脱敏后；redactedFields 列出被替换的字段，导入侧据此判「需重填」） */
export interface ConnectorExportEntry {
    key: string;
    connectorId: string;
    kind: 'oauth' | 'manual' | 'json';
    name: string;
    serverKey?: string;
    serverName: string;
    transport: 'streamable-http' | 'sse' | 'stdio';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
    url?: string;
    allowInsecurePrivateNetwork?: boolean;
    headers?: Record<string, string>;
    authMode?: 'oauth' | 'bearer' | 'api-key' | 'none';
    bearerToken?: string;
    apiKeyHeader?: string;
    apiKeyValue?: string;
    injectionMode?: 'always' | 'session';
    enabled: boolean;
    redactedFields?: string[];
}
/** OAuth 连接只导出「引用」：Token 与动态客户端密钥永不进备份，导入侧提示从市场重新授权 */
export interface ConnectorOauthRef {
    key: string;
    connectorId: string;
    serverKey?: string;
    name: string;
    serverName: string;
    enabled: boolean;
    injectionMode?: 'always' | 'session';
    action: 'reconnect-oauth';
}
/** mcp 分区里连接器来源的整块载荷 */
export interface McpConnectorExport {
    format: typeof MCP_CONNECTOR_EXPORT_FORMAT;
    version: typeof MCP_CONNECTOR_EXPORT_VERSION;
    /**
     * 这批连接**状态**的时间戳（内容派生：最晚的 updatedAt/createdAt，无时间戳则固定纪元值）。
     *
     * 为什么不是「导出当刻」：同步的「本地有无改动」直接哈希这份载荷（SyncEngine.hasLocalChanges），
     * 基线也取自同一份载荷；写 now() 会让 hash 每轮都变 ⇒ 每轮轮询都真推一次空快照。
     * 本字段没有任何读取方（导入只认 connections / oauthConnections），因此取内容派生值不丢信息。
     */
    exportedAt: string;
    connections: ConnectorExportEntry[];
    oauthConnections: ConnectorOauthRef[];
}
/** stdio 参数：只脱掉看起来是密钥的参数（含 `--token=xxx` 与「flag 后紧跟值」两种形态），其余保留 */
export declare function redactArgs(args: readonly string[] | undefined): {
    args?: string[];
    redacted: boolean;
};
/** 命令：裸命令名（npx / uvx / node）保留；带路径的（绝对路径、盘符、相对目录）替换为本机值占位符 */
export declare function redactCommand(command: string | undefined): {
    command?: string;
    redacted: boolean;
};
/** URL：userinfo 整条替换；查询参数逐项脱敏（端点本体必须保住，否则备份无法还原） */
export declare function redactUrl(url: string | undefined): {
    url?: string;
    redacted: boolean;
};
/** 一条连接记录 → 可携带的脱敏条目（永不返回 Token / 密钥明文） */
export declare function exportConnectorRecord(record: ConnectorRecord): ConnectorExportEntry;
/**
 * 导出块的稳定时间戳：这批连接里最晚的一次变更（updatedAt 优先，其次 createdAt）；
 * 一条都没有时间戳时退回固定纪元值（1970-01-01T00:00:00.000Z）——**恒定**比「像样但会漂移」重要，
 * 因为它参与同步的「有无改动」哈希（见 McpConnectorExport.exportedAt 的注释）。
 */
export declare function connectorBlockStamp(records: readonly ConnectorRecord[]): string;
/** 全部连接 → 导出块（OAuth 只留引用；按 key 排序，便于 diff 与稳定哈希） */
export declare function exportConnectorBlock(records: readonly ConnectorRecord[], exportedAt?: string): McpConnectorExport;
/** 列出「还有占位符」的字段路径（导入前判「需重填凭据」） */
export declare function unresolvedRedactions(value: unknown, path?: string, output?: string[]): string[];
/** 导出条目里「需要用户重填」的字段（占位符路径 + redactedFields 并集，供计划项 detail 用） */
export declare function refillFieldsOf(entry: ConnectorExportEntry): string[];
/** 连接器存储文件的解析结果 */
export interface ConnectorStoreRead {
    /** 文件存在且解析成功 */
    parsed: boolean;
    /** 文件是否存在（ENOENT → false；其余错误 → true + 解析失败） */
    exists: boolean;
    connections: ConnectorRecord[];
    /** 解析失败原因（读到了但形态不对 → 绝不当作空表覆盖） */
    error?: string;
    /** 原始 JSON（保留其它表，写回时只替换 connections） */
    raw?: Record<string, unknown>;
}
/** 解析连接器存储文本（绝不对「读到了但解析不了」当空表） */
export declare function parseConnectorStore(text: string): ConnectorStoreRead;
/** 读连接器存储（ENOENT → 空表 + exists:false；其余错误原样上报） */
export declare function readConnectorStore(fs: {
    readFile(rel: string): Promise<Uint8Array>;
    exists(rel: string): Promise<boolean>;
}): Promise<ConnectorStoreRead>;
/** 连接身份：优先 key，其次 (connectorId, serverName) */
export declare function connectorIdentity(entry: {
    key?: string;
    connectorId?: string;
    serverName: string;
}): string;
/**
 * 在目标连接里找同一身份的记录：**只认 (connectorId, serverName)**。
 *
 * 为什么不先按 key 认：key 是存储主键，但「同 key 不同连接」在手工改过/旧版本里是可能的；
 * 按 key 命中就当成同一条会**覆盖掉一条无关连接**。身份相同 → 复用既有 key（幂等）；
 * 身份不同 → 交给 pickConnectorKey 挑一个不冲突的新 key。
 */
export declare function findConnectorRecord(records: readonly ConnectorRecord[], entry: ConnectorExportEntry): ConnectorRecord | undefined;
/**
 * 比较用形态：**两侧都过一遍脱敏**再去掉易变字段。
 *
 * 为什么导出条目也要重新脱敏：条目里可能已被用户重填成真值（明文），而目标机记录里的
 * 同名字段也是明文——但如果只脱一侧，明文与占位符一比就永远 Conflict（导入一次就再也 Skip 不了）。
 * 两侧统一过 exportConnectorRecord ⇒ 明文都被换成同一个占位符，同一条连接天然相等。
 */
export declare function comparableConnector(record: ConnectorRecord | ConnectorExportEntry): Record<string, unknown>;
/** 把脱敏条目还原成可写入 storage domain 的记录（占位符必须为空才不会破坏目标机） */
export declare function buildConnectorRecord(entry: ConnectorExportEntry, options: {
    existing?: ConnectorRecord;
    key: string;
    now: number;
}): ConnectorRecord;
/** 目标机里生成一个不与既有记录冲突的 key（同身份 → 复用既有 key） */
export declare function pickConnectorKey(records: readonly ConnectorRecord[], entry: ConnectorExportEntry): string;
/**
 * 把一条（已脱敏、无占位符的）连接合并进存储 JSON 文本，返回新文本。
 *
 * 只替换 `tables.connections[`key`]`，其它表与未知字段逐字保留（grants/tool_catalog 等绝不重写）。
 */
export declare function mergeConnectorIntoStoreText(read: ConnectorStoreRead, record: ConnectorRecord): string;
