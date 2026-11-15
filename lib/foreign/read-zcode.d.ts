import type { FamilySessionView, SqliteDeps, SqlitePathInput, SqliteSessionFile } from './read-opencode.ts';
import type { SessionReadOutcome } from './session-source.ts';
/** zcode 的库：`<home>/.zcode/cli/db/db.sqlite`（三平台同形） */
export declare function zcodeDbPath(opts: SqlitePathInput): string;
/** zcode 的子会话判定（纯函数）：`parent_id` 非空 = 子会话；`''` 与 NULL 同等视为主会话 */
export declare function isZcodeChildSession(session: FamilySessionView): boolean;
export interface ZcodeReadOptions extends SqlitePathInput {
    /** 仅测试注入 */
    readonly sqliteDeps?: SqliteDeps | undefined;
}
/** 读盘入口（wiring 的 `read`） */
export declare function readZcode(opts: ZcodeReadOptions): Promise<SessionReadOutcome<SqliteSessionFile>>;
