import type { SqliteCapability, SqliteHandle, SqliteOpenProblem, SqliteOpenResult, SqliteRow } from './sqlite.ts';
import type { ParsedTranscript, SessionReadOutcome, TranscriptRecord } from './session-source.ts';
import type { IrBlock, IrTimeMs } from './session-ir.ts';
import type { ForeignSkip } from './types.ts';
/** 一个已读成归一记录的 SQLite 会话（8 个 SQLite 来源共用同一形状） */
export interface SqliteSessionFile {
    readonly id: string;
    readonly parsed: ParsedTranscript;
}
/**
 * 可注入的 SQLite 依赖（默认 = `sqlite.ts` 的真实实现）。
 *
 * 注入面只有两个函数，用途**仅限测试**：验证「宿主没有 `node:sqlite`」时的结构化降级路径
 * （竞品调研 read-claude-move §7.2 的建议：先落地一个可注入的最小适配器 + fake 实现）。
 * 生产路径（wiring 的 read）永远不传它。
 */
export interface SqliteDeps {
    readonly capability?: () => Promise<SqliteCapability>;
    readonly open?: (file: string) => Promise<SqliteHandle | null>;
}
/** 一个来源/一个库的读盘结果（0 文件也是正常结果） */
export interface SqliteReadPart {
    readonly files: readonly SqliteSessionFile[];
    readonly skipped: readonly ForeignSkip[];
    readonly counts: Readonly<Record<string, number>>;
}
/**
 * 逐会话剔除谓词看到的会话视图（**只由本仓库的 `read-<id>.ts` 使用**，绝不接受用户输入）。
 *
 * 三个 fork 的剔除事实所在层不同，因此视图把三层一次给全：`row`（fork 专有列，如 kilocode 的
 * `parent_id` / `time_archived`）、`messages`（mimocode 的后台标记在 `data.agent` 里 —— 与竞品
 * `readOpencodeDb` 抽 `agent` 供 `isMimocodeBackgroundSession` 过滤同一理由）、`parsed`（已归一记录）。
 */
export interface FamilySessionView {
    readonly id: string;
    readonly row: SqliteRow;
    readonly title: string;
    readonly cwd?: string | undefined;
    readonly time?: IrTimeMs | undefined;
    readonly messages: readonly SqliteRow[];
    readonly parsed: ParsedTranscript;
}
/** 家族读器的逐源差异（缺省 = 不过滤，opencode / teleagent 口径） */
export interface FamilyReadOptions {
    /** 返回 true = 该会话不进结果集（逐源差异，见 `FamilySessionView`）；剔除数进 `sessions.dropped` */
    readonly dropSession?: ((session: FamilySessionView) => boolean) | undefined;
}
/** 读不到的**稳定机器码**：code 固定 source-unreadable，detail 区分原因（绝不进用户可见文案） */
export declare function sqliteSkip(origin: string, detail: string): ForeignSkip;
/**
 * 能力探测门：可用 → undefined；宿主缺 `node:sqlite` → 一条结构化降级 skip。
 *
 * **不抛、不返回 null**：能力缺失是「宿主不支持」这个**已知事实**，必须能被上层看见
 * （与「库读不到」不是同一件事）。
 */
export declare function sqliteGate(origin: string, deps?: SqliteDeps): Promise<ForeignSkip | undefined>;
/**
 * 只读打开（能力已探测）：默认走 `sqlite.ts` 的三态计划
 * （direct / immutable / copy —— **绝不往用户目录写文件**，见 sqlite.ts 文件头），
 * 并把失败原因带出来（`open-failed:<problem>`，如 `copy-too-large`）。
 * 注入的 `deps.open` 只能给句柄（测试用），没有细分原因 → detail 就是 `open-failed`。
 */
export declare function sqliteOpen(file: string, deps?: SqliteDeps): Promise<SqliteOpenResult>;
/** 打开失败的 detail（稳定机器码；`problem` 缺省说明失败发生在注入的 open 里） */
export declare function openDetail(problem: SqliteOpenProblem | undefined): string;
/**
 * 单元格 → 毫秒安全整数。
 *
 * 与 `session-ir.ts` 的 `irSafeTime` 的差异只有一条：SQLite 来源常见**秒**时间戳
 * （竞品 core 同款「秒/毫秒自适应 + 必须取整」），而 DSH 的时间字段要求安全整数毫秒。
 * 判据是**有界的**：只有正数且小于 `SECONDS_CEILING` 的整数才乘 1000，其余原样；
 * 负值/0 不做任何换算（绝不猜）。
 */
export declare function msTime(v: unknown): IrTimeMs | undefined;
/** 取第一个非空字符串列值（列**必须存在**才取得到 —— 缺列只丢该字段，不抛） */
export declare function pickString(row: SqliteRow, keys: readonly string[]): string | undefined;
/** 取第一个可解析时间列值（自适应列 + 秒/毫秒自适应） */
export declare function pickTime(row: SqliteRow, keys: readonly string[]): IrTimeMs | undefined;
/** JSON 列的取值结果（`absent` 与 `unparsable` 必须能区分：前者不是错误，后者要计数） */
export type JsonCell = {
    readonly ok: true;
    readonly value: unknown;
} | {
    readonly ok: false;
    readonly problem: 'absent' | 'unparsable';
};
/** 一行 JSON 列：TEXT/BLOB 里是 JSON 就解析；纯文本原样返回；空/缺 → absent；畸形 → unparsable */
export declare function jsonCell(row: SqliteRow, keys: readonly string[]): JsonCell;
/**
 * 库属于哪一代：`'v2'`（session_v2）/ `'v1'`（session）/ `undefined`（两者都没有）。
 *
 * **v2 必须优先**（竞品 `opencodeSchemaGeneration`）：V1→V2 迁移后旧三表仍留在同一个库里
 * （只是迁移的来源），先取 `session` 会读到**过期**数据 —— 新会话在 v2 表里、老会话在 v1 表里，
 * 两边都读还会让同一会话被导入两次。
 */
export declare function opencodeSchemaGeneration(tables: readonly string[]): 'v1' | 'v2' | undefined;
/** 消息 JSON 列候选（**导出**：逐源剔除谓词要读消息行里的源侧字段，如 mimocode 的 data.agent） */
export declare const MESSAGE_DATA_KEYS: string[];
/**
 * 一条源记录 → 1~2 条归一记录（**工具生命周期闭合的唯一实现**，SQLite 批四个读器共用）。
 *
 * 为什么必须拆：合成器只把 `tool_result` 归入**已打开的 step**（助手侧消息），一条记录里
 * 同时放 tool_call 与 tool_result 时结果会被**静默丢弃**（合成器的助手分支只取 tool_call）。
 * 因此 tool_result 一律拆到紧随其后的**用户侧记录**，与真实日志的「同一 step 内闭合」同形。
 */
export declare function splitToolResults(role: 'user' | 'assistant', blocks: readonly IrBlock[], meta: {
    readonly id?: string | undefined;
    readonly time?: IrTimeMs | undefined;
    readonly model?: string | undefined;
    /** provider 回报用量（assistant 侧；user 侧合成器不看，透传无害） */
    readonly usage?: unknown;
}): TranscriptRecord[];
/**
 * 打开着的库 → 每个会话一个归一文件。
 *
 * **返回 null ⇔ 读不到**：表读不出来 / 既无 `session` 也无 `session_v2` 表 /
 * 消息表查询失败。返回空数组才是「这就是该库，但里面没有会话」。
 *
 * **世代在这里先分派**（见 opencodeSchemaGeneration）：V2 库走 session_v2 + session_message，
 * V1 库走三表；两条路径产出的形状完全一致，差异只在读取层。
 */
export declare function readOpencodeFamilyDatabase(db: SqliteHandle, options?: FamilyReadOptions): SqliteReadPart | null;
/**
 * 家族入口：存在性 → 能力门 → 只读打开 → 解析，四步的错误各有稳定码。
 *
 * **库文件不存在 = 未安装**：不报码（与 detect 的 found:false 一致）；
 * 「存在但打不开 / 不是这个来源的库 / 查询失败」= 一条 `source-unreadable`（响亮）。
 */
export declare function readOpencodeFamily(dbFile: string, label: string, deps?: SqliteDeps, options?: FamilyReadOptions): Promise<SqliteReadPart>;
/** 真值表路径函数的入参（与 `session-source.ts` 的 RootProbeOptions 同形，只取用得到的字段） */
export interface SqlitePathInput {
    readonly homeDir: string;
    readonly platform: string;
}
/**
 * 三平台同形的 `<home>/.local/share/<product>/<name>`。
 *
 * 这条规则**Windows 也不走 %APPDATA%**（chat-import discovery.mjs:125-131 的
 * `joinFor('win32', home, '.local','share', ...)`）；read-claude-move 的 %APPDATA% 说法
 * 与 chat-import 冲突，按「有出入以 chat-import 为准」取它（真值表同款结论）。
 */
export declare function posixShareDbPath(platform: string, homeDir: string, product: string, name: string): string;
/** opencode 的库：`<home>/.local/share/opencode/opencode.db` */
export declare function opencodeDbPath(opts: SqlitePathInput): string;
/** opencode 的读盘入口（wiring 的 `read`） */
export declare function readOpencode(opts: SqlitePathInput & {
    readonly sqliteDeps?: SqliteDeps | undefined;
}): Promise<SessionReadOutcome<SqliteSessionFile>>;
/** 把家族计数键加上来源前缀（避免多来源合并时撞键） */
export declare function prefixCounts(prefix: string, counts: Readonly<Record<string, number>>): Record<string, number>;
