import type { FamilySessionView, SqliteDeps, SqlitePathInput, SqliteSessionFile } from './read-opencode.ts';
import type { SessionReadOutcome } from './session-source.ts';
/** mimocode 的库：`<home>/.local/share/mimocode/mimocode.db` */
export declare function mimocodeDbPath(opts: SqlitePathInput): string;
/** mimocode 后台任务会话判定（纯函数）：标题前缀或任一条消息 agent 命中即真 */
export declare function isMimocodeBackgroundSession(session: FamilySessionView): boolean;
export interface MimocodeReadOptions extends SqlitePathInput {
    /** 仅测试注入（默认走 sqlite.ts 的真实能力探测与只读打开） */
    readonly sqliteDeps?: SqliteDeps | undefined;
}
/** 读盘入口（wiring 的 `read`；读不到 = 0 文件 + source-unreadable，绝不抛） */
export declare function readMimocode(opts: MimocodeReadOptions): Promise<SessionReadOutcome<SqliteSessionFile>>;
