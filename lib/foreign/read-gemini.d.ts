import type { IrBlock } from './session-ir.ts';
import type { ParsedTranscript, RootProbeOptions, SessionReadOutcome } from './session-source.ts';
/** 相对用户 home 的位置标签前缀（回给 GUI/CLI 的**只允许路径**） */
export declare const GEMINI_HISTORY_REL = ".gemini/history";
/**
 * 会话文件名（chat-import §3.1：`<slot>/chats/session-*.json`）。
 *
 * 两处与参考逐字对齐（convert 侧 discovery/gemini.mjs:20 是 `/^session-.+\.json$/i`）：
 *  · `.+` 而非 `.*` —— 拒绝 `session-.json`（空 stem 不是合法会话名，会产出空 id 会话）；
 *  · `i` 大小写不敏感 —— 真机上出现过 `Session-*.json` 的坑位（漏读 = 用户以为会话消失）。
 */
export declare const GEMINI_SESSION_FILE_RE: RegExp;
/** Gemini CLI 的历史根（三平台同形；真值表没有为它列任何环境变量覆盖） */
export declare function geminiHistoryDir(opts: RootProbeOptions): string;
/** 一条已解析的 Gemini 会话 */
export interface GeminiSessionFile {
    readonly id: string;
    readonly parsed: ParsedTranscript;
}
export interface GeminiReadOptions extends RootProbeOptions {
    readonly maxFileBytes?: number | undefined;
    readonly maxSessionFiles?: number | undefined;
}
/** 解析结果：成功给 id + 归一记录；失败给稳定机器码片段（调用方转成 source-unreadable） */
export type GeminiParseOutcome = {
    readonly ok: true;
    readonly id: string | undefined;
    readonly parsed: ParsedTranscript;
} | {
    readonly ok: false;
    readonly problem: 'json-error' | 'not-an-object' | 'messages-not-array';
};
/**
 * 内联工具结果文本（chat-import convert/gemini.mjs:105-116）。
 *
 * **必须走专用口径**：真实形态是 `result[].functionResponse.response.output`，而通用
 * `flattenText` 只认 text/content/message —— 交给它必然返回空串（导入后工具结果全空）。
 * 取值顺序：逐条 functionResponse.response.output → `resultDisplay`（参考的兜底，本仓此前完全没有）
 * → 通用文本投影（容忍非官方变体：本仓既有夹具用 `result: '文本'`）。
 */
export declare function geminiToolResultText(item: Record<string, unknown>, ignored: Record<string, number>): string | undefined;
/**
 * `toolCalls[]` → 工具块。
 *
 * 返回值 = **调用块**（写进 assistant 那条记录）；`results` 是出参，收集**内联结果**
 * （写进紧随其后的 user 记录）。
 *
 * id 缺省时铸 `gemini-<turn>-<n>`（chat-import convert/gemini.mjs:72 同款）：合成器对空
 * callId 会**只改写调用侧**为 `call-<消息序>`（session-ir.ts:389），结果侧仍是空串 →
 * tool/result 与 tool/call 配对断裂（会话被判损坏）。铸 id 后两侧同源，配对恒闭合。
 */
export declare function geminiToolBlocks(raw: unknown, ignored: Record<string, number>, results: IrBlock[], turn?: number): IrBlock[];
/** 单对象 JSON → 归一记录（**不是** JSONL：整份文件是一个对象） */
export declare function parseGeminiSession(text: string): GeminiParseOutcome;
export declare function readGeminiSessions(opts: GeminiReadOptions): Promise<SessionReadOutcome<GeminiSessionFile>>;
