import type { Dirent, Stats } from 'node:fs';
import type { ForeignSkip } from './types.ts';
/** 读不到的**稳定**原因（调用方映射成 ForeignSkip 的 detail，绝不进用户可见文案） */
export type ReadProblem = 'missing' | 'empty' | 'too-large' | 'read-error' | 'json-error' | 'not-a-file';
/** 单文件读取上限的显式取值（各来源可覆盖，缺省 8 MiB 与既有读盘层一致） */
export declare const DEFAULT_MAX_FILE_BYTES: number;
/** 一次走盘的最大文件数（防病态目录树；超限即停，调用方据此报码） */
export declare const DEFAULT_MAX_WALK_FILES = 5000;
export declare function statOrNull(p: string): Promise<Stats | null>;
export declare function isDirectory(p: string): Promise<boolean>;
export declare function isFile(p: string): Promise<boolean>;
export declare function listDirSafe(p: string): Promise<Dirent[]>;
export declare function readBytesSafe(p: string, maxBytes?: number): Promise<Uint8Array | null>;
/**
 * 只读文件**头部窗口**（审计 P7-7）：给「先看 header 再决定要不要整读」的场景用。
 *
 * 与 readBytesSafe 的区别只有一点：不超过 maxBytes 时只取前 maxBytes 字节，而不是整份读。
 * 语义仍守四条硬边界（读不到返回 null、绝不抛、超上限不读）。调用方必须自己处理
 * 「头部窗口不足以判定」的退化路径 —— 不要把它当成整份内容。
 */
export declare function readBytesPrefixSafe(p: string, maxBytes: number): Promise<Uint8Array | null>;
export declare function readTextSafe(p: string, maxBytes?: number): Promise<string | null>;
/** 读 + 解析 JSON：**失败给出稳定原因**（0 字节与畸形必须能区分 —— 前者是空文件码，后者是解析错） */
export type JsonReadResult = {
    ok: true;
    value: unknown;
} | {
    ok: false;
    problem: ReadProblem;
};
export declare function readJsonSafe(p: string, maxBytes?: number): Promise<JsonReadResult>;
/** 逐行 JSONL 解析为「对象行 + 坏行数」（空行不计；**坏行绝不抛**） */
export interface JsonlLines {
    objects: Record<string, unknown>[];
    lines: number;
    bad: number;
}
export declare function parseJsonlText(text: string): JsonlLines;
/** 走盘命中项（rel = 相对探测根的 POSIX 路径，用作**位置标签**；abs 只在本进程内用） */
export interface WalkedFile {
    rel: string;
    abs: string;
    name: string;
}
export interface WalkOptions {
    /** 只收满足判定的**文件**（目录一律继续下钻；缺省 = 全部文件） */
    readonly match?: (name: string) => boolean;
    /** 最大下钻深度（根 = 0；缺省 8） */
    readonly maxDepth?: number;
    /** 最多收集多少个文件（缺省 DEFAULT_MAX_WALK_FILES） */
    readonly maxFiles?: number;
}
/**
 * 目录走盘（技能目录等）的**触顶统计**（t36）。
 *
 * 为什么要有它：各来源的目录走盘只回数组、不报是否触顶，于是「单目录文件数上限」
 * （maxSkillFiles=200）与「单文件字节上限」触顶时是**静默丢内容**（audit-foreign F4 的同族残余：
 * qwen 等 9 个会话源已在 t17 报码，技能文件遍历还没报）。走盘把统计交回调用方，
 * 由调用方用 dirWalkSkips() 换成与既有码同族的可见条目。
 */
export interface DirWalkStats {
    /** 命中条目数上限（= 至少还有一个候选文件没被收） */
    truncatedFiles?: boolean;
    /** 因单文件字节上限被跳过的文件数 */
    tooLargeCount?: number;
}
/** 目录走盘的条数触顶 detail（与 max-sessions-reached / max-skills-reached 同族） */
export declare const MAX_SKILL_FILES_REACHED = "max-skill-files-reached";
/** 单文件字节上限触顶的 detail（与各读盘层既有的 too-large 同名同义） */
export declare const DIR_WALK_TOO_LARGE = "too-large";
/**
 * 把一次目录走盘的触顶统计转成 skipped 条目（各来源共用同一口径）。
 * 无触顶 → 空数组（不产生噪声）；origin 一律是**包内相对标签**，绝不含机器路径或值。
 */
export declare function dirWalkSkips(stats: DirWalkStats | undefined, origin: string, maxFiles: number): ForeignSkip[];
/**
 * 解析一个可选上限：**上下文覆盖 > 读器显式选项 > 默认值**（t36 透传面的唯一口径）。
 * 只用安全正整数（脏值一律落到下一档），因此「不给覆盖」与改造前**逐字同行为**。
 */
export declare function resolveLimit(override: number | undefined, explicit: number | undefined, fallback: number): number;
/** 相对路径统一成 POSIX 形态（包内相对路径与位置标签都是 POSIX） */
export declare function toPosixPath(p: string): string;
/**
 * 递归收集普通文件（**不跟随符号链接**、深度与条数有上限、结果按相对路径排序）。
 * 读不到的目录静默跳过（它是「这里没有数据」，不是错误 —— 错误由调用方按根的存在性判定）。
 */
export declare function walkFiles(root: string, options?: WalkOptions): Promise<WalkedFile[]>;
/** 只列**直接子目录**的名字（排序；不跟随符号链接） */
export declare function listDirNames(dir: string): Promise<string[]>;
/** 只列**直接子文件**的名字（排序；可给判定） */
export declare function listFileNames(dir: string, match?: (name: string) => boolean): Promise<string[]>;
/** 去掉扩展名（不引入 path.parse 的平台差异：只切最后一个点之后的非空后缀） */
export declare function stemOf(name: string): string;
/** 探测结果：命中位置（**相对 home 的 POSIX 标签**）+ 如实记录的发现 */
export interface ProbeOutcome {
    readonly paths: readonly string[];
    readonly skipped: readonly ForeignSkip[];
}
/**
 * 位置标签：相对用户 home 的 POSIX 串（宿主给 GUI/CLI 的位置**绝不能是绝对路径** —— 那是机器身份）。
 * 不在 home 之下的（如 %APPDATA%、XDG 目录、显式项目目录）退化为「可辨识的顺序标签」，仍然不含盘符与用户名。
 */
export declare function labelForPath(homeDir: string, p: string): string;
/**
 * 按真值表逐个 stat 探测（**只 stat、绝不读内容**：检测层拿不到任何配置值，也就无从泄露）。
 *
 * 三条语义：不存在 = 正常（未安装，不是错误）；0 字节文件如实报码（仍算命中）；
 * 目录/文件都算命中（判据由真值表决定，本函数不额外收窄）。
 */
export declare function probeConfiguredPaths(paths: readonly string[], homeDir: string): Promise<ProbeOutcome>;
