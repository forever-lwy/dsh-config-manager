import type { ForeignLimitOverrides } from './types.ts';
import type { CopilotInput } from './copilot.ts';
export interface CopilotHomeOptions {
    /** 用户 home（Windows = %USERPROFILE%，macOS/Linux = $HOME） */
    homeDir: string;
    /** 进程环境（只用于位置覆盖判定：COPILOT_HOME） */
    env?: Readonly<Record<string, string | undefined>>;
}
export interface CopilotResolvedHome {
    /** Copilot CLI 配置目录绝对路径 */
    home: string;
    /** 是否由 COPILOT_HOME 覆盖（命中即报 source-location-overridden） */
    overridden: boolean;
}
/**
 * Copilot CLI 配置目录：COPILOT_HOME > ~/.copilot（三平台同形）。
 * 不猜、不回退到「看起来像」的目录 —— 解析出来的路径就是唯一候选。
 */
export declare function resolveCopilotHome(opts: CopilotHomeOptions): CopilotResolvedHome;
export interface CopilotReadOptions extends CopilotHomeOptions {
    /** 单文件读取上限（默认 8 MiB）；超过即不读并如实计入 unreadable */
    maxFileBytes?: number;
    /** 单个技能目录的文件数上限（默认 200） */
    maxSkillFiles?: number;
    /** 技能数上限（默认 500） */
    maxSkills?: number;
    /** instructions/*.instructions.md 的文件数上限（默认 100） */
    maxInstructionFiles?: number;
    /** 可选上限覆盖（t36，装配层透传；缺省 = 上面各默认值逐字不变） */
    limits?: ForeignLimitOverrides;
}
export interface CopilotReadResult {
    /** 是否找到 Copilot CLI 的痕迹（配置目录存在）；未安装是正常状态，不是错误 */
    found: boolean;
    /** 解析出的配置目录（诊断用） */
    home: string;
    locationOverridden: boolean;
    input: CopilotInput;
    /** 读不到 / 超限 / 解析失败的**相对路径**（不含任何内容） */
    unreadable: string[];
}
export declare function readCopilot(opts: CopilotReadOptions): Promise<CopilotReadResult>;
