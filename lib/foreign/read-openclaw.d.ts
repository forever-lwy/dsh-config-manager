import type { ParsedTranscript, RootProbeOptions, SessionReadOutcome, TranscriptShape } from './session-source.ts';
/** 相对用户 home 的位置标签前缀（回给 GUI/CLI 的**只允许路径**） */
export declare const OPENCLAW_AGENTS_REL = ".openclaw/agents";
/** 会话文件（JSONL 是唯一形态；索引是 .json，按后缀天然区分） */
export declare const OPENCLAW_SESSION_FILE_RE: RegExp;
/** 伴生索引文件名（与真值表 truth-table.ts 的 dynamic 描述同源） */
export declare const OPENCLAW_INDEX_NAME = "sessions.json";
/**
 * 走盘命中判据：路径里同时出现 `agents` 与 `sessions` 段（逐字对齐
 * discovery/jsonl.mjs:242 的 `/\bagents\b.*\bsessions\b/i`）。
 */
export declare const OPENCLAW_SESSION_PATH_RE: RegExp;
/** OpenClaw 的 agents 根（三平台同形；真值表没有为它列任何环境变量覆盖） */
export declare function openclawAgentsDir(opts: RootProbeOptions): string;
/**
 * 通用 JSONL 形态（**遗留**：OpenClaw 已改走专用事件流解析，本常量只为保留既有公开导出名）。
 */
export declare const OPENCLAW_SHAPE: TranscriptShape;
/** 一条已解析的 OpenClaw 会话（`title` 有值时已回填进 `parsed`） */
export interface OpenclawSessionFile {
    readonly id: string;
    readonly parsed: ParsedTranscript;
}
export interface OpenclawReadOptions extends RootProbeOptions {
    readonly maxFileBytes?: number | undefined;
    readonly maxSessionFiles?: number | undefined;
}
/**
 * 读 `sessions.json` 索引：**只取 id → displayName 的名字映射**。
 *
 * 两种形态都认（对象映射 / 数组）；认不出来就返回空映射（绝不因此丢会话）。
 * id 的候选键：对象项优先取 `sessionId`（对齐 convert/openclaw.mjs 的 openclawDisplayNames），
 * 没有才退回对象键；数组项取 `id` / `sessionId` / `session_id`。
 */
export declare function sessionNamesFromIndex(value: unknown): Map<string, string>;
/** 剥离 OpenClaw gateway 注入的尾部元数据 `\n[message_id: …]`（对齐 convert/openclaw.mjs） */
export declare function stripMessageIdSuffix(text: string): string;
export interface OpenclawEventParse {
    /** session 事件里的 id（缺省时由调用方回落到文件主干） */
    readonly sessionId?: string | undefined;
    readonly parsed: ParsedTranscript;
}
/**
 * OpenClaw 事件流（纯函数：原文 → 已归一记录）。
 *
 * 三条纪律：① session 事件只取 id/cwd/timestamp，出现多次只认第一条；② message 事件的
 * role 决定记录角色，toolResult 按 `tool_use_id` 挂回声明该调用的 assistant 记录**之后**
 * （由共享合成器收进同一个 step）；③ 对不上的孤儿结果丢弃并逐类计数，绝不塞进别的回合。
 */
export declare function parseOpenclawEventStream(text: string): OpenclawEventParse;
export declare function readOpenclawSessions(opts: OpenclawReadOptions): Promise<SessionReadOutcome<OpenclawSessionFile>>;
