import type { ClaudeCodeInput, ClaudeSkillInput, ForeignLimitOverrides, ForeignSkip } from './types.ts';
export interface ClaudeCodeReadOptions {
    /** 用户 home（含 .claude 目录 / .claude.json） */
    homeDir: string;
    /** 进程环境快照（只读）：只有 CLAUDE_CONFIG_DIR 参与判定，绝不读凭据类变量 */
    env?: Readonly<Record<string, string | undefined>>;
    /** 调用方**显式**给出的项目根（优先于 ~/.claude.json 的 projects 键；缺省 = 不猜任何项目） */
    projectPaths?: readonly string[];
    /** 单文件读取上限（默认 8 MiB）；超过即不读，并如实计入 unreadable */
    maxFileBytes?: number;
    /** 单个 skill 目录的文件数上限（默认 200） */
    maxSkillFiles?: number;
    /** 会话文件数上限（默认 500）；触顶报 source-unreadable/max-sessions-reached */
    maxSessionFiles?: number;
    /** 单个会话文件的上限（默认 32 MiB）；超限即不读并计入 unreadable，绝不截断 */
    maxSessionFileBytes?: number;
    /** 项目扫描上限（默认 50）；触顶报 source-unreadable/max-projects-reached */
    maxProjects?: number;
    /** 插件数上限（默认 50，透传给 read-claude-plugins） */
    maxPlugins?: number;
    /** 单插件文件数上限（默认 200，透传给 read-claude-plugins） */
    maxPluginFiles?: number;
    /** 可选上限覆盖（t36，装配层透传；缺省 = 上面各默认值逐字不变） */
    limits?: ForeignLimitOverrides;
}
export interface ClaudeCodeReadResult {
    /** 是否找到 Claude Code 的痕迹（配置目录或 ~/.claude.json） */
    found: boolean;
    input: ClaudeCodeInput;
    skipped: ForeignSkip[];
    /** 读不到 / 超限 / JSON 解析失败的**相对路径**（不含任何内容、不含机器绝对路径） */
    unreadable: string[];
}
/** 技能目录读取的可选参数（用户级 / 项目级 / 插件级共用同一份口径） */
export interface SkillDirReadOptions {
    /** 单个技能目录的文件数上限 */
    maxFiles: number;
    /** 单文件字节上限 */
    maxBytes: number;
    /** 位置标签前缀（**包内相对标签**，绝不含机器路径） */
    origin: string;
    /** 发现写这里（符号链接跳过 / 条数触顶 / 字节超限） */
    skips: ForeignSkip[];
}
/**
 * 读一个 **skills 目录**（只压平一层：`<skills>/<技能名>/**`）。
 *
 * 三条不静默（缺陷 2 修复）：技能目录本身是符号链接 → source-unreadable + symlink-skipped；
 * 条数触顶 → max-skill-files-reached；单文件超字节 → too-large。
 * 结果按技能名排序（readdir 顺序在三个平台不同）。
 */
export declare function readSkillUnits(dir: string, opts: SkillDirReadOptions): Promise<ClaudeSkillInput[]>;
export declare function readClaudeCode(opts: ClaudeCodeReadOptions): Promise<ClaudeCodeReadResult>;
