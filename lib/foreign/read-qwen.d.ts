import type { ParsedTranscript, RootProbeOptions, SessionReadOutcome, TranscriptShape } from './session-source.ts';
/** 相对用户 home 的位置标签前缀（回给 GUI/CLI 的**只允许路径**） */
export declare const QWEN_PROJECTS_REL = ".qwenworkcn/projects";
/** 会话文件（JSONL 是唯一形态） */
export declare const QWEN_SESSION_FILE_RE: RegExp;
/** Qwen 的项目根（三平台同形；真值表没有为它列任何环境变量覆盖） */
export declare function qwenProjectsDir(opts: RootProbeOptions): string;
/**
 * 通用 JSONL 兜底形态（历史实现；本来源自 2026-10-06 起改用下面的专用解析器
 * `parseQwenJsonl`，**不再据此解析**——保留导出仅为不破坏既有公开面）。
 */
export declare const QWEN_SHAPE: TranscriptShape;
/** 一条已解析的 Qwen 会话 */
export interface QwenSessionFile {
    readonly id: string;
    readonly parsed: ParsedTranscript;
}
export interface QwenReadOptions extends RootProbeOptions {
    readonly maxFileBytes?: number | undefined;
    readonly maxSessionFiles?: number | undefined;
}
/** `parseQwenJsonl` 的额外产物：主转录自证用的源 sessionId（记录里没有 = undefined） */
export interface QwenParsedTranscript extends ParsedTranscript {
    readonly sessionId: string | undefined;
}
/**
 * `workspace-directories.directories[]` → 用户选的真实项目目录。
 *
 * 第一个非 `.qwenworkcn` 的字符串目录才是用户选的；全在 `.qwenworkcn` 下（纯聊天）
 * 返回 undefined（发现层归「无项目」桶，下游按 session-missing-cwd 跳过）。
 */
export declare function realQwenWorkspaceDir(directories: unknown): string | undefined;
/**
 * 千问 JSONL → 归一记录（本来源专用；对照 `lib/convert/qwen.mjs` 的 convertQwenJsonl）。
 *
 * 三条与通用 parser 的差异：① cwd 只认 `workspace-directories`（记录内 cwd 丢弃）；
 * ② 提问走 `humanInput` 优先 + 注入块过滤；③ `sessionId` 回传供主转录自证。
 */
export declare function parseQwenJsonl(text: string): QwenParsedTranscript;
export declare function readQwenSessions(opts: QwenReadOptions): Promise<SessionReadOutcome<QwenSessionFile>>;
