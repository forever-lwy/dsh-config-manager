import type { SectionId } from '../schema/types.ts';
/** 监听目标的形态：单个文件，或（递归）目录。 */
export type WatchTargetKind = 'file' | 'dir';
export interface WatchTarget {
    /** home 相对路径，posix 分隔符（Windows 上也用 `/`，便于比较与日志） */
    relPath: string;
    kind: WatchTargetKind;
    /** 目录目标是否递归（file 恒 false） */
    recursive: boolean;
    /** 该路径承载的分区（诊断/日志用，不参与「是否触发」判定） */
    sections: readonly SectionId[];
}
/** 组装监听目标所需的宿主事实（只读）。 */
export interface WatchScopeInput {
    /** `$DSH_HOME` 绝对路径 */
    homeDir: string;
    /** 当前 profile（决定 plugins / prompts / mcp 的落盘位置）；缺省 'web'（与 core/backup.ts 一致） */
    profile?: string;
}
/** 任意层级都要过滤的目录名（依赖树、git 内部、同步工作副本）。 */
export declare const WATCH_IGNORED_SEGMENTS: readonly string[];
/**
 * 组装监听目标清单。
 *
 * 清单顺序即日志顺序（稳定，便于测试与排查）；路径一律 posix 相对 `$DSH_HOME`。
 */
export declare function buildWatchTargets(input: WatchScopeInput): WatchTarget[];
/** 把任一绝对路径转成 home 相对 posix 路径；不在 home 内 → null。 */
export declare function toHomeRelPath(homeDir: string, absPath: string): string | null;
/**
 * 该 home 相对路径是否属于「绝不该触发同步」的噪声。
 *
 * 判据只有两类（宁少不多：漏过滤只是多跑一轮空同步，误过滤会漏掉真实改动）：
 * 依赖树 / git 内部目录，以及原子写临时文件。
 */
export declare function isNoiseRelPath(relPath: string): boolean;
/** 监视目标的绝对路径。 */
export declare function targetAbsPath(homeDir: string, target: WatchTarget): string;
