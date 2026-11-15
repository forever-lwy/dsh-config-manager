import type { McpSection, McpServerEntry } from '../schema/types.ts';
import type { ForeignSectionOut, ForeignSkip, ForeignSkipCode } from './types.ts';
/** UTF-8 编码（各来源产出文件类分区时共用，避免各自 new TextEncoder） */
export declare function utf8(s: string): Uint8Array;
/** UTF-8 解码（frontmatter 校验要读 SKILL.md 文本） */
export declare function textOf(data: Uint8Array): string;
/** 单元名：非空、无首尾空白、不含分隔符/盘符冒号、不是 . 或 .. */
export declare function isSafeUnitName(name: string): boolean;
/** 包内相对路径：只允许普通段（拒绝空段 / . / .. / 绝对路径 / 尾随斜杠） */
export declare function isSafeRelPath(rel: string): boolean;
export interface FrontmatterSplit {
    raw: string;
    body: string;
}
/** 逐行切 frontmatter（刻意不用正则：正则源里的转义很容易在跨层写入时被解释掉） */
export declare function splitFrontmatter(text: string): FrontmatterSplit | null;
/**
 * null = 可被 DSH 正常加载；否则返回机器可读原因。
 *
 * 为什么必须在这里判：DSH 的 skill 发现对**非法 YAML 的 frontmatter 是静默丢弃**的
 * （本仓库实测过：description 这类 plain scalar 里出现 ": " 会让 yaml.parse 抛错，
 * 整个 skill 从 catalog 消失、没有任何 UI 提示）。不在这里报出来，
 * 用户看到的就是「我从外部工具导入了 N 个 skill，导入成功，但一个都没出现」。
 */
export declare function frontmatterProblem(text: string): string | null;
export declare function stringMapOf(v: unknown): Record<string, string>;
export declare function stringArrayOf(v: unknown): string[];
/** 剥离 URL 里的 userinfo（https://user:pass@host → https://host）；纯字符判定，不用正则 */
export declare function stripUserInfo(url: string): {
    url: string;
    stripped: boolean;
};
/**
 * 单个 server 定义 → McpServerEntry。
 * type 判定与 adapters/mcp.ts 的 extractMcpServers **同口径**：有非空 url 即 streamable-http，否则 stdio。
 * 刻意**不写 sourceLineId**：缺省时 adapter 会用 newLineId(serverName) 生成，
 * 而自己编一个 id 有撞上目标机既有 patch 行 id 的风险。
 */
export declare function mcpEntryOf(name: string, raw: unknown, skipped: ForeignSkip[]): McpServerEntry | null;
/** 剥离 MCP 里的凭据：URL userinfo + 字段名扫描（与导出侧同一个扫描器）+ 值形状判定 */
export declare function redactMcpSection(section: McpSection, refs: string[], skipped: ForeignSkip[]): McpSection;
/**
 * 外部「名字 → server 定义」映射（Claude 的 ~/.claude.json mcpServers、Hermes 的 config.yaml
 * mcp_servers 都是这一形态）→ 一个可进包的 McpSection。
 * 一个条目都映射不出来时返回 null（**不产出空分区**）。
 */
export declare function mcpSectionFromEntries(entries: readonly (readonly [string, unknown])[], refs: string[], skipped: ForeignSkip[]): McpSection | null;
/** 「名字 → 定义」映射取值（非映射 / 缺字段 → 空清单） */
export declare function serverEntriesOf(container: unknown, key: string): [string, unknown][];
/** 一个外部 skill 单元：目录名 + 目录内文件（相对该目录）；category 仅用于报告压平 */
export interface SkillUnit {
    name: string;
    files: readonly {
        relativePath: string;
        data: Uint8Array;
    }[];
    /** 外部侧的分类目录名（如 Hermes 的 skills/<分类>/<技能>）——有值即报压平 */
    category?: string;
}
/**
 * 把外部 skill 单元装配进 skills 分区的文件清单。
 *
 * 顺序与判据**逐字保留** v1 的 Claude 行为：名字安全 → SKILL.md 存在 → frontmatter 可被 DSH 加载
 * → 逐文件相对路径安全。新增的只有两条（契约 §8.4 冻结）：
 *  - 分类压平（category 非空）逐条报 skill-category-flattened；
 *  - **同名先到先得**：第二个同名技能整体跳过并报 skill-id-conflict（绝不产生重复包内路径）。
 */
export declare function collectSkills(units: readonly SkillUnit[], out: {
    relativePath: string;
    data: Uint8Array;
}[], skipped: ForeignSkip[]): void;
/**
 * 工作区标题 = cwd 的最后一段（**两种分隔符都认**）。
 *
 * 为什么不能只 split('/')：Windows 记录里的 cwd 是反斜杠形态，按 '/' 切会得到整条绝对路径当标题
 * （audit-foreign F3 —— 同一份产物里两条同类记录标题还不一致）。先去掉尾部同一族分隔符，
 * 再取最后一段；空路径退回原串。
 */
export declare function workspaceTitleOf(cwd: string): string;
/** 转码产物（结构上兼容 claude-sessions.ts 的 TranscodedSession） */
export interface KernelTranscodedSession {
    id: string;
    cwd: string;
    relativePath: string;
    data: Uint8Array;
    info: {
        ignored: Record<string, number>;
    };
}
/** 转码结果（结构上兼容 claude-sessions.ts 的 TranscodeResult） */
export interface KernelTranscodeResult {
    session?: KernelTranscodedSession;
    skip?: {
        code: ForeignSkipCode;
        detail?: string;
    };
}
export interface SessionSectionsOptions<TFile extends {
    id: string;
}> {
    /** 待转码的会话文件（已读盘） */
    files: readonly TFile[];
    /** 目标机 DSH 的 SESSION_FORMAT_VERSION；缺省 = 一条都不转，整批报 session-format-version-unknown */
    targetFormatVersion: number | undefined;
    /** 纯转码函数（各来源自己的 JSONL → DSH 行） */
    transcode: (file: TFile) => KernelTranscodeResult;
    /** workspaces 记录 id 的来源前缀（契约 §8.3：<sourceId>:<projectKey>） */
    workspaceIdPrefix: string;
    sections: ForeignSectionOut[];
    skipped: ForeignSkip[];
    counts: Record<string, number>;
}
/**
 * 会话转码 → sessions + workspaces 两个分区。
 *
 * 为什么必须连 workspaces 一起产出：DSH 工作区按「会话 cwd 目录键 == 工作区 path 目录键」显示会话；
 * 只给会话文件、没有工作区记录时，导入会「全部成功但一条对话都看不见」（本仓真机踩过的事故）。
 *
 * 契约 §8.4 的冲突语义在这里落地：**同一个 DSH 会话 id 只允许出现一次**，第二条起跳过并报
 * session-id-conflict（绝不后写覆盖先写，也绝不让同一个 id 落到两个 projectKey 目录下 ——
 * DSH 启动会以 duplicate JSONL session id 直接拒绝）。
 */
export declare function collectSessionSections<TFile extends {
    id: string;
}>(opts: SessionSectionsOptions<TFile>): void;
/**
 * 全局指令 → agentInstructions 分区（包内 AGENTS.md）。
 *
 * DSH 只读一个全局指令文件，所以**每次导入至多一个文件**（契约 §8.6-4）：多来源指令需要合并时
 * 由各来源在转换期先合并，并报 instructions-merged；本函数只负责「非空才产出」。
 */
export declare function instructionsSection(text: string): ForeignSectionOut | null;
