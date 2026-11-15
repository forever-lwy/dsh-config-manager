import type { ParsedTranscript } from './session-source.ts';
import type { ForeignLimitOverrides } from './types.ts';
import type { AntigravityInput } from './antigravity.ts';
/** Antigravity 的 gemini 目录名（真值表用一个值固定下来，调用方不该各写一份字符串） */
export declare const ANTIGRAVITY_GEMINI_DIR_NAME = ".gemini";
/**
 * ~/.gemini 的路径解析（三平台同形，无环境变量覆盖：契约 §8.2 没有给 Antigravity 列覆盖变量）。
 */
export declare function resolveGeminiHome(opts: {
    homeDir: string;
}): {
    dir: string;
};
export interface AntigravityReadOptions {
    /** 已解析的 .gemini 目录绝对路径（宿主用 resolveGeminiHome(...).dir） */
    geminiDir: string;
    /** 单文件读取上限（默认 8 MiB）；超过即不读并如实计入 unreadable */
    maxFileBytes?: number;
    /** 会话数上限（默认 500）；超出即报 source-unreadable/max-sessions-reached，绝不静默截断 */
    maxSessions?: number;
    /** 可选上限覆盖（t36，装配层透传；缺省 = 上面各默认值逐字不变） */
    limits?: ForeignLimitOverrides;
}
export interface AntigravityReadResult {
    /** 是否找到 Antigravity 的痕迹（.gemini 目录存在）；未安装是正常状态，不是错误 */
    found: boolean;
    /** 命中的相对路径（诊断用；**只允许路径，绝不含任何值**） */
    paths: string[];
    input: AntigravityInput;
    /** 读不到 / 超限 / 解析失败的**相对路径**（不含任何内容） */
    unreadable: string[];
}
/** 三根并列（真值表同款：IDE / 旧 CLI / 个别发行） */
export declare const ANTIGRAVITY_ROOTS: readonly string[];
/** <USER_REQUEST> 内的正文即真实提问；<ADDITIONAL_METADATA> 是脚手架元信息，剥掉 */
export declare function unwrapUserRequest(text: unknown): string;
/** annotations/*.pbtxt 是 protobuf 文本格式（title:"…"），标题是唯一需要的字段 */
export declare function parseAnnotationTitle(raw: string): string;
export interface AntigravityParseOptions {
    /** annotations/<id>.pbtxt 解析出的标题（空串 = 没有） */
    title?: string | undefined;
    /** stepIndex → 伴生 messages/*.json 的回执正文（异步任务的真实输出） */
    taskMessages?: ReadonlyMap<number, string> | undefined;
}
/**
 * transcript.jsonl → 归一记录。
 *
 * 记录语义（参考实现 lib/convert/antigravity.mjs 逐条对齐）：
 *  - USER_INPUT：content 包在 <USER_REQUEST> 里 → 剥壳后是用户轮；
 *  - PLANNER_RESPONSE：content 是正文、thinking 是思考摘要、tool_calls 是调用；
 *  - GENERIC + status=DONE：**工具结果**，按「最早尚无结果的未决调用」正序配对；
 *  - ERROR_MESSAGE：保留为 assistant 正文（失败不许被抹掉）；
 *  - SYSTEM_MESSAGE / CHECKPOINT：框架噪声 → 跳过并逐类计数；
 *  - 未配上结果的调用（fire-and-forget / 任务控制）标显式占位，**绝不虚构空结果**。
 */
export declare function parseAntigravityTranscript(raw: string, opts?: AntigravityParseOptions): ParsedTranscript;
export declare function readAntigravity(opts: AntigravityReadOptions): Promise<AntigravityReadResult>;
