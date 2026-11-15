import type { DshSessionLogFile } from './read-dsh.ts';
import type { RootProbeOptions, SessionReadOutcome } from './session-source.ts';
/** dsh4 = V4（`session.v4.jsonl.zstd`；本机实测首帧 version=4） */
export declare const DSH4_GENERATION = "v4";
export declare function dsh4SessionsRoot(opts: RootProbeOptions): string;
export declare function dsh4ProbePaths(opts: RootProbeOptions): string[];
/** 代次判定与 dsh 同源（同一个函数，不是副本） */
export declare function dsh4GenerationOfVersion(version: number | undefined): 'v4' | undefined;
/** 扫描 V4 代次日志（读盘规则全部来自 read-dsh.ts） */
export declare function readDsh4(opts: RootProbeOptions & {
    readonly maxLogs?: number;
    readonly maxFileBytes?: number;
    readonly maxTotalBytes?: number;
}): Promise<SessionReadOutcome<DshSessionLogFile>>;
