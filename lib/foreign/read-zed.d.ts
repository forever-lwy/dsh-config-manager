import type { SqliteDeps, SqliteReadPart, SqliteSessionFile } from './read-opencode.ts';
import type { SqliteHandle } from './sqlite.ts';
import type { SessionReadOutcome } from './session-source.ts';
export interface ZedPathInput {
    readonly homeDir: string;
    readonly platform: string;
    readonly env: Readonly<Record<string, string | undefined>>;
}
/** Zed 的 data_dir（`XDG_DATA_HOME` 只对 linux 生效、且仅绝对路径） */
export declare function zedDataDir(opts: ZedPathInput): string;
/** Zed 的库：`<data_dir>/threads/threads.db` */
export declare function zedThreadsDbPath(opts: ZedPathInput): string;
/**
 * `folder_paths` 用 `\n` 连接路径、`folder_paths_order` 用 `,` 连接索引 —— 旧代码把它当
 * JSON 数组解析（jsonCell），真实库上 cwd 永远拿不到。索引缺失/长度不符时退化为字典序。
 */
export declare function zedFolderPaths(folderPaths: unknown, order: unknown): string[];
/**
 * 打开着的库 → 每个 thread 一个归一文件；**返回 null ⇔ 读不到 / 不是 zed 库**。
 *
 * 签名判定：必须存在 `threads` 表，且它有 `id` 与 `data` 列（竞品同款「靠结构自证」）。
 * `parent_id` 非空的行是子代理线程（上游 UI/ThreadStore 都过滤）→ 跳过并计数。
 */
export declare function readZedDatabase(db: SqliteHandle, label: string): SqliteReadPart | null;
export interface ZedReadOptions extends ZedPathInput {
    /** 仅测试注入 */
    readonly sqliteDeps?: SqliteDeps | undefined;
}
/** 读盘入口（wiring 的 `read`） */
export declare function readZed(opts: ZedReadOptions): Promise<SessionReadOutcome<SqliteSessionFile>>;
