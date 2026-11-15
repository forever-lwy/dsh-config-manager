import type { ForeignImportResult, ForeignSkip } from './types.ts';
/** 一个 Copilot skill 单元：技能名 + 目录内文件（category 只用于报告压平，不参与命名） */
export interface CopilotSkillInput {
    name: string;
    files: {
        relativePath: string;
        data: Uint8Array;
    }[];
    /** 外层目录名（手工嵌套时）——有值即报 skill-category-flattened */
    category?: string;
}
/**
 * 一份 Copilot 指令文件（copilot-instructions.md 或 instructions/*.instructions.md）。
 * name 只用于生成可读的合并来源标签（合并规则见下一行注释），不参与文件命名。
 */
export interface CopilotInstructionInput {
    name: string;
    text: string;
}
/**
 * Copilot 配置的已读形态（纯数据；翻译层不做任何 fs 访问）。
 *
 * 为什么类型定义在本文件而不是 types.ts：本任务的作用域只含 copilot.* / read-copilot.ts /
 * antigravity.* / fixtures —— 把来源专属类型留在来源模块里，既不动其它来源的公共面，
 * 也便于 t22 装配时按需再导出（与 codex.ts 同一决定）。
 */
export interface CopilotInput {
    /** mcp-config.json（已解析；缺失 / 0 字节 / 畸形 = undefined） */
    mcpConfig?: unknown;
    /** copilot-instructions.md 原文 */
    instructions?: string;
    /** instructions/*.instructions.md（按文件名排序，已过滤空文件） */
    instructionFiles?: CopilotInstructionInput[];
    /** skills/ 的技能单元（frontmatter 校验在翻译层做） */
    skills?: CopilotSkillInput[];
    /** 读盘层发现（位置被 COPILOT_HOME 覆盖 / 0 字节 / 读不到）——原样带出，调用方无需二次合并 */
    readFindings?: ForeignSkip[];
}
export declare function convertCopilot(input: CopilotInput): ForeignImportResult;
