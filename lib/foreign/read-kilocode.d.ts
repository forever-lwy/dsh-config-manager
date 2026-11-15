import type { FamilySessionView, SqliteDeps, SqlitePathInput, SqliteSessionFile } from './read-opencode.ts';
import type { SessionReadOutcome } from './session-source.ts';
/** kilocode 的库：`<home>/.local/share/kilo/kilo.db` */
export declare function kilocodeDbPath(opts: SqlitePathInput): string;
/**
 * kilocode 的辅助会话判定（纯函数）：子会话（`parent_id` 非空）或已归档会话（`time_archived` 非空）。
 *
 * 列不存在（旧库/降级形态）时取不到值 → 判为非辅助（不误伤）；`time_archived = 0` 也是**非空**值
 * （对齐竞品 `time_archived IS NOT NULL` 的口径）。
 */
export declare function isKilocodeAuxSession(session: FamilySessionView): boolean;
export interface KilocodeReadOptions extends SqlitePathInput {
    /** 仅测试注入 */
    readonly sqliteDeps?: SqliteDeps | undefined;
}
/** 读盘入口（wiring 的 `read`） */
export declare function readKilocode(opts: KilocodeReadOptions): Promise<SessionReadOutcome<SqliteSessionFile>>;
