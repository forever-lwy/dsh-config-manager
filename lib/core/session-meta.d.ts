/**
 * DSH 会话元数据读取（导出选择器的「工作区分组 + 会话标题」数据源）。
 *
 * 为什么不去解压会话日志：`.jsonl.zstd` 是**多帧**容器，而 Node 的 zstd 解压器只解第一帧
 * （实测：598 KB 的文件只解出 294 字节的 header 行，流式也一样），要拿标题就得自己做帧边界
 * 解析并把整棵树（用户实测 379 MB）解一遍。DSH 自己已经把这些信息缓存在
 * `$DSH_HOME/storages/` 下，直接读缓存既快又不需要碰二进制：
 *
 *  - `storages/session_projcache.json` → `tables.sessions[<id>].rows.title.val`（界面上的会话标题）
 *    、`identity.cwd`、`rows.sessionListMetadata.val.lastPromptAt`；
 *  - `storages/workspace.json` → `tables.workspaces[<id>] = { path, title, sessionIds }`（工作区注册表）。
 *
 * 可靠性姿态（DSH 内部存储，格式可能变）：**只读、尽力而为、绝不抛错** —— 任何读取/解析失败
 * 都退化成空索引，导出与预览照常工作（选择器退回「显示目录名」的旧行为）。不认识的形状一律忽略。
 */
import type { ExportUnit, HostContext, SessionParentRelation } from './types.ts';
import { projectKeyOf } from './session-select.ts';
export { projectKeyOf };
/** 单个会话的可用元数据（全部可选：缓存里缺哪项就少哪项，绝不猜）。 */
export interface SessionMetaEntry {
    /** 界面上的会话标题（`rows.title.val`） */
    title?: string;
    /** 会话的工作目录（`identity.cwd`） */
    cwd?: string;
    /** 最后一条用户消息时间（毫秒）；用于「最近的在前面」排序 */
    lastActivityAt?: number;
    /** 空会话标记（`sessionListMetadata.blank`） */
    blank?: boolean;
}
/** 会话元数据索引（键 = 会话目录名，即 SessionId 去掉 `session-` 前缀）。 */
export interface SessionMetaIndex {
    bySessionId: Map<string, SessionMetaEntry>;
    /** 项目键 → 工作区标题 */
    workspaceTitleByProjectKey: Map<string, string>;
    /** 项目键 → 工作区绝对路径 */
    workspacePathByProjectKey: Map<string, string>;
}
/** 空索引（读不到任何缓存时的安全返回值）。 */
export declare function emptySessionMeta(): SessionMetaIndex;
/** 清空索引与逐会话投影缓存（测试用；宿主在收到「DSH 存储已重载」信号时也可调用）。 */
export declare function clearSessionMetaCache(): void;
/**
 * 读取会话标题与工作区注册表（带 mtime 失效的进程内缓存，见 `metaCache`）。
 *
 * 语义与无缓存版**逐字相同**：任何一步失败都只让对应部分退化，绝不抛错。
 * 返回的索引视为**只读**（调用方 `applySessionMeta*` 不改它）——缓存会把同一份 Map 再发出去。
 */
export declare function readSessionMeta(ctx: HostContext): Promise<SessionMetaIndex>;
/**
 * 会话单元 id（`sessions:<项目键>/<目录名>`）或裸目录名 → **归一化裸键**（`sessionIdKey`）。
 *
 * 为什么要有：调用方手上是单元 id / 计划项 id（末段才是目录名），而索引与投影文件都按**裸键**存。
 */
export declare function sessionBareKeyOf(ref: string): string;
/**
 * 「界面标题」的**全量**解析：聚合缓存优先，缺的按需读**逐会话投影文件**。
 *
 * 用户要求（2026-10-12）：「历史对话的文本**始终**用对话标题，而不是只取缓存里的标题」。
 * 只读聚合缓存（`session_projcache.json`）时，本机 1347 条会话里有 902 条拿不到标题 → 界面退化成
 * `session-<uuid>`，用户在同屏十几条里认不出哪条是自己的对话。
 *
 * 成本：只读「聚合缓存里没有标题」的那些（本机约 900 条小文件；实测全量顺序读 1349 份 = 361 ms），
 * 32 路并发 + mtime 缓存 —— 同一批会话重复查询（打开选择器 / 勾选 / 联动补跑）不再重复读盘。
 *
 * 语义：**只增不改** —— 已缓存的标题与 blank 一律保留；实在读不到的会话原样返回（界面回落目录名）。
 *
 * @param refs 会话单元 id（`sessions:<项目键>/<目录名>`）或裸目录名，混着传也行
 */
export declare function readSessionMetaWithTitles(ctx: HostContext, refs: readonly string[]): Promise<SessionMetaIndex>;
/**
 * 给 **导入计划项**（sessions 分区）补上「界面标题 + 工作区分组」。
 *
 * 与 `applySessionMeta` 的区别：导出侧富化 `ExportUnit`，导入侧富化 `PlanItem`；两者共用同一份
 * 索引与同一套 id 形状（`sessions:<项目键>/<会话目录名>`），所以标题口径完全一致（用户实测：
 * 导入页此前只显示会话**目录名**，因为计划项没有展示名可用）。
 *
 * 只写 `label`/`group`（纯展示字段），**不碰** id/kind/target —— 勾选与执行契约不受影响；
 * 缓存里没有标题的会话保持 `label` 缺省（UI 回退显示目录名，不编造）。
 */
export declare function applySessionMetaToPlanItems<T extends {
    id: string;
    unitId?: string;
    adapter: string;
    label?: string;
    group?: string;
}>(items: readonly T[], index: SessionMetaIndex, sectionId?: string): (T & {
    blank?: boolean;
})[];
/**
 * 「子代理会话 → 父对话」映射（**裸键**）：DSH 会话存储的父子关系 → `Map<子会话裸键, 父对话裸键>`。
 *
 * 只收 `subagent === true` 的会话 —— origin 非 subagent 的会话即使带 parentSession 也是**顶层行**
 * （DSH 工作区列表口径，与 `SessionsAdapter.coupleSessionParents` 完全一致）；非法形状一律忽略。
 */
export declare function subagentParentMap(relations: ReadonlyMap<string, SessionParentRelation> | undefined): Map<string, string>;
/**
 * 给 sessions 单元标出「父对话」（纯联动/展示字段，不动 id/kind/target）：只有子代理会话会有值。
 *
 * 用途：导出选择器的「父 ↔ 子会话」勾选联动（勾父自动勾上它的子代理会话、勾子自动带上父）。
 * 非 sessions 分区 / 形状不符 / 映射里查不到 → 原样返回（**不猜**：宁可不联动，也不凭 id 编关系）。
 */
export declare function applySessionParentLinks<T extends {
    id: string;
    parentSessionId?: string;
}>(units: readonly T[], parentOf: ReadonlyMap<string, string> | undefined, sectionId?: string): T[];
/**
 * 给**会话体检行**补上「界面标题」（行上的 `sessionId` = 会话目录名，索引键是裸键 → 查表前必须归一化）。
 *
 * 为什么需要：体检列表此前只显示目录名（`session-20d2722c-…`），用户在同一屏十几条里认不出哪条是自己的
 * 对话（2026-10-12 用户反馈截图实证）。标题的唯一可靠来源就是 DSH 自己的会话缓存
 * （`storages/session_projcache.json` 的 `rows.title.val`）—— 与导出选择器**同一份索引、同一套
 * `sessionIdKey` 归一化口径**，绝不另写一套查表规则。
 *
 * 只读、纯函数、**绝不编造**：索引里没有这条会话 / 没有标题 → 原样返回（界面回落显示目录名）。
 * 索引本身由 `readSessionMetaWithTitles()` 产出（聚合缓存 + **逐会话投影文件**兜底，见那里）。
 */
export declare function applySessionTitles<T extends {
    sessionId?: string | null;
}>(rows: readonly T[], index: SessionMetaIndex): (T & {
    title?: string;
    blank?: boolean;
})[];
/**
 * 给 sessions 分区的单元补上「界面标题 + 工作区分组」，并按「工作区 → 最近在前」排序。
 *
 * - `label`：会话标题（缓存里没有 → 退回会话目录名，绝不编造）；
 * - `detail`：工作区绝对路径（未知 → 不回填）；
 * - `group`：工作区标题（未知 → 用项目键兜底，保证每个会话都有归属，不出现「未归类」坟场）；
 * - 其它分区的单元原样返回（ids 不变 —— 勾选/导出契约只认 id）。
 *
 * @param activityAt 会话**裸键**（`sessionIdKey`）→ 最近活跃时间（毫秒），由宿主在预览期用会话日志
 *   文件 mtime 现算（`ConfigAdapter.unitActivityTimes`）。为什么必须有这条兜底：元数据缓存
 *   （`storages/session_projcache.json`）只覆盖**一部分**会话（真机实测：同一项目 731 个会话目录里
 *   347 个不在缓存内），只用缓存时间会让这些会话全部落到组尾、退化成按 uuid 字典序排 ——
 *   用户看到的就是「历史对话没有按最新到最旧排序」。缓存里有精确的 lastPromptAt 时仍以它为第一口径。
 */
export declare function applySessionMeta(units: readonly ExportUnit[], index: SessionMetaIndex, sectionId?: string, activityAt?: ReadonlyMap<string, number>): ExportUnit[];
