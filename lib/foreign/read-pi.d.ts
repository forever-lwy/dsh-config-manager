import type { ForeignPlatform } from './platform-paths.ts';
import type { ParsedTranscript, RootProbeOptions, SessionReadOutcome, TranscriptShape } from './session-source.ts';
/** 相对用户 home 的位置标签前缀（回给 GUI/CLI 的**只允许路径**） */
export declare const PI_SESSIONS_REL = ".pi/agent/sessions";
/** 会话文件（JSONL 是唯一形态） */
export declare const PI_SESSION_FILE_RE: RegExp;
/** 会话目录名的包装：`--<cwd>--` */
export declare const PI_DIR_PREFIX = "--";
/** Pi 的会话根（三平台同形；真值表没有为它列任何环境变量覆盖） */
export declare function piSessionsDir(opts: RootProbeOptions): string;
/**
 * 通用 JSONL 形态（**遗留**：Pi 走专用事件流解析，本常量只为保留既有公开导出名）。
 */
export declare const PI_SHAPE: TranscriptShape;
/** 一条已解析的 Pi 会话 */
export interface PiSessionFile {
    readonly id: string;
    readonly parsed: ParsedTranscript;
}
export interface PiReadOptions extends RootProbeOptions {
    readonly maxFileBytes?: number | undefined;
    readonly maxSessionFiles?: number | undefined;
}
/**
 * `--<cwd>--` 目录名 → 绝对路径**候选**（按目标平台排序；唯一判据是**存在性**）。
 *
 * 编码是有损的（路径里的 `-` 与分隔符同形），所以本函数只产出候选、**不做判断** ——
 * 由调用方逐个 `isDirectory` 验真。两种编码形态都收：
 *  - `C:-Users-u-proj`（posix 形态的 `/`→`-`）；
 *  - `C--Users-u-proj`（分隔符与冒号一起 → `-`）。
 */
export declare function piCwdCandidates(dirName: string, platform: ForeignPlatform): string[];
/** 目录名反解 → 本机真实存在的目录（不存在 = undefined，**绝不猜**） */
export declare function derivedCwdOfDirName(dirName: string, platform: ForeignPlatform): Promise<string | undefined>;
/**
 * 会话 id：头的 id > 文件名 `<timestamp>_<uuid>` 的 uuid 段 > 文件名主干。
 * 自证安全性（isSafeIrId）留给下游 `transcodeSessionDraft` —— 不安全就报 session-unsafe-id，
 * **绝不在这里悄悄换一个 id**。
 */
export declare function piSessionIdOf(header: Record<string, unknown> | undefined, fileStem: string): string;
export interface PiParseOutcome {
    /** 会话头（`type:"session"`）；缺省 = 不是 Pi 会话文件 */
    readonly header?: Record<string, unknown> | undefined;
    readonly parsed: ParsedTranscript;
}
/**
 * Pi 会话 JSONL（纯函数：原文 → 已归一记录）。
 *
 * 步骤：① 找会话头（`type:"session"`；没有 → `header` 留空，调用方跳过该文件）；
 * ② 其余条目按 `id/parentId` 组树（缺 id 的旧式条目按顺序链接）；
 * ③ 从末条目沿 `parentId` 走到根 = **活动分支**（visited 防环），旁支条目丢弃并计数；
 * ④ 沿活动分支把 message 归一成记录，toolResult 挂回声明它的 assistant 记录之后；
 * ⑤ 标题取活动分支上最后一个 `session_info.name`，缺省回退首条用户文本。
 */
export declare function parsePiTranscript(text: string): PiParseOutcome;
export declare function readPiSessions(opts: PiReadOptions): Promise<SessionReadOutcome<PiSessionFile>>;
