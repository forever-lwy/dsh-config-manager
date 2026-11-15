/** IR 里的时间统一为毫秒；只接受安全整数 */
export type IrTimeMs = number;
/**
 * 归一后的内容块（DSH 侧可表达的最小词汇）。
 *
 * 竞品的 IR 块词汇是 text/reasoning/tool-call/image；我们**刻意不合并**工具块与文本块，
 * 因为两类块在源侧的外观与边界语义不同：
 *  - `tool_call`/`tool_result` 由源直接给出，`id` 是配对键，**允许为空串**（源缺 id 时照抄）；
 *  - `text` 是 `typeof text === 'string'` 的字面判定 —— 包括**空串**（`undefined` 则不是文本，
 *    见 read-claude-code 的「结构上算文本块」判定），这是重构前逐字节对齐的行为。
 */
export interface IrTextBlock {
    readonly type: 'text';
    readonly text: string;
}
export interface IrToolCallBlock {
    readonly type: 'tool_call';
    /** 源侧调用 id；源没给就是空串（**不伪造**：伪造会让 tool_result 配对错位） */
    readonly id: string;
    readonly name: string;
    /** 工具入参（原样透传，序列化在合成期做） */
    readonly input: unknown;
}
export interface IrToolResultBlock {
    readonly type: 'tool_result';
    /** 对应调用 id；源没给就是空串 */
    readonly id: string;
    /** 结果的纯文本投影（源侧的数组/对象形态在此已拍平） */
    readonly text: string;
    readonly isError: boolean;
}
export type IrBlock = IrTextBlock | IrToolCallBlock | IrToolResultBlock;
export declare function irTextBlock(text: string): IrTextBlock;
export declare function irToolCallBlock(id: string, name: string, input: unknown): IrToolCallBlock;
export declare function irToolResultBlock(id: string, text: string, isError: boolean): IrToolResultBlock;
/** provider 回报的用量（缺失一律记 0，绝不猜） */
export interface IrUsage {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
    readonly cacheReadTokens: number;
    readonly reasoningTokens: number;
}
export declare const IR_ZERO_USAGE: IrUsage;
/**
 * 一条 IR 消息 = 消息 id、内容块、以及**源侧数据原样透传槽**。
 *
 * `passthrough` 的存在理由：合成期的 DSH 行式有若干「源侧字段照抄」的位置（Claude 的
 * `usage` 键名与 `source.provider/model`），若在这里归一成我们的词汇，合成期就得把这些
 * 映射表再搬回来 —— 那是把「源知识」泄漏进宿主层。透传槽让 IR 保持**源无关**：只有源适配器
 * 知道自己要放什么进去。
 */
export interface IrMessage {
    readonly id: string;
    readonly role: 'user' | 'assistant';
    readonly blocks: readonly IrBlock[];
    /** 供合成期原样写出的源侧字段（结构由源与合成器的契约约定；本层不解释） */
    readonly passthrough?: Readonly<Record<string, unknown>>;
}
export declare function irMessage(id: string, role: IrMessage['role'], blocks: readonly IrBlock[], passthrough?: Readonly<Record<string, unknown>>): IrMessage;
export interface IrSession {
    /** 会话 id = DSH 侧目录名（由调用方在解析前自证安全） */
    readonly id: string;
    /** 工作目录（DSH 按它的目录键归位；缺失时**根本没有会话**，不猜） */
    readonly cwd: string;
    /** 会话创建时间（源里最早的可解析时间；缺省 = 调用方给的时间兜底） */
    readonly createdAt: IrTimeMs;
    /** 源记录的**原始条数**（含被忽略的） */
    readonly records: number;
    /** 逐条归一后的记录，**保持源顺序** */
    readonly messages: readonly IrMessage[];
}
export interface IrParseIssue {
    readonly kind: string;
    readonly detail?: string;
}
/**
 * 逐行解析的记账（与竞品 `parseJsonlLines` 的 `{recs, skipped, skippedLines, secrets}` 同形）。
 *
 * 与竞品的两处刻意不同：
 *  ① **明细计数不设 200 上限**：上限会让「第 201 条坏行」静默消失，与本仓「绝不静默」冲突；
 *     真正需要截断时应由**渲染层**决定（本仓已有长列表限高内滚的做法）。
 *  ② 竞品在这条通道里顺带上报疑似密钥位置；我们的凭据策略是**结构性剥离**（见
 *     claude-code.ts 的 collectSettingsFindings），会话文本本身就是用户对话内容，不参与剥离 ——
 *     这条差异是**产品决策**，不是遗漏：把会话正文里的 sk- 当成凭据上报会误导用户以为已经剥离。
 */
export interface IrParseStats {
    /** 解析成功且是对象的记录数（累加器，由 `parseJsonlObjects` 写入） */
    records: number;
    /** 解析失败的**行数**（空行不计；累加器） */
    unparsable: number;
    /** 明细（失败了哪些行、为什么是零会话；累加器） */
    issues: IrParseIssue[];
}
/** 逐行 JSON 解析（坏行不抛，只记账） */
export declare function parseJsonlObjects(text: string, stats: IrParseStats): Record<string, unknown>[];
/** 非空字符串 */
export declare function irStr(v: unknown): string | undefined;
/**
 * 有限数（**不限安全整数**）—— 只用于「比较 / 累加」类字段（如 usage 的 token 数）。
 * 时间戳请用 `irSafeTime`：DSH 对时间字段要安全整数。
 */
export declare function irNum(v: unknown): number | undefined;
/** 毫秒时间：数字（含负数年）必须安全整数，字符串走 Date.parse；其余一律 undefined（绝不 Date.now() 伪造） */
export declare function irSafeTime(v: unknown): IrTimeMs | undefined;
export declare function isSafeIrId(id: string): boolean;
/** 类型/种类名的**唯一**计数口径（各处自己写 +1 必然漂移） */
export declare function irBump(counts: Record<string, number>, key: string, by?: number): void;
/** 取「最早时间」的**唯一**口径（未定义时取候选；候选更早时替换） */
export declare function irEarlier(a: IrTimeMs | undefined, b: IrTimeMs | undefined): IrTimeMs | undefined;
/** 消息 id 兜底序：源没给合法 id 时用**会话内序号**铸稳定伪 uuid（与重构前同形） */
export declare function irFallbackMessageId(index: number): string;
/**
 * 一行 DSH 会话事件。
 *
 * 放在 IR 层的理由：`encodeDshSessionLog` 的公开签名**逐字不变**（v1 公开面），而它被
 * IR 层之外的调用方使用；类型留在 IR 层可以让「行式」只有一处定义。
 * **本层不生成行**——行是由 `synthesizeDshRows` 合成的（IR 层不含任何 DSH 语义）。
 */
export interface DshSessionRow {
    type: string;
    seq: number;
    time: number;
    data: Record<string, unknown>;
    /** 表层追加标记：user/message、assistant/message、tool/result 必需（codec 强校验） */
    surfaceOp?: 'append';
}
export interface DshSessionHeader {
    type: 'session';
    version: number;
    id: string;
    createdAt: number;
    cwd: string;
    isSeeded: boolean;
    delegationDepth: number;
}
/**
 * 合成器需要的、**只能由源给出**的额外信息（IR 保持源无关的代价就在这个接口上）：
 *  - `title`：源给的会话标题，或源侧的文本提取（**空标题不产标题行**）
 *  - `titleSource`：标题来源标记（DSH 的 `session/title` 要它）
 *  - `emptyBlocks`：把「本轮内容块全空」时的取值交给源判定 —— Claude 的 user/message 恒为
 *    `[{type:'text',text}]`（允许空串），assistant/message 在文本被 trim 后为空时给 `[]`；
 *    这是**源侧行为**，写进 IR 层就等于把 Claude 的怪癖固化给所有来源
 *  - `provider`：`request/header` 与 `source` 里的 provider 名（源侧才有这个概念）
 *  - `reasoningEffort` / `maxTokens`：请求头的能力声明（同样只在源侧有意义）
 */
export interface IrSynthesisHints {
    readonly title: string;
    readonly titleSource: unknown;
    readonly emptyBlocks: readonly IrBlock[];
    readonly provider: string;
    readonly reasoningEffort: string;
    readonly maxTokens: number;
}
export interface SynthesisStats {
    /** 计数键 → 条数（未迁移的源记录类型、源侧空消息、孤儿结果、坏行都记在这里；累加器） */
    readonly ignored: Record<string, number>;
    userMessages: number;
    assistantMessages: number;
    toolCalls: number;
    toolResults: number;
}
/**
 * IR → DSH 行（**唯一合成器**，所有会话类来源共用）。
 *
 * 三条硬约束（DSH codec 强校验，违反 = 目标机把会话判为损坏）：
 *  ① `seq` 从 0 连续递增（按位置校验引用）；
 *  ② `user/message`/`assistant/message`/`tool/result` 必须带 `surfaceOp: 'append'`；
 *  ③ 工具生命周期闭合：`tool/call` 开 step，其结果收进**同一个 step**。
 *
 * 与竞品 `synthesizeSession` 的**刻意差异**（不是能力缺失，是宿主不同）：竞品产出的是
 * 「供 DSH 官方 API 导入的事件流」，所以要做 protected head（首个 surface 事件必须是头）、
 * 环境注入、压缩检查点、三层预算；我们产出的是**要写进会话日志文件的行**，宿主 codec
 * 对这条流的硬不变量就是上面三条。补头/注入/压缩属于**待办能力**（见 t4 汇报的
 * 「合成器可扩展位」），不在本次重构里顺手改字节产物 —— 那会让逐字节回归失去意义。
 */
export declare function synthesizeDshRows(session: IrSession, hints: IrSynthesisHints, stats: SynthesisStats, now: number): DshSessionRow[];
/** 内容块的文本投影（唯一口径：顺序拼接，块之间一个换行） */
export declare function irTextOfBlocks(blocks: readonly IrBlock[]): string;
/**
 * 消息 id：优先源自己的 id（**必须自证是安全 id**，否则兜底伪 uuid）。
 * 兜底序 index 由合成器按消息次序给出。
 */
export declare function irMessageIdOf(raw: unknown, index: number): string;
/** 用量归一：非安全整数/负数/缺字段一律 0（DSH 对 usage 要求安全整数） */
export declare function irUsageOf(raw: unknown): IrUsage;
