import type { IrBlock, IrTimeMs } from './session-ir.ts';
import type { ParsedTranscript, RootProbeOptions, SessionReadOutcome } from './session-source.ts';
/** 环境变量覆盖的键名（**只报键名**；值绝不回传） */
export declare const CONTINUE_ENV_KEY = "CONTINUE_GLOBAL_DIR";
/** 索引文件名（不是会话） */
export declare const CONTINUE_INDEX_NAME = "sessions.json";
/** 会话目录名（env 存在时替换 `<home>/.continue` 这一整段） */
export declare const CONTINUE_DIR_NAME = ".continue";
/**
 * Continue 新建会话时写入的**默认标题常量** → 视为「没有显式标题」（参考 convert/continue.mjs 的
 * DEFAULT_TITLE）：源侧把它当占位符，直接当标题会在目标机显示一整排「New Session」。
 */
export declare const CONTINUE_DEFAULT_TITLE = "New Session";
/**
 * Continue 的会话根（**env 替换语义**）。
 *
 * 探测面直接复用本函数 → `CONTINUE_GLOBAL_DIR` 生效时 detect 也看得到真实位置；
 * 而真值表护栏用**空环境**比对时它退化成 `<home>/.continue/sessions`（与 truth-table.ts
 * 的 defaults 逐字相同），两种口径都不冲突。
 */
export declare function continueSessionsDir(opts: RootProbeOptions): string;
/** 一条已解析的 Continue 会话 */
export interface ContinueSessionFile {
    readonly id: string;
    readonly parsed: ParsedTranscript;
}
export interface ContinueReadOptions extends RootProbeOptions {
    readonly maxFileBytes?: number | undefined;
    readonly maxSessionFiles?: number | undefined;
}
/** 解析结果：成功给 id + 归一记录；失败给稳定机器码片段 */
export type ContinueParseOutcome = {
    readonly ok: true;
    readonly id: string | undefined;
    readonly parsed: ParsedTranscript;
} | {
    readonly ok: false;
    readonly problem: 'json-error' | 'not-an-object' | 'history-not-array';
};
/**
 * 工具上下文（**预扫一次**的产物）。
 *
 * 为什么需要预扫：参考实现是「先把所有 tool 结果消息收进 coveredCallIds，再用
 * toolCallStates[].output 只补**没有**独立结果消息的调用」。我们的 IR 是顺序流，
 * 在解析 assistant 时还不知道后面有没有 `role:'tool'` 消息 → 必须先把这层信息扫出来。
 */
export interface ContinueToolContext {
    /** 历史项上的全部 toolCallStates（顺序 = 源顺序） */
    readonly states: readonly Record<string, unknown>[];
    /** callId → 该 state（首个同 id 者胜） */
    readonly stateByCallId: ReadonlyMap<string, Record<string, unknown>>;
    /** 已有独立 `role:'tool'` 结果消息的 callId（这些调用的结果以消息为准） */
    readonly coveredByToolMessage: ReadonlySet<string>;
}
/**
 * 助手消息上的工具调用（两个世代并存：`toolCalls` 与 `toolCallStates`）。
 *
 * 与参考 convert/continue.mjs 对齐的两条口径：
 *  ① `message.toolCalls` 是**权威**，**只在它产出 0 条调用时**才回退 `item.toolCallStates`
 *     —— 两者同时存在时是同一数组的镜像，无条件同时遍历会**重复产出**调用与结果；
 *  ② state 的 output 只补「没有独立 `role:'tool'` 结果消息」的调用，错误位取
 *     `status === 'errored'`（而不是消息上自造的 isError）。
 *
 * 返回调用块；`results` 是出参（配对结果，按源顺序）。
 */
export declare function continueToolBlocks(msg: Record<string, unknown>, ctx: ContinueToolContext, ignored: Record<string, number>, results: IrBlock[]): IrBlock[];
/** 单对象 JSON → 归一记录（Continue 的会话文件是**一个对象**，不是 JSONL） */
export declare function parseContinueSession(text: string): ContinueParseOutcome;
/** 索引条目（只读这两项；其余字段一概不读 —— 索引可被手工编辑，畸变条目按缺省处理） */
export interface ContinueIndexEntry {
    /** 源产品自己给会话起的显示名（空串 = 没有；默认标题常量已过滤） */
    readonly title: string;
    /** 创建时间（会话文件本身没有时间戳，只有索引带 dateCreated） */
    readonly createdAt?: IrTimeMs | undefined;
}
/**
 * 索引的 `dateCreated` → 毫秒。
 *
 * 它是 `String(Date.now())`（**毫秒数字串**），不是时间戳文本：纯数字串必须先按数值解析，
 * 交给 `Date.parse` 会得到 NaN（于是 createdAt 退化成导入当天）。其余形态回退 `irSafeTime`。
 */
export declare function indexTimeOf(v: unknown): IrTimeMs | undefined;
/** 索引（`sessions.json`）→ id → {显示名, 创建时间}；认不出来就空映射（绝不因此丢会话） */
export declare function continueIndexOf(value: unknown): Map<string, ContinueIndexEntry>;
/** 索引 → id 显示名映射（保留原导出名与语义；`continueIndexOf` 的薄视图） */
export declare function sessionTitlesFromIndex(value: unknown): Map<string, string>;
export declare function readContinueSessions(opts: ContinueReadOptions): Promise<SessionReadOutcome<ContinueSessionFile>>;
