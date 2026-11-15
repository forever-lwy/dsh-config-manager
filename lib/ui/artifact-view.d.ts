import type { UiT, UiTextKey } from './i18n.ts';
/** 本机快照（`core/restore.ts` 的 SnapshotMeta 子集） */
export interface SnapshotInput {
    id: string;
    createdAt: string;
    entryCount: number;
    /** 快照**之前**已装的插件数 */
    beforePluginCount: number;
    pinned?: boolean;
}
/** 备份文件（`sync/backup-files.ts` 的 BackupFileMeta 子集） */
export interface BackupFileInput {
    path: string;
    name: string;
    sizeBytes: number;
    /** 修改时间（ms 时间戳） */
    mtimeMs: number;
    source: 'auto' | 'manual';
    note?: string | null;
    /** 容器形态探测结果；`'encrypted'` = 需先解锁（issue #55 的界面侧根因：不探测会让用户以为备份坏了） */
    containerType?: 'zip' | 'encrypted';
}
/** 远端快照（`client/sync/sync-api.ts` 的 SyncSnapshotLite 子集） */
export interface RemoteSnapshotInput {
    id: string;
    createdAt: string;
    sectionCount: number;
    platform: string;
    dshVersion: string;
}
/** 市场条目（`market/types.ts` 的 MarketListItem 子集） */
export interface MarketItemInput {
    id: string;
    name: string;
    author?: string;
    version?: string;
    updatedAt?: string;
}
export interface ArtifactInput {
    snapshots?: readonly SnapshotInput[];
    backupFiles?: readonly BackupFileInput[];
    remoteSnapshots?: readonly RemoteSnapshotInput[];
    /** 远端当前基线（sync-state.lastSnapshotId）；命中即标「当前基线」。未知/缺省 = 不标 */
    remoteCurrentId?: string | null;
    /** 远端通道类型（元数据行第 1 段）。未知 = 该段不渲染（不猜成 Git） */
    remoteChannel?: 'git' | 'webdav' | null;
    marketItems?: readonly MarketItemInput[];
}
export type ArtifactKind = 'snapshot' | 'backup-file' | 'remote-snapshot' | 'market';
/**
 * 行内可用动作。**这就是动作矩阵本身**（§6.4），没有第二份 kind → 动作的映射表。
 *
 * 与 §6.3 草案的两处收敛（实际落地时证明草案多余）：
 *  - 去掉 `'unlock'`：解锁不是独立行内动作，它是**导入流程的第一个阶段**，
 *    所以行内主操作的**文案**随 `encrypted` 徽章切换（`library.cap.unlockImport`），动作仍是 `import`；
 *  - 去掉 `'diff'`：本机快照的「查看差异」**就是**恢复的 dry-run 计划预览，
 *    与主操作同入口（§6.8 ②），单列只会让同一次调用有两个按钮。
 */
export type ArtifactCapability = 'restore' | 'import' | 'pull' | 'install' | 'inspect' | 'download' | 'consult' | 'pin' | 'unpin' | 'delete';
/** 徽章（`Badge` 四态的语义入口；颜色由渲染层按 §6.2 映射） */
export type ArtifactBadge = 'pinned' | 'current' | 'encrypted' | 'unreadable';
/**
 * 主标识。`time` 是**标签**而不是格式化好的字符串：快照/远端快照的主标识就是时间，
 * 而本地化在 React 层做（本模块不掺 locale）。
 */
export type ArtifactTitle = {
    kind: 'text';
    value: string;
} | {
    kind: 'time';
    iso: string;
};
/** 展开态的一行完整元数据。
 *  `iso` 非空 = 这一行是时间：模型只给 ISO，**格式化留给渲染层**（本模块不掺 locale）。 */
export interface ArtifactDetailPair {
    label: string;
    value: string;
    iso?: string;
}
/** 定位到具体动作的载荷（渲染层按 kind 取对应字段） */
export interface ArtifactRef {
    snapshotId?: string;
    path?: string;
    remoteId?: string;
    marketId?: string;
}
export interface ArtifactRow {
    /** 全局唯一（React key + 展开态持久化）：`<kind>:<id>` */
    key: string;
    kind: ArtifactKind;
    title: ArtifactTitle;
    /** 元数据行的各段（**已本地化**，不含分隔符；「·」由渲染层插） */
    meta: string[];
    /** 排序时间（ISO）；未知 = null（时间排序时排最后，名称排序时退化为空串） */
    at: string | null;
    /** 只有备份文件带体积（§6.8 ①）；`undefined` → 渲染「—」，绝不显示 0 */
    sizeBytes?: number;
    badges: ArtifactBadge[];
    /** **展示顺序**：第 0 项 = 行内主操作，其余进 ⋯ 菜单（§6.4） */
    capabilities: ArtifactCapability[];
    ref: ArtifactRef;
    /** 展开态的完整元数据（已本地化；**不含变更摘要** —— 那要跑一次 dry-run，§6.8 ③） */
    detail: ArtifactDetailPair[];
    /** 搜索用的小写 haystack（构造期算一次；含文件名/备注/快照 id/条目名/作者） */
    searchText: string;
}
export interface ArtifactQuery {
    /** 来源筛选；`null`/`undefined` = 全部 */
    kind?: ArtifactKind | null;
    /** 搜索词：按空白切词，**全部命中**才算匹配（AND，比整串子串更好用） */
    text?: string;
    /** 排序：时间倒序（缺省）/ 名称 */
    sort?: 'time' | 'name';
}
export interface LibrarySummary {
    count: number;
    /** 各来源条数（筛选条上的计数）。**只在「全部」视图可信** —— 单来源视图下它是该来源的已加载条数 */
    counts: Record<ArtifactKind, number>;
    encrypted: number;
    /** 没有体积的条数（三种来源都没有体积，所以这个数通常很大） */
    unknownSize: number;
    /** 已知体积之和；**只要有一条没有体积就是 `null`**（不把「未知」混进「合计」，§6.8 ①） */
    bytes: number | null;
}
export declare const ARTIFACT_KIND_LABEL_KEY: Record<ArtifactKind, UiTextKey>;
export declare const ARTIFACT_BADGE_LABEL_KEY: Record<ArtifactBadge, UiTextKey>;
export declare const ARTIFACT_CAPABILITY_LABEL_KEY: Record<ArtifactCapability, UiTextKey>;
/**
 * 四源 → 行。返回**已按时间倒序**（缺时间的排最后）——
 * 面板不必再造一遍序，筛选/排序只覆盖用户的显式选择。
 */
export declare function toArtifactRows(input: ArtifactInput, t: UiT): ArtifactRow[];
/**
 * 远端快照的**落地文件名**（「下载」与「拉取即导入」共用）。
 *
 * 为什么需要它：宿主把远端快照落地成 ZIP 时用的是 `snapshotToZip` 的临时名 `snapshot.zip`，
 * 直接落进浏览器「下载」目录会得到一堆同名文件（第二份就变成 `snapshot (1).zip`），
 * 事后也认不出是哪一份快照。这里按创建时间生成 `dsh-config-remote-<YYYYMMDD-HHmmss>.zip`。
 *
 * 两条边界：时间不是 ISO 形态 → 回退到**清洗后的**快照 id；两者都拿不到才用 `snapshot`。
 * 清洗只留 `[A-Za-z0-9._-]` —— 这个名字会进宿主 `path.join(dir, name)`，绝不能带路径分隔符。
 */
export declare function remoteSnapshotFileName(createdAt: string, id: string): string;
/** 名称排序键：文本标识直接用；时间标识退化成 ISO（快照/远端快照的「名字」本就是时间） */
export declare function artifactSortKey(row: ArtifactRow): string;
/** 来源 + 搜索词 + 排序。空查询 = 原序（恒为时间倒序，或用户选的名称序）。 */
export declare function filterArtifacts(rows: readonly ArtifactRow[], q: ArtifactQuery): ArtifactRow[];
/** 各来源条数（筛选条上的计数；**用未筛选的行**算，否则选中一个来源后其余计数会变 0） */
export declare function countByKind(rows: readonly ArtifactRow[]): Record<ArtifactKind, number>;
export declare function librarySummary(rows: readonly ArtifactRow[]): LibrarySummary;
