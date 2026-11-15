/**
 * Claude Code 会话（~/.claude/projects/<项目>/<uuid>.jsonl）→ **DSH 会话日志**的转码器（纯函数）。
 *
 * 为什么是转码而不是搬运（两边落盘形态完全不同）：
 *  - Claude Code：纯 JSONL 明文，一行一条记录（type = user / assistant / attachment / queue-operation / system），
 *    cwd 只写在记录字段里；
 *  - DSH：sessions/<projectKey(cwd)>/<id>/session[.vN].jsonl.zstd，是**带校验和的 zstd 帧的拼接**
 *    （首帧 = header 单行 JSON，之后每个 append 批次一帧）；DSH 启动时校验
 *    「日志位置 == projectKey(header.cwd)/id」，不一致直接报 corrupt session log。
 *
 * 三条硬约束：
 *  ① **格式版本必须来自目标机**：DSH 对非本 build 的 header.version 直接拒绝，且列表里**静默跳过**
 *     （用户看到的是「对话消失」，见本仓 G-23）。本模块不猜版本：调用方必须传入
 *     （宿主用 utils/session-format.ts 的 resolveSessionFormatVersion 解析）；本模块只实现 3。
 *  ② **行的形态按 DSH 自己的 codec 对齐，不按本模块的想象**：surfaceOp 标记（user/message、
 *     assistant/message、tool/result 必需）、可选空字段必须省略（request/header 的 tools: [] 会被拒）、
 *     header 的 isSeeded / delegationDepth 必填。这套最小事件集由真实 codec 的
 *     encode → assertV3RowAdmission → createDecoder 三条路径验证过
 *     （复核脚本：outputs/foreign-import-v1/try-dsh-events.mjs）。
 *  ③ **不认识的记录一律计数上报**，绝不静默吞掉。
 *
 * 三段式分层（t4，档 B 前置）：
 *  ① **解析**（本文件）：Claude 记录 → IR（`./session-ir.ts`）；
 *  ② **合成**（`./session-ir.ts` 的 `synthesizeDshRows`）：IR → DSH 行（**所有会话类来源共用**）；
 *  ③ **编码**（本文件）：行 → 字节（zstd 帧拼接 + 校验和）。
 *  本文件**刻意不出现在 file-budget 的 import 白名单里**：它 import 了 `node:fs` 的**类型**用于
 *  构造只读句柄的回调（`ClaudeReadHandle`，追加能力通道），这是**零运行期 I/O** 的类型依赖。
 *  守卫按运行时性质放行（见 file-budget.test.ts 的白名单说明）。
 *
 * 会话保真修复（2026-10-18，task-4；四条都在**本文件内**收口，共享合成器 session-ir.ts 一字未改）：
 *  ① **幂等时间**：墙钟回落只有一个确定性来源（`resolveWallClock`：显式 `options.now` → 记录自身
 *     最早时间戳 → `input.createdAtMs`），只有全都缺失才回落 `Date.now()` 并在
 *     `info.counts.timestampsFallback` **如实记账**。旧实现 parse 与 synthesize 各调一次
 *     `Date.now()` ⇒ 同一来源两次转码字节必然不同 ⇒ DSH 侧「同内容 → Skip」永不成立。
 *  ② **isSidechain**：真实 Claude 子代理记录（`type=user|assistant` + `isSidechain:true`）**一律
 *     不进 IR**，整类计报 `isSidechain`（旧实现零命中 → 子代理正文静默混进父对话）。
 *  ③ **sessionId 不一致**：`input.recordSessionId` 存在且 ≠ `input.id` → 非致命发现
 *     `session-id-mismatch`（会话 id 仍以文件名 stem 为准，见 `TranscodeResult.findings`）。
 *  ④ **推理块**（Claude Code 的 `thinking` / `redacted_thinking`）：共享 IR 没有 reasoning
 *     承载位（docs/known-issues/known-gaps.md F-01）→ 计报 `thinking`，**绝不伪装成正文**；非 Claude 原生的
 *     `{type:'reasoning',text:…}` 刻意保持既有口径（理由与切换方式见 `REASONING_BLOCK_TYPES`）。
 */
import type { Stats } from 'node:fs';
import type { DshSessionHeader, DshSessionRow, IrParseStats, IrSession } from './session-ir.ts';
import type { ClaudeSessionInput, ForeignSkip } from './types.ts';
export type { DshSessionHeader, DshSessionRow } from './session-ir.ts';
/**
 * 本模块已实现行式的 DSH 会话格式版本（其它版本一律拒绝，不猜）。
 *
 * **v3 与 v4 的行式是同一套**：`synthesizeDshRows` 产出的行在两代 DSH 自己的真 codec 上逐条复验过
 * （v3 档 = 本机 CLI 档案树的 dsh-session；v4 档 = 桌面端 0.2.0-rc.2，均 `equivalentToReadPath`）。
 * 所以**按目标机的版本写**：目标是 v3 就写 v3、是 v4 就写 v4。两条反向都不行 —— 一律写最高版本
 * 会让 v3 主机读不了（反向不可读）；只认 v3 则让 v4 目标整批被跳过（2026-10-08 真机事故：
 * 桌面端 v4 目标下每一条会话都被 `session-format-unsupported` 拒掉，产出的包里没有 sessions 分区）。
 */
export declare const SUPPORTED_DSH_SESSION_FORMAT_VERSIONS: readonly number[];
/**
 * 待转码的 Claude 会话文件。
 *
 * **等价于 `types.ts` 的 `ClaudeSessionInput`**（2026-10-18 起不再重复声明）：读盘层额外给的
 * `recordSessionId`（≠ 文件名 stem 时报 session-id-mismatch）与 `createdAtMs`（确定性 createdAt
 * 回落值，见 `resolveWallClock`）因此天然可达本层，而 `{ id, text }` 的老调用方一字不用改。
 */
export type ClaudeSessionFile = ClaudeSessionInput;
/**
 * **只读**的文件读取面（additive，2026-10）：**内部**用它支持「大文件只读头尾」的追加通道。
 *
 * 现状：转码器一次吃全文（`ClaudeSessionFile.text`），本接口是**给将来留的扩展位**，不是
 * 现状产物的一部分 —— 因此它**刻意不从本模块再导出**（v1 公开面是 registry/claude-code.ts
 * 到转码器的调用，不是这个内部形状）。真正需要它的是「同一会话被再次导入时只转尾段」那条路
 * （竞品 `tailSessionEvents` 的等价物），属于 t4 之后的档 B 工作。
 */
export interface ClaudeReadHandle {
    readonly id: string;
    /** 只需要文件元信息与大小（宿主侧用 `ctx.fs.stat` 即可满足，避免为了 size 读整份文件） */
    stat(): Promise<Stats>;
    /** 只读前 n 字节（可选实现；未提供时由调用方整读后再截取） */
    readHead?(bytes: number): Promise<string>;
    /** 只读后 n 字节（可选实现） */
    readTail?(bytes: number): Promise<string>;
}
export interface ClaudeSessionInfo {
    records: number;
    userMessages: number;
    assistantMessages: number;
    toolCalls: number;
    toolResults: number;
    /**
     * 未迁移的记录类型 / 内容块 → 条数（attachment / queue-operation / system / isSidechain /
     * thinking / unparsable …）。**每个键在下游都会被翻成 `unsupported-session-record` 的 detail**
     * （kernel.collectSessionSections），所以这里只放「这条内容本版不迁移」这一件事。
     */
    ignored: Record<string, number>;
    /**
     * 结算类记账（**刻意不进 `ignored`**：那里的键会被翻成 `unsupported-session-record`，语义不符）。
     *
     * 目前只有 `timestampsFallback`（0/1）：记录里与 `input.createdAtMs` **都没有**可用时间戳 ⇒
     * 本次转码只能回落墙钟 `Date.now()`，**同一来源两次转码的字节可能不同**（DSH 侧「同内容 → Skip」
     * 因此不成立、重复导入会判 Conflict）。这是必须如实报出来的不确定性，不是错误。
     */
    counts: Record<string, number>;
}
export interface TranscodedSession {
    id: string;
    cwd: string;
    /** 包内相对路径：<projectKey>/<id>/<日志名> */
    relativePath: string;
    data: Uint8Array;
    info: ClaudeSessionInfo;
}
export interface TranscodeOptions {
    /** 目标机 DSH 的 SESSION_FORMAT_VERSION（必填） */
    formatVersion: number;
    /**
     * 墙钟回落的**最高优先级**注入点（测试 / 调用方显式给定）。
     *
     * 缺省时按 `resolveWallClock` 的回落链取：记录自身最早时间戳 → `input.createdAtMs` →
     * `Date.now()`（最后一级会在返回值里记 `timestampsFallback`）。非法值（非安全整数）视同没给。
     */
    now?: number;
}
export interface TranscodeSkip {
    code: 'session-format-unsupported' | 'session-missing-cwd' | 'session-unsafe-id' | 'session-empty' | 'session-unparsable';
    detail?: string;
}
export interface TranscodeResult {
    session?: TranscodedSession;
    skip?: TranscodeSkip;
    /**
     * **非致命**发现（会话照样产出）：目前只有 `session-id-mismatch`（记录里的 sessionId 与文件名
     * stem 不一致）。会话 id 仍以文件名 stem 为准，只有「不一致」这件事必须可见。
     *
     * 为什么放在结果上而不是 `info.ignored`：`ignored` 的键在下游一律被翻成
     * `unsupported-session-record`（码固定），而本条要用契约里冻结的 `session-id-mismatch`。
     * **调用方负责原样带出**（`skipped.push(...result.findings)`）—— 现有
     * `kernel.collectSessionSections` 尚未读本字段（不在本次改动范围）。空数组 = 没有发现。
     */
    findings: ForeignSkip[];
}
/**
 * Claude 会话原文 → IR（**纯函数，不读盘**）。
 *
 * 反应：坏行不抛、计数上报（`stats.unparsable`）；缺 cwd 时**不产出会话**（由调用方转成 skip 码），
 * 因为 DSH 会按 cwd 的目录键归位，猜一个 cwd 等于把会话放到错误的项目里。
 */
export declare function parseClaudeSession(file: ClaudeSessionFile, options: TranscodeOptions, stats?: IrParseStats): IrSession | undefined;
/** 日志文件名（与 DSH 的 generation 命名一致：v0 无后缀，vN 带 .vN） */
export declare function dshSessionLogName(version: number): string;
export declare function transcodeClaudeSession(file: ClaudeSessionFile, options: TranscodeOptions): TranscodeResult;
/** 帧拼接：首帧 = header 单行 JSON，之后每批事件一帧（与 DSH 的物理编码一致，帧带内容校验和） */
export declare function encodeDshSessionLog(header: DshSessionHeader, rows: readonly DshSessionRow[]): Uint8Array;
