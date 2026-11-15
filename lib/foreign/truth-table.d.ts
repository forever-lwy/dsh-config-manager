/**
 * **来源路径真值表**（档 B 全量补齐的单一事实源 + 机械护栏的输入）。
 *
 * 为什么要有这个文件（不是文档搬家）：验收要求「每个来源有路径真值表依据（四份报告交叉核对）」，
 * 而「真值表」此前**只活在注释里** —— 没有任何机制保证注释里的平台分支与 read-<id>.ts 的实现一致。
 * 本文件把真值表变成**数据**，truth-table.test.ts 再拿它与运行期的 ForeignSource.probePaths()
 * 逐平台交叉核对：注释、数据、实现三者不一致即红灯。
 *
 * 四份报告的交叉核对结论（**有出入以 read-chat-import.md §3 为准，并在此记录差异**）：
 *  ① hermes 的 win32 落点：chat-import 的 defaultRoots 只给 ~/.hermes（discovery.mjs:135），
 *     而 read-claude-move §8.1 与**本仓本机实测**都是 %LOCALAPPDATA%/Hermes。
 *     ⇒ 取并集语义：win32 用 %LOCALAPPDATA%/Hermes（本机实测过），且 HERMES_HOME 覆盖优先
 *     （v1 既有行为不变，本次**不动**该来源的路径表）。
 *  ② codex 是**双根**（sessions + archived_sessions，discovery.mjs:108-110），read-claude-move
 *     只建模了 sessions/**。⇒ 取 chat-import（双根）。
 *  ③ opencode 的 win32 落点：read-claude-move 用 %APPDATA%/opencode，chat-import 与 read-vault
 *     都是 ~/.local/share/opencode（**Windows 同样**）。⇒ 取 chat-import。
 *  ④ $VIBE_HOME 是**追加**（sources/vibe.mjs:40-49 同时 push env 根与 ~/.vibe 根），
 *     而 $CONTINUE_GLOBAL_DIR 是**替换**（discovery.mjs:145-147）；两种语义并存，逐源确认。
 */
import type { ForeignEvidenceKind, ForeignSourceId } from './types.ts';
import type { ForeignPlatform } from './platform-paths.ts';
/** 一个环境变量覆盖的真值（mode 决定它是替换默认根还是与之并列，逐源不同） */
export interface TruthEnvKey {
    readonly key: string;
    /** replace = 覆盖默认根；append = 与默认根并列（两种语义**并存**，不得一律按替换处理） */
    readonly mode: 'replace' | 'append';
    /** 只在某些平台生效（缺省 = 全部）；护栏只在这些平台上断言覆盖生效 */
    readonly platforms?: readonly ForeignPlatform[];
    /** 只有**绝对路径**才生效（GOOSE_PATH_ROOT / CRUSH_GLOBAL_DATA / XDG_*） */
    readonly absoluteOnly?: boolean;
    readonly note?: string;
}
/** 一个来源的真值表条目 */
export interface ForeignTruthTableEntry {
    readonly id: ForeignSourceId;
    /** 目标平台 → 默认探测位置（令牌模板；home / appdata / xdgdata 三个令牌） */
    readonly defaults: Readonly<Record<ForeignPlatform, readonly string[]>>;
    /** 环境变量覆盖 */
    readonly envKeys?: readonly TruthEnvKey[];
    /** 是否**没有**自动根（只能显式给路径） */
    readonly autoRoots: boolean;
    /** 证据强度（**如实标注**，不得美化） */
    readonly evidence: ForeignEvidenceKind;
    /** 依据（四份报告的落点；交叉核对后的结论写在这里） */
    readonly refs: string;
    /** 该来源还要在运行时**动态枚举**什么（探测面只到静态父目录，文档与评审核对用） */
    readonly dynamic?: string;
}
/** 护栏用**合成**探测值（与平台约定一致；绝不读真机 home —— 那是机器身份） */
export interface TruthProbe {
    readonly homeDir: string;
    readonly appdata: string;
    readonly xdgdata: string;
}
export declare const TRUTH_PROBES: Readonly<Record<ForeignPlatform, TruthProbe>>;
/** **空环境**（平台默认根的真值；环境变量覆盖由 envKeys 单独断言） */
export declare const TRUTH_PROBE_ENV: Readonly<Record<string, string | undefined>>;
/** 展开一个令牌模板（未识别的令牌原样保留 —— 那样护栏会立刻红，不会静默给出错路径） */
export declare function expandTruthTemplate(platform: ForeignPlatform, template: string): string;
export declare function expandTruthList(platform: ForeignPlatform, templates: readonly string[]): string[];
export declare const FOREIGN_TRUTH_TABLES: readonly ForeignTruthTableEntry[];
