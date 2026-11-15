import type { ForeignPlatform } from './platform-paths.ts';
import type { ParsedTranscript, RootProbeOptions, SessionReadOutcome } from './session-source.ts';
export declare const REASONIX_DIR = ".reasonix";
export declare const REASONIX_SESSIONS_SUBDIR = "sessions";
export declare const REASONIX_DESKTOP_DIR = "reasonix";
/**
 * 静态探测位置（**多根**）：`<home>/.reasonix/sessions` +（win32）`%APPDATA%/reasonix`。
 *
 * 为什么 win32 的第二根无条件加入（而不是「仅 $APPDATA 存在时」）：真值表把这两条都写进了
 * `defaults.win32`，而 `roamingAppDataDir` 在缺 %APPDATA% 时会回落到 `<home>/AppData/Roaming`
 * —— 条件加入会让 probePaths 与真值表在「空环境」下逐项不等（t6 按合成真值交叉核对时必红）。
 */
export declare function reasonixSessionRoots(opts: RootProbeOptions): string[];
/**
 * 一条已归一的会话文件（`ParsedTranscript` + 源侧 id，draftOf 直接透传）。
 *
 * `walMerged` / `walRecords` 是 WAL 合并的可见性报告（绝不静默）。
 */
export interface ReasonixSessionFile extends ParsedTranscript {
    readonly id: string;
    readonly walMerged: boolean;
    readonly walRecords: number;
}
/** 伴生元数据路径（**旧版**）：`<stem>.jsonl` → `<stem>.meta.json` */
export declare function reasonixMetaPath(jsonlPath: string): string;
/** 伴生元数据路径（**新版**）：`<file>.jsonl` → `<file>.jsonl.meta`（chat-import source-derive.mjs:118） */
export declare function reasonixModernMetaPath(jsonlPath: string): string;
/** V2 事件日志（WAL）路径：`<stem>.jsonl` → `<stem>.events.jsonl` */
export declare function reasonixWalPath(jsonlPath: string): string;
/**
 * stem 内嵌的会话创建时刻（`YYYYMMDDHHMM`，本地时间；chat-import convert/reasonix.mjs:31-41）。
 * 转录行与 meta 都没有时间戳时回退到它 —— 否则会话创建时间会落成**导入时刻**。
 */
export declare function reasonixStemTime(stem: string): number | undefined;
/**
 * 桌面版布局 `…/projects/<slug>/sessions/<file>.jsonl`（chat-import source-derive.mjs:210-218）：
 * 返回 slug 与 sessions 目录；不是该布局返回 undefined。
 */
export declare function reasonixDesktopLayout(path: string): {
    readonly slug: string;
    readonly sessionsDir: string;
} | undefined;
/**
 * Reasonix 项目 slug 贪心逆解码（chat-import cwd-map.mjs:86-134）：磁盘存在性逐段匹配，
 * `c--users--name--proj` → `C:\users\name\proj`，兼容含 `-` 的目录名（合并 ≤3 段）。
 * 只接受**绝对路径**（相对候选会随进程 cwd 漂移，宁可返回 undefined）。
 */
export declare function greedyDecodeSlugPath(slug: string, platform: ForeignPlatform): Promise<string | undefined>;
/** 一次解析的结果（含 WAL 合并报告，与参考的 `{walMerged, walRecords}` 同口径） */
export interface ReasonixParseResult extends ParsedTranscript {
    readonly walMerged: boolean;
    readonly walRecords: number;
}
/**
 * checkpoint JSONL（+ 可选 V2 WAL）→ 归一记录。
 *
 * WAL 合并（chat-import convert/reasonix.mjs:58-74）：
 *  · `{type:'replace', messages:[…]}` = 权威快照，**整表替换** checkpoint；
 *  · 其余行按出现顺序追加到 checkpoint 之后（晚到者胜）；
 *  · 无 WAL / 空 WAL → 纯 checkpoint（旧行为）。
 */
export declare function parseReasonixTranscript(checkpointText: string, walText?: string | null): ReasonixParseResult;
/** 读全部 reasonix 会话（多根；同 id 先到先得，不覆盖 —— 与全局「同 id 只允许一条」同口径） */
export declare function readReasonix(opts: RootProbeOptions & {
    readonly maxFiles?: number;
}): Promise<SessionReadOutcome<ReasonixSessionFile>>;
