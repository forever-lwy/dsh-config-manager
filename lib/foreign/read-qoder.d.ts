import type { ForeignPlatform } from './platform-paths.ts';
import type { ParsedTranscript, RootProbeOptions, SessionReadOutcome, TranscriptShape } from './session-source.ts';
/** 相对用户 home 的位置标签前缀（回给 GUI/CLI 的**只允许路径**，绝不含用户名/盘符） */
export declare const QODER_PROJECTS_REL = ".qoder/projects";
/** 会话文件（在该来源里 JSONL 是唯一形态） */
export declare const QODER_SESSION_FILE_RE: RegExp;
/** Qoder 的项目根（三平台同形；真值表没有为它列任何环境变量覆盖） */
export declare function qoderProjectsDir(opts: RootProbeOptions): string;
/**
 * 记录形态：与通用 JSONL 同族（`{role|type, message|content, timestamp, id}`）。
 *
 * 两处**收紧**（不是美化，而是避免误取）：
 *  - `titleKeys` 去掉 `name`：JSONL 里的 `name` 常是工具名，拿它当标题会张冠李戴；
 *  - `cwdKeys` 加几个同义键（记录里带 cwd 时优先采信记录，见文件头 ①）。
 */
export declare const QODER_SHAPE: TranscriptShape;
/** 一条已解析的 Qoder 会话（读盘层的产物；`parsed` 已含 cwd 判定结果） */
export interface QoderSessionFile {
    readonly id: string;
    readonly parsed: ParsedTranscript;
}
export interface QoderReadOptions extends RootProbeOptions {
    /** 单文件读取上限（缺省 8 MiB）；超限即不读并如实计入 findings */
    readonly maxFileBytes?: number | undefined;
    /** 本次最多收集多少条会话（缺省 500） */
    readonly maxSessionFiles?: number | undefined;
}
/**
 * 目录名（cwd 的 `/`→`-` 编码）→ 本机真实存在的目录；反解不出来就返回 undefined（绝不猜）。
 *
 * 两个候选形态（按平台决定先后，**存在性**是唯一判据）：
 *  - posix 形态：`-home-u-proj` → `/home/u/proj`；
 *  - win32 盘符形态：`C--Users-u-proj` → `C:\Users\u\proj`。
 */
export declare function derivedCwdOf(encoded: string, platform: ForeignPlatform): Promise<string | undefined>;
/**
 * Qoder 的 JSONL 比通用 JSONL 多三类**只在本源有**的事实（所以这里不直接用
 * `parseGenericJsonl`，否则要再扫一遍原始行才能拿到）：
 *  ① `ai-title` / `last-prompt` 记录 —— 标题（ai-title > last-prompt > 首问兜底）；
 *  ② 记录里的 `sessionId` —— 「文件名 stem == sessionId」的主体判定（辅助 / 子代理 transcript 跳过）；
 *  ③ `tool_result` 缺 `tool_use_id` 时，按**未决调用顺序**回退配对（参考 convert/qoder.mjs）。
 * `thinking` 块由 `genericBlocksOf` 逐类计数（`block:thinking`）—— 本地 IR 没有 reasoning 承载位，
 * 只显式计数、绝不伪装成正文。
 */
export interface QoderParseResult {
    readonly parsed: ParsedTranscript;
    /** 记录里自报的 sessionId（有则用于主体判定） */
    readonly sessionId?: string | undefined;
    /** 文件名 stem 与记录 sessionId 不一致（辅助 / 子代理 transcript） */
    readonly stemMismatch: boolean;
}
/** 一份 Qoder transcript（JSONL）→ 归一记录 + 主体判定（`fileStem` = 文件名去掉 .jsonl） */
export declare function parseQoderJsonl(text: string, fileStem?: string): QoderParseResult;
export declare function readQoderSessions(opts: QoderReadOptions): Promise<SessionReadOutcome<QoderSessionFile>>;
