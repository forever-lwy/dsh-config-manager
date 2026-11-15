import type { ForeignPlatform } from './platform-paths.ts';
import type { ParsedTranscript, RootProbeOptions, SessionReadOutcome, TranscriptRecord } from './session-source.ts';
import type { IrTimeMs } from './session-ir.ts';
import type { ForeignSkip } from './types.ts';
/** 四个发行版名（顺序 = chat-import traeUserDataDirs 的判定顺序） */
export declare const TRAE_PRODUCTS: readonly string[];
export declare const TRAE_VSCDB_NAME = "state.vscdb";
export declare const TRAE_STORAGE_SUBDIRS: readonly string[];
/** 静态探测位置 = 4 个 User 目录（state.vscdb 在读取期动态枚举，探测期只 stat 目录） */
export declare function traeUserDataDirs(opts: RootProbeOptions): string[];
export declare function traeProbePaths(opts: RootProbeOptions): string[];
/** 一条已归一的会话（从 ParsedTranscript 派生 + 源侧 id） */
export interface TraeSessionFile extends ParsedTranscript {
    readonly id: string;
}
/** 已确证的主存储键（chat-import §3.1） */
export declare const TRAE_STORAGE_KEY = "memento/icube-ai-agent-storage";
/**
 * 已确证的**回退键**（参考 lib/sources/trae.mjs 的 TRAE_FALLBACK_KEYS）：
 * 旧版 / 变体发行版把会话放在这两个键下，只认 icube 模式会**整库漏读**（一条会话都读不出来）。
 * 后两个本身就含 icube，列出来是为了让「参考认哪些键」这件事在源码里可见。
 */
export declare const TRAE_FALLBACK_KEYS: readonly string[];
/**
 * 聊天存储键的**候选**判定。
 * 判据三层：① 已确证的主键；② 已确证的回退键（大小写不敏感，与 SQLite 的按值查询同义）；
 * ③ 未确证的回退键用模式兜住（含 icube，或含 trae 且含 chat/agent/session/storage）。
 * 第③层**不把它们当成「一定正确」** —— 解析不出内容就走 sessions-not-migrated。
 */
export declare function isTraeChatStorageKey(key: string): boolean;
/**
 * Trae 的时间值 → 毫秒（参考 lib/sources/trae.mjs 的 timeValue）。
 *
 * 与 `irSafeTime` 的差异**两条**：① state.vscdb 里秒 / 毫秒两种时间戳都有（< 1e11 按秒换算，
 * 直接当毫秒会落到 1970）；② 「数字字符串」（`"1700000000"`）也是常见形态，`Date.parse`
 * 对它得 NaN（于是 createdAt 退化成导入当天）。换算复用 `read-opencode.ts` 的 `msTime`，
 * 这里只额外剥一层数字串。
 */
export declare function traeTimeValue(v: unknown): IrTimeMs | undefined;
interface RawSession {
    readonly id: string;
    readonly cwd?: string | undefined;
    readonly title: string;
    readonly createdAt?: number | undefined;
    readonly records: readonly TranscriptRecord[];
    readonly raw: number;
    readonly ignored: Readonly<Record<string, number>>;
}
/**
 * 从一个 ItemTable 值里**结构自证**地抽出会话容器。
 *
 * 判据（全部满足才认）：① 是对象；② 有消息数组且至少一条带角色字段；③ 有字符串 id（否则铸稳定兜底 id）。
 * 不满足的节点只**继续下钻**（不计数 —— 存储值里绝大多数是 UI 状态）；满足的节点不再下钻（避免重复计数）。
 */
export declare function traeSessionsOfValue(value: unknown, storageKey: string, platform: ForeignPlatform, findings?: ForeignSkip[], maxNodes?: number): RawSession[];
/** 一个 User 根下的 state.vscdb 位置（globalStorage 一个 + workspaceStorage/<hash> 各一个） */
export declare function traeVscdbPaths(userDir: string, platform: ForeignPlatform): Promise<string[]>;
/**
 * 读 Trae 会话。
 *
 * SQLite 能力缺失时**不再尝试**（如实报 source-unreadable 的 detail=sqlite-module-unavailable），
 * 而不是静默返回空 —— 那会与「未安装 Trae」混淆（t5 明文要求两者可区分）。
 */
export declare function readTrae(opts: RootProbeOptions & {
    readonly maxFiles?: number;
    readonly maxEncryptedDbBytes?: number;
}): Promise<SessionReadOutcome<TraeSessionFile>>;
/**
 * detect 期的**轻量预告**（issue #134 的第二半）：让 `/foreign-sources` 在用户点导入前就把
 * 「为什么这里没有会话」摆出来，而不是等 build 的 400 才闪一下。
 *
 * 代价（刻意接受）：只读**页头**与 **ItemTable 的 key 列**，绝不读正文、绝不枚举会话 ——
 * 4 个发行版的加密库最多各解密 1 页，旧库只是 `SELECT key`。因此 detect 仍是有界的只读探测。
 */
export declare function traeDetectSkips(opts: RootProbeOptions & {
    readonly maxEncryptedDbBytes?: number;
}): Promise<ForeignSkip[]>;
export {};
