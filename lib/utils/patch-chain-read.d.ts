import { type PatchChainRead } from '../core/patch-chain.ts';
/**
 * patch 行改动的最小形状（`PatchFileFacade.applyPatchChanges` 的入参元素）。
 *
 * `forceTopLevel` = 「这一行必须落在**顶层**」：本层若还留着同名 insert 成员（0.9.0 写坏的存量），
 * 光把 action 改成 update 不够 —— planPatchDocument 按**原文档归属**决定身份，insert 成员会
 * 原地留着，于是同 id 仍是两条新增。置位后强制搬到顶层覆盖行。
 */
export type PatchChangeLike = {
    lineId: string;
    raw: unknown;
    action: 'insert' | 'update' | 'remove';
    forceTopLevel?: boolean;
};
/**
 * 生效链读取结果的短时缓存：一次导入会逐行写 patch，逐行重读 30+ 个 bundle patch 没有意义。
 *
 * 只按 TTL 命中还不够 —— 写盘之后必须 `invalidate()`，否则同一批次里「我刚写下的行」对后续
 * 判定不可见（本层最终会同时出现在 insert 与顶层两种身份里）。
 */
export declare class PatchChainCache {
    private at;
    private read;
    private pending;
    private readonly ttlMs;
    constructor(ttlMs: number);
    /** 丢弃缓存（写盘成功后调用）。 */
    invalidate(): void;
    get(load: () => Promise<PatchChainRead>, now?: number): Promise<PatchChainRead>;
}
/**
 * 把「已被**别的层**提供」的 insert 改动降级成覆盖行。
 *
 * 顶层 `- id: X` 行只做覆盖：宿主 `entryMap` 查得到 X 就覆盖它的 config，查不到就整行丢弃；
 * 只有 `- insert:` 块成员才新增条目。所以「X 已在链上」时必须写覆盖行，再写一份 insert 就
 * 变成两条「新增」抢同一个 id —— 宿主 compose 后该条目取到没有 config 的那份，插件保存配置
 * 时必然报 `Configuration for "X" is overridden by a home patch or command-line overlay`。
 */
export declare function downgradeProvidedInserts<T extends PatchChangeLike>(chain: PatchChainRead | null, file: string, changes: readonly T[]): {
    effective: T[];
    downgraded: string[];
};
/** 读整条生效链：bundle 层按声明顺序在前，其后 profile 层、home 层（与宿主合并序一致）。 */
export declare function readPatchChainFromProfile(homeDir: string, profile: string, bundles?: PatchChainRead): Promise<PatchChainRead>;
/**
 * 读既有 patch 文件并解析：真不存在（ENOENT）或内容为空 → `undefined`。
 *
 * 读不出来 / 解析不了**必须抛错**（issue #75 的数据丢失点）：调用方把失败当成空文档重建，
 * 就等于删掉用户手写的其余行。
 */
export declare function readExistingPatchDocument(path: string): Promise<unknown>;
