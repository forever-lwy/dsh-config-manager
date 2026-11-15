import type { ParsedTranscript, RootProbeOptions, SessionReadOutcome, TranscriptShape } from './session-source.ts';
/** 相对用户 home 的位置标签前缀（回给 GUI/CLI 的**只允许路径**） */
export declare const WORKBUDDY_PROJECTS_REL = ".workbuddy/projects";
/** 会话文件（JSONL 是唯一形态） */
export declare const WORKBUDDY_SESSION_FILE_RE: RegExp;
/** WorkBuddy 的项目根（三平台同形；真值表没有为它列任何环境变量覆盖） */
export declare function workbuddyProjectsDir(opts: RootProbeOptions): string;
/**
 * 记录形态的**键候选**单一来源（`parseWorkbuddyJsonl` 从这里取 cwd / 时间 / 模型 / 角色候选）
 * —— 形态本身是事件流（见下面的解析器），不是通用 JSONL。cwd 同义键集合刻意**保守**。
 *
 * cwdKeys 的取法是「只收语义唯一、不会被别的字段占用」的键：`cwd`/`workdir`/`working_directory`
 * 一类。刻意**不收** `path`/`file` 这类在 tool-call 里到处都是的键 —— 收进来就会把工具
 * 参数里的路径当成会话 cwd（那是猜，且错得静默）。`titleKeys` 去掉 `name`（常是工具名）。
 */
export declare const WORKBUDDY_SHAPE: TranscriptShape;
/** 一条已解析的 WorkBuddy 会话 */
export interface WorkbuddySessionFile {
    readonly id: string;
    readonly parsed: ParsedTranscript;
}
export interface WorkbuddyReadOptions extends RootProbeOptions {
    /** 单文件读取上限（缺省 8 MiB） */
    readonly maxFileBytes?: number | undefined;
    readonly maxSessionFiles?: number | undefined;
}
/**
 * 从注入的 user content 里提取**人类真实提问**（参考 convert/workbuddy.mjs 的
 * extractWorkbuddyUserQuery）。
 *
 * WorkBuddy 把 system-reminder / project_context / connector-status / expert_selection 等
 * 系统上下文和人类提问写进**同一条** user 消息，人类提问包在 `<user_query>…</user_query>` 里。
 * 不提取就会把整段注入上下文当成提问（并进一步当成会话标题）—— 旧行为。
 * 优先取信封正文；缺失时剥掉 system-reminder 整块、其余标签替换为空格（标签两侧常是不同
 * 块的文字，直接删会粘成一个词）后折叠空白。
 */
export declare function extractWorkbuddyUserQuery(content: unknown): string;
/**
 * WorkBuddy 会话 JSONL → 归一记录（参考 convert/workbuddy.mjs 的事件流水）。
 *
 * 事件词汇：`message`（user/assistant + content 块）、`reasoning`（rawContent[]）、
 * `function_call`（工具调用）、`function_call_result`（结果，按 callId 配对）、
 * `file-history-snapshot`（运行期元数据）。
 *
 * 本地 IR 只有 text / tool_call / tool_result 三种块 → `reasoning` **没有承载位**：
 * 只**显式计数**（`workbuddy:reasoning`），绝不把推理伪装成正文（与 continue 同一口径）。
 */
export declare function parseWorkbuddyJsonl(text: string): ParsedTranscript;
export declare function readWorkbuddySessions(opts: WorkbuddyReadOptions): Promise<SessionReadOutcome<WorkbuddySessionFile>>;
