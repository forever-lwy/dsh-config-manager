/**
 * patch 文档的**结构重建**（issue #133）。
 *
 * 为什么需要独立一层：`cordis.patch.yml` 的两种形态语义**不等价**（宿主 dsh-app-boot 的
 * readProfilePatches 合并循环）：
 *   - 顶层 `- id: X` → 按 id **覆盖**已存在的条目；id 查不到时打 `patch: entry "X" not found` 丢弃；
 *   - `- insert:` 块成员 → **新增**条目（`data.push(...clone)`，唯一的新增路径）。
 * 此前重建时把所有行（含 insert 成员）统一输出成顶层行，于是「只能靠 insert 新增」的条目
 * （典型是 MCP server）在 DSH 侧全部失效 —— 一条 update 就够触发。
 *
 * 本模块只做**结构**：不读文件、不碰 YAML（core 层零依赖），输入是已解析的文档 + 变更清单，
 * 输出是重建后的条目数组与两套 id。序列化与自检在宿主门面（DshPatchFileFacade）里做。
 *
 * 三条不变量：
 *  ① 原本是 insert 成员的 id，重建后仍在 insert 块里（update 不改变归属）；
 *  ② 新增条目（`action:'insert'` 且文档里没有）落进 insert 块，而不是顶层行；
 *  ③ 任一 id 不得同时出现在顶层与 insert 两处 —— 计划阶段就抛错（防御性，正常路径不可达）。
 */
export interface PatchLineChange {
    lineId: string;
    raw: unknown;
    action: 'insert' | 'update' | 'remove';
    /**
     * 强制这一行落在**顶层**（覆盖行），即使本层还留着同名 insert 成员（issue #144 的存量修复）。
     *
     * 不变①的例外，只在调用方**知道该 id 已被别的层提供**时置位：此时本层的旧 insert 成员与
     * 别处的 insert 是两条新增抢同一个 id（宿主 compose 后取到没有 config 的那份，插件保存配置
     * 必然报 overridden）。光把 action 改成 update 不够 —— 归属按原文档决定，insert 成员会原地留下。
     */
    forceTopLevel?: boolean;
}
export interface PatchDocumentPlan {
    /** 重建后的文档条目（顺序尽量贴原文档：顶层行原位、insert 块原位、新增项追加在尾部） */
    items: unknown[];
    /** 落在 insert 块里的 id（按输出顺序） */
    insertIds: string[];
    /** 落在顶层行里的 id（按输出顺序） */
    topLevelIds: string[];
}
/** 计划会把 insert 成员提升成顶层行：调用方必须放弃这次写入（零写入）。 */
export declare class PatchPromoteRefusedError extends Error {
    readonly ids: string[];
    constructor(ids: string[]);
}
/** The candidate was rejected before writing; other import items may still proceed. */
export declare class PatchStartupInvalidError extends Error {
    constructor(message: string);
}
/**
 * 文档里的一条条目：id、它声明的 name、以及出现在 insert 块里还是顶层。
 *
 * 为什么把 name 一起读出来：写**顶层覆盖行**时宿主会校验 `name === target.name`，不一致就
 * `patch: name mismatch … skipping` 整行跳过（issue #144 的条目都来自 bundle 层，name 在那边）。
 */
export interface PatchDocumentEntry {
    id: string;
    /** 条目里声明的 name（没写就没有；覆盖行不写 name 也合法） */
    name?: string;
    /** true = `- insert:` 块成员（新增）；false = 顶层行（覆盖） */
    inInsert: boolean;
}
/** 读出文档里的全部条目（不判重、保持文档顺序）。 */
export declare function patchDocumentEntries(doc: unknown): PatchDocumentEntry[];
/** 读出文档里的 insert 成员 id 与顶层行 id（自检与测试共用；不判重、保持文档顺序）。 */
export declare function describePatchDocument(doc: unknown): {
    insertIds: string[];
    topLevelIds: string[];
};
/**
 * 重建成 patch 文档条目。
 *
 * `doc` 是已解析的原文档（非数组视为空文档）；顺序按原布局保留，新增项追加在尾部。
 */
export declare function planPatchDocument(doc: unknown, changes: readonly PatchLineChange[], inheritedIds?: ReadonlySet<string>): PatchDocumentPlan;
/**
 * 计划布局与观察到的布局是否一致（写后自检用，issue #133）。
 * 一致返回 `null`；不一致返回一句可直接进错误文案的差异说明（只含 id，不含值）。
 */
export declare function describePatchLayoutDrift(planned: {
    insertIds: readonly string[];
    topLevelIds: readonly string[];
}, observed: {
    insertIds: readonly string[];
    topLevelIds: readonly string[];
}): string | null;
/**
 * 覆盖行孤儿检查（issue #133 起、issue #144 改判到「整条生效链」口径）。
 *
 * 宿主对顶层行只做**覆盖**：`entryMap` 查不到该 id ⇒ `patch: entry %C not found` 整行丢弃。
 * 所以真正值得拒绝的只有一种：**任何一层都没有提供这个 id**。旧判据反过来拒绝「别的层用
 * `- insert:` 提供过它」—— 那恰恰是条目已经存在、覆盖**合法**的情形，#144 里 bundle 层提供的
 * 6 个 id 正是被这条旧判据误拒的（写进去就是重复条目）。
 *
 * `docs` = 判定依据的层文档（生效链 + 本文件写入前的文档；读不出来的层由调用方自行丢弃 ——
 * 守卫只做加强，绝不因为兄弟层损坏而永久阻塞写入）。
 */
export declare function unprovidedTopLevelIds(docs: readonly unknown[], topLevelIds: readonly string[]): string[];
