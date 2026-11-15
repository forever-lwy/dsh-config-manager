import type { SessionRewriteReason } from '../core/types.ts';
/** 项目目录段的合法形状（与 DSH projectKey 同名）；只接受 --…-- ，绝不拼出会话根之外的路径。 */
export declare const PROJECT_KEY_RE: RegExp;
/** 单文件改写结果（ok=false 时 reason 为机器可读原因）。 */
export type SessionLogRewrite = {
    ok: true;
    previousCwd: string;
} | {
    ok: false;
    reason: SessionRewriteReason;
};
/** 一个会话目录的改写结果（多 generation 一起改）。 */
export type SessionLogDirRewrite = {
    ok: true;
    rewritten: string[];
} | {
    ok: false;
    reason: SessionRewriteReason;
};
/** 是否是会话日志文件名（判据不写死：session.jsonl / session.v3.jsonl.zstd 都算）。 */
export declare function isSessionLogName(name: string): boolean;
/** 目录里按名字排序的会话日志文件（同一会话可能有多个 generation，必须一起处理）。 */
export declare function sessionLogNames(names: readonly string[]): string[];
/**
 * 只读：从会话日志**字节**里取出首帧 header 的 cwd。
 * 解不出来（缺 zstd 能力 / 非 zstd / 首帧不完整 / 非单行 JSON / 无 cwd）→ undefined：
 * 调用方按「无法判定」处理，绝不猜（猜错会让 DSH 下次启动直接报 corrupt session log）。
 */
export declare function readLogCwdFromBytes(bytes: Uint8Array): string | undefined;
/** 首帧 header 里我们关心的字段（全部可选；读不到就是 undefined，绝不猜）。 */
export interface SessionLogHeader {
    /** 会话 id（DSH 只认它；'session-<uuid>' 与裸 '<uuid>' 两种形态并存） */
    id?: string;
    /** 会话的工作目录 */
    cwd?: string;
    /** 会话来源；'subagent' = 子代理会话（DSH 工作区列表**不**单独显示它，只作为父对话的下一级） */
    origin?: string;
    /** 子代理会话所属的**父对话** id（origin === 'subagent' 时存在） */
    parentSessionId?: string;
    /**
     * 会话日志格式版本（header 的 `version`；DSH 的 SESSION_FORMAT_VERSION）。
     *
     * 为什么要读它：DSH 读会话时对**非本 build 的 version 直接拒绝**，而会话列表
     * （listArtifacts）把这种会话**静默跳过** —— 不报错、不在列表里，用户看到的就是
     * 「对话消失」。宿主据此在导出/导入/同步的**分析阶段**告警，而不是等用户发现。
     */
    version?: number;
}
/**
 * 只读：解出会话日志**首帧 header 的字段**。
 *
 * 解不出来（缺 zstd 能力 / 非 zstd / 首帧不完整 / 非单行 JSON）→ undefined：调用方按
 * 「无法判定」处理。为什么要 origin/parentSessionId（真机事故）：DSH 工作区只显示
 * origin !== 'subagent' 的会话，子代理会话挂在父对话之下；导出时只带子会话、不带父对话，
 * 导入后在工作区里就一条都看不见 —— 见 adapters/sessions.ts 的父链连带导出。
 */
/**
 * 只读：从会话日志**字节**里取出可用于 DSH codec 的行形态（首帧原始 JSON + 事件行的 JSON.parse 结果）。
 *
 * 为什么要「原始行」而不是解码后的字符串行：DSH 读盘时先 `JSON.parse(line)` 再把对象交给 codec
 * （`dsh-session-persistence-jsonl` 的 `SessionLogScanner.consumeEventLine`），某些代际/打包行的合法形状
 * 就藏在这个边界上（例如 `sourceEventSeqs` 的区间形态）。把字符串行再 parse 一遍就复刻不了这条边界。
 *
 * 读不出的地方一律不猜：容器非法 / 撕裂尾帧 / 首帧不是单行 JSON 对象 → 返回 reason；
 * 事件行 parse 失败 → 该行记为 null（调用方自行决定是「不可解析事件」还是停止深检）。
 * **绝不写任何字节**。
 */
export type SessionLogShape = {
    ok: true;
    headerValue: unknown;
    rows: (unknown | null)[];
} | {
    ok: false;
    reason: 'unavailable' | 'corrupt-container' | 'torn-tail' | 'invalid-header';
};
export declare function readSessionLogShapeFromBytes(bytes: Uint8Array): SessionLogShape;
export declare function readLogHeaderFromBytes(bytes: Uint8Array): SessionLogHeader | undefined;
/** 从磁盘上读某个会话日志文件的首帧 cwd（只读前 64 KB，绝不把整棵树读进内存）。 */
export declare function readLogFileCwd(absPath: string): Promise<string | undefined>;
/**
 * 改写**单个**会话日志文件的首帧 header cwd；成功时回传原 cwd（供调用方回滚）。
 *
 * 安全序列（任一环节不过就不发布）：
 *  1. 定位第 1 帧（窗口按需扩大；异常大窗口 → frame-too-large，不猜）；
 *  2. 解出 header 行：必须是单行 JSON 对象且有 cwd（否则 invalid-header / cwd-mismatch）；
 *  3. 重新序列化后把 cwd 改回原值必须与原对象**深度相等**（防止序列化悄悄改动其它字段）；
 *  4. 用与 DSH 同款的带校验和帧重压缩 → 写同目录临时文件（.tmp 不匹配会话日志判据）→
 *     原文件尾部**流式**拷贝（不整文件进内存）；
 *  5. 发布前自检：总长度 + 首帧 cwd + 尾部首尾抽查一致；通过才 rename 覆盖。
 */
export declare function rewriteSessionLogFile(absPath: string, newCwd: string): Promise<SessionLogRewrite>;
/**
 * 改写一个**会话目录**下全部 generation 的首帧 cwd。
 *
 * 多 generation 中后一个失败 → 把已改写的回滚回各自原 cwd，并报失败原因（绝不留半套：
 * header 与目录位置不一致会让 DSH 下次启动直接报 corrupt session log）。
 */
export declare function rewriteSessionLogDir(dir: string, newCwd: string): Promise<SessionLogDirRewrite>;
