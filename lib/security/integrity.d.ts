import type { ChecksumVerifyResult } from '../utils/hashing.ts';
export declare const SHA256_HEX_RE: RegExp;
/** 与 core ZIP 条目数上限一致的默认表大小上限 */
export declare const DEFAULT_MAX_CHECKSUM_ENTRIES = 10000;
export interface ChecksumsTableOptions {
    maxEntries?: number;
}
/**
 * 生成 checksums 表（对齐 core 扁平格式；内部复用 core buildChecksums）。
 * entries.name 必须是 ZIP 内正斜杠相对路径。
 */
export declare function buildChecksums(entries: {
    name: string;
    data: Uint8Array;
}[]): Record<string, string>;
/**
 * 解析并结构校验 checksums.json 原文。
 * 非法结构 / 危险键 / 值非 SHA-256 hex / 条目数超限 → 抛错（不可信输入，宁可拒绝）。
 */
export declare function parseChecksumsTable(raw: string, opts?: ChecksumsTableOptions): Record<string, string>;
/**
 * 校验：表内每个路径必须在 entries 中存在且 SHA-256 一致；entries 多余文件（manifest/自身）不参与。
 * 返回 { ok, mismatches, missing }（缺失与不符统一列入 mismatches 的展开视图，mismatches 只含不符）。
 */
export declare function verifyChecksums(entries: ReadonlyMap<string, Uint8Array>, table: Record<string, string>): ChecksumVerifyResult;
/** 一步到位：解析 checksums.json 原文并校验（解析失败抛错；不符返回 {ok:false,...}） */
export declare function verifyChecksumsJson(entries: ReadonlyMap<string, Uint8Array>, raw: string, opts?: ChecksumsTableOptions): ChecksumVerifyResult;
/**
 * 会落盘的文件分区条目「未登记进校验表」时的错误码（写进 `PlanItem.detail`，也进执行报告）。
 *
 * 语义不是「哈希不符」（那由 `import.integrityFailed` 表示，且直接失败），而是
 * 「这个条目根本没被校验表覆盖」—— 完整性声明对它零约束（SEC-05）。
 */
export declare const UNVERIFIED_FILE_ENTRY_CODE = "unverified-file-entry";
/**
 * 上述状态的文案键。字典条目由维护方补齐；缺失时 messages 回退成键名本身、绝不抛错，
 * 所以导入流程不会因为缺一条文案而中断。
 */
export declare const UNVERIFIED_FILE_ENTRY_KEY = "import.unverifiedFileEntry";
/**
 * 校验表的**反向覆盖**：entries 里存在、校验表里没登记的路径。
 *
 * `verifyChecksums` 只正向遍历表里的键（登记的必须存在且 SHA-256 一致），**表外条目它不看**；
 * 而文件类分区是按归档名原样落盘的（`adapters/file-collection.ts` 的 applyItem），
 * 于是「ZIP 里有、checksums 没登记」的文件照样写进目标目录 —— 完整性声明只约束了登记过的那一半。
 *
 * 本函数是「谁没被覆盖」的**单一事实源**：loadBundle 的告警与导入侧的阻断判定共用它，
 * 不各算一遍（两份实现迟早分叉）。判据与既有告警逐字一致：
 * 跳过目录条目（以 `/` 结尾）与调用方给出的结构文件（manifest.json / integrity/checksums.json）。
 */
export declare function unverifiedEntries(names: readonly string[], table: Record<string, string>, exclude?: readonly string[]): string[];
/** 人类可读的不匹配摘要（给「Backup integrity check failed」错误消息用） */
export declare function describeMismatches(result: ChecksumVerifyResult): string;
