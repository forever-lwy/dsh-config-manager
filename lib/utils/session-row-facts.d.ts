/**
 * 会话事件的**行级事实**与「合成收尾块」判定 —— 宿主侧唯一实现（体检扫描与修复计划共用）。
 *
 * 为什么必须共用：体检说「这条可修」与执行器「真的去修」必须是同一份判据。
 * 两处各写一份必然分叉 —— 界面给按钮、执行器却拒绝（或反过来静默不改），用户看到的是自相矛盾。
 *
 * 分层纪律：本模块只解析**已经解压出来的行文本**，不碰容器字节（那是 utils/zstd-frame.ts），
 * 也不写任何字节；core 禁止 import。
 */
/**
 * v0 的**打包行**类型（官方 `decodePackedRun`）：一行承载 payload.length 个连续事件，
 * 展开后 seq = seq0 .. seq0+len-1。**这种行没有 `seq`** —— 只看 `seq` 的判据会把它当空气，
 * 于是「打包行之后的第一条标量 seq 行」被误判成空洞（真机 407/1194 份 v0 日志因此被判有损）。
 */
export declare const SESSION_PACKED_TYPES: ReadonlySet<string>;
/**
 * 判定 packed 行的展开**跨度**（官方 v0 released 行形状的逐条照抄）。
 *
 * 合法形状（全部满足才是「可判定」）：
 *  - 顶层键集**严格等于** `{type, seq0, time0, data}`（官方 assertReleasedV0Keys 的严格判据）；
 *  - `seq0` 是安全非负整数；
 *  - `data.texts` / `data.args` 是**非空字符串数组**；
 *  - `data.dt` 长度 = 载荷长度 - 1。
 * 任一条件不满足 → `'opaque'`（**不可判定**：调用方不得跨越它下任何连续性/截断结论，只能 refuse）。
 *
 * 为什么必须这么严（R1 对抗样本 ADV-1/3/4）：`'abcdef'.length === 6`、`[].length === 0`、
 * 多带一个 `seq` 成员 —— 任何一条放宽都会把「DSH 拒读的非法行」当成「已知跨度」，
 * 从误报（现状）变成**漏报**（把坏日志报成 nothing-to-fix），那是更危险的回归。
 */
export declare function packedRowSpan(rec: Record<string, unknown>): number | 'opaque';
/** 一行会话事件里我们**能证明**的字段（读不出的一律缺省，绝不猜）。 */
export interface SessionRowFacts {
    /** 事件类型（如 turn/end；不是字符串 = 缺省） */
    type?: string;
    /** 序号（DSH 的 seq；非安全整数 = 缺省） */
    seq?: number;
    /** 所属回合（data.turn；非安全整数 = 缺省） */
    turn?: number;
    /** packed 行的展开跨度（payload.length）；'opaque' = 形状不合法 / 不可判定。非 packed 行缺失。 */
    packedSpan?: number | 'opaque';
    /** packed 行的起始 seq（seq0；安全非负整数才有值） */
    packedSeq0?: number;
}
/**
 * 解析一行 JSON；不是对象 / 解析失败 → null（不猜，交给调用方记成「不可解析」事实）。
 */
export declare function parseSessionRowFacts(line: string): SessionRowFacts | null;
/** 收尾类型（设计稿 §10.2 的 closer 形状判据）。 */
export declare const SESSION_CLOSER_TYPES: ReadonlySet<string>;
/** 收尾块的形态上限：≤8 行（超长的收尾块不是崩溃恢复补出来的样子）。 */
export declare const SESSION_MAX_CLOSER_ROWS = 8;
/** 可证明的合成收尾块（要丢弃的行区间为 [start, end)）。 */
/**
 * 「续写事件」类型白名单：只有这些类型出现在收尾块之后，才算「回合结束后**还在继续对话**」。
 *
 * 为什么必须有它（真机证据）：`turn/end#824` 之后紧跟 `workspace/changes#825`（同属 turn 17）——
 * 那是**回合正常结束后的收尾元数据**，不是续写。旧判据只看 `data.turn` 相等，于是把这种正常会话
 * 判成「合成收尾块撞上真实续写」，进而拒绝修复（用户看到「写前校验未通过，已拒绝修复」）。
 * 白名单只收真正代表「还在说话/干活」的事件：消息、流式块、工具调用/结果、回合与步骤的开始。
 */
export declare const SESSION_CONTINUATION_TYPES: ReadonlySet<string>;
export interface SyntheticCloserRun {
    start: number;
    end: number;
    /** 收尾块关闭的回合（判据：块内最后一个带 turn 的行） */
    turn: number;
}
/**
 * 找出**可证明是崩溃恢复补写**的合成收尾块（设计稿 §10.2）。
 *
 * 形状判据（≤8 行收尾类型、含 `turn/end`）只是**必要条件**：任何一次正常的「回合结束 → 下个回合开始」
 * 都满足它。真机实测（2026-10-04）：只看形状会把同一台机器上 86 条健康会话误报成崩溃残留。
 *
 * 所以必须再证明「撞上真实续写」：收尾块之后、下一个 `turn/start` 之前，**同一个 turn 还在继续**
 * （有行带相同的 `data.turn`）—— 回合已经结束却还在续写，那个 closer 才是合成块。
 * 证明不了 = undefined（绝不猜：宁可漏报，也不把健康会话标红、更不拿它去改字节）。
 */
export declare function findSyntheticCloserRun(rows: readonly SessionRowFacts[]): SyntheticCloserRun | undefined;
/** 连续性走查结果（**唯一**的 seq 跨度模型；体检与执行器必须共用）。 */
export interface SessionRowWalk {
    /** 首个**可证明**的错位（不可解析行 / 首个 seq 不是 0 / 空洞 / packed 行 seq0 不对齐）；未发现 = -1 */
    firstAnomalyIndex: number;
    /** 首个**不可判定**行（packed 形状不合法 / 无 seq 且不是 packed 行）；未发现 = -1 */
    firstOpaqueIndex: number;
}
/**
 * 逐个 seq 走查「事件计数是否致密」（官方 scanRows 的同一份跨度模型）。
 *
 * 规则（对齐官方 `decodePackedRun` / `scanRows`；R1 §3.1 的规范形状 1–5）：
 *  1. `next` 从 0 起（等价于官方 eventCount）；
 *  2. 标量行：`seq` 是安全非负整数时要求 `seq === next`，随后 `next = seq + 1`；
 *  3. packed 行：要求 `seq0 === next`，随后 `next = seq0 + 跨度`（跨度见 packedRowSpan）；
 *  4. 形状不合法（含无 seq 且非 packed 的行）→ **不可判定**（opaque）；
 *  5. 不可解析行（facts === null）按**异常**处理（与旧判据一致）。
 *
 * 「不可判定」不是「没问题」：调用方遇到 `firstOpaqueIndex >= 0` 必须 refuse，
 * 绝不跨越它继续下「连续 / 该截断」的结论（refuse 而不是猜）。
 */
export declare function walkSessionRowContinuity(facts: readonly (SessionRowFacts | null)[]): SessionRowWalk;
/** seq 引用区间（闭区间，含端点）。 */
export interface SessionSeqRange {
    start: number;
    end: number;
}
/** 一行里我们**能认出的**事件 seq 引用（单点 + 区间，不展开区间以免内存放大）。 */
export interface SessionRowReferences {
    /** 单点引用（升序去重） */
    seqs: number[];
    /** 区间引用（升序去重；[a, b] 与 [b, a] 归一化为 start <= end） */
    ranges: SessionSeqRange[];
}
/**
 * 收集一行原始文本里全部**事件 seq 引用**（递归 walk，覆盖官方已知的三个引用面）：
 *  - `sourceEventSeqs` / `messageSeqs`：数字项 = 单点；两元数组 = 区间（官方 decodeSeqRanges 会展开）；
 *  - `startSeq` / `endSeq`：单点；
 *  - `targets[].seq`：单点。
 * 解析失败 / 非对象 → 空引用（调用方按「无引用」处理，绝不猜）。
 */
export declare function collectSessionRowReferences(raw: string): SessionRowReferences;
/** 该引用集合是否包含某个 seq（区间按成员判定，不展开）。 */
export declare function referencesContain(refs: SessionRowReferences, seq: number): boolean;
/**
 * 廉价预筛：这行**是否可能**含引用（真正的引用键要么含 `Seq`、要么是 `targets`）。
 * 只用于避免对每一行做 JSON.parse —— 预筛为 false 的行**一定**没有引用（保守方向正确）。
 */
export declare function sessionRowMayHaveReferences(raw: string): boolean;
