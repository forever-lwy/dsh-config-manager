import { type BackupVerifyResult } from '../core/backup-verify.ts';
import { type DiskUsageDirs, type DiskUsageReport } from '../core/disk-usage.ts';
import { type SnapshotMeta } from '../core/restore.ts';
import { type BackupFileMeta } from '../sync/backup-files.ts';
import { type SessionHealthScanResult } from '../utils/session-health-scan.ts';
import type { SessionVerifyResult } from '../utils/session-verify.ts';
import { type LockReport, type RunningInstance, type SafeModeReport } from './control-state.ts';
export { isProcessAlive, readLockState, readRunningInstances, readSafeMode } from './control-state.ts';
export type { LockReport, RunningInstance, SafeModeReport } from './control-state.ts';
export { checkWriteGates, SAFE_MODE_REFUSAL_CODE, locksDirFromControlRoots } from './write-gates.ts';
export type { WriteGateOutcome, WriteGateRefusal, WriteRefusalCode } from './write-gates.ts';
export type VerifyOutcome = {
    ok: true;
    results: BackupVerifyResult[];
} | {
    ok: false;
    error: string;
};
/**
 * 定位待校验目标：显式目标（文件名或路径）优先，否则列出导出目录下全部 *.zip（名称升序）。
 * 与 `dsh-config-manager verify` 同一实现（CLI 与网页共用）。
 */
export declare function resolveVerifyTargets(exportsDir: string, explicit: string | undefined): Promise<{
    ok: true;
    targets: string[];
} | {
    ok: false;
    error: string;
}>;
/** 收集备份自检结果（只读；不通过不是异常，而是结果里的 verdict）。 */
export declare function collectVerifyResults(exportsDir: string, explicit?: string): Promise<VerifyOutcome>;
/**
 * 快照列表（与 `dsh-config-manager snapshots` 同源）。
 *
 * `unreadable` = 目录**读不出来**（不是不存在）—— 调用方必须如实展示，绝不显示成「没有快照」。
 */
export declare function readSnapshots(snapshotsDir: string, out?: {
    unreadable?: string;
}): Promise<SnapshotMeta[]>;
/**
 * 导出产物列表；**打开容器形态探测**（加密容器 DCA1 必须在列表里被标出来）。
 * `unreadable` = 目录读不出来（非 ENOENT），调用方必须如实展示。
 */
export declare function readBackups(exportsDir: string, out?: {
    unreadable?: string;
}): Promise<BackupFileMeta[]>;
/**
 * 插件数据根的固定布局 → 磁盘体检子区目录。
 *
 * 与宿主 `src/routes/backup.ts` 的 `diskUsageDirsOf` 同一映射（子区目录不在这里另立一套语义）。
 * `exportsDir` 允许覆盖：`--data-dir` 可被当成导出目录使用（verify/backup 的历史语义）。
 */
export declare function diskUsageDirsOf(dataDir: string, exportsDir?: string): DiskUsageDirs;
/** 只读磁盘体检（零写入）。 */
export declare function readDiskUsage(dataDir: string, exportsDir?: string): Promise<DiskUsageReport>;
export type SessionsHealthOutcome = {
    ok: true;
    result: SessionHealthScanResult;
} | {
    ok: false;
    error: string;
};
/** 只读会话体检（结构档 + 限额内的行档）。scanSessionHealth 本身不写任何字节。 */
export declare function readSessionsHealth(homeDir: string): Promise<SessionsHealthOutcome>;
/** 救急台首页所需的路径事实（由 CLI 侧解析后注入，保证与各子命令同一口径）。 */
export interface RescuePaths {
    homeDir: string;
    /** 插件数据根（`$DSH_HOME/dsh-config-manager` 或缺省 dataRoot） */
    dataDir: string;
    snapshotsDir: string;
    exportsDir: string;
    locksDir: string;
    controlRoots: readonly string[];
    profile: string;
    /**
     * 离线导出的 manifest.exporter.version（CLI 传真实版本；缺省 = 中性占位）。
     * 为什么不在这里再算一次版本：actions.ts 不得 import ./index.ts（会成环），
     * 而版本号只有 CLI 侧从 package.json 读得到 —— 由 runWeb 经本结构注入。
     */
    exporterVersion?: string;
}
export interface RescueStatus {
    generatedAt: string;
    paths: RescuePaths;
    safeMode: SafeModeReport[];
    lock: LockReport;
    instances: RunningInstance[];
    snapshots: SnapshotMeta[];
    backups: BackupFileMeta[];
    /** 任一项读失败的原因（首页必须显示，绝不静默当作空） */
    errors: string[];
}
/** 首页聚合：每一项各自 try/catch，缺一项不影响其余（但失败必须在 errors 里可见）。 */
export declare function readRescueStatus(paths: RescuePaths, now?: () => Date): Promise<RescueStatus>;
/** 会话修复步骤的机器可读形态（页面渲染用；CLI 走它自己的文本输出）。 */
export interface RepairStep {
    kind: 'move' | 'rewrite-move' | 'quarantine' | 'skip';
    sessionId: string;
    fromProjectKey: string;
    toProjectKey?: string;
    prefixRewrite?: {
        from: string;
        to: string;
    };
    reason: string;
    /** 是否真的会执行（duplicate-id 且没点名 --keep 时为 false） */
    applies: boolean;
}
export interface RepairOutcome {
    ok: boolean;
    dryRun: boolean;
    /** 需要人工处理（位置错位 / 重复 id / 前缀需映射等） */
    needsAttention: boolean;
    home: string;
    steps: RepairStep[];
    /** 计划摘要：scanned / ok / move / rewriteMove / skip / duplicates */
    scanned: number;
    movable: number;
    skipped: number;
    duplicates: number;
    /** 真实执行时的逐条结果（dry-run 时为空） */
    done: string[];
    errors: string[];
    /** 计划阶段就读不出来的文本（如非 projectKey 目录）——绝不静默，原样带回 */
    notices: string[];
    error?: string;
}
/** 就地修复（重放族）单条结果：给页面直接渲染用。 */
export interface SessionLogRepairRow {
    unitId: string;
    ok: boolean;
    /** 机器可读原因（ok=false 时） */
    reason?: string;
    /** 丢弃的重放重复行数（ok=true 时） */
    droppedRows?: number;
    bytesBefore?: number;
    bytesAfter?: number;
    /** 预览给出的指纹（apply 时必须原样回传） */
    expect?: {
        size: number;
        mtimeMs: number;
    };
    /** 备份文件名（与日志同目录，回滚只认台账，不认用户给的路径） */
    backupName?: string;
    repairId?: string;
    /**
     * 写后真 codec 复验结论（**逐字段透传** service 的 SessionVerifyResult，不改造/不丢字段）。
     * JSON 消费者必须据它区分三态：verified+equivalentToReadPath（现役读盘可读）/
     * verified+!equivalentToReadPath（只有迁移链能还原）/ !verified（未验证，原因见 reason）。
     * 预览路径不跑复验门 ⇒ 这一项缺省。
     */
    verify?: SessionVerifyResult;
    /** 确定性失败（reason='verify-failed'）时：本次备份的自动回滚是否成功（false = 目标仍是修复后字节） */
    rolledBack?: boolean;
    message: string;
}
export interface InlineRepairOutcome {
    ok: boolean;
    dryRun: boolean;
    rows: SessionLogRepairRow[];
    /**
     * 离线出口命令（可复制去终端）。
     *
     * **不是本入口的等价实现** —— 见 `repairSessionLogInline` 的能力边界：`sessions repair` 只做
     * 布局归位与重复 id 隔离，不改写会话字节；字节级离线通道只有救急台 `dcm web`。
     */
    commands: string[];
    error?: string;
}
/**
 * 真 codec 复验结论 → 一句人话（**三态**；服务层 utils/session-verify.ts 的定义为准）。
 *
 *  · verified && equivalentToReadPath   → 「现役读盘可读」= header.version === catalog.currentVersion === 已装版本，
 *                                          DSH 的现役读盘路径此刻就能直接读它；
 *  · verified && !equivalentToReadPath  → 只有**迁移链**能还原（pre-v4 日志：官方 resolveCurrentLog 对本代之前的
 *                                          代际返回 undefined，即「没有现役日志」）；
 *  · !verified                          → 「**未验证**」= 本机跑不了真 codec 门（如 available catalog 缺席 / 代际对不上 /
 *                                          缺子会话事实）——**这是最常见的一态，必须说出来**，绝不能让它看起来像成功；
 *  · verify 缺失（改造前的旧结果 / 预览路径）→ 空串：调用方保持原文案，绝不臆造「已验证」。
 */
export declare function sessionVerifyNoteOf(verify: SessionVerifyResult | undefined): string;
/** 会话修复行的文案入参（只吃机器可读事实 —— 便于单测与两边共用）。 */
export interface SessionRepairRowFacts {
    ok: boolean;
    reason?: string;
    droppedRows?: number;
    backupName?: string;
    rolledBack?: boolean;
    verify?: SessionVerifyResult;
}
/**
 * 会话修复行 → message（CLI 与离线救急台**同一份**文案）。
 *
 * 成功路径按 verify 分三态；**!verified 时不出现无限定的成功表述**（先声明未验证，再如实说写入已生效）；
 * verify 缺失时**逐字保持改造前的文案**（向后兼容，不臆造）；verify-failed 时说明已自动回滚 + 官方错误 detail。
 */
export declare function sessionRepairRowMessage(facts: SessionRepairRowFacts): string;
/**
 * **就地修复「重放重复行」**（离线救急台 /sessions 页的写入口）。
 *
 * 能力边界（**不得放宽**）：
 *  - 只做 `session-repair-service` 已有的那一类 —— 字节相同 + seq 相同的重放重复行（零损失）；
 *    其余类别（合成 closer / seq 空洞 / 不可解析行 / 容器非法 / header 不可读 / 子代理缺父）
 *    **只报告**，绝不在这里扩张（设计稿 §10.3/§10.4 的 G-23 界限）。
 *  - **离线出口只有一个**：救急台 `dsh-config-manager web`（别名 `dcm web`）—— 它调用的就是本函数。
 *    CLI 的 `sessions repair`（加 `--fix`/`--apply` 才落盘）**不是**字节级修复的等价命令：
 *    它只做**布局归位**（按首帧 cwd 把目录搬回 `projectKeyOf(cwd)`）与**重复 id 隔离**，不碰会话字节。
 *    此前把 `sessions repair --apply` 写成「等价命令」是不实表述（已订正，见下面的 `commands`）。
 *  - 三道写入门由服务层自持：单元必须解析到会话根内 / 无 `session.lock` / 文件不在 30s 静止期内；
 *    「DSH 已停」这一条由 `checkWriteGates` 在这里补上（与 CLI 写动作共用同一道写入门，
 *    比应用内 T8 通道更严：T8 跑在 DSH 内部，靠静止期而非停机）。
 *  - 与 CLI 同源：预览-应用指纹一致（TOCTOU）/ 时间戳备份 / 原子换入 / 写后复验，全在服务层。
 *
 * 为什么页面需要一个「一键」入口：救急台的定位是「DSH 起不来时唯一的可视化通道」，
 * 而 `session-repair-service` 的 CLI 出入口此前只挂在应用内通道上 —— 离线时用户只能敲命令。
 */
export declare function repairSessionLogInline(options: {
    home: string;
    dataDir: string;
    unitIds: readonly string[];
    apply: boolean;
    expects?: Record<string, {
        size: number;
        mtimeMs: number;
    }>;
    /** 环境锁目录（缺省由 controlRoots 派生；显式给出时优先） */
    locksDir?: string;
}, controlRoots: readonly string[]): Promise<InlineRepairOutcome>;
/**
 * 会话布局修复：`dryRun: true` 时**零写入**（与 `sessions repair` 缺省行为一致）。
 *
 * 实现方式：复用 `runSessionsRepair`（CLI 的同一实现）并收集它的输出行 —— 这样「网页看到的计划」
 * 与「命令行看到的计划」逐字同源；解析失败的极端情况如实进 notices，不假装成功。
 */
export declare function repairSessions(options: {
    home: string;
    fix: boolean;
    maps?: readonly string[];
    keep?: string;
    locksDir?: string;
}, controlRoots: readonly string[]): Promise<RepairOutcome>;
/** 磁盘清理结果（页面渲染用） */
export interface CleanupOutcome {
    ok: boolean;
    removed: number;
    freedBytes: number;
    errors: number;
    detail: string[];
    sections: string[];
    error?: string;
}
/**
 * 清理可重建缓存（tmp / 市场缓存 / 市场工作副本）。
 *
 * 硬边界（与路由 `/disk-usage/cleanup` 同源）：
 *  - 候选集只有**可重建区**；`snapshots` 与 `sync` 永不在候选集内；
 *  - **只有用户显式勾选 expired-exports 才碰导出产物**，且永远只按保留期（绝不「立即清空」）；
 *  - 不做 SAFE MODE / 环境锁门（本动作不写配置、不碰会话字节），但绝不越界删别的目录。
 */
export declare function cleanupDisk(dataDir: string, exportsDir: string, selection: {
    caches: boolean;
    expiredExports: boolean;
}): Promise<CleanupOutcome>;
export interface RecoverLockOutcome {
    ok: boolean;
    removed: boolean;
    state: string;
    detail: string;
}
/**
 * 回收残留环境锁（**显式动作**，与 `recover-stale-lock` 同一实现）。
 *
 * 绝不自动、绝不放宽：只有 `inspectLockState` 确证 stale（或崩溃残留无有效 owner）才动；
 * 活锁一律拒绝（判据在 `EnvironmentLockManager.recoverStaleLock` 内部二次验证）。
 */
export declare function recoverStaleEnvironmentLock(locksDir: string, dataDir: string): Promise<RecoverLockOutcome>;
/**
 * 救急台要能回答「DSH 起不来了，我还能不能把它起回来」：
 *  - **列档案**：复用 `DshProfileManager`（纯文件读，与宿主/CLI 同一实现）；
 *  - **启动实例**：复用 `DshProfileLauncher`（挑空闲端口 → detached spawn → 抓带 token 的认证 URL → 探活）；
 *  - **停止实例**：先按**台账**（本插件启动的）停，找不到再看**心跳**（手动 `dsh web` 起来的）——
 *    两个来源缺一不可：只认台账会漏掉手动实例（真机 bug：同名能反复启动）。
 *
 * 三条硬约束（与宿主 profile 路由同源）：
 *  ① `desktop` 是 Electron 独占档案 → 一律按 `managedProfile` 拒绝（普通 CLI 对它会直接报错退出）；
 *  ② 非 web 形态不可启动（headless/generic spawn 出去是用户看不见的进程）；
 *  ③ **绝不静默**：每个失败码都带原因，启动失败附子进程日志尾部。
 */
export interface ProfileRow {
    name: string;
    shape: string;
    bundles: number;
    dependencies: number;
    hasNodeModules: boolean;
    patchEntryCount: number;
    updatedAtMs: number | null;
    dshVersion: string | null;
    sessionFormatVersion: number | null;
    /** 是否可启动（web 形态 + 非 Electron 独占档案 + 当前没有实例） */
    launchable: boolean;
    launchBlockedReason?: string;
    /** 本插件台账里的实例（有则说明是我们启动的） */
    owned: boolean;
    /** 台账 ∪ 心跳表明有实例在跑（含手动启动的） */
    running: boolean;
    port: number | null;
    /** 台账里带认证 token 的 URL（只有本插件启动的才有） */
    url: string | null;
    pid: number | null;
}
export interface ProfilesOutcome {
    ok: boolean;
    profilesDir: string;
    rows: ProfileRow[];
    /** 台账/心跳读取失败的原因（页面必须显示） */
    errors: string[];
}
/** 列档案 + 实例状态（台账 ∪ 心跳；零写入 —— 只读 launches.json 与 running/）。 */
export declare function readProfiles(paths: RescuePaths): ProfilesOutcome;
export interface LaunchOutcome {
    ok: boolean;
    /** started / managedProfile / notLaunchable / alreadyRunning / launcherUnavailable / launchFailed / notFound */
    code: string;
    message: string;
    url?: string;
    port?: number;
    pid?: number;
    logFile?: string;
    /** 就绪/URL 的告警（notReady / urlNotFound），如实回传 */
    warnings: string[];
}
/** 启动某个档案的独立实例（与宿主「启动」按钮同一实现）。 */
export declare function launchProfile(paths: RescuePaths, name: string): Promise<LaunchOutcome>;
export interface StopOutcome {
    ok: boolean;
    code: string;
    message: string;
    /** graceful / killed / already-stopped */
    result?: string;
}
/** 停止实例：先台账（本插件启动的），再心跳（手动启动的）。都找不到 → notRunning。 */
export declare function stopProfile(paths: RescuePaths, name: string): Promise<StopOutcome>;
export interface UnlockOutcome {
    ok: boolean;
    /** 失败码：not-encrypted / bad-password / tampered / unsupported / not-found / io-error */
    code: string;
    message: string;
    /** 成功时的清单（只读，绝不回传文件内容） */
    entries?: Array<{
        path: string;
        sizeBytes: number;
    }>;
    entryCount?: number;
    totalBytes?: number;
    /** 明文 ZIP 是否被落盘（恒 false —— 这里的实现从不写盘，字段用于自证） */
    plaintextWritten?: false;
}
/**
 * 解锁一个**加密容器备份**（DCA1）并列出其内容清单（**零写入**）。
 *
 * 三条硬约束：
 *  ① 明文 ZIP **只在进程内存**里存在（不落盘、不进日志、不回传内容），用完即弃；
 *  ② 失败码可判别（not-encrypted / bad-password / tampered / unsupported），页面据此给不同指引；
 *  ③ 只处理「导出目录里确实存在的那个文件名」（与 /verify 同源），不解析用户给的路径 → 无目录穿越。
 */
export declare function unlockEncryptedBackup(exportsDir: string, fileName: string, password: string): Promise<UnlockOutcome>;
export interface RestorePlanView {
    ok: boolean;
    code: string;
    message: string;
    snapshotId?: string;
    createdAt?: string;
    sourceZip?: string;
    pluginBaselineConfirmed?: boolean;
    /** 逐条动作（页面渲染；kind/target/detail 直接来自 core 的 RestorePlan） */
    actions?: Array<{
        kind: string;
        description: string;
        target?: string;
        detail?: string;
        manualHint?: string;
        dangerous: boolean;
    }>;
    summary?: Record<string, number>;
}
/**
 * 取某个快照的**恢复计划**（只读；与 CLI \`restore --dry-run\` 同一实现）。
 *
 * 与 CLI 完全同源：\`planRestore\` + 同一个 \`snapshotsRoot\` 校验（存在/READY/manifest/blob-hash/symlink/provenance）。
 */
export declare function planSnapshotRestore(paths: RescuePaths, snapshotId: string): Promise<RestorePlanView>;
export interface RestoreRunOutcome {
    ok: boolean;
    code: string;
    message: string;
    restored?: string[];
    removedPlugins?: string[];
    manualHints?: string[];
    failed?: Array<{
        item: string;
        reason: string;
    }>;
    skipped?: string[];
}
/**
 * 执行快照恢复（**destructive**：会覆盖 $DSH_HOME 文件、删除文件、卸载插件）。
 *
 * 与 CLI 同源：执行前过 \`checkWriteGates\`（SAFE MODE → 残留锁 → DSH 未运行），
 * 覆盖前由 core 复制到 \`<snapshotDir>/pre-restore/\`（可人工反悔），并在恢复后刷新工作区登记序号。
 */
export declare function runSnapshotRestore(paths: RescuePaths, snapshotId: string): Promise<RestoreRunOutcome>;
export interface ExportOutcome {
    ok: boolean;
    code: string;
    message: string;
    outPath?: string;
    entryCount?: number;
    sections?: Array<{
        sectionId: string;
        label: string;
        entryCount: number;
        excludedCount: number;
        risk?: string;
    }>;
    warnings?: string[];
    /** 离线**不可收集**的分区（必须如实列出，绝不假装导出成功） */
    unavailableSections?: string[];
}
/**
 * 离线文件级导出（与 CLI \`backup\` 同一实现：collectBackupEntries → buildChecksums/manifest → writeZip）。
 *
 * 只打包**离线可直读**的文件类分区；结构化分区读不到就不进归档（宁可如实少导，也不给假备份）。
 * 文件落在导出目录，命名与 CLI 一致（自动去重，绝不覆盖既有文件）。
 */
export declare function exportOfflineBackup(paths: RescuePaths, sections: readonly string[]): Promise<ExportOutcome>;
/** 离线默认可导出的分区（页面渲染勾选项）。 */
export declare function defaultExportSections(): Promise<string[]>;
export interface ReinstallPlanView {
    ok: boolean;
    code: string;
    message: string;
    version?: string;
    wipeConfig?: boolean;
    steps?: Array<{
        label: string;
        command: string;
        dangerous: boolean;
    }>;
    /** 当前已安装版本（探测不到 → null：按 fail-closed 不允许继续） */
    currentVersion?: string | null;
}
/** 生成重装计划（只读；与 CLI \`reinstall --dry-run\` 同一实现）。 */
export declare function planDshReinstall(selection: readonly string[], version: string, exec: (cmd: string) => Promise<string>): Promise<ReinstallPlanView>;
export interface ReinstallRunOutcome {
    ok: boolean;
    code: string;
    message: string;
    executed?: string[];
    failed?: Array<{
        label: string;
        command: string;
        reason: string;
    }>;
    recoveryPointWritten?: boolean;
}
/**
 * 执行重装（**最高危**：卸载全局包 + 清缓存，勾选数据类还会清 ~/.dsh）。
 *
 * 与 CLI 同源的安全序列（一步都不能省）：
 *  ① SAFE MODE 门 + 环境锁（\`runWithMutationLock\`）；
 *  ② program 步前先探测旧版本，探测不到 → fail-closed 不执行；
 *  ③ 写 durable recovery point 成功后才跑第一条命令；
 *  ④ 逐条执行、逐条记录结果（失败不静默）。
 */
export declare function runDshReinstall(paths: RescuePaths, selection: readonly string[], version: string, exec: (cmd: string) => Promise<string>): Promise<ReinstallRunOutcome>;
