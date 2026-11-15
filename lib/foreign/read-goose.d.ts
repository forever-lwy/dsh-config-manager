import type { SqliteDeps, SqliteReadPart, SqliteSessionFile } from './read-opencode.ts';
import type { SqliteHandle } from './sqlite.ts';
import type { SessionReadOutcome } from './session-source.ts';
export interface GoosePathInput {
    readonly homeDir: string;
    readonly platform: string;
    readonly env: Readonly<Record<string, string | undefined>>;
}
/** Goose 的**数据目录**（库在它的 `sessions/sessions.db` 下）；env 覆盖是「绝对路径才生效」的替换 */
export declare function gooseDataDir(opts: GoosePathInput): string;
/** Goose 的库：`<dataDir>/sessions/sessions.db` */
export declare function gooseDbPath(opts: GoosePathInput): string;
/**
 * 打开着的库 → 每个会话一个归一文件；**返回 null ⇔ 读不到 / 不是 goose 库**。
 *
 * 签名判定：必须有 `sessions` 表、它的 `id` 列与 `working_dir`（或 `working_directory`）。
 * 这条判据正是「`sessions.db` 与 cline 同名」时唯一能自证的东西。
 */
export declare function readGooseDatabase(db: SqliteHandle): SqliteReadPart | null;
export interface GooseReadOptions extends GoosePathInput {
    /** 仅测试注入 */
    readonly sqliteDeps?: SqliteDeps | undefined;
}
/** 读盘入口（wiring 的 `read`） */
export declare function readGoose(opts: GooseReadOptions): Promise<SessionReadOutcome<SqliteSessionFile>>;
