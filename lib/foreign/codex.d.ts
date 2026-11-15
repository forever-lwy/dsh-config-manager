import type { ParsedTranscript } from './session-source.ts';
import type { ForeignImportResult, ForeignSkip } from './types.ts';
/** 一个 Codex skill 单元：技能名 + 目录内文件（category 只用于报告压平，不参与命名） */
export interface CodexSkillInput {
    name: string;
    files: {
        relativePath: string;
        data: Uint8Array;
    }[];
    /** 外层目录名（~/.agents/skills/<外层>/<技能>/SKILL.md）——有值即报 skill-category-flattened */
    category?: string;
}
/**
 * 一个已解析成**归一记录**的 Codex 会话（读盘层产出；翻译层只负责装配）。
 *
 * id 一律由读盘层保证「过 isSafeIrId 或明知不安全」——不安全 id 由
 * transcodeSessionDraft 报 session-unsafe-id，本层绝不改名（改名等于伪造另一个会话的身份）。
 */
export interface CodexSessionInput {
    /** session_meta.payload.id（安全 id 时）；否则回落 rollout 文件名去扩展名 */
    id: string;
    /** 归一记录（parsed.raw = rollout 原始行数，含被忽略的） */
    parsed: ParsedTranscript;
}
/**
 * Codex 配置的已读形态（纯数据；翻译层不做任何 fs 访问）。
 *
 * 为什么类型定义在本文件而不是 types.ts：本任务的作用域只含 codex.ts / read-codex.ts /
 * codex.test.ts / fixtures —— 把来源专属类型留在来源模块里，既不动其它来源的公共面，
 * 也便于 t22 装配时按需再导出。
 */
export interface CodexInput {
    /** ~/.codex/config.toml（已解析；缺失 / 0 字节 / 畸形 = undefined） */
    config?: unknown;
    /** 按发现层级选中的全局指令文件原文（AGENTS.override.md 优先于 AGENTS.md） */
    instructions?: string;
    /** ~/.agents/skills 的技能单元（frontmatter 校验在翻译层做） */
    skills?: CodexSkillInput[];
    /** sessions/ 与 archived_sessions/ 下读出的 rollout 会话（已归一记录；子代理 rollout 已被读盘层剔除） */
    sessions?: CodexSessionInput[];
    /**
     * 目标机 DSH 的 SESSION_FORMAT_VERSION（**必须由宿主解析后传入**，见 utils/session-format.ts）。
     * 缺省 = 不转码任何会话并整批报 session-format-version-unknown，绝不猜版本。
     */
    targetSessionFormatVersion?: number;
    /** 读盘层发现（位置被 CODEX_HOME 覆盖 / 0 字节 / 命中 override / 读不到 / 子代理 rollout）——原样带出，调用方无需二次合并 */
    readFindings?: ForeignSkip[];
}
export declare function convertCodex(input: CodexInput): ForeignImportResult;
/**
 * Codex 子代理 rollout 判定（与竞品 `codexSubagentMarker` 同一份判据）。
 *
 * thread_source='subagent' 是权威标记；source.subagent 是 spawned thread 形态（含
 * thread_spawn.parent_thread_id）。**不据此跳过 fork**：forked_from_id / parent_thread_id
 * 描述「从某会话 fork 出的新主会话」，它仍是可独立继续的用户会话，必须保留。
 * 返回命中的标记名（供 skipReason 诊断），未命中 null。
 */
export declare function codexSubagentMarker(payload: unknown): string | null;
/**
 * 会话 id：session_meta.payload.id **过 isSafeIrId 才用**，否则回落 rollout 文件名（去扩展名）。
 * 两者都不安全时原样带出，由 transcodeSessionDraft 报 session-unsafe-id —— 绝不静默改名成别的会话。
 */
export declare function codexSessionId(payloadId: unknown, fileName: string): string;
/** rollout 的解析结果（读盘层据此决定「建会话」还是「剔除并报码」） */
export interface CodexRolloutParse {
    readonly parsed: ParsedTranscript;
    readonly id: string;
    /** 子代理标记（非 null = 不是独立会话） */
    readonly subagent: string | null;
}
/**
 * Codex rollout JSONL → 归一记录（一行一条 {timestamp, type, payload} 信封）。
 *
 *  - session_meta → id / cwd / 创建时间 / 子代理标记（元数据，不占记录）
 *  - turn_context → 模型（Codex 可中途换模型：逐条生效，落到其后开的记录上）
 *  - response_item → 真正的产物：message（user / assistant）、function_call(_output)、
 *    custom_tool_call(_output)、reasoning，其余类型逐类计数
 *  - event_msg 的 user_message / agent_message 是 response_item 的**重复**（竞品明确警告会重复
 *    计数）→ 不记账、不产出记录
 *  - compacted（上下文压缩）与 reasoning 在本共享 IR 里没有承载块 → **逐类计数**，绝不伪装成正文
 *  - 坏行不抛，只计入 bad（与 parseGenericJsonl 同口径）
 */
export declare function parseCodexRollout(text: string, fileName: string): CodexRolloutParse;
