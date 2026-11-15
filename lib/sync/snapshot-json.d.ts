import type { SyncSnapshot } from './transport.ts';
/** sections 整体 JSON 化（加密密文载荷原样透传）。 */
export declare function sectionsToJsonSafe(sections: SyncSnapshot['sections']): SyncSnapshot['sections'];
/** sections 从 JSON 还原（加密密文载荷原样透传）。 */
export declare function sectionsFromJsonSafe(sections: unknown): SyncSnapshot['sections'];
/** 整份快照序列化为 JSON 字符串（本地不落盘，仅用于传输/加密载荷）。 */
export declare function serializeSnapshot(snapshot: SyncSnapshot): string;
/**
 * 从 JSON 字符串还原快照（形状非法抛错；调用方负责包装成通道错误）。
 *
 * 体积上限刻意**不同于** parseJsonSafe 的缺省 64 MiB（issue #59）：快照是本插件自己写出的
 * 载荷（加密单文件布局经 base64 双膨胀后轻易越界），而缺省上限是给**不可信输入**用的。
 * 读写两侧口径必须一致，否则会产出「自己读不回来」的快照：push 报成功、远端列表为空、
 * 拉取报「快照损坏」。
 */
export declare function deserializeSnapshot(raw: string): SyncSnapshot;
