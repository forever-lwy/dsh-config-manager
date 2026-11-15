import type { ParsedTranscript } from './session-source.ts';
import type { ForeignImportResult, ForeignSkip } from './types.ts';
/** Cursor 的两层作用域：用户级（~/.cursor）与项目级（<项目>/.cursor） */
export type CursorScope = 'user' | 'project';
/** 规则的四种激活类型（契约 §8.2 的 Always / Intelligently / Specific Files / Manually） */
export type CursorRuleActivation = 'always' | 'auto-attached' | 'agent-requested' | 'manual';
/**
 * 一条已分类的 Cursor 规则（*​.mdc）。
 *
 * 正文（body）已经剥离 frontmatter：frontmatter 是 Cursor 的激活元数据，不是指令正文；
 * frontmatter 缺失（= Manual）或损坏（报码后按 Manual 保守归类）时 body = 全文，绝不丢内容。
 */
export interface CursorRuleInput {
    /** 规则文件名（含 .mdc）——只用于报告与合并注释头，不含任何配置值 */
    name: string;
    scope: CursorScope;
    activation: CursorRuleActivation;
    body: string;
}
/** 一个 Cursor skill 单元：叶子技能名 + 目录内文件（category 只用于报告压平，不参与命名） */
export interface CursorSkillInput {
    name: string;
    files: {
        relativePath: string;
        data: Uint8Array;
    }[];
    /** 中间目录（<技能根>/<外层>/<技能>/SKILL.md）——有值即报 skill-category-flattened */
    category?: string;
}
/** 一个已解析成**归一记录**的 Cursor 会话（读盘层产出；翻译层只负责装配） */
export interface CursorSessionInput {
    /**
     * composer uuid（`agent-transcripts/<composer>/<composer>.jsonl` 的目录名 / 文件名 stem；
     * 真机布局里两者同值）。它同时是 DSH 侧会话 id —— **必须过 isSafeIrId**，
     * 不过门的由 transcodeSessionDraft 如实报 session-unsafe-id，绝不静默写盘。
     */
    id: string;
    /** 归一记录（parsed.raw = 转录行原始条数；cwd 由读盘层按 slug 存在性解码后补入） */
    parsed: ParsedTranscript;
}
/**
 * Cursor 配置的已读形态（纯数据；翻译层不做任何 fs 访问）。
 *
 * 为什么类型定义在本文件而不是 types.ts：本任务作用域只含 cursor.ts / read-cursor.ts /
 * cursor.test.ts / fixtures —— 来源专属类型留在来源模块里，不动其它来源的公共面。
 */
export interface CursorInput {
    /** ~/.cursor/mcp.json（已解析；缺失 / 0 字节 / 畸形 = undefined） */
    mcpJson?: unknown;
    /** <项目>/.cursor/mcp.json（可选的第二份；同名 server 项目级优先） */
    projectMcpJson?: unknown;
    /** rules/*.mdc（已按 frontmatter 分类；顺序由读盘层给出） */
    rules?: CursorRuleInput[];
    /** skills/**​/SKILL.md 的技能单元（读盘层保证项目级在前 = 同名冲突时项目级胜出） */
    skills?: CursorSkillInput[];
    /** 旧式 .cursorrules 的位置（**只报告不导入**；正文根本没有承载字段） */
    legacyRules?: {
        scope: CursorScope;
    }[];
    /** ~/.cursor/projects/<slug>/agent-transcripts/<composer>/<composer>.jsonl 解析出的会话 */
    sessions?: CursorSessionInput[];
    /**
     * 目标机 DSH 的 SESSION_FORMAT_VERSION（**必须由宿主解析后传入**，见 utils/session-format.ts）。
     * 缺省 = 不转码任何会话并整批报 session-format-version-unknown，绝不猜版本。
     */
    targetSessionFormatVersion?: number;
    /** 读盘层发现（0 字节 / 畸形 / 超限 / 旧式规则命中 / 会话读盘）——原样带出，调用方无需二次合并 */
    readFindings?: ForeignSkip[];
}
/** 作用域标签：只用于报告与注释头（绝不含绝对路径 —— 那是机器身份） */
export declare function cursorScopeLabel(scope: CursorScope): string;
/** 合并 MCP 条目：用户级打底，项目级同名覆盖**在原位置**且值取项目级（不产生重复 serverName） */
export declare function mergeMcpEntries(userEntries: readonly (readonly [string, unknown])[], projectEntries: readonly (readonly [string, unknown])[]): {
    entries: [string, unknown][];
    overridden: number;
};
/** 一条规则的合并注释头（激活语义在 DSH 无对等字段，必须在产物里可见） */
export declare function cursorRuleHeader(rule: CursorRuleInput): string;
/**
 * 规则 → AGENTS.md 正文。顺序确定（作用域 → 文件名），不依赖目录遍历顺序；
 * 空正文的规则不并入（分类计数仍然算它）。返回 { text, merged }（merged = 实际并入的条数）。
 */
export declare function mergeRuleBodies(rules: readonly CursorRuleInput[]): {
    text: string;
    merged: number;
};
export declare function convertCursor(input: CursorInput): ForeignImportResult;
