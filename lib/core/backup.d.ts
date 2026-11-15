import type { SectionId } from '../schema/types.ts';
import type { ConfigAdapter, FileSystemFacade, HostContext, ImportPlan, PlanItem, Snapshot, SnapshotPluginRemoval, SnapshotStatus, SnapshotStore } from './types.ts';
/**
 * 「会写目标」的**单点事实源**：该计划项是否会被引擎交给 `adapter.applyItem`
 * （即可能产生目标写入）。
 *
 * 为什么必须单点：硬不变量「导入前强制快照（可回滚）」只为会写目标的项登记原值
 * （本文件 collectTargets → createSnapshot），而执行分派在 analyzer.applyOne，
 * 历史上还有一条恢复回放侧（core/config-snapshot.ts，已随灾备快照线下线）。两处各写一份 kind
 * —— 实测漂移过一次，两个方向的错都在：
 *  - PathMapping 与 Conflict(resolution='useImported') 会写目标却不在快照范围
 *    （写了撤不掉，报告却声称「已快照、可回滚」）；
 *  - 回放侧把**未采纳**的 Conflict 当可执行（settings adapter 无条件 settings.replace
 *    → 静默覆盖目标机本地值），而导入路径对同一项是 skip。
 *
 * 语义（与 analyzer.applyOne 逐条对齐）：
 *  - Skip / Warning / MissingDependency：信息项，不调用 applyItem；
 *  - Error：硬失败项，执行侧如实记 failed，不调用 applyItem；
 *  - Conflict：只有显式采纳（resolution === 'useImported'）才写；keepCurrent / review /
 *    未决策一律不写（「冲突不默认覆盖」硬不变量）；
 *  - MissingSecret：无可用秘密值时执行侧会 skip（见 PlanItemExecContext）。
 */
export interface PlanItemExecContext {
    /**
     * MissingSecret：该 ref 当前是否已有可用秘密值。
     *  - 不传（快照范围 / journal 记账）：一律视为「会写」—— 快照是**保守超集**，
     *    宁可多留一个回滚点，也绝不允许「写了却撤不掉」；
     *  - 导入执行：按 secretInputs / decryptedCredentials 真实判定；
     *  - 快照回放：没有秘密输入来源 → 传 `() => false`（与导入侧「无值 → skip」同判）。
     */
    secretValueAvailable?: (ref: string) => boolean;
}
/** 见 PlanItemExecContext 与上方说明：会写目标的项 = 必须进快照范围的项。 */
export declare function planItemWritesTarget(item: PlanItem, exec?: PlanItemExecContext): boolean;
/**
 * plugins 分区中「profile 内文件」的 ref 前缀（issue #35）：`patchFile:<相对 profile 目录的路径>`。
 * 前缀的存在是为了与 patch **行** id（同样落在 plugins 分区的 ref 空间）区分开——
 * 行 id 是任意字符串，无法靠形状判断它是不是一个路径。
 */
export declare const PLUGIN_PATCH_REF_PREFIX = "patchFile:";
/**
 * plugins 分区中「profile 的 package.json」这一文件目标的 ref（issue #95）。
 *
 * 声明 host 自带的 bundle 层（`dsh.profile.bundles`）就是写这个文件，因此它必须与
 * `pnpm-workspace.yaml` 同级：进导入前快照 → 回滚能整文件还原，否则一次导入留下的声明
 * 撤不掉（照抄 \`patchFile:\` 的做法，用一个符号 ref 而不是真实文件名——ref 空间里还有
 * 任意 patch 行 id，靠形状判断会撞车）。
 */
export declare const PLUGIN_PROFILE_MANIFEST_REF = "profileManifest";
/**
 * 以**系统 home 为根**的文件类分区（ref 是系统 home 相对路径）。
 *
 * 为什么单独一组：`FileSystemFacade` 被限制在 $DSH_HOME 内，而第三方插件的数据常在 $DSH_HOME 之外
 * （`~/.dsh-wallpaper-engine/`、`~/.mnemon/` …）。这两个分区的路径解析与 I/O 门面都换根，
 * 其余分区一字不动 —— 单根不变量只在**这两个分区**上被显式放宽，且仍然只允许白名单区域。
 */
export declare const OS_HOME_FILE_SECTIONS: ReadonlySet<SectionId>;
/** 该分区文件目标的根（`dsh` = $DSH_HOME；`osHome` = 系统 home） */
export declare function sectionFileRoot(adapter: SectionId): 'dsh' | 'osHome';
/** 系统 home：宿主显式给就用它，否则进程 `homedir()`（`~` 的定义，不是猜） */
export declare function osHomeDirOf(ctx: HostContext): string;
/**
 * 该分区文件 I/O 应使用的门面。
 *
 * `osHome` 分区必须用 `homeFs`：缺了它**显式抛错**，绝不退回 `ctx.fs` —— 那会把
 * `~/.mnemon/x.db` 写成 `$DSH_HOME/.mnemon/x.db`（看起来成功、实际写错位置）。
 */
export declare function fsForSection(ctx: HostContext, adapter: SectionId): FileSystemFacade;
/** 解析文件类目标的绝对路径（引擎通用快照与回滚共用） */
export declare function resolveFileTarget(ctx: HostContext, adapter: SectionId, ref: string): string;
/**
 * 文件类目标的 home-relative 相对路径（P2-B，Phase 8）。
 * 供导入逐项指纹（analyzer 经 HostContext.fs.readFile(read rel) 读文件算 sha256）
 * 与 journal step.ref 的 posix 规范化。
 *
 * issue #35：`plugins` 分区的两个文件类 ref（`pnpm-workspace.yaml` 与
 * `patchFile:<profile 相对路径>`）不落在 FILE_BASES 的静态基准上，必须显式给 profile ——
 * 否则产出的是**不存在的** home 相对路径（如 `patchFile:patches/a.patch`），
 * 指纹恒为 null，crash 后 reconcile 无法证明该项是否已应用（保守但可避免的精度损失）。
 */
export declare function resolveFileTargetRel(adapter: SectionId, ref: string, profile?: string): string;
/**
 * 归一「快照来源 DSH 版本」（F-4）。
 *
 * 只接受**非空的真实版本串**：宿主 `resolveDshVersion` 在解析不到时返回 `'unknown'` 占位，
 * 把它写进快照会让恢复侧的「两侧都已知且不同」判定拿占位值当已知版本而误报。
 * 归一不到 → undefined（快照不写该字段，恢复时按「来源版本未知」处理，不告警）。
 */
export declare function normalizeDshVersion(value: unknown): string | undefined;
/**
 * 归一「快照来源档案」（originProfile）。
 *
 * 与 `normalizeDshVersion` 同一口径（非空、非 'unknown' 占位），但判据多一层：档案名要拿去和
 * 当前档案比对、要在界面上按档案分组，所以还得是**合法档案名形态**。形态判据与
 * `core/plugin-cli.ts` 的 `validateProfileName` 同源（拒绝路径分隔符与 '.'/'..'/'node_modules'），
 * 差别只在失败处理：那边是拼 `profiles/<name>` 路径，非法必须抛错；这里只是标注**只过滤不抛错** ——
 * 一个可疑档案名不该让快照落盘失败。
 * 归一不到 → undefined（快照不写该字段，界面按「未标注」处理，绝不写 'unknown' 占位）。
 */
export declare function normalizeOriginProfile(value: unknown): string | undefined;
export interface CreateSnapshotOptions {
    ctx: HostContext;
    plan: ImportPlan;
    sourceZip: string;
    store: SnapshotStore;
    adapters: ConfigAdapter[];
    /** Phase 4：operation-bound binding（journal.operationId / environmentFingerprint / ownerInstanceId / operationType） */
    operationId?: string;
    operationType?: string;
    environmentFingerprint?: string;
    ownerInstanceId?: string;
}
/**
 * 生成并落盘快照：只覆盖将被写入的目标。
 * 文件字节经 store.save / saveStreaming 落盘（SnapshotEntry 契约不含二进制）。
 */
export declare function createSnapshot(opts: CreateSnapshotOptions): Promise<Snapshot>;
/**
 * m-retention：保留策略的**结构形状**（故意在 core 内声明，而非 import sync/retention-policy.ts）。
 *
 * 为什么不用 sync 的类型：架构边界测试（tests/architecture-boundaries.test.ts）硬性禁止
 * `core/ → sync/` 反向依赖——core 是与 DSH 解耦的领域层，只允许 node 内置 / core 内部 /
 * schema / utils / security。sync 侧 `RetentionPolicy` 与本接口结构一致，可直接赋值（结构化类型）。
 * 分层选别算法本体在 `src/sync/retention-policy.ts`（selectPruneCandidatesByPolicy），
 * 由宿主（入口层）经 `FileSnapshotStoreOptions.pruneSelector` 注入——core 只定义契约，不反向依赖。
 */
export interface RetentionPolicyLike {
    /** 最近保留份数 */
    keepLast: number;
    /** 每月保留份数（0 = 关闭） */
    keepMonthly: number;
    /** 每年保留份数（0 = 关闭） */
    keepYearly: number;
}
/** core 侧缺省保留策略：与既有 `SNAPSHOT_RETENTION_LIMIT`（最近 10 个）逐字等价。 */
export declare function defaultRetentionPolicyLike(): RetentionPolicyLike;
/** 快照保留上限：save 落盘后超过该数量则删除最旧快照目录 */
export declare const SNAPSHOT_RETENTION_LIMIT = 10;
/** 纯函数：返回应清理的最旧快照 id（按 createdAt 升序取超限部分；恰好 limit 个 → 空数组）。
 * 参数用最小结构类型，避免引入 restore.ts 的 SnapshotMeta 造成循环 import。 */
export declare function selectPruneCandidates(metas: ReadonlyArray<{
    id: string;
    createdAt: string;
}>, limit?: number): string[];
/**
 * 分层保留选择器契约（core 侧签名；实现由宿主注入，见 sync/retention-policy.ts）。
 * 入参 metas 已剔除 pinned / recovery 引用等豁免项（由 store.prune 完成）。
 */
export type PruneSelector = (metas: ReadonlyArray<{
    id: string;
    createdAt: string;
}>, policy: RetentionPolicyLike) => string[];
/**
 * core 内置的**兜底**选择器：只按 keepLast 取最旧超限部分（= 既有 FIFO 行为）。
 * 分层（keepMonthly/keepYearly）语义需宿主注入真正的 GFS 实现；未注入时分层字段被忽略，
 * 行为等价于改造前（安全侧：宁可少删，绝不因缺实现而多删）。
 */
export declare const fallbackPruneSelector: PruneSelector;
export declare const PRE_RESTORE_KEEP_ATTEMPTS = 5;
export declare const PRE_RESTORE_KEEP_DAYS = 30;
/** 一条反悔副本 attempt 的淘汰计划（删除**前**就进 PrunePlan，供审计与界面展示）。 */
export interface PrunePreRestoreDrop {
    snapshotId: string;
    attempt: string;
    /** count = 超出份数上限；over-age = 超过保留天数 */
    reason: 'count' | 'over-age';
    /** 该 attempt 目录里的文件数（用户能看出「删了多少份原文」） */
    files: number;
}
/** 一轮保留清理的**计划**（在真正 rm 之前回调出去；也是 pruneNow 的返回值）。 */
export interface PrunePlan {
    /** 将回收的快照 id（目录内的快照本体，不含 pre-restore 子树） */
    removeSnapshots: string[];
    /** 因存在反悔副本而**不**整目录删的快照 id（只删本体内容、留下 pre-restore/） */
    keepPreRestoreFor: string[];
    /** 反悔副本 attempt 级淘汰计划 */
    dropPreRestore: PrunePreRestoreDrop[];
    /** 计划删除的具体路径（相对快照根、'/' 分隔；审计「到底删了什么」） */
    paths: string[];
}
export interface FileSnapshotStoreOptions {
    /** 快照根目录（宿主决定，如 ~/.dsh/dsh-config-manager/snapshots） */
    dir: string;
    /**
     * Phase 4 F3：可恢复 / 未收敛 journal 引用的 snapshotId 集合提供者。
     * prune 必须豁免这些 snapshot（绝不可删被 recovery 引用的回滚点）。
     * 缺省 = 空集合（不豁免）。宿主注入 JournalStore.listReferencedSnapshotIds。
     */
    referencedSnapshotIds?: () => Promise<Set<string>>;
    /**
     * Phase 6：自动保留清理的迁移历史回调（best-effort）。
     * prune 删除后回调被清 snapshotId 列表；宿主据其写统一审计史（snapshot-prune kind）。
     * 缺省 = 不记录（不改变 prune 行为、不污染核心引擎）。
     */
    onPrune?: (removedIds: string[]) => void;
    /** BK-05：保留清理的**计划**回调（在真正删除之前，best-effort；抛错不影响清理） */
    onPrunePlan?: (plan: PrunePlan) => void;
    /**
     * m-retention：快照保留策略提供者（GFS 分层；可配置）。
     * 缺省 = `SNAPSHOT_RETENTION_LIMIT`（= 既有的「保留最近 10 个」，行为不变）。
     * 每次 prune 时调用（宿主可从 backup-schedule.json 读取最新策略，用户改完即时生效）；
     * 抛错/返回非法值 → 回退缺省策略（绝不因策略读取失败而误删或崩溃）。
     */
    retentionPolicy?: () => RetentionPolicyLike | Promise<RetentionPolicyLike>;
    /**
     * m-retention：分层保留选择器（由宿主注入 sync/retention-policy.ts 的 GFS 实现）。
     * 未注入 → `fallbackPruneSelector`（只按 keepLast，等价既有 FIFO；分层字段被忽略 = 保守少删）。
     */
    pruneSelector?: PruneSelector;
    /**
     * 诊断回调（可选）：保留清理**被放弃**或失败时的可见线索。
     * 缺省 = 不记录（不改变行为）；宿主接 `host.log.warn` —— 「这轮为什么没清理」必须能查。
     */
    onWarn?: (message: string) => void;
}
/** 文件快照存储：<dir>/<id>/snapshot.json + <dir>/<id>/blobs/* */
export declare class FileSnapshotStore implements SnapshotStore {
    private readonly options;
    constructor(options: FileSnapshotStoreOptions);
    private snapshotDir;
    /**
     * 落盘单个 blob：写盘与**计算 hash 同遍完成**（t51）。
     * 改动前 save() 先遍历一遍写盘、再遍历一遍算 hash —— 两遍都要求整个 blobs 集合驻留。
     */
    private writeBlob;
    /** 尾段（save 与 saveStreaming 共用）：snapshot.json / manifest / 磁盘校验 / READY 发布 / prune。
     *  **不动 durable+verified 不变量**：第 4 步仍从磁盘独立重读校验（不信任内存对象）。 */
    private finalizeSnapshot;
    save(snapshot: Snapshot, blobs?: Map<string, Uint8Array>): Promise<string>;
    /**
     * 流式落盘（t51）：blobs 由**异步可迭代源**提供，逐条取值 → 写盘 + 算 hash（同遍）。
     *
     * 这是 SnapshotStore **接口之外**的可选能力（接口一字未改，见 src/core/types.ts:617）：
     * 调用方可以传一个**异步生成器**按需读盘，于是任一时刻只驻留一条 blob，而不必先把整个
     * 分区载荷读进内存 Map。为什么不做成「惰性 Map」：Map 的迭代协议与 get 都是**同步**的
     * （for...of 的 next() 必须同步返回 Uint8Array；get 返回 Uint8Array 而非 Promise），
     * 惰性读盘只能靠 readFileSync —— 那会把 t46 刚从压缩路径消除的同步 I/O 引回快照路径。
     * 不支持本方法的 store 由调用方经能力探测回退到 save(snapshot, eagerMap)。
     */
    saveStreaming(snapshot: Snapshot, blobs: AsyncIterable<readonly [string, Uint8Array]>): Promise<string>;
    /** 保留清理：扫描快照根目录，超限时删除最旧快照目录（损坏/非快照目录跳过；目录缺失容错）。
   *  P1-⑧：置顶（pinned=true）的快照豁免自动清理——用户显式保留的导入前回滚点不得被
   *  自动淘汰，只能手动删除（deleteSnapshot）。
   *  Phase 4 F3：被 active/quarantine 未收敛 journal 引用的 snapshot（recovery 回滚点）
   *  必须豁免——引用提供者（referencedSnapshotIds）返回的 id 绝不自动清理。 */
    private prune;
    /**
     * BK-05：反悔副本（pre-restore）淘汰计划 —— 只看**份数与天数**，与快照本体的保留策略无关。
     *
     * 为什么单独一套：快照本体是「历史回滚点」，可被 GFS 策略批量回收；反悔副本是用户把
     * 刚才那次恢复撤回去的**唯一**原文（不在 blobs、不进同步、不进导出），它只需要「别无限长」，
     * 不需要也不该受 keepLast/keepMonthly 影响 —— 否则一次批量淘汰会把最近几次恢复的反悔点一起抹掉。
     * attempt 名即恢复时间戳（restore.ts 的 preRestoreStamp，本地时间 yyyyMMdd-HHmmss-SSS[-序号]）；
     * 解析不出来回落目录 mtime（手工改名的残留也能被淘汰，不会永久占位）。
     */
    private collectPreRestorePlan;
    /** BK-05：手动触发一轮保留清理（与 save 后的自动清理同一实现）。 */
    pruneNow(): Promise<PrunePlan>;
    load(id: string): Promise<Snapshot>;
    readBlob(id: string, blobPath: string): Promise<Uint8Array>;
    /** 标记快照生命周期状态：重写 <dir>/<id>/snapshot.json（保留其余字段）。 */
    updateStatus(id: string, status: SnapshotStatus): Promise<void>;
    /**
     * 记录本轮跟删的插件（issue #132 undo 线索）：只重写 snapshot.json 的 pluginRemovals 字段。
     *
     * 为什么不像 save() 那样走 finalizeSnapshot：那条路会重算 manifest.blobHashes（本次没有 blob
     * 可写 → 空 map → 磁盘校验直接判失败）并重跑 verify。这里只补一个**不在 metadataHash 覆盖面内**
     * 的字段，manifest 与 blob 一字不动，快照的 READY/完整性语义不受影响。
     */
    recordPluginRemovals(id: string, removals: SnapshotPluginRemoval[]): Promise<void>;
}
/**
 * 破坏性内容 hash（稳定，不含 readiness/status）：entries + hostFileBackups + beforePlugins。
 * READY 发布与 status 更新不改变此 hash（B-P1-1 修复）。
 */
export declare function computeMetadataHash(snapshot: Snapshot): string;
export interface SnapshotVerifyResult {
    ok: boolean;
    reason?: string;
}
export declare function verifySnapshot(snapshotsDir: string, id: string): Promise<SnapshotVerifyResult>;
