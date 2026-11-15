import type { SqliteDeps } from './read-opencode.ts';
import type { ForeignLimitOverrides, ForeignSkip, HermesInput, HermesSessionInput } from './types.ts';
export interface HermesHomeOptions {
    /** 用户 home（Windows 一般传 %USERPROFILE%） */
    homeDir: string;
    /** 进程环境（只用于位置覆盖判定：HERMES_HOME / LOCALAPPDATA） */
    env?: Readonly<Record<string, string | undefined>>;
    /** 平台（缺省 = process.platform；测试注入） */
    platform?: string;
}
export interface HermesResolvedHome {
    /** Hermes 数据目录绝对路径 */
    home: string;
    /** 是否由 HERMES_HOME 覆盖（命中即报 source-location-overridden） */
    overridden: boolean;
}
/**
 * Hermes 数据目录：HERMES_HOME > Windows 的 %LOCALAPPDATA%\Hermes > ~/.hermes。
 * 不猜、不回退到「看起来像」的目录：解析出来的路径就是唯一候选。
 */
export declare function resolveHermesHome(opts: HermesHomeOptions): HermesResolvedHome;
export interface HermesReadOptions extends HermesHomeOptions {
    /** 单文件读取上限（默认 8 MiB）；超过即不读并如实计入 unreadable */
    maxFileBytes?: number;
    /** 单个技能目录的文件数上限（默认 200） */
    maxSkillFiles?: number;
    /** 技能数上限（默认 500） */
    maxSkills?: number;
    /** 会话数上限（默认 500）；超出即报 source-unreadable/max-sessions-reached，绝不静默截断 */
    maxSessions?: number;
    /**
     * 可注入的 SQLite 依赖（**仅测试**：验证宿主缺 \`node:sqlite\` 时的结构化降级路径）。
     * 生产路径（registry 的 build）永远不传它。
     */
    sqliteDeps?: SqliteDeps;
    /** 可选上限覆盖（t36，装配层透传；缺省 = 上面各默认值逐字不变） */
    limits?: ForeignLimitOverrides;
}
export interface HermesReadResult {
    /** 是否找到 Hermes 数据目录（未安装是正常状态，不是错误） */
    found: boolean;
    /** 解析出的数据目录（诊断用） */
    home: string;
    locationOverridden: boolean;
    input: HermesInput;
    /** 读不到 / 超限 / 解析失败的**相对路径**（不含任何内容） */
    unreadable: string[];
}
/** 一个库/一个目录的会话读盘结果（0 会话也是正常结果） */
export interface HermesSessionPart {
    readonly files: readonly HermesSessionInput[];
    readonly skipped: readonly ForeignSkip[];
}
/** Hermes 的会话库文件名（真值：<home>/state.db） */
export declare const HERMES_STATE_DB = "state.db";
/**
 * state.db → 会话（只读打开 + PRAGMA 自适应列）。
 *
 * 打不开 / 不是 Hermes 的库 / 表结构不符 / 查询失败 → 0 文件 + 一条 source-unreadable，
 * 由 `readHermes` 决定是否回退 sessions/*.jsonl。**绝不抛、绝不往用户目录写文件**。
 */
export declare function readHermesSessionsFromDb(opts: {
    readonly dbFile: string;
    readonly maxSessions: number;
    readonly sqliteDeps?: SqliteDeps | undefined;
}): Promise<HermesSessionPart>;
/**
 * 回退路径：`sessions/*.jsonl`（旧版/异构 Hermes 布局）。
 *
 * **只认 .jsonl**：真机 sessions/ 里全是 request_dump_*.json（请求转储，不是会话），
 * 把它们当会话读会产出成百上千条垃圾对话 —— 宁可少读，不可错读。
 */
export declare function readHermesSessionJsonl(sessionsDir: string, maxSessions: number, maxBytes: number): Promise<HermesSessionPart>;
export declare function readHermes(opts: HermesReadOptions): Promise<HermesReadResult>;
