import type { ParsedTranscript } from './session-source.ts';
import type { ForeignImportResult, ForeignSkip } from './types.ts';
/** 一个已解析成**归一记录**的 Antigravity 会话（读盘层产出；翻译层只负责装配） */
export interface AntigravitySessionInput {
    /** conversationId（brain/ 下的目录名；同时作为 DSH 侧会话 id） */
    id: string;
    /** 归一记录（parsed.raw = 转录行原始条数） */
    parsed: ParsedTranscript;
}
/** Antigravity 配置的已读形态（纯数据；翻译层不做任何 fs 访问） */
export interface AntigravityInput {
    /** ~/.gemini/config/mcp_config.json（已解析；缺失 / 0 字节 / 畸形 = undefined） */
    globalMcp?: unknown;
    /** ~/.gemini/antigravity/mcp_config.json（IDE 侧同形位置；同上） */
    ideMcp?: unknown;
    /** ~/.gemini/antigravity/mcp_oauth_tokens.json 存在与否（**只报告**；正文绝不读） */
    oauthTokensPresent?: boolean;
    /** 三根 brain/<convId>/.system_generated/logs/ 下解析出的会话 */
    sessions?: AntigravitySessionInput[];
    /**
     * 目标机 DSH 的 SESSION_FORMAT_VERSION（**必须由宿主解析后传入**，见 utils/session-format.ts）。
     * 缺省 = 不转码任何会话并逐条报 session-format-version-unknown，绝不猜版本。
     */
    targetSessionFormatVersion?: number;
    /** 读盘层发现（0 字节 / 读不到）——原样带出，调用方无需二次合并 */
    readFindings?: ForeignSkip[];
}
export declare function convertAntigravity(input: AntigravityInput): ForeignImportResult;
