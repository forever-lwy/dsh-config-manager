import type { ForeignPlatform } from './platform-paths.ts';
import type { ParsedTranscript, RootProbeOptions, SessionReadOutcome } from './session-source.ts';
export declare const CHATGPT_EXPORT_FILE = "conversations.json";
export declare const CHATGPT_NEEDS_PATH_CODE = "source-needs-explicit-path";
/** 显式路径（= 宿主的 projectDir；未给 → undefined，**绝不回落到 cwd/home**） */
export declare function chatgptExplicitPath(opts: RootProbeOptions): string | undefined;
/** 目标平台下的父目录（不用 node:path：运行平台可能与目标平台不同） */
export declare function dirnameFor(platform: ForeignPlatform, p: string): string;
/** 一条已归一的会话文件（`ParsedTranscript` + 源侧 id） */
export interface ChatgptSessionFile extends ParsedTranscript {
    readonly id: string;
}
/** 秒/毫秒自适应的 epoch → 毫秒（导出文件的 create_time 是**浮点秒**） */
export declare function epochMsOf(v: unknown): number | undefined;
/** mapping DAG → 线性链（current_node 向上回溯；缺则最长根链） */
export declare function chatgptChainOf(mapping: unknown, currentNode: unknown): string[];
/** 读显式给出的 ChatGPT 导出包（无显式路径 → 空结果 + source-needs-explicit-path） */
export declare function readChatgpt(opts: RootProbeOptions & {
    readonly maxNodes?: number;
}): Promise<SessionReadOutcome<ChatgptSessionFile>>;
