import type { MsgFunc } from './messages.ts';
import type { RestoreJournalPort } from './restore-wal.ts';
import type { RestoreResumeHint } from './restore-resume.ts';
import type { SnapshotStatus } from './types.ts';
export type RestoreActionKind = 'hostFileRestore' | 'hostFileRemove' | 'pluginRemove' | 'pluginInstall' | 'fileRestore' | 'fileRemove' | 'credentialHint' | 'skip';
export interface RestoreAction {
    kind: RestoreActionKind;
    /** 人类可读描述 */
    description: string;
    /** 目标：相对 $DSH_HOME 的 relPath（hostFile/file 类）或插件名（pluginRemove） */
    target?: string;
    /** hostFileRestore/fileRestore：快照内 blob 相对路径（相对 snapshotDir） */
    blobPath?: string;
    /** pluginRemove / pluginInstall：插件包名 */
    pluginName?: string;
    /** pluginInstall：重装目标（name@version；版本未知时就是裸包名） */
    pluginTarget?: string;
    /** credentialHint：人工提示文本 */
    manualHint?: string;
    /** 附加说明（旧快照缺基线 / 离线无法恢复等） */
    detail?: string;
    /** 该动作是否对应 settings 主文件（settingsPath 解析出的文件） */
    isSettings?: boolean;
}
export interface RestorePlan {
    snapshotId: string;
    createdAt: string;
    sourceZip: string;
    actions: RestoreAction[];
    summary: {
        hostFileRestores: number;
        hostFileRemoves: number;
        pluginRemoves: number;
        pluginInstalls: number;
        fileRestores: number;
        fileRemoves: number;
        credentialHints: number;
        skips: number;
    };
    /** beforePlugins 基线是否可用（undefined=旧快照无基线 → 不计划任何插件卸载） */
    pluginBaselineConfirmed: boolean;
    /**
     * 快照记录的来源 DSH 版本（F-4；**可选**：旧快照没有该字段是常态，此时为 undefined）。
     * 只承载事实，判定与展示在调用方（UI/CLI）；恢复绝不因它而拒绝。
     */
    snapshotDshVersion?: string;
    /**
     * 本机当前 DSH 版本（F-4；**可选**：无法判定时不猜，保持 undefined 且不产出版本告警）。
     * 来源优先级：调用方注入的 `RestoreOptions.currentDshVersion`（宿主权威，桌面端取 installAnchor）
     * → profile 依赖树里实际落盘的 `@deepseek-ai/dsh` 版本（离线 best-effort）。
     */
    currentDshVersion?: string;
}
export interface RestoreOptions {
    /** 快照目录 <snapshotsDir>/<id>/（含 snapshot.json 与 blobs/） */
    snapshotDir: string;
    /** $DSH_HOME（默认 ~/.dsh） */
    homeDir: string;
    /** 管理的 DSH profile 名（插件卸载走 profiles/<profile>） */
    profile: string;
    /** 覆盖 settings 文件路径（默认探测 $DSH_HOME/settings.yaml → settings.json） */
    settingsPath?: string;
    /**
     * 本机当前 DSH 版本（F-4；**可选**）。宿主知道权威版本（`HostContext.dshVersion`，桌面端是
     * `profileContext.installAnchor` 那份运行时）时应当注入 —— 它优先于离线 best-effort 的
     * profile 依赖树探测。判定只在「与快照记录的值都已知且不同」时产出一条**可见告警动作**，
     * 绝不拒绝恢复（兼容性口径是「打分 + 原因」，不是门禁）。
     */
    currentDshVersion?: string;
    /** 注入式插件卸载器（测试用；缺省走 runDshPlugin 官方通道） */
    pluginUninstaller?: (name: string, profileDir: string, profile: string) => Promise<{
        ok: boolean;
        message?: string;
    }>;
    /**
     * 注入式插件重装器（issue #132 undo；测试用）。缺省走官方 `dsh plugin add <name>@<version>`。
     * 只用于「快照记录过跟删、本机现在缺失」的插件；未记录过的插件绝不重装。
     */
    pluginInstaller?: (name: string, target: string, profileDir: string, profile: string) => Promise<{
        ok: boolean;
        message?: string;
    }>;
    /** 每项动作执行回调（宿主路由埋点：更新 RunRegistry 进度；index/1-based、total=计划动作数、
     * detail=动作描述。dry-run/planRestore 不触发） */
    onAction?: (info: {
        index: number;
        total: number;
        detail: string;
    }) => void;
    /** 消息翻译器（缺省 zh；宿主按 DSH 应用语言注入） */
    msg?: MsgFunc;
    /**
     * Phase 4 统一恢复校验：快照根目录（<snapshotsDir>，<snapshotDir> 的直接父级）。
     * 提供时，planRestore 顶端强制调用 validateSnapshotForRestore；CORRUPT/INVALID/UNSAFE_PATH/
     * WRONG_ENVIRONMENT 拒绝计划。缺省 = 不强制（兼容旧调用；新入口都应传）。
     */
    snapshotsRoot?: string;
    /** Phase 4 恢复校验时校验环境指纹（不匹配 → WRONG_ENVIRONMENT；缺省不校验）。 */
    environmentFingerprint?: string;
    /**
     * Phase 4 恢复确认策略：缺省允许 LEGACY 显式恢复。若调用方要求「非 operation-bound 一律拒绝」，
     * 可传 'requireOperationBound'。
     */
    requireOperationBound?: boolean;
    /**
     * 逐动作 WAL（崩溃后可判进度）：传入 journal 上下文（host 的 JournalRunContext 结构上兼容）后，
     * 恢复会在**首个写之前**把全部动盘动作登记为 planned（带 beforeFp），执行完逐项更新 done/attention
     * （带 afterFp）。崩溃后 reconcile 因此能证明「哪些还原了、哪些没动」，而不是整笔不透明。
     * 不传 = 只记 operation intent（旧行为，绝不假装有进度）。
     */
    journal?: RestoreJournalPort;
    /**
     * 续跑提示（crash 后再点一次恢复）：只由 core/restore-resume.ts 的严格判定产出。
     *  - `skipStepIds`：已证明「磁盘就是执行后状态」的动作 —— 本轮不执行、不重登记；
     *  - `steps`：崩溃那次 journal 里已有的 step（执行完的动作仍要 settle 成 done/attention）。
     * 传了它就必须配 journal（否则没有可 settle 的对象）；**绝不重新 preRegister**：
     * 那会把已完成动作的 beforeFp 覆盖成「执行后内容」，崩溃证据全丢。
     */
    resume?: RestoreResumeHint;
}
export interface RestoreReport {
    snapshotId: string;
    /** 已还原/已删除的目标（相对 $DSH_HOME） */
    restored: string[];
    /** 已卸载的插件名 */
    removedPlugins: string[];
    /** 已按 undo 记录装回的插件目标（name@version；issue #132） */
    installedPlugins: string[];
    /** 需人工处理的提示（凭据补录等） */
    manualHints: string[];
    /** 失败清单 */
    failed: {
        item: string;
        reason: string;
    }[];
    /** 跳过项（无动作 / 离线无法处理） */
    skipped: string[];
    /**
     * 本次执行真正写入的 pre-restore 反悔副本目录（`<snapshotDir>/pre-restore/<attemptDir>/`）。
     * 每次 restore() 新建一个 attempt 目录（D5）⇒ 崩溃后重跑**不会覆盖**上一次的反悔副本；
     * 没有任何文件需要备份时缺省（不建空目录）。
     */
    preRestoreDir?: string;
    /**
     * 幽灵会话（F5 失效归档清理）：快照记录的 sessions 分区会话在磁盘 sessions 目录
     * 已无任何文件（备份有记录、磁盘无文件）。DSH 官方无归档会话 API，降级本地校验，
     * 仅供报告、需人工在 DSH 确认清理；无会话分区/无幽灵时为缺省或空数组。
     */
    ghostSessions?: string[];
}
export interface SnapshotMeta {
    id: string;
    createdAt: string;
    sourceZip: string;
    status?: SnapshotStatus;
    entryCount: number;
    hostFileBackupCount: number;
    beforePluginCount: number;
    /**
     * 来源档案（originProfile）：拍这份快照的进程所属 profile 名。
     * 旧快照 / 宿主不暴露 profile 时缺省 —— 界面按「未标注」展示，绝不写 'unknown' 占位。
     */
    originProfile?: string;
    /** 置顶标记（P1-⑧）：置顶快照不参与自动保留清理（最多保留 N 个时的淘汰豁免） */
    pinned?: boolean;
}
/** homeDir 内绝对路径（越界抛错） */
export declare function homeAbs(homeDir: string, relPath: string, msg: MsgFunc): string;
/**
 * home 相对目标 → 绝对路径（越界/非法给 null 而不是抛错）。
 * 供逐动作 WAL 与续跑判定用：这两处都只需要「能不能拿到绝对路径」这一个事实，
 * 判定失败由调用方决定是跳过该动作还是拒绝整笔。
 */
export declare function resolveRestoreTargetAbs(homeDir: string, target: string): string | null;
/** 快照目录内 blob 绝对路径（防 snapshot.json 里伪造 ../ 越界读） */
export declare function blobAbs(snapshotDir: string, blobPath: string, msg: MsgFunc): string;
/**
 * 新建本次执行的 pre-restore 目录（D5）：`<snapshotDir>/pre-restore/<attemptDir>/`。
 *
 * 为什么必须分目录：备份名原来是「seq + relPath」、seq 每次都从 1 重数 ⇒ 崩溃后重跑会把
 * 第一次的「恢复前原文」覆盖成「第一次恢复后的内容」= 反悔副本静默丢失。
 * 同名（同一毫秒内重复调用 / 时钟回拨）时追加 `-1`/`-2`…：靠 `mkdir` 的 EEXIST 判定，
 * **不 pre-stat**（先查后建在并发下会撞车）。
 */
export declare function createPreRestoreAttemptDir(preRoot: string): Promise<string>;
/**
 * 快照恢复前可信校验的 verdict（统一供 Host API / ModelTools / CLI / sync rollback 消费）。
 *
 * - TRUSTED_OPERATION_SNAPSHOT：READY + manifest 完整 + blob hash 匹配 + 有 op/env/owner binding。
 *   可授权自动/推荐回滚。
 * - TRUSTED_MANUAL_LOCAL：READY + 完整校验通过，但无 Phase4 binding（如用户手动/pinned 快照）。
 *   可显式手动恢复，不可作 Phase3 自动 recovery 证据。
 * - LEGACY_REQUIRES_CONFIRMATION：旧快照（无 manifest / 无 readiness）。结构/路径校验通过即可显式确认恢复，
 *   绝不可自动恢复。
 * - INVALID / CORRUPT / UNSAFE_PATH / WRONG_ENVIRONMENT：拒绝。
 */
export type RestoreSnapshotVerdict = 'TRUSTED_OPERATION_SNAPSHOT' | 'TRUSTED_MANUAL_LOCAL' | 'LEGACY_REQUIRES_CONFIRMATION' | 'WRONG_ENVIRONMENT' | 'CORRUPT' | 'INVALID' | 'UNSAFE_PATH';
export interface RestoreSnapshotValidation {
    verdict: RestoreSnapshotVerdict;
    reason?: string;
}
/**
 * 统一恢复前校验（供 planRestore 顶端对所有 restore 类型强制调用）：
 * 1. isValidSnapshotId（语法）
 * 2. snapshot.json + manifest 存在、id 匹配（结构）
 * 3. verifySnapshot（磁盘重读：metadataHash + blob hashes + 路径安全）→ CORRUPT
 * 4. symlink 检查（snapshot.json / manifest / blobs）→ UNSAFE_PATH
 * 5. readiness + provenance：
 *    - 无 binding 字段（旧快照）→ LEGACY_REQUIRES_CONFIRMATION
 *    - 有 manifest/READY 但无 op binding → TRUSTED_MANUAL_LOCAL
 *    - 有 READY + manifest + op/env/owner binding → TRUSTED_OPERATION_SNAPSHOT
 * 绝不把「不可证明」当成 trusted。
 */
export declare function validateSnapshotForRestore(snapshotDir: string, snapshotsRoot: string, env?: {
    environmentFingerprint?: string;
}): Promise<RestoreSnapshotValidation>;
/**
 * 生成恢复动作计划（dry-run 预览的唯一入口；零写入）：
 * 读快照 + 探测当前文件/已装插件状态，输出按执行顺序排列的动作清单。
 *
 * F-4：快照记录的来源 DSH 版本与本机版本都已知且**不同**时，末尾追加一条可见告警动作（kind='skip'）
 * 并在 `snapshotDshVersion` / `currentDshVersion` 回传两侧事实；绝不因此拒绝恢复。
 */
export declare function planRestore(opts: RestoreOptions): Promise<RestorePlan>;
/**
 * 执行恢复：按计划顺序 整文件还原 → 插件卸载 → file 补偿，
 * 覆盖/删除前全部先复制到 <snapshotDir>/pre-restore/<attemptDir>/（双保险，每次执行一个新目录），
 * 逐项 try/catch（单项失败不拖垮其余），输出诚实报告。
 */
export declare function restore(opts: RestoreOptions): Promise<RestoreReport>;
/**
 * 扫描快照根目录下每个子目录的 snapshot.json，返回按 createdAt 倒序的元信息。
 * 目录缺失/条目损坏自动跳过（不阻断其他快照）。
 *
 * **「读不到」与「没有」必须分清**（验收 F2）：目录不存在（ENOENT）→ 空列表是正确结论；
 * EACCES / EPERM / ENOTDIR（路径被普通文件占住）等一律不算「没有快照」，
 * 经可选 out.unreadable 回传由调用方如实展示（默认不传 → 与改造前返回值一致）。
 */
export declare function listSnapshots(dir: string, out?: {
    unreadable?: string;
}): Promise<SnapshotMeta[]>;
/** 快照 id 安全校验（防路径穿越）：字母数字 + - _ .，长度 1-80。 */
export declare function isValidSnapshotId(id: unknown): id is string;
/** 删除单个快照（手动删除；P1-⑧）。只接受合法 id（防穿越），目标是快照根下的 <id>/ 目录。
 *  不存在视为成功（幂等）。返回是否实际删除。 */
export declare function deleteSnapshot(snapshotsDir: string, id: string): Promise<boolean>;
/** 切换置顶状态（P1-⑧）：置顶快照豁免自动保留清理。重写 <dir>/<id>/snapshot.json 的 pinned 字段。
 *  只接受合法 id；快照不存在抛错。 */
export declare function setSnapshotPinned(snapshotsDir: string, id: string, pinned: boolean): Promise<boolean>;
