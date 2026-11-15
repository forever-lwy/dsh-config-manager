import type { ForeignLimitOverrides, ForeignSkip } from './types.ts';
import type { CodexInput, CodexSessionInput } from './codex.ts';
export interface CodexHomeOptions {
    /** 用户 home（Windows = %USERPROFILE%，macOS/Linux = $HOME） */
    homeDir: string;
    /** 进程环境（只用于位置覆盖判定：CODEX_HOME） */
    env?: Readonly<Record<string, string | undefined>>;
}
export interface CodexResolvedHome {
    /** Codex 配置目录绝对路径 */
    home: string;
    /** 是否由 CODEX_HOME 覆盖（命中即报 source-location-overridden） */
    overridden: boolean;
}
/**
 * Codex 配置目录：CODEX_HOME > ~/.codex（三平台同形）。
 * 不猜、不回退到「看起来像」的目录 —— 解析出来的路径就是唯一候选。
 */
export declare function resolveCodexHome(opts: CodexHomeOptions): CodexResolvedHome;
export interface CodexReadOptions extends CodexHomeOptions {
    /** 单文件读取上限（默认 8 MiB）；超过即不读并如实计入 unreadable */
    maxFileBytes?: number;
    /** 单个技能目录的文件数上限（默认 200） */
    maxSkillFiles?: number;
    /** 技能数上限（默认 500） */
    maxSkills?: number;
    /** 会话条数上限（默认 500；超过即报 max-sessions-reached） */
    maxSessions?: number;
    /** 可选上限覆盖（t36，装配层透传；缺省 = 上面各默认值逐字不变） */
    limits?: ForeignLimitOverrides;
}
export interface CodexReadResult {
    /** 是否找到 Codex 的痕迹（~/.codex 目录 或 ~/.agents/skills 目录）；未安装是正常状态 */
    found: boolean;
    /** 解析出的配置目录（诊断用） */
    home: string;
    locationOverridden: boolean;
    input: CodexInput;
    /** 读不到 / 超限 / 解析失败的**相对路径**（不含任何内容） */
    unreadable: string[];
}
/**
 * 解析失败的原因。**稳定机器码、只描述结构、绝不含值**：
 * 调用方一律映射成 source-unreadable(detail=toml-error)，绝不把解析器异常抛给上层。
 */
export type TomlParseResult = {
    ok: true;
    value: Record<string, unknown>;
} | {
    ok: false;
    reason: string;
};
/**
 * 解析 TOML 的最小有用子集：注释 / 空行 / 表头（[a.b]、[[a]]）/ 点分键 / 基本与字面量字符串
 * （含多行与转义）/ 整数与浮点 / 布尔 / 数组（可跨行、可尾逗号）/ 内联表。
 *
 * 刻意不做的：日期时间类型化（原样字符串）、字符串插值、UTF-16 代理对校验之外的 TOML 细节。
 * **任何失败都从返回值给出**（ok:false + 稳定 reason），绝不抛异常。
 */
export declare function parseTomlSubset(text: string): TomlParseResult;
/** 会话读盘结果（0 会话也是正常结果；子代理 rollout 已剔除并在 readFindings 里报码） */
export interface CodexSessionPart {
    readonly files: readonly CodexSessionInput[];
    readonly readFindings: readonly ForeignSkip[];
}
/**
 * 读 <CODEX_HOME> 的**双根** rollout（sessions/YYYY/MM/DD 与扁平的 archived_sessions/）。
 *
 * 三条纪律：
 *  ① 只认 `rollout-*.jsonl`（同目录别的 jsonl 不是会话转录，读了就是造垃圾会话）；
 *  ② 子代理 rollout（thread_source=subagent / source.subagent）**剔除并报码**，绝不产出碎片会话；
 *  ③ 读不到 / 超限 / 触顶如实报码，绝不静默少读。
 */
export declare function readCodexSessions(codexHome: string, maxSessions: number, maxBytes: number): Promise<CodexSessionPart>;
export declare function readCodex(opts: CodexReadOptions): Promise<CodexReadResult>;
