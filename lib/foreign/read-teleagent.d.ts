import type { SqliteDeps, SqliteSessionFile } from './read-opencode.ts';
import type { SessionReadOutcome } from './session-source.ts';
export interface TeleagentPathInput {
    readonly homeDir: string;
    readonly platform: string;
    readonly env: Readonly<Record<string, string | undefined>>;
}
/** `$TELEAGENT_HOME`（**仅绝对路径**生效）替换基座 → `<base>/users`；否则 `~/.local/share/TeleAgent/users` */
export declare function teleagentUsersDir(opts: TeleagentPathInput): string;
export interface TeleagentReadOptions extends TeleagentPathInput {
    /** 仅测试注入 */
    readonly sqliteDeps?: SqliteDeps | undefined;
}
/** 读盘入口（wiring 的 `read`：枚举账户 → 每库一次家族读） */
export declare function readTeleagent(opts: TeleagentReadOptions): Promise<SessionReadOutcome<SqliteSessionFile>>;
