import type { ParsedTranscript, RootProbeOptions, SessionReadOutcome } from './session-source.ts';
export declare const VIBE_HOME_ENV = "VIBE_HOME";
export declare const VIBE_DEFAULT_DIR = ".vibe";
export declare const VIBE_LOG_SEGMENTS: readonly string[];
export declare const VIBE_SESSION_DIR_PREFIX = "session_";
/** 静态探测位置（**两根并存**：$VIBE_HOME 根 + ~/.vibe 根；去重但不丢任一根） */
export declare function vibeSessionRoots(opts: RootProbeOptions): string[];
/** 一条已归一的会话文件（`ParsedTranscript` + 源侧 id，draftOf 直接透传） */
export interface VibeSessionFile extends ParsedTranscript {
    readonly id: string;
}
/**
 * 目录名 `session_<ts>_<shortId>` 里的时间戳（毫秒安全整数才采信）。
 * 这是**布局自证的元数据**（不是从内容猜 cwd），meta.json 缺时间时用它兜底。
 * `<ts>` 既可能是毫秒（13 位）也可能是秒（10 位）→ 交给 `vibeTimeOf` 判定。
 */
export declare function vibeTimeFromDirName(name: string): number | undefined;
/**
 * messages.jsonl → 归一记录（对照 `lib/convert/vibe.mjs` 的 convertVibeJson）。
 *
 * 工具结果按 `tool_call_id` 挂回声明它的 assistant 记录 → **产出顺序**里紧跟该记录
 * （本地合成器按位置把结果收进「当前 step」，参考实现同样要求结果归属 call 所在 step）。
 */
export declare function parseVibeJsonl(text: string): ParsedTranscript;
/** 读全部 vibe 会话（两根；**递归**收集含 messages.jsonl 的目录，命中即收下不下钻） */
export declare function readVibe(opts: RootProbeOptions & {
    readonly maxFiles?: number;
}): Promise<SessionReadOutcome<VibeSessionFile>>;
