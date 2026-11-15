import type { ForeignPlatform } from './platform-paths.ts';
import type { ParsedTranscript, RootProbeOptions, SessionReadOutcome } from './session-source.ts';
export declare const GROK_HOME_ENV = "GROK_HOME";
export declare const GROK_DEFAULT_HOME_DIR = ".grok";
/** 双根：chat-import 的注释点名「归档目录此前未纳入默认根，其下的 rollout 完全扫不到」 */
export declare const GROK_SESSION_SUBDIRS: readonly string[];
export interface GrokResolvedHome {
    readonly home: string;
    readonly overridden: boolean;
}
/** GROK_HOME（非空即替换；**只报键名，绝不读值进产物**）→ 默认 ~/.grok */
export declare function resolveGrokHome(opts: RootProbeOptions): GrokResolvedHome;
/** 静态探测位置（**双根**；运行时再在它下面递归枚举会话目录） */
export declare function grokSessionRoots(opts: RootProbeOptions): string[];
/** 一条已归一的会话文件（结构上就是 ParsedTranscript + 源侧 id，draftOf 可直接透传） */
export interface GrokSessionFile extends ParsedTranscript {
    readonly id: string;
}
/**
 * 目录名 → cwd：encodeURIComponent(cwd) 的逆变换（可逆，故不是「猜」）。
 * 解不出 / 解出来不是目标平台的绝对路径 → undefined（宁可不给，也不落一条错 cwd 的会话）。
 */
export declare function grokCwdFromDirName(name: string, platform: ForeignPlatform): string | undefined;
/** chat_history.jsonl → 归一记录（真实 {type,…} 形状；不是通用 role/content 形状） */
export declare function parseGrokHistory(text: string): ParsedTranscript;
/**
 * 读全部 grokbuild 会话（双根；源码位置一律按**目标平台**拼接）。
 *
 * 上限：单文件 8 MiB、单根最多 MAX_SESSION_DIRS 个会话目录；触顶**如实报码**（source-unreadable
 * 的 detail=max-sessions-reached），绝不静默截断。
 */
export declare function readGrokbuild(opts: RootProbeOptions & {
    readonly maxFiles?: number;
}): Promise<SessionReadOutcome<GrokSessionFile>>;
