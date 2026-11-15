import type { ForeignSource } from './registry.ts';
import type { IrBlock, IrMessage, IrTimeMs } from './session-ir.ts';
import type { ForeignEvidenceKind, ForeignImportResult, ForeignLimitOverrides, ForeignSkip, ForeignSkipCode, ForeignSourceId } from './types.ts';
/**
 * 一条**已归一**的源记录。
 *
 * 刻意不含任何「DSH 行式」知识（turn/step/seq 全在合成器里）—— 各来源只需要回答
 * 「这条是用户还是助手、有哪些内容块、什么时间、哪个 id、哪个模型」。
 */
export interface TranscriptRecord {
    readonly role: 'user' | 'assistant';
    readonly blocks: readonly IrBlock[];
    readonly time?: IrTimeMs | undefined;
    readonly id?: string | undefined;
    readonly model?: string | undefined;
    readonly usage?: unknown;
}
/** 一次解析的结果（记账字段与竞品 `parseJsonlLines` 的 {recs,skipped,skippedLines} 同形） */
export interface ParsedTranscript {
    readonly records: readonly TranscriptRecord[];
    /** cwd（源里最权威的那个；缺失 = 调用方转成 session-missing-cwd，绝不猜） */
    readonly cwd?: string | undefined;
    readonly createdAt?: IrTimeMs | undefined;
    /** 源给的标题（空串 = 没有） */
    readonly title: string;
    /** 源记录的原始条数（含被忽略的） */
    readonly raw: number;
    /** 解析不出来的条数/坏行数 */
    readonly bad: number;
    /** 未迁移的记录类型 → 条数（**逐类计数，绝不静默**） */
    readonly ignored: Record<string, number>;
}
/** 一条待转码的会话草稿（IR 之上的「源侧元数据」） */
export interface SessionDraft {
    readonly id: string;
    readonly cwd: string | undefined;
    readonly createdAt: IrTimeMs | undefined;
    readonly title: string;
    readonly messages: readonly IrMessage[];
    /** 源侧记录的原始条数（含被忽略的） */
    readonly records: number;
    readonly provider: string;
    /** 未迁移类型 → 条数（转成 unsupported-session-record 逐条报码） */
    readonly ignored?: Readonly<Record<string, number>> | undefined;
    /** 解析不出来的行数（进 ignored.unparsable） */
    readonly unparsable?: number | undefined;
    /** 「本轮内容块全空」的取值（Claude 取 []，其余来源同样取 []） */
    readonly emptyBlocks?: readonly IrBlock[] | undefined;
}
/** 归一记录 → SessionDraft（各来源统一走这一处，不自己拼 IrMessage） */
export declare function draftFromTranscript(id: string, parsed: ParsedTranscript, provider: string): SessionDraft;
export interface DraftTranscodeOptions {
    /** 目标机 DSH 的 SESSION_FORMAT_VERSION（必填；不支持即 session-format-unsupported，绝不猜） */
    readonly formatVersion: number;
    /** 时间兜底（源里没有可解析时间时用） */
    readonly now?: number | undefined;
}
export interface DraftTranscodeResult {
    readonly session?: {
        readonly id: string;
        readonly cwd: string;
        readonly relativePath: string;
        readonly data: Uint8Array;
        readonly info: {
            readonly ignored: Record<string, number>;
        };
    };
    readonly skip?: {
        readonly code: ForeignSkipCode;
        readonly detail?: string;
    };
}
/**
 * 骨架的三段判定 + 合成 + 编码（**所有会话类来源的唯一出口**）。
 *
 * 判定顺序与 `transcodeClaudeSession` 逐条对齐（版本 → id → 空 → 缺 cwd → 解析不出 → 合成空）：
 * 顺序变了，用户看到的 skip 码就会变（同一个坏文件从 session-missing-cwd 变成 session-empty）。
 */
export declare function transcodeSessionDraft(draft: SessionDraft, options: DraftTranscodeOptions): DraftTranscodeResult;
export interface SessionSourceOptions<TFile> {
    /** 待转码的会话（已读盘 / 已解析成草稿的输入形态） */
    readonly files: readonly TFile[];
    /** 目标机格式版本（缺省 = 一条都不转，整批报 session-format-version-unknown） */
    readonly targetFormatVersion: number | undefined;
    /** workspaces 记录 id 的前缀（契约 §8.3：<sourceId>:<projectKey>） */
    readonly workspaceIdPrefix: string;
    /** 单个文件 → 草稿（或一个 skip 码） */
    readonly draftOf: (file: TFile) => SessionDraft | {
        readonly skip: {
            readonly code: ForeignSkipCode;
            readonly detail?: string;
        };
    };
    /** 读盘层的发现（原样带出，调用方无需二次合并） */
    readonly readFindings?: readonly ForeignSkip[] | undefined;
    /** 额外的计数（如「发现 N 个会话目录」） */
    readonly extraCounts?: Readonly<Record<string, number>> | undefined;
    /** 额外的未迁移项（如「旧版 JSONL 刻意不读」） */
    readonly extraSkips?: readonly ForeignSkip[] | undefined;
}
/**
 * 会话类来源的**统一出口**：草稿 → sessions + workspaces 分区 → ForeignImportResult。
 *
 * 走 `kernel.collectSessionSections`（与 Claude 同一份实现）而不是自己拼，理由有三：
 *  ① 冲突语义（同 DSH 会话 id 只允许出现一次）只有一处实现；
 *  ② workspaces 必须与会话同源产出（只给会话不给工作区 = 目标机上一条对话都看不见）；
 *  ③ 「未迁移记录逐类计数」只有一处实现。
 */
export declare function buildSessionSourceResult<TFile extends {
    id: string;
}>(source: ForeignSourceId, opts: SessionSourceOptions<TFile>): ForeignImportResult;
/** 文本投影：字符串原样；数组逐项拼；对象取 text/content/message；其余 → ''（绝不 JSON.stringify 进正文） */
export declare function flattenText(value: unknown, unknown?: Record<string, number>, key?: string): string;
/**
 * 通用内容块映射（绝大多数来源的 `content` / `parts` 都能被它覆盖）。
 *
 * 覆盖四种形态：字符串、块数组（text / tool_use / tool_result）、单块对象、
 * 以及把整段对话描述成 `{type:'text',text}` 的形态。**不认识的块逐类计数**（绝不静默丢）。
 */
export declare function genericBlocksOf(content: unknown, unknown?: Record<string, number>, key?: string): IrBlock[];
/** 通用 JSONL 形态的字段真值（各来源可覆盖其中任意几项） */
export interface TranscriptShape {
    /** 角色字段候选（按序取第一个非空字符串） */
    readonly roleKeys: readonly string[];
    /** 内容字段候选；命中的值可以是字符串 / 数组 / 对象 */
    readonly contentKeys: readonly string[];
    /** 记录类型字段（用于「未迁移类型」计数） */
    readonly typeKey: string;
    /** 角色取值（大小写不敏感）→ user */
    readonly userValues: readonly string[];
    /** 角色取值 → assistant */
    readonly assistantValues: readonly string[];
    readonly timeKeys: readonly string[];
    readonly idKeys: readonly string[];
    readonly cwdKeys: readonly string[];
    readonly titleKeys: readonly string[];
    readonly modelKeys: readonly string[];
    /** 额外的「整条记录就是一段文本」字段（如 {type:'summary',summary:'…'} 不当消息） */
    readonly textKeys: readonly string[];
}
/** 主形态（Claude / Codex / 多数 JSONL 工具的共同结构：{type|role, message|content,…}） */
export declare const GENERIC_TRANSCRIPT_SHAPE: TranscriptShape;
/**
 * 通用 JSONL 解析：**一行一条 JSON 对象**，按 shape 映射成归一记录。
 *
 * 三条纪律（与竞品 `parseJsonlLines` 的记账口径同源，但**明细不设 200 上限**）：
 *  ① 坏行不抛，只计入 `bad`；② 未迁移记录类型逐类计入 `ignored`；③ cwd 取**第一个**有值的记录。
 */
export declare function parseGenericJsonl(text: string, shape?: TranscriptShape): ParsedTranscript;
/** 首条用户文本前 80 字（折叠空白）——标题兜底口径与 Claude 一致 */
export declare function firstUserText(records: readonly TranscriptRecord[]): string;
/** 取源给的会话标题字段（空串表示没有） */
export declare function titleFromRecord(rec: unknown, keys: readonly string[]): string;
/** 归一记录的 id 兜底（源没给合法 id 时用会话内序号铸稳定伪 uuid） */
export declare function recordIdOf(raw: string | undefined, index: number): string;
/** 探测上下文（纯函数：homeDir / env / platform，**不读盘**） */
export interface RootProbeOptions {
    readonly homeDir: string;
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly platform: string;
    /** 显式项目目录（crush 的每项目一库 / chatgpt 的显式导出文件都靠它，缺省不猜） */
    readonly projectDir?: string | undefined;
    /**
     * 可选上限覆盖（t36）：宿主路由 / CLI 将来放开上限时的通道。
     * 缺省 = 各读器自己的选项与默认值**逐字不变**；读器用 resolveLimit(覆盖, 显式, 默认) 取值。
     */
    readonly limits?: ForeignLimitOverrides | undefined;
}
/** 读盘上下文（read-*.ts 的唯一入口形状） */
export interface SessionSourceHostOptions extends RootProbeOptions {
    readonly targetFormatVersion?: number | undefined;
}
/** 一次读盘的结果（**不含**任何分区装配语义 —— 那是 buildSessionSourceResult 的事） */
export interface SessionReadOutcome<TFile extends {
    id: string;
}> {
    readonly files: readonly TFile[];
    /** 读盘层的发现（0 字节 / 超限 / 只读打开失败 …） */
    readonly readFindings?: readonly ForeignSkip[] | undefined;
    /** 结构性提示（如「旧式 JSONL 刻意不读」「本版不迁移」） */
    readonly extraSkips?: readonly ForeignSkip[] | undefined;
    readonly extraCounts?: Readonly<Record<string, number>> | undefined;
}
/** 会话类来源的装配输入 */
export interface SessionSourceWiring<TFile extends {
    id: string;
}> {
    readonly id: ForeignSourceId;
    readonly evidence: ForeignEvidenceKind;
    /** 目标平台下的**静态探测位置**（真值表；运行时再在它下面动态枚举） */
    readonly probePaths: (opts: RootProbeOptions) => readonly string[];
    /** 命中即报 source-location-overridden 的环境变量（只报键名，绝不报值） */
    readonly probeEnvKeys?: readonly string[] | undefined;
    /**
     * 探测期的附加提示（如 chatgpt 的「无自动根」）。
     *
     * 允许返回 Promise：少数来源需要**有界**地读一点内容才能给出可判定的预告（trae 的加密库
     * 只解密第 1 页、旧库只读 key 列）。这类探测必须自证「有界、只读、不枚举会话」，
     * 否则 detect 会被 30 个来源拖慢。
     */
    readonly probeSkips?: ((opts: RootProbeOptions, probed: readonly string[]) => readonly ForeignSkip[] | Promise<readonly ForeignSkip[]>) | undefined;
    readonly read: (opts: SessionSourceHostOptions) => Promise<SessionReadOutcome<TFile>>;
    readonly draftOf: (file: TFile) => SessionDraft | {
        readonly skip: {
            readonly code: ForeignSkipCode;
            readonly detail?: string;
        };
    };
    readonly workspaceIdPrefix?: string | undefined;
}
/**
 * 把一个会话来源装配成 `ForeignSource`。
 *
 * **detect 默认只 stat 真值表里的位置**（绝不读内容、绝不枚举会话）—— 界面对 30 个来源各调一次
 * detect，任何一处读全文都会把面板拖慢；真正的枚举发生在 build。唯一例外是来源在 `probeSkips`
 * 里显式声明的**有界轻量探测**（trae：加密库只解密第 1 页、旧库只读 key 列），因为它们要回答的
 * 正是「为什么这里没有会话」，而这件事只有看内容才知道。
 *
 * platform 的兜底只在**这一处**：`ctx.platform ?? process.platform`（装配层碰运行平台是允许的，
 * 真值表函数本身一律显式收参）。
 */
export declare function sessionSourceOf<TFile extends {
    id: string;
}>(wiring: SessionSourceWiring<TFile>): ForeignSource;
