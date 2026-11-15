import type { IrTimeMs } from './session-ir.ts';
import type { ParsedTranscript, SessionReadOutcome } from './session-source.ts';
import type { ForeignLimitOverrides } from './types.ts';
import type { CursorInput, CursorRuleActivation, CursorSessionInput } from './cursor.ts';
export interface CursorHomeOptions {
    /** 用户 home（Windows = %USERPROFILE%，macOS/Linux = $HOME） */
    homeDir: string;
}
/**
 * Cursor 用户级配置目录：三平台同形 = <home>/.cursor（契约 §8.2 未列出任何环境变量覆盖，
 * 官方文档也没有 CURSOR_CONFIG_DIR 这类开关 → **不猜**：解析出来的路径就是唯一候选）。
 */
export declare function resolveCursorHome(opts: CursorHomeOptions): string;
/**
 * 会话读盘的选项（**只含会话需要的那几项**）。
 *
 * 为什么刻意不收 `projectDir`：会话根只有用户级 `~/.cursor/projects`（项目级 `.cursor/` 只有
 * mcp/rules/skills，没有 projects）—— 收一个用不上的参数只会让调用方以为项目级也有会话。
 */
export interface CursorSessionsReadOptions extends CursorHomeOptions {
    /** 单文件读取上限（默认 8 MiB）；超过即不读并如实计入 findings */
    maxFileBytes?: number;
    /** 会话文件数上限（默认 500）；超出即报 max-sessions-reached，绝不静默截断 */
    maxSessions?: number;
    /** 可选上限覆盖（t36，装配层透传；缺省 = 上面各默认值逐字不变） */
    limits?: ForeignLimitOverrides;
}
export interface CursorReadOptions extends CursorSessionsReadOptions {
    /** 可选的项目目录（项目级 .cursor/ 与 .cursorrules 在这里；缺省 = 只读用户级） */
    projectDir?: string;
    /** 单个技能目录的文件数上限（默认 200） */
    maxSkillFiles?: number;
    /** 技能数上限（默认 500） */
    maxSkills?: number;
}
/** 一次会话读盘的结果（形状与档 B 会话来源共用：`{ files, readFindings, … }`） */
export type CursorSessionsReadResult = SessionReadOutcome<CursorSessionInput>;
export interface CursorReadResult {
    /** 是否找到 Cursor 的痕迹（~/.cursor 或 <项目>/.cursor 目录，或读到了任何内容）；未安装是正常状态 */
    found: boolean;
    /** 解析出的用户级配置目录（诊断用；不含任何值） */
    home: string;
    /** 项目目录（未提供时为 undefined） */
    projectDir?: string;
    input: CursorInput;
    /** 读不到 / 超限 / 解析失败的**相对路径**（不含任何内容） */
    unreadable: string[];
}
export interface ParsedCursorRule {
    activation: CursorRuleActivation;
    /** 并入 AGENTS.md 的正文（frontmatter 缺失/损坏时 = 全文，绝不丢内容） */
    body: string;
    /** frontmatter 解析问题（稳定机器码片段；undefined = 正常） */
    problem?: 'frontmatter-yaml-error' | 'frontmatter-not-mapping';
}
/**
 * frontmatter → 四种激活类型（Cursor 文档的判定顺序，不猜）：
 *  ① alwaysApply 为真 → **always**（无条件加载）
 *  ② globs 非空 → **auto-attached**（匹配到文件时自动附带）
 *  ③ description 非空 → **agent-requested**（由 agent 判断是否附带）
 *  ④ 以上都没有（含完全没有 frontmatter）→ **manual**（只在显式 @ 提及时使用）
 */
export declare function classifyRuleActivation(fm: unknown): CursorRuleActivation;
/**
 * 一条 *​.mdc 的解析：frontmatter 分隔线缺失 = 没有 frontmatter（Cursor 文档：无字段即 Manual）；
 * frontmatter 损坏时**按 Manual 保守归类**（绝不因为读不懂就当成 always-on）并把问题如实报出。
 */
export declare function parseCursorRule(text: string): ParsedCursorRule;
/** 相对用户 home 的会话根（回给 GUI/CLI 的**只允许路径**，绝不回传用户名/盘符） */
export declare const CURSOR_PROJECTS_REL = ".cursor/projects";
/** composer 目录下的会话文件（Cursor 只写 `.jsonl`） */
export declare const CURSOR_SESSION_FILE_RE: RegExp;
/**
 * 剥离 Cursor 提问的 `<timestamp>…</timestamp>` 与 `<user_query>…</user_query>` 包裹。
 *
 * 为什么提问与标题必须同一口径：DSH 的标题取自首条用户文本（session-source.firstUserText），
 * 若只在标题上剥壳，面板里会留下 `\nCreate a …` 这种带标签残留的标题（参考实现同款，
 * 见 lib/convert/cursor.mjs 的 stripCursorTitleDecorations）。
 */
export declare function stripCursorTitleDecorations(text: unknown): string;
/**
 * 从提问正文里解析内嵌的毫秒时间戳（形如
 * `<timestamp>Thursday, Aug 27, 2026, 3:11 PM (UTC+8)</timestamp>`）。
 *
 * 与参考实现 parseCursorEmbeddedTimestamp 逐字对齐：先剥掉 `(UTC…)` 后缀再 `Date.parse`；
 * 解析不出来返回 undefined（**绝不 Date.now() 伪造**）。
 * 已知口径：`Date.parse` 按**本机时区**解释该串（`(UTC+8)` 只被剥掉、不做偏移换算）——
 * 与参考实现同款；它只用于 createdAt 兜底，不参与任何判定。
 */
export declare function parseCursorEmbeddedTimestamp(text: unknown): IrTimeMs | undefined;
/**
 * Windows 绝对路径 → Cursor 的 `projects/<slug>` 目录名。
 *
 * 与参考实现 `cwd-map.mjs: encodeCursorSlug` 逐字对齐：**只有盘符小写**（其余段保留原大小写），
 * 分隔符与段内的 `.` 都变成 `-`。非盘符形态（UNC / posix 绝对路径）返回 null —— 参考实现同样
 * 只支持盘符形态，**不猜**（猜出来的 cwd 会指向别的目录，比缺 cwd 更坏）。
 * 导出它是为了让单测能**用本机真实路径**构造夹具（往返一致才是解码正确的证据）。
 */
export declare function encodeCursorSlug(absPath: string): string | null;
/** 与真实仓库无关的 slug（空窗口 / 纯数字项目 id）→ **绝不解码**（参考实现 isCursorNonRepoSlug 同款） */
export declare function isCursorNonRepoSlug(slug: string): boolean;
/** 存在性判定（**可注入**：单测用它把贪心解码变成确定性用例，不需要真的盘符路径） */
export type CursorPathExists = (candidate: string) => Promise<boolean>;
/**
 * Cursor 的 `projects/<slug>` → 真实工作区绝对路径（**贪心解码 + 存在性检查**）。
 *
 * 为什么必须贪心：编码是有损的（`-` 同时是分隔符与段内 `.` 的替身），段边界只能**回到盘上验证**
 * 才能确定 —— 每层优先「剩余整段」，再逐段合并 ≤2/≤3 段，命中即返回；全程不命中返回 undefined
 * （下游按 session-missing-cwd 跳过，**绝不伪造一条指向不存在目录的 cwd**）。
 * `budget` 是探测次数上限：病态 slug（长且全不命中）会组合爆炸，触顶即 fail-closed（返回 undefined）。
 */
export declare function decodeCursorSlugPath(slug: string, exists: CursorPathExists, budget?: number): Promise<string | undefined>;
/** fs 版解码（存在性 = 本机真实目录）；解不出来返回 undefined（绝不伪造 cwd） */
export declare function cursorCwdFromSlug(slug: string): Promise<string | undefined>;
/**
 * `agent-transcripts/<composer>.jsonl` 原文 → 归一记录。
 *
 * 与参考实现逐条对齐：
 *  - 一行一条 `{role, message:{content:[…]}}`；坏行只计数（`bad`）、未迁移角色/块逐类计数（`ignored`）；
 *  - **用户轮**：text 块剥离 `<user_query>` / `<timestamp>` 后拼接；空轮不产出（计数 user-empty）；
 *  - **助手步**：text 剥 `[REDACTED]`；tool_use 缺 id 时铸**稳定**兜底 id
 *    `cursor-<轮>-<步>-<块序>`（轮/步/块序都是 1 起，与参考实现同式）；
 *  - **首个用户轮之前的助手记录**丢弃并计数（assistant-without-turn）—— 没有提问的回复在 DSH 里
 *    会凭空开一轮，参考实现同样丢弃；**源里没有 tool_result**，本函数也不自造；
 *  - 没有任何会话内时间字段：createdAt 只来自首个提问内嵌的 `<timestamp>`（解析不出即 undefined，
 *    由下游用导入时刻兜底，绝不伪造）；cwd 由读盘层按 slug 推导后补进 parsed，本函数一律返回 undefined。
 */
export declare function parseCursorTranscript(raw: string): ParsedTranscript;
/**
 * 枚举 `~/.cursor/projects/<slug>/agent-transcripts/<composer>/*.jsonl` 并解析成归一记录。
 *
 * 四条纪律（与档 B 会话读盘层同口径）：
 *  ① cwd **只**来自 slug 的贪心解码 + 存在性检查；解不出来就留 undefined（下游按
 *     `session-missing-cwd` 如实跳过），**绝不伪造**；推出来的每条都报 `session-cwd-derived`；
 *  ② 会话 id = composer uuid（真机布局里目录名 == 文件名 stem）；目录名与文件名不一致的异常布局
 *     以文件名 stem 为准 —— 避免同一 composer 目录里的多个文件互相撞 id（撞了会报 session-id-conflict）；
 *  ③ 文件数上限触顶**可见**（max-sessions-reached），绝不静默截断；
 *  ④ 0 字节 / 超限 / 读失败各自成码，绝不抛。
 */
export declare function readCursorSessions(opts: CursorSessionsReadOptions): Promise<CursorSessionsReadResult>;
export declare function readCursor(opts: CursorReadOptions): Promise<CursorReadResult>;
