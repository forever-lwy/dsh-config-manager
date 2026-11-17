import { Importer } from '../core/importer.ts';
import type { ConfigAdapter, GlobalConflictStrategy, HostContext, ImportAnalysis, ImportPlan, ImportResult, PathMapping, PlanItem, PlanItemKind, SecretScanner } from '../core/types.ts';
import type { SectionData, SectionId } from '../schema/types.ts';
import type { SnapshotFs } from './fs.ts';
import type { PluginRemovalReportItem } from './plugin-removal-apply.ts';
import type { RetentionPolicy } from './retention-policy.ts';
import type { PendingMerge } from './sync-state.ts';
import type { RecordBaselineOptions } from './baseline-record.ts';
import type { SyncProbeResult, SyncSnapshotMeta, SyncTransport } from './transport.ts';
import type { MsgFunc } from '../core/messages.ts';
import type { MergePlan } from './merge.ts';
import type { MergePreview } from './merge-preview-view.ts';
export type { MergePreview, MergePreviewConflictView, MergePreviewSectionView } from './merge-preview-view.ts';
import type { SyncApplyPlan } from './risk.ts';
import './sync-engine-messages.ts';
import type { TransactionSnapshotContext } from '../core/types.ts';
import type { PlanItemProgress } from '../core/analyzer.ts';
export interface SyncEngineOptions {
    ctx: HostContext;
    transport: SyncTransport;
    /** sync-state.json 所在目录 */
    stateDir: string;
    /** 分区 adapter 列表（缺省 createAdapters()；宿主应注入 namespaces 等） */
    adapters?: ConfigAdapter[];
    /** 秘密扫描器（缺省 defaultSecretScanner：敏感字段名剥离） */
    scanner?: SecretScanner;
    /** pull 需要；不注入则 pull 抛错（push 不受影响） */
    importer?: Importer;
    now?: () => Date;
    /** 快照 id 生成器（缺省 sync-<uuid>；须符合通道安全字符集） */
    snapshotId?: () => string;
    /** 记录到 sync-state.transport.ref（如 git 分支名） */
    transportRef?: string;
    /** 本地散文件快照副本目录（push 落盘审计副本；不传则跳过本地落盘） */
    localSnapshotsDir?: string;
    /** 一键回滚兜底快照目录（apply-items / apply-merge-plan 落盘；缺省 <stateDir>/snapshots，
     *  与 Host /sync/rollback 路由读取的目录保持一致，否则回滚找不到 snapshot.json） */
    rollbackSnapshotsDir?: string;
    /** pull 临时 ZIP 目录（缺省 os.tmpdir()） */
    zipDir?: string;
    exporterVersion?: string;
    fsx?: SnapshotFs;
    /** 消息翻译器（缺省 ctx.msg ?? zh） */
    msg?: MsgFunc;
    /**
     * 本次运行**显式放行的「可选分区」集合**（拉取/合并/应用 + 推送两侧共用）。
     *
     * 缺省空集 —— 可选分区默认永不参与同步。宿主按「该分区允许哪种驱动」决定传什么：
     *  - 手动 push/pull / 一键同步 → 持久化选择里的全部可选分区（OPT_IN_SYNC_SECTIONS ∩ 勾选）；
     *  - 自动同步 / model-tools → 只传 'auto' 档（AUTO_SYNC_OPT_IN_SECTION_IDS ∩ 勾选），
     *    sessions（'manual'）因此**绝不悄悄下行/上行**。
     *
     * 为什么是集合而不是布尔：布尔只能表达「全放行 / 全不放行」，勾了 mcp 会连带放行
     * sessions（issue #78 的回归点）。集合化后每个分区独立放行。
     */
    optInSections?: readonly SectionId[];
    /**
     * 同步范围（高级/自定义导出模式持久化配置）：只处理这些 portable 分区。
     * 缺省 = 全部 portable 推荐分区。应用于 push / merge / applyMergePlan / applyItems
     * 等全部链路（portableAdapters 层过滤），供自动同步等后台流程复用用户选择；
     * 手动请求仍可用 push(opts.sections) 覆盖。
     */
    sections?: SectionId[];
    /**
     * 跟随远端删除插件（issue #132）：祖先快照里有、远端快照里没有、本机未改过的插件 →
     * 在本轮应用成功后执行 `dsh plugin remove`。
     *
     * 缺省 **false**（既有行为逐字不变）。只由宿主的持久化选择注入 —— 用户勾开关即授权，
     * 手动合并与自动同步因此共享同一个判据（不再由调用点各自决定）。
     */
    deletePlugins?: boolean;
    /**
     * 本插件自己的包名（跟随删除时**永不**碰它；'' = 不设防，只用于不关心自身的测试）。
     * 宿主注入 `PLUGIN_NAME`：删掉正在运行的宿主插件会让下一次启动直接缺功能。
     */
    selfPluginName?: string;
    /**
     * 远端快照保留策略提供者（m-retention 接线）：缺省 = DEFAULT_RETENTION_POLICY
     * （keepLast=10，与改造前的硬编码 FIFO 逐字等价）。
     *
     * 注入后远端 prune 走 GFS 分层（最近 N / 每月一份 / 每年一份），与本地备份产物、
     * 本地快照共用同一份 RetentionPolicy——「对话寿命 = 推了几次配置」这个反直觉行为
     * 由此消除：策略按月/年分层时，早先同步到远端的会话不再被后续 push 冲掉。
     * 提供者抛错 → 回退缺省策略（保守多留，绝不因读取失败而误删远端快照）。
     */
    retentionPolicy?: () => RetentionPolicy | Promise<RetentionPolicy>;
}
export interface SyncPushOptions {
    /** 覆盖自动生成的快照 id */
    snapshotId?: string;
    /** 仅同步指定分区（缺省 = 全部 portable 推荐分区，即「默认/快速导出」模式）。
     *  传入非 portable 或未知分区 → 忽略并告警（同步通道安全约束：
     *  deviceSpecific/platformSpecific 默认永不进入同步通道；未知 id 不静默吞掉）。
     *  例外：构造期显式放行的可选分区（SyncEngineOptions.optInSections）才纳入 ——
     *  未被放行的一律按非 portable 跳过并告警（不静默）。 */
    sections?: SectionId[];
    /**
     * sessions（历史会话）分区的**导出参数**（「最新 N 个会话」上限 / 逐会话点名）。
     *
     * 注意：它**不再兼任放行开关** —— 是否允许 sessions 进通道只由构造期
     * SyncEngineOptions.optInSections 决定（issue #78 把「放行」与「参数」拆开，
     * 否则勾了 mcp 会顺带解锁 sessions）。这里只决定「带哪几个会话」。
     *
     * include（显式勾选的会话单元 id，形如 sessions:<projectKey>/<sessionId>）非空时
     * **优先于 limit**：用户点名的对话必须赢；此时不施加「最新 N 个」数量筛选，否则会退化成
     * 「最新 N 个里被我勾中的那几个」。宿主侧由 sync-selection.json 的 sessionsInclude 持久化。
     */
    sessions?: {
        limit?: number;
        include?: string[];
    };
    /**
     * 本轮**必须扣下**的分区（issue #146）：未裁决冲突的分区绝不上行。语义看「传没传」，不是「空不空」：
     * - 不传（`undefined`）= 手动推送：只按本参数扣，**不读磁盘**上的历史待裁决；
     * - 传了（含空数组）= 本参数 ∥ 磁盘 pendingMerge 一起扣（自动同步必须传，否则上一轮留下的待裁决
     *   会被任何一轮别的分区的改动顺手推上去 —— #146 的复发路径）；
     * - `force: true` 时整个扣下语义不生效（强推 = 明确要用本机覆盖远端）。实现见 `push-skip.ts`。
     */
    skipSections?: SectionId[];
    /** 加密快照：sections 载荷整体加密（AES-256-GCM），manifest.encrypted=true。
     *  开启时必须提供 password（仅本次调用内存使用，绝不落盘/落日志）。 */
    encrypt?: boolean;
    /** 加密密码（仅内存；encrypt=true 时必填）。 */
    password?: string;
    /** 导出真实凭据值：读取 `$DSH_HOME/.credentials.yaml` 原文，加密后作为快照的独立
     *  凭据载荷（`snapshot.credentials`）随快照上行（issue #38）。安全不变量：
     *  includeSecrets=true 必须同时 encrypt=true，否则拒绝（密钥绝不明文进入同步通道）；
     *  自动同步恒 includeSecrets=false（推普通快照）。 */
    includeSecrets?: boolean;
    /**
     * 强制推送（缺省 false）：跳过「远端已被其它设备推进」的前置检测。
     *
     * 为什么默认要拦：本机基线 X、别的设备推了 Y、本机再推 Z（不含 Y 的改动）时，
     * 远端保留策略随后会淘汰 Y ⇒ **Y 的改动在远端与本机都消失**（静默丢数据）。
     * 只有用户明确知道「要用本机覆盖远端」时才传 true。
     */
    force?: boolean;
}
export interface SyncPullOptions {
    /** 指定远端快照 id（缺省 = 最新） */
    snapshotId?: string;
    /** 冲突全局策略（缺省 merge：冲突保留待决策） */
    strategy?: GlobalConflictStrategy;
    /** 解密密码（加密快照需要；仅内存，绝不落盘/落日志） */
    password?: string;
    /**
     * 用户路径映射（issue #45）：与导入向导同一套 PathMapping，排在**自动重定基之后**生效。
     * 缺省 [] = 只用自动重定基（导出机 home ≠ 本机时由 analyzer.rebaseMapping 生成）。
     * 只作用于结构化分区的路径叶值 + 会话首帧 cwd，永不改写文件集合分区的 relativePath。
     */
    pathMappings?: PathMapping[];
}
export interface SyncPushReport {
    ok: boolean;
    snapshotId: string;
    /** 实际进入同步的 portable 分区 */
    sections: SectionId[];
    /** 分区级告警（单项失败不拖垮整体，§34.17 语义） */
    warnings: string[];
    message?: string;
    /**
     * 本次推送**被前置检测拒绝**（远端已被其它设备推进）：未写远端、未记基线、未改 sync-state。
     * 这是「需要先合并远端」的冲突态，不是通道/凭据故障 —— 调用方（自动同步 / 路由）应按冲突处理，
     * 而不是记成「同步失败」。
     */
    conflict?: boolean;
    /**
     * 本次推送前**收养了本机自己推上去的远端最新快照**（0.4.1 自愈）：该值 = 被收养的快照 id。
     *
     * 触发场景：上次推送在上传成功、写基线之前被打断（进程退出/崩溃/断电），远端已前进而本机
     * `lastSnapshotId` 仍是上一版 → 前置检测会永久拒绝推送（每次都说「远端被别人推进了」），
     * 单设备用户因此被自己的快照锁死。判据只看「远端最新快照的 manifest.deviceId == 本机
     * deviceId」，别的设备推进过就仍然按冲突返回，绝不越过。
     */
    adoptedBase?: string;
    /**
     * issue #140：本次推送**没有产生新快照**（远端最新快照的分区内容与本次导出逐字相同）。
     *
     * 语义：`ok:true` + 本字段 = 「什么都没做，也不算失败」——未 upload、未建目录、未裁剪；
     * 只是把基线指针**收养**到远端最新快照（`adoptedSnapshotId`），让下一轮判定有正确起点。
     * GUI / 报告必须显式区分它（「内容未变化，已跳过」），不能显示成「已推送 xx」。
     * issue #146：`all-conflicted` = 一个分区都没推（`ok:true` + `snapshotId:''`，远端与基线都没动），不是失败，但绝不能显示成「已推送」。
     */
    skipped?: 'unchanged' | 'all-conflicted';
    /** issue #140：`skipped='unchanged'` 时被收养的远端快照 id（= 本次报告里的 snapshotId） */
    adoptedSnapshotId?: string;
}
/** 差异报告中的单个变更项（PlanItem 摘要，不含敏感细节） */
export interface PullChange {
    id: string;
    adapter: SectionId;
    kind: PlanItemKind;
    description: string;
    severity: PlanItem['severity'];
}
export interface SyncPullReport {
    ok: boolean;
    snapshotId: string;
    changes: PullChange[];
    /** 是否存在需要人工决策的项（Conflict / MissingSecret / MissingDependency / 路径问题）。
     * 插件 Install 不算 —— 插件安装随同步自动采用（product requirement）。 */
    needsReview: boolean;
    message?: string;
}
/** P0-②：push 前只读预览 ——「将推送什么」的单分区摘要（不写远端、不落盘）。 */
export interface SyncPushPreviewSection {
    /** 分区 id（将进入快照的 portable 分区） */
    section: SectionId;
    /** 分区内条目计数（adapter.export 的 counts 聚合；无计数时为 0） */
    count: number;
    /** 相对上次基线（sync-state）是否变化：true = 本次会更新该分区；false = 与基线一致 */
    changed: boolean;
}
/** P0-②：push 前预览结果（零写入）。 */
export interface SyncPushPreview {
    ok: boolean;
    /** 将推送的分区清单（含计数与变化标记） */
    sections: SyncPushPreviewSection[];
    /** 远端现有快照数（0 = 首次推送将创建首个基线） */
    remoteSnapshotCount: number;
    /** 加密快照：载荷将整体加密（分区计数与基线比较不可得） */
    encrypted: boolean;
    /** 本次推送是否真的会带上凭据载荷（.credentials.yaml 可读且非空；issue #38） */
    credentialsIncluded: boolean;
    /** issue #146：与 push 同口径的终态（全被冲突扣下 ⇒ 预览也是「什么都没得推」，不是错误） */
    skipped?: 'all-conflicted';
    message?: string;
}
/** 一键 sync 预览结果（preview() 返回；临时 ZIP 由调用方持有并负责清理）。 */
export interface SyncPreviewResult {
    ok: boolean;
    /** 临时标准 ZIP 路径（apply-items 复用 executeImportPlan 需要；调用方清理） */
    zipPath: string;
    plan: ImportPlan | null;
    analysis: ImportAnalysis | null;
    snapshotId: string;
    /**
     * 被拉取的远端快照本身是否加密（issue #107 补漏）：apply-items 路径据此决定
     * 祖先副本落密文（有密码）还是干脆不落（没有密码）—— 绝不落明文。
     */
    encrypted?: boolean;
    /**
     * 从快照凭据载荷解密出的 `Map<ref, value>`（issue #38；无凭据载荷 → undefined）。
     * **仅内存**：绝不落盘、绝不进响应体/日志/报告；apply-items 时作为
     * executeImportPlan 的 decryptedCredentials 交给 credentials adapter 写回本机。
     */
    credentials?: Map<string, string>;
    message?: string;
    reason?: 'remote-empty';
}
/** 自动应用执行器（P2b）报告 */
export interface ApplyReport {
    ok: boolean;
    /** Nonfatal import failures: durable applied changes are kept, but the baseline is not advanced. */
    ineffective?: ImportResult['ineffective'];
    /** 实际写入本地的分区 id 列表 */
    applied: string[];
    /** 应用前快照 id（UI 可借此一键回滚）；失败时仍透传以便排查 */
    restoreId: string;
    /** 是否触发了整体回滚 */
    rolledBack: boolean;
    /**
     * 整体回滚是否**完整**（诚实性，2026-10）。rolledBack=true 只说明触发了回滚，
     * 不代表每一项都补偿成功（典型：原本已存在的凭据值 DSH 不可回读、无法自动恢复）。
     * false 时失败项已并入 warnings，界面不得渲染成「整体成功回滚」。
     * 缺省 undefined = 没触发回滚（既有布尔字段语义不变）。
     */
    rollbackFull?: boolean;
    /** 失败时移到 review 队列的项（ReviewQueueItem 形态供 UI 直接渲染） */
    review: import('./review-queue.ts').ReviewQueueItem[];
    /** 来自 Importer.ImportResult 的 warnings；UI 可用于红条提示（含回滚未完成项） */
    warnings: string[];
    /**
     * 跟随远端删除插件的逐项结果（issue #132；缺省不出现 = 本轮没有该步骤）。
     *
     * 之所以逐项回传而不是只回一条汇总：卸载是**不可回滚**的外部进程动作（plugins 分区没有
     * snapshot/rollback 钩子），界面与报告必须能逐条说清「删了哪个版本、哪个没删成、为什么」。
     */
    pluginRemovals?: PluginRemovalReportItem[];
    /** 删过插件 → 必须重启（与安装同语义；导入结果说不用也不能吞） */
    needsRestart?: boolean;
}
/** 一条插件卸载结果（实现与 undo 编排见 ./plugin-removal-apply.ts；此处再导出保持既有导入面）。 */
export type { PluginRemovalReportItem } from './plugin-removal-apply.ts';
/** applyItems 报告（§3.4 ApplyItemsResponse 的服务端形态） */
export interface ApplyItemsReport {
    ok: boolean;
    /** 实际写入的分区 id 列表（去重） */
    applied: string[];
    /** 未采纳的 itemId 列表 */
    skipped?: string[];
    /** 应用前快照 id（UI 一键回滚用；失败时仍透传以便排查） */
    restoreId: string;
    /** 任一失败是否整体回滚 */
    rolledBack: boolean;
    /**
     * 整体回滚是否**完整**（诚实性，2026-10；与 ApplyReport.rollbackFull 同一语义）：
     * rolledBack=true 只说明触发了整体回滚。false = 有改动没能恢复，失败项已并入 warnings。
     * 缺省 undefined = 未触发回滚（既有布尔字段语义不变）。
     */
    rollbackFull?: boolean;
    warnings: string[];
    failed: {
        itemId: string;
        message?: string;
    }[];
    /**
     * 未生效项（issue #56 第二条线）：`status='warning'` 的计划项 —— **非致命但确实没写进去**。
     *
     * 为什么同步层要有自己的字段：`ok` 不因 warning 变 false（刻意如此），所以上层
     * （路由 / 历史 / 界面）必须靠这个字段才能把「部分成功」讲出来，而不是只报一句「同步完成」。
     * 真机：插件安装失败（warning）排在凭据写入之前，密钥因此没导进来，用户以为成功了。
     */
    ineffective: {
        itemId: string;
        adapter: string;
        message?: string;
    }[];
    /** 透传 executeImportPlan 结果 */
    result: ImportResult | null;
    needsRestart?: boolean;
}
/**
 * 远端快照保留数量上限（**缺省策略**的 keepLast 层）：每次 push 上传成功后对远端裁剪，
 * 保留最新 N 个（按 createdAt 升序的最末 N 个，含刚 push 的），更旧的逐个删除。
 * 删除失败只告警（进 push 的 warnings），不上抛阻断主流程。
 *
 * m-retention：真正的裁剪规则来自 SyncEngineOptions.retentionPolicy（GFS 三层）；
 * 本常量只是**缺省策略**的 keepLast 取值（= 10，与改造前的硬编码 FIFO 逐字等价），
 * 保留导出是为了让既有调用方/测试仍能引用「缺省保留份数」这一事实，不再作为唯一判据。
 */
export declare const MAX_REMOTE_SNAPSHOTS: number;
/**
 * 用户对**单个分区**的裁决（分区粒度：没有冲突项粒度 / 复合 id）。
 *  - useRemote：用远端整分区原值（对键级冲突而言 = 放弃本机该分区里除冲突键以外的改动）；远端没有该分区 → 无法表达删除，计入 pendingConflicts；
 *  - keepLocal ：保持本机整分区原值（本机没有该分区 = 无写入，直接跳过）；
 *  - useMerged ：取 merge() 的 merged 结果 —— 仅 decision === 'merge' 的分区有效；'conflict' 分区没有 merged，按冲突处理并计入 pendingConflicts；
 *  - skip     ：本轮不裁决该分区 → 计入 pendingConflicts，基线不推进（冲突下一轮重新出现）。
 */
export type MergeResolution = {
    id: SectionId;
    action: 'keepLocal' | 'useRemote' | 'useMerged' | 'skip';
};
/** applyMergeResolutions 报告：ApplyReport + 仍未裁决的冲突分区（非空 = 基线未推进）。 */
export type ApplyMergeResolutionsReport = ApplyReport & {
    pendingConflicts: SectionId[];
};
/**
 * 删除远端快照的结果（F3：显式删除路径此前对「本轮 blob GC 被放弃」完全静默）。
 * `warnings` 与 push 报告同风格（空数组 = 本轮什么都没被放弃）：快照已按用户意图删除，
 * 「孤儿 blob 没回收」不是失败（下一轮 GC 还会再试），所以进 warnings、不进 ok。
 */
export interface DeleteSnapshotResult {
    warnings: string[];
}
export declare class SyncEngine {
    private readonly ctx;
    private readonly transport;
    private readonly stateDir;
    private readonly adapters;
    private readonly scanner;
    private readonly importer;
    private readonly now;
    private readonly snapshotIdFn;
    private readonly transportRef;
    private readonly localSnapshotsDir;
    private readonly rollbackSnapshotsDir;
    private readonly zipDir;
    private readonly exporterVersion;
    private readonly fsx;
    private readonly msg;
    private readonly sections;
    /** 本次显式放行的可选分区（构造期已归一：只可能是 OPT_IN_SYNC_SECTIONS 的注册项） */
    private readonly optInSections;
    /** 远端快照保留策略提供者（缺省 = 保守的「保留最近 10 个」，与改造前逐字等价） */
    private readonly retentionPolicyProvider;
    /**
     * 最近一次 merge() 命中的**远端**快照 id（P0-7）：紧接其后的 applyMergePlan() 用它写基线远端指针，
     * 避免把本地临时快照 id 当成远端 id（那会让 hasNewRemoteSnapshot() 永远判「远端有新生」）。
     * 每次 merge() 重设；merge 失败/远端为空时置 null（= 远端 id 未知）。
     */
    private lastMergedRemoteSnapshotId;
    /**
     * 最近一次 merge() 命中的**远端**快照的 sourceHome（issue #45 跨机重定基）。
     * applyMergePlan 构造临时 ZIP 时把它写进 manifest.sourceHome，Importer 才会生成
     * 「源机 home → 本机 home」的重定基规则；'' = 旧快照/未知（不猜，行为不变）。
     */
    private lastMergedRemoteSourceHome;
    /**
     * 最近一次 merge() 命中的远端快照是否加密（issue #107）：
     * applyMergeResolutions → applyMergePlan 写基线时据此决定祖先副本是否也落**密文**。
     * false = 明文通道/未知（保持既有明文副本，行为逐字不变）。
     */
    private lastMergedRemoteEncrypted;
    /** 最近一次 merge() 收到的用户路径映射（applyMergePlan 复用；缺省 []） */
    private lastMergedPathMappings;
    /**
     * 最近一次 merge() 是否拿到了本地祖先副本（false = 两方合并）。
     * previewMerge 用它如实告诉界面「为什么全都是冲突」，绝不让两方差异看起来像三方结论。
     */
    private lastMergeHadAncestor;
    /**
     * 最近一次 merge() 的三方输入（仅内存）。
     * applyMergeResolutions 需要它还原「整分区」语义：merge() 的 MergePlan 只携带冲突处的
     * 原始值（键级冲突只给键值），而 'useRemote' / 'keepLocal' 必须落**整分区**数据才能进导入计划。
     */
    private lastMergeInputs;
    /** issue #132：跟随远端删除插件（缺省 false = 既有行为逐字不变） */
    private readonly deletePlugins;
    /** 本插件自己的包名（永不跟随删除；'' = 不设防） */
    private readonly selfPluginName;
    constructor(opts: SyncEngineOptions);
    /** 删除计划（预览与执行共用同一份判据；本机清单读不到 → undefined = 本轮不判也不删）。 */
    private pluginRemovalPlan;
    /** 同步只做 portable 分区（deviceSpecific/platformSpecific 永不参与）。
     *  构造注入 sections（同步范围）时再按注入范围过滤 —— 自动同步等后台流程
     *  merge/apply/push 全链路复用用户选择；手动请求仍可用 push(opts.sections) 覆盖。 */
    private portableAdapters;
    /**
     * 拉取/合并侧的分区范围 id 集合：portable（受注入的同步范围约束）
     * + **本次显式放行**的可选分区（optInSections）。
     *
     * 为什么单独一个助手：pull/preview/merge 都要把「远端快照里的哪些分区转进临时 ZIP」，
     * 三处必须同一口径；散开写 `portableAdapters().map(...)` 迟早漏掉一处（漏掉的表现是
     * 「推上去了、拉下来静默没有」）。
     */
    private pullSectionIds;
    /**
     * 会进载荷的分区 adapter = portable（受注入范围约束）+ 本次放行的可选分区。
     * 「哪些分区算数」只留这一处：hasLocalChanges / pullSectionIds / pushTargets 三处各写一份候选集合时，
     * 漏掉一处就出现「推上去了、拉下来静默没有」或「有改动却判成无变化」（#146 的候选面纪律）。
     */
    private candidateAdapters;
    /** 本次显式放行的「可选分区」adapter（空集 = 一个都不放行；顺序跟随 adapters） */
    private optInAdapters;
    /**
     * push 候选 adapter：缺省 = portable 全量 + 放行的可选分区；显式 sections 只取命中项，非 portable 警告跳过。
     * issue #146 的「扣下」判定一并解完（`push-skip.ts`）⇒ 过滤只有一处，push 与 previewPush 必然同口径。
     */
    private pushTargets;
    /** 结构性断言：凭据/秘密分区绝不进入同步载荷（双保险，portable 过滤之上） */
    private assertNoForbiddenSections;
    /**
     * 快照读取准备（download 后、使用前）：
     * - 加密快照（manifest.encrypted）→ 用 password 解密回明文 sections（原地替换）；
     *   无密码 → 明确报错（自动同步等无密码场景在调用方先行跳过）。
     * - 普通快照声明 containsSecrets=true → 拒绝（同步通道永不携带秘密，防御篡改/旧坏数据）。
     * 密码仅本次调用内存使用，绝不落盘/落日志。
     */
    private prepareSnapshot;
    /**
     * push 侧凭据载荷：includeSecrets=true 时读取 `$DSH_HOME/.credentials.yaml` 原文并加密。
     * 读不到 / 解析不出任何凭据 → 返回 undefined 并**告警**（不阻断推送：其余配置照常同步，
     * 但用户必须能看见「勾了导出密钥却没导出任何值」，而不是静默成功）。
     */
    private buildCredentialsPayload;
    /**
     * pull/preview 侧凭据载荷解密：快照携带凭据载荷时用同一次调用的密码解开为
     * `Map<ref, value>`（与宿主导入路径 tryDecryptCredentials 同口径）。无载荷 → undefined。
     * 值仅在内存流转：绝不落盘、绝不进日志/报告/响应体。
     */
    private decryptSnapshotCredentials;
    /**
     * 把「随加密快照迁移的凭据」补进导入计划：**需要写回**的 ref 生成 MissingSecret 项，
     * 本机值已与快照逐字节相同的 ref 生成 Skip（info）——写回是 no-op，不该再让用户确认。
     * 执行阶段由 credentials adapter 经 ImportContext.decryptedCredentials（仅内存）
     * 调用 credentials.set(ref, value) 写回本机 —— 与手动补录走同一条已验证路径。
     *
     * 判定与导入路径同规则（**值的有无优先于本机状态**），并多做一步「值是否已经相同」：
     *  - 有值 + 本机不同 / 本机没有 → MissingSecret（确认后写回）。**不因本机已配置而跳过**：
     *    快照显式带了值（用户勾了「导出密钥」），跳过就等于「密钥没同步过来」；
     *    要逐项放过用确认列表的批量按钮（sync-view 的 isBulkDecidable）。
     *  - 有值 + 本机逐字节相同 → Skip（info）。这是对上一轮「有值一律 MissingSecret」的**收窄**
     *    （真机反馈：本机 refs 一条不缺，列表却全标「缺密钥」+ 黄色警告）：只有真的会改动本机的
     *    ref 才需要人工确认。
     *  - 本机凭据文件读不到 → 无法比较 → 保守按 MissingSecret 处理，绝不静默跳过。
     *  - 「只有 ref 名、没有值」的情形由 createImportPlan → buildCredentialPlanItems 处理
     *    （那里才做本机已配置 → Skip 的判定）。
     *  - 同 id 已是 **Skip**（上面那条规则在「无值」时先判成了 Skip）→ 值不同时**升级**为
     *    MissingSecret：否则有值也会被 Skip 挡住，值永远不会写回；值相同时保持 Skip。
     */
    private appendCredentialPlanItems;
    /**
     * 读本机 `$DSH_HOME/.credentials.yaml` → `Map<ref, value>`，**只用于**「值是否已经相同」比对。
     * 与 push 侧 buildCredentialsPayload 读同一个文件、同一解析口径（credentialsMapFromYaml）；
     * 不新增任何能力，也不回读凭据值到 UI。
     * 读不到 / 解析失败 → undefined = **无法比较**：调用方必须按「未知」保守处理（照旧要求确认），
     * 绝不因为读失败就静默跳过写回。
     * 安全：值只在进程内存里比较 —— 不落盘、不进日志/报告/响应体。
     */
    private readLocalCredentials;
    /**
     * sessions 分区的导出选项（opt-in 分区）：显式勾选清单优先于「最新 N 个」。
     *
     * 为什么 include 非空时必须让 limit 失效：adapter 里 restrictUnits（最新 N 个）先于
     * includeItems 白名单执行 —— 两者叠加得到的是交集，用户要的是他勾中的那些。
     * 返回值直接展开进 adapter.export 的 options，其余分区恒返回 {}（零变化）。
     */
    private sessionExportOptions;
    /**
     * push：导出 portable 分区 → 组装快照 → 本地散文件副本 → transport.upload → 更新 sync-state。
     * 单项分区导出失败只告警跳过（§34.17），全部失败才整体失败。
     * opts.sections：指定仅同步这些分区（高级/自定义模式）；缺省 = 全部 portable 推荐分区。
     * opts.encrypt/password/includeSecrets：加密快照（含可选密钥导出）。
     * 安全不变量：includeSecrets ⇒ encrypt（密钥绝不明文进入同步通道）；密码仅内存。
     *
     * 前置：**远端已被其它设备推进时默认拒绝写入**（见 assertRemoteNotAdvanced）—— 这一条在导出
     * 之前执行，因为「本机这一版要不要推」是被远端状态决定的，先别做无谓的导出（plugins 还会 npm pack）。
     */
    push(opts?: SyncPushOptions): Promise<SyncPushReport>;
    /**
     * P0-②：push 前只读预览「将推送什么」—— 零写入、零远端变更：
     *  - 导出目标 portable 分区（与 push 同口径：sections 过滤 + secret 剥离）；
     *  - 逐分区相对上次基线（sync-state.sections hash）的 changed 标记；
     *  - 远端现有快照数（list 只读；首次推送 = 0）。
     * 加密快照（encrypt）时不再比较基线（密文不可比），sections 只带计数。
     * 任何失败都不写任何内容；预览只是 push 的「确认前说明书」。
     */
    previewPush(opts?: SyncPushOptions): Promise<SyncPushPreview>;
    /**
     * P1-5：会话删除墓碑簿记（只在**本次真的推送 sessions** 时才做，避免无谓的全树扫描）。
     *
     * `tracked=false` 的三种情形一律**不动既有记录**：没推 sessions / 适配器不支持全量枚举 /
     * 本机枚举失败或为空。用「读不到」覆盖成「全删了」会一次性标错几百条墓碑，绝不猜。
     */
    private computeSessionBookkeeping;
    /**
     * 裁剪远端快照：调用 transport.list() 获取全部快照（按 createdAt 升序），
     * 按 retentionPolicyProvider() 给出的 GFS 策略（最近 N / 每月一份 / 每年一份）
     * 算出待清理的 id，逐个调用 transport.delete()。
     *
     * 与改造前的关系：缺省策略（keepLast=10，无分层）走 core 的 selectPruneCandidates 快速路径
     * → 与旧的「保留最新 10 个」**逐字等价**；用户启用分层后，远端保留不再绑死在
     * 「推了几次配置」上（早先同步的会话不会被后续 push 冲掉）。
     *
     * 两条硬保证：
     *  - **刚 push 的 pushedId 恒保留**（策略三层全关时也不删它，否则等于推完立刻删）；
     *  - 策略提供者抛错 → 回退缺省策略（保守多留）。
     *
     * 失败语义：list/delete 失败均只 push 进 warnings，不上抛 —— 裁剪是「尽力而为」的后台整理，
     * 绝不影响 push 主流程的成功与否（§34.17 分区级告警同款语义）。
     */
    private pruneRemoteSnapshots;
    /** 读取远端保留策略；提供者缺失/抛错 → 缺省策略（保守多留，绝不因读取失败误删）。 */
    private resolveRetentionPolicy;
    /**
     * pull：拉取远端最新（或指定）快照 → 过滤 portable 分区 → 转临时标准 ZIP →
     * 复用 Importer 预览流程（analyzeImport/createImportPlan）产出差异报告。
     * 绝不直接写配置、绝不执行导入；执行由上层按用户确认后走 Importer.executeImportPlan。
     */
    pull(opts?: SyncPullOptions): Promise<SyncPullReport>;
    /**
     * 把远端快照**落地成本机 ZIP**（供「拉取即导入」）。
     *
     * 与 `pull()` 的区别：pull 只做只读差异预览并在 finally 里删掉临时 ZIP；
     * 本方法把 ZIP 留在**调用方指定的目录**（由调用方负责清理），返回它的绝对路径。
     *
     * 三条边界：
     *  - **只读远端**：不改远端、不写 sync-state（同步基线只在 apply 之后才动）；
     *  - **加密快照仍要密码**：`prepareSnapshot` 会在缺密码时明确报错，绝不静默产出空包；
     *  - **墓碑剔除同样生效**：与 pull 一致，已删除的会话不随包复活。
     */
    downloadSnapshot(opts: {
        snapshotId?: string;
        password?: string;
        dir: string;
        name?: string;
    }): Promise<{
        path: string;
        snapshotId: string;
        tombstonedSessions?: number;
    }>;
    /**
     * 删除**远端**的一份快照（产物库「远端快照 → 删除」，不可恢复）。
     *
     * 三条边界：
     *  - **只动远端**：不写 sync-state、不碰本机配置 —— 本机的 `lastSnapshotId` 只是「上次共同祖先」
     *    的记录，远端少一份不会让本机配置变坏；若删掉的正是它，下一次 `hasNewRemoteSnapshot()`
     *    会把远端最新快照当作新的可拉项（远端为空时它返回 false，不会拿空列表去取快照）；
     *  - **与保留策略裁剪共用同一条 `transport.delete`**（两条通道的删除语义只有一份实现），
     *    区别只在「谁点名」：这里是用户显式指定的 id，pruneRemoteSnapshots 由 RetentionPolicy 挑；
     *  - **不存在视为成功**（SyncTransport 契约），所以重复点删除 / 已被裁剪掉都不会报错。
     *
     * F3：通道侧的 blob GC 可能「放弃本轮」（SYN-04：引用快照 404 / 读不出 ⇒ 证明不了没人引用）。
     * 放弃不是删除失败，但**必须可见**（否则孤儿 blob 无人知晓地一直堆）⇒ 放弃码用与 push 报告
     * 同一条 `gcSkipWarning` 渲染进返回体的 warnings。
     */
    deleteSnapshot(id: string): Promise<DeleteSnapshotResult>;
    /**
     * SYN-04b：通道最近一轮 GC 的放弃码（无则 null）。
     *
     * 保留为 public 只读出口（不删）：属本类已发布的可见 API，路由/诊断不跑删除流程也能读到通道能力；
     * 引擎内已由 deleteSnapshot 消费（放弃码 → warnings），不再是死方法。读不到（通道没这能力）= null。
     */
    lastGcSkipCode(): string | null;
    /** 列出远端已有快照（按 createdAt 升序）—— 供「选择历史快照」下拉。 */
    listSnapshots(): Promise<SyncSnapshotMeta[]>;
    /**
     * 列表时**读不出来/解析失败**的远端快照（issue #59）：通道实现可选暴露该诊断。
     *
     * 为什么要有：列表把坏快照跳过是必要防御（不能因为一条坏数据让整体失败），但**静默跳过**
     * 会让「push 报成功 + 远端列表为空」变成用户无从自查的矛盾状态。路由层把它随列表一起回传。
     */
    unreadableSnapshots(): readonly {
        file: string;
        reason: string;
    }[];
    /**
     * 远端是否出现比本地共同祖先更新的快照（§3.2「检测到远端新快照」）。
     * - 远端为空 → false（无物可拉）；
     * - 远端指针未知（lastSnapshotId=''：从未同步 / 远端 id 未知）且远端非空 → true（首次可拉）；
     * - 否则比较**内容**（issue #140）：远端最新快照实际携带的分区哈希 vs 上次记录的远端观测。
     *   只比 id 时，任何一次新推送（哪怕分区逐字相同）都会判成「有新生」，白跑 download + 合并。
     * - 两边任一观测缺失（加密快照 sections 恒空 / 旧 state 没记过观测）⇒ 回落 id 比较，
     *   绝不把「读不到」猜成「没变」（判据与回落规则只在 content-diff.ts）。
     * 只读远端列表（transport.list），不做下载/合并。
     *
     * 前提：lastSnapshotId 必须是**远端**快照 id（P0-7）。旧实现把本地生成的快照 id 也写进去，
     * 于是合并/应用之后这里恒为 true → 每轮白跑 list + download + merge。
     *
     * `listed` 可选：调用方本轮已经 list 过（如自动同步先查加密快照）时直接传进来，
     * 避免同一个回合对远端做两次 list —— 每条通道的 list 都是一次真实网络往返
     * （git 通道 = `pull --ff-only`，webdav 通道 = PROPFIND/GET）。
     */
    hasNewRemoteSnapshot(listed?: readonly SyncSnapshotMeta[]): Promise<boolean>;
    /**
     * 连通性探针（cloud-sync 借鉴项 ②）：把当前通道的**只读**自检透出给宿主路由。
     *
     * 通道没实现 probe（如 git 通道按 fast-forward 语义自证）时**如实报不支持**，
     * 绝不返回「连接正常」—— 谎报成功比不支持更糟。
     */
    probe(): Promise<SyncProbeResult>;
    /**
     * 本地**会进载荷**的配置与上次基线相比是否有变化（§3.1，「看变化」）。
     * 判定集合 == 推送载荷集合（candidateAdapters），字节口径与载荷同源 —— 实现与理由见 local-changes.ts。
     */
    hasLocalChanges(): Promise<boolean>;
    /**
     * 一键同步预览：拉取远端（最新或指定历史快照）→ 转临时 ZIP → Importer 分析出计划。
     * 与 pull 的区别：临时 ZIP **不清理**（由调用方 / 会话持有，供 apply-items 复用），并返回完整 plan/analysis/snapshotId 供会话登记。
     * 调用方负责在会话消费或取消后清理 zipPath 所在目录。
     */
    preview(opts?: SyncPullOptions): Promise<SyncPreviewResult>;
    /**
     * 三方合并（不写本地配置、不执行导入）：local = 现场 export，remote = 下载的远端快照，
     * ancestor = 本地祖先副本；副本缺失 → 退化为两方合并（整分区 conflict 交用户裁决）。
     * 副作用只有进程内备忘（远端快照 id / sourceHome / 用户映射 / 祖先可用性 / plan / 三方输入），
     * 供紧随其后的 previewMerge / applyMergePlan / applyMergeResolutions 复用：同一次调用只下载一次远端。
     */
    merge(opts?: {
        snapshotId?: string;
        password?: string;
        pathMappings?: PathMapping[];
    }): Promise<MergePlan>;
    /**
     * 合并预览（只读、零写入）：把 merge() 的三方结果翻成界面可渲染的结构化视图。
     *
     * 与 merge() 的关系：**复用**同一次调用（同一实例上只下载一次远端快照、只 export 一次本地），
     * 不改远端、不写 sync-state、不落祖先副本、不动本机配置。
     *
     * 安全：每侧预览文本都先过 redact() 再截断到 2 KiB（敏感值绝不回传浏览器）；原始值对象
     * （对象 / 数组 / 字节数组）**绝不**上抛给调用方。
     */
    previewMerge(opts?: {
        snapshotId?: string;
        password?: string;
        pathMappings?: PathMapping[];
    }): Promise<MergePreview>;
    /**
     * 按用户裁决应用合并结果（**分区粒度**），并严守基线纪律。
     *
     * 与 applyMergePlan 的关系：把 resolutions 映射成 SyncApplyPlan 后走**同一条执行路径**
     * （applyMergePlan：兜底快照 + 失败整体回滚 + 成功才记基线）。本方法只额外负责两件事：
     *  1. 把 merge() 的分区级结论翻成「远端整分区 / 本机整分区 / 自动合并结果」的实际数据
     *     （键级冲突的 conflicts 只带键值，进不了导入计划，必须回到整分区语义）；
     *  2. 基线纪律 —— 只要还有未裁决分区，就**不推进远端基线指针**并记 pendingMerge
     *     （冲突下一轮重新出现）；全部裁决完才清空 pendingMerge 并推进基线。
     *
     * 裁决语义（与 MergeResolution 的文档一致）：
     *  - 未点名的分区按 merge() 的既有结论处理：可决断（useRemote / keepLocal / merge）→ 应用；
     *    'skip' → 跳过；'conflict' → 计入 pendingConflicts；
     *  - action='skip'（点名了但不裁决）：该分区若有内容可裁决 → 计入 pendingConflicts（**不算解决**，
     *    否则基线推进会让它下一轮不再被提出 = 静默丢改动）；本来就无变化的 'skip' 分区 → 跳过；
     *  - useMerged 而 merge() 没给 merged（典型：'conflict' 分区）→ 计入 pendingConflicts；
     *  - useRemote 而远端没有该分区（= 远端删了它）→ 导入计划表达不了删除 → 计入 pendingConflicts；
     *  - keepLocal 而本机没有该分区 → 保持现状（无写入）→ 跳过。
     */
    applyMergeResolutions(resolutions: MergeResolution[], opts?: {
        snapshotId?: string;
        password?: string;
        pathMappings?: PathMapping[];
        snapshotBinding?: TransactionSnapshotContext;
    }): Promise<ApplyMergeResolutionsReport>;
    /** P2（2026-11-14 真机事故）：自动同步撞冲突时把分区落成待裁决；实现与为什么见 pending-merge.ts。 */
    recordPendingMerge(sections: readonly SectionId[]): Promise<PendingMerge | null>;
    /** 组装 pendingMerge 记录（同一远端快照上连续冲突保留首次时间）；见 pending-merge.ts。 */
    private pendingMergeFor;
    /** 基线纪律的纯状态写入（不碰祖先副本、不推远端）；为什么不用 recordBaseline 见 pending-merge.ts。 */
    private writeMergeBaseline;
    /**
     * 重新导出**已应用**的分区（F-2，2026-10）：基线的唯一正确来源是「实际落地的本机内容」。
     *
     * 为什么不能用计划/远端的 merged 载荷：写回时 adapter 会自增本机侧字段（如
     * settings.namespaces[*].revision），而 merged 记录的是**远端快照里的值**；据此记基线会让
     * 下一轮 merge 同时判「本地改了」与「远端改了」→ both-modified 冲突 → 每轮重复冲突。
     *
     * 口径与 merge() 的本地侧导出一致：文件类分区直接取 data，其余过 SecretScanner 剥离。
     * 任一分区导出失败 → 返回 null（调用方**不推进基线**并明确告警）：绝不写半个基线。
     */
    private exportAppliedSections;
    /**
     * 记录祖先基线：写本地祖先副本 + 更新 sync-state（每分区 hash/updatedAt、lastSyncAt、transport、
     * 远端指针 lastSnapshotId、本地祖先目录名 ancestorId）+ 裁剪到 keep。
     *
     * 实现整体在 `baseline-record.ts`：P0-7 的两个 id 语义、G-44 的「远端观测 vs 本机观测」口径
     * 都写在那份文件头里，改这里之前先读它。引擎只把本机环境（快照目录、通道身份、时钟、文案）交出去。
     */
    recordBaseline(snapshotId: string, sections: Partial<Record<SectionId, SectionData>>, nowIso?: string, opts?: RecordBaselineOptions): Promise<void>;
    /**
     * 应用自动应用计划：写本地（走 Importer.executeImportPlan 标准路径；应用前调 backup.createSnapshot 兜底）；
     * 任一 auto 项失败 → 整体 rollback；成功后 recordBaseline 更新祖先基线。
     * 返回 ApplyReport；不抛错到调用方（失败返回 ok:false + rolledBack:true）。
     * 不再写 review-queue（§2.3/§7.4：待审语义改由同步历史 skipped 标记表达）。
     *
     * @param opts.snapshotBinding journal 绑定面（审计 P0-23）——由 runJournaled / runExternalIntent 的
     *   ctx 透传。**自动同步路径必须传**：否则 ctx 里的 recordRollback 到不了引擎，applyMergePlan 内部
     *   完成的整体回滚会被 executeImportPlan 正常返回，最终被记成 COMMITTED（已回滚却报成功）。
     * @param opts.remoteSnapshotId 本次应用对应的**远端**快照 id（写进 sync-state.lastSnapshotId，P0-7）。
     *   缺省 = 同一实例上最近一次 merge() 命中的远端快照（「自动同步 merge → applyMergePlan」的调用形态，
     *   引擎实例由宿主每次运行新建）；都拿不到则写 ''（远端 id 未知，不冒充远端 id）。
     */
    applyMergePlan(apply: SyncApplyPlan, opts?: {
        remoteSnapshotId?: string;
        snapshotBinding?: TransactionSnapshotContext;
        /**
         * issue #45：路径映射。缺省 = 复用最近一次 merge() 记下的用户映射；
         * 自动重定基则取自 merge() 记下的远端 sourceHome（写进临时 ZIP 的 manifest.sourceHome，
         * 由 analyzer.rebaseMapping 生成「源机 home → 本机 home」规则并排在用户映射之前）。
         */
        pathMappings?: PathMapping[];
        /** 覆盖自动重定基的源 home（缺省 = merge() 记下的远端 sourceHome） */
        sourceHome?: string;
        /**
         * 保留祖先副本与 ancestorId（缺省 false = 既有行为逐字不变）。
         * applyMergeResolutions 在**仍有未裁决冲突**时必须传 true：共同基线仍是「本机与远端都认可的上一版」。
         */
        preserveAncestor?: boolean;
        /**
         * 待裁决冲突记录（基线纪律）：null = 清除（全部裁决完）；缺省 = 不动该字段。
         * 与 recordBaseline 同语义，随本次成功的基线写入**同一次落盘**（原子，不留中间态）。
         */
        pendingMerge?: PendingMerge | null;
        /**
         * issue #107：本次基线对应的远端快照是加密快照时传解密密码 → 祖先副本也落**密文**。
         * 缺省 = 明文祖先副本（既有行为逐字不变）。密码仅本进程内存使用。
         */
        ancestorPassword?: string;
    }): Promise<ApplyReport>;
    /**
     * applyItems：按用户对差异项的逐项决策执行导入（§3.4/§5.3）。
     *
     * 与 applyMergePlan 的区别：applyItems 接收「会话级临时 ZIP + 子计划」，
     * 直接执行（backup.createSnapshot 兜底 → importer.executeImportPlan →
     * 成功 recordBaseline / 失败 rollback），不构造中间 SyncApplyPlan。
     *
     * @param zipPath 会话级临时标准 ZIP（由 sync/sync 生成，包含采纳项的 merged payload）
     * @param subPlan 子计划（仅含采纳项的 ImportPlan；globalStrategy/pathMappings/needsRestart 沿用会话 plan）
     * @param opts 执行选项（onItem 进度回调）
     * @returns ApplyItemsReport（ok/applied/restoreId/rolledBack/warnings/result）
     */
    applyItems(zipPath: string, subPlan: ImportPlan, opts?: {
        onItem?: (info: PlanItemProgress) => void;
        /** Phase 4 生产 journal↔snapshot 绑定（deferred；透传给 Importer.executeImportPlan） */
        snapshotBinding?: TransactionSnapshotContext;
        /**
         * issue #38：快照凭据载荷解密出的 `Map<ref, value>`（由 preview() 交给会话保管，
         * 仅内存）→ 透传为 executeImportPlan 的 decryptedCredentials，credentials adapter
         * 据此 credentials.set(ref, value) 写回本机。缺省 = 无凭据可写。
         */
        credentials?: Map<string, string>;
        /**
         * P0-7：本次应用对应的**远端**快照 id（宿主应从同步会话的 SyncSession.snapshotId 透传）→
         * sync-state.lastSnapshotId。缺省 ''：远端 id 未知就留空，绝不把本地随机快照 id 冒充成远端 id
         * （那会让 hasNewRemoteSnapshot() 恒判「远端有新生」，每轮白跑 list + download + merge）。
         */
        remoteSnapshotId?: string;
        /**
         * issue #107 补漏：远端快照本身是加密快照时，本次基线对应的祖先副本也必须落**密文**。
         * 提供密码 → 写密文祖先副本（下轮可三方合并）；不提供 → 由调用方传 `suppressAncestor`，
         * **绝不落明文副本**（明文副本会违反「祖先副本只落密文」，也让加密通道的基线以明文散文件落盘）。
         */
        ancestorPassword?: string;
        /** 加密通道拿不到密码时：不落祖先副本，`ancestorId` 置 ''（下轮退回两方合并，绝不落明文） */
        suppressAncestor?: boolean;
    }): Promise<ApplyItemsReport>;
    /** 散文件快照 → 标准导出 ZIP（临时目录，用完即删）：buildManifest + checksums + 平铺分区 */
    private snapshotToZip;
}
