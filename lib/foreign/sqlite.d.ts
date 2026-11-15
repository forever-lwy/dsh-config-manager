/** 一行结果（列名 → 原值；BLOB 列以 Uint8Array 返回） */
export type SqliteRow = Record<string, unknown>;
/** 只读句柄：**每个方法都可能返回 null**（读不到 ≠ 空表） */
export interface SqliteHandle {
    /** 查全（参数化绑定；表不存在 / 语句错 / 锁定 → null） */
    all(sql: string, ...params: readonly unknown[]): SqliteRow[] | null;
    /** 库里的表名清单（读不到 → null） */
    tables(): string[] | null;
    /** 某张表的列名清单（PRAGMA table_info 自适应列；读不到 → null） */
    columns(table: string): string[] | null;
    /** 关闭句柄（幂等；Windows 上不关会让临时目录删不掉 —— 竞品注释同款教训；copy 模式下顺带清理临时副本） */
    close(): void;
}
/** 能力探测结果（缺能力时 reason 是稳定机器码片段，进 skip 的 detail，不进用户文案） */
export interface SqliteCapability {
    available: boolean;
    reason?: 'module-unavailable' | 'api-unavailable';
}
/** 实际采用的打开方式（诊断/测试用；进 `SqliteOpenResult.mode`） */
export type SqliteOpenMode = 'direct' | 'immutable' | 'copy';
/**
 * 打不开的**稳定机器码**（进 `source-unreadable` 的 detail；用户文案由 UI 字典映射）。
 * `missing`/`not-a-file` 正常不会到达读盘层（调用方先 `isFile`），保留是为了让本模块可独立使用。
 */
export type SqliteOpenProblem = 'missing' | 'not-a-file' | 'open-failed' | 'copy-too-large' | 'copy-failed';
export interface SqliteOpenOptions {
    /** copy 路线的字节上限（db + 伴生文件之和）；超限即 `copy-too-large`，缺省 1 GiB */
    readonly maxCopyBytes?: number | undefined;
}
/** 打开结果：`db === null` ⇔ 有 `problem`；成功时 `mode` 说明走了哪条路 */
export interface SqliteOpenResult {
    readonly db: SqliteHandle | null;
    readonly problem?: SqliteOpenProblem | undefined;
    readonly mode?: SqliteOpenMode | undefined;
}
/** copy 路线的缺省上限（1 GiB）：再大就如实报码，不拿「写用户目录」换功能 */
export declare const DEFAULT_MAX_COPY_BYTES: number;
/** 本宿主是否具备只读 SQLite 能力（探测结果进程内缓存；探测本身绝不抛） */
export declare function sqliteCapability(): Promise<SqliteCapability>;
/**
 * 只读打开（**带失败原因**）：`missing` / `not-a-file` / `open-failed` / `copy-too-large` / `copy-failed`。
 *
 * **绝不抛**；**绝不写用户目录**（copy 路线失败即放弃，不退回就地打开）。
 */
export declare function openSqliteReadOnlyEx(file: string, options?: SqliteOpenOptions): Promise<SqliteOpenResult>;
/**
 * 只读打开（**兼容签名**：只回句柄，读不到回 null）。
 *
 * 需要区分失败原因时用 `openSqliteReadOnlyEx`；「读不到返回 null」的约定在两者上一致。
 */
export declare function openSqliteReadOnly(file: string, options?: SqliteOpenOptions): Promise<SqliteHandle | null>;
/** 表 + 关键列的**签名判定**（竞品同款：不靠文件名，靠结构自证；不符 → 关闭句柄并返回 null） */
export declare function openSqliteIfShape(file: string, required: Readonly<Record<string, readonly string[]>>): Promise<SqliteHandle | null>;
/** 把一列取值按「首行可用」取出（SQLite 的 NULL 与缺列都归 undefined） */
export declare function cell(row: SqliteRow, key: string): unknown;
/** 单元格 → 文本（BLOB 与数字按各自约定；null/undefined → undefined，绝不伪造空串） */
export declare function cellText(row: SqliteRow, key: string): string | undefined;
/** 单元格 → Uint8Array（TEXT 列也编码成字节；其它类型 → undefined） */
export declare function cellBytes(row: SqliteRow, key: string): Uint8Array | undefined;
/** 单元格 → 毫秒时间（安全整数直接采信；ISO 字符串走 Date.parse；其余 undefined） */
export declare function cellTime(row: SqliteRow, key: string): number | undefined;
