export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/** 合法日志级别集合（`DSH_CONFIG_MANAGER_LOG_LEVEL` 的取值）。 */
export declare const LOG_LEVELS: readonly LogLevel[];
/**
 * 解析日志级别字符串（大小写 / 前后空白不敏感）；未提供或不合法 → fallback（缺省 warn）。
 * 宿主入口用它解析 `DSH_CONFIG_MANAGER_LOG_LEVEL`：默认 warn —— 启动 dsh web 后控制台
 * 只保留 warn/error，常规 info（挂载横幅、调度器跳过、导出/备份完成）不再刷屏；
 * 排查时 `DSH_CONFIG_MANAGER_LOG_LEVEL=info`（或 debug）即可恢复逐条输出。
 */
export declare function parseLogLevel(raw: string | undefined, fallback?: LogLevel): LogLevel;
/**
 * 对象级掩码（**与文本级同口径**）：
 *  1) 字段名级：命中 security 名单的键 → 整值替换（返回新对象；结构与类型保留）；
 *  2) 值形状级：剩下的字符串叶子再过一遍文本掩码（sk- / JWT / AKIA / GitHub PAT / PEM /
 *     Bearer / URL query），覆盖「键名不敏感、值本身是密钥」的 meta（如 { note: 'sk-…' }）。
 * 顺序不能反：先按字段名整值替换，避免漏掉「键名命中但值不含任何形状」的键。
 * 不变式：凡是进 sink 的 meta 必须是本函数的产物（见 createLogger —— 注入的自定义 sink 同样如此）。
 * `extra` 为**附加**字段名（任意形态，内部按 security 口径规范化后精确命中）。
 */
export declare function redactValue(value: unknown, extra?: readonly string[]): unknown;
/** 文本级掩码：JSON 片段 `"field": "value"`、`field=value`、`field: value` 形态 +
 *  值形状（sk- / JWT / AKIA / GitHub PAT / PEM / Bearer / URL query），字段名按 security 口径判定。 */
export declare function redact(text: string, extra?: readonly string[]): string;
export interface LogMeta {
    [key: string]: unknown;
}
export interface LogSink {
    (level: LogLevel, message: string, meta?: LogMeta): void;
}
export interface Logger {
    level: LogLevel;
    debug(message: string, meta?: LogMeta): void;
    info(message: string, meta?: LogMeta): void;
    warn(message: string, meta?: LogMeta): void;
    error(message: string, meta?: LogMeta): void;
}
export interface LoggerOptions {
    level?: LogLevel;
    /** 输出目标；缺省写 console（单行 JSON）。测试可注入内存 sink。 */
    sink?: LogSink;
    /** 额外敏感字段名（任意形态；按 security 口径规范化后精确命中） */
    extraBlacklist?: string[];
    /** 是否带时间戳前缀 */
    timestamp?: boolean;
}
/** 创建结构化日志器（默认 console JSON 行；所有 sink 拿到的 msg/meta 都已脱敏） */
export declare function createLogger(opts?: LoggerOptions): Logger;
/** 静默日志器（测试用） */
export declare function nullLogger(): Logger;
