/**
 * 路由组共享的纯工具与请求体校验（route support）。
 *
 * 为什么单独一层：这些函数原先定义在 `src/index.ts`（宿主组合根），而
 * `src/routes/*.ts` 的组文件反向 import 组合根取值 —— 形成「入口 → routes → 组文件 → 入口」
 * 的运行时 import 环（13 文件 SCC）。把**不依赖组合根状态**的纯函数下沉到本模块后，
 * 依赖方向变成单向：`index.ts → routes/route-support.ts` 与 `routes/*.ts → route-support.ts`，
 * 组文件不再 import 组合根（`tests/architecture-boundaries.test.ts` 有对应断言）。
 *
 * 新增约定：只放**纯函数 / 常量 / 小型执行器装配**，绝不放需要 ctx/host 装配时序的东西；
 * 本模块不得 import `../index.ts`（否则环又回来了）。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { RouteError } from './kit.ts';
import type { MsgFunc } from '../core/messages.ts';
import type { SectionId } from '../schema/types.ts';
import type { HostContext, ImportPlan, PlanItemKind } from '../core/types.ts';
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials';
import type { RestoreActionKind, RestorePlan, RestoreReport } from '../core/restore.ts';
import type { RestoreResumeHint } from '../core/restore-resume.ts';
import type { RestoreJournalPort } from '../core/restore-wal.ts';
import type { SyncConfig, SyncTransportType } from '../sync/sync-config.ts';
import type { AutosyncAutoApplyTier, AutosyncConflictPolicy, AutosyncInterval, AutosyncRunStatus } from '../sync/autosync-config.ts';
export { SYNC_CREDENTIAL_REF, SYNC_DECRYPT_PASSWORD_REF_PREFIX, SYNC_ENCRYPT_PASSWORD_REF_PREFIX, SYNC_WEBDAV_CREDENTIAL_REF, scopedSyncRef, syncPasswordRef, syncScopeOrDefault, } from '../sync/sync-scope.ts';
/**
 * 档案路由的错误响应：engine 的 DshProfileError 带 code（UI 据此映射本地化文案，
 * 不显示裸英文码）；其它异常按 500 处理。
 */
export declare function writeProfileError(res: ServerResponse, error: unknown): void;
/** Stream a raw request body to a file, enforcing a byte cap. */
export declare function writeRequestBodyToFile(req: IncomingMessage, dest: string, maxBytes: number): Promise<number>;
export declare function safeCredentialRef(ref: string): any;
export declare const credentialRef: typeof safeCredentialRef;
/** Controlled staging roots guard. */
export declare function isControlledPath(target: string, roots: string[]): boolean;
/** 导出/导入执行超时（ms）。正常导出秒级完成；此上限只兜底「宿主卡死」场景，
 * 让客户端拿到明确错误而不是永远停在进度条。 */
export declare const ROUTE_TIMEOUT_MS: number;
/** 带超时的 Promise：超时以明确错误拒绝（promise 自身由调用方负责，此处只计时）。 */
export declare function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T>;
/** Decrypt an encrypted backup's credentials (in-memory only; undefined when not applicable). */
export declare function tryDecryptCredentials(zipPath: string, password: string | undefined): Promise<Map<string, string> | undefined>;
/** 解密错误 → 用户可读文本：BAD_PASSWORD 只报「密码错误」（不泄内部细节），其余原文 */
export declare function decryptErrorText(error: unknown, msg: MsgFunc): string;
/** 同步路由可预期的请求级错误（status 缺省 400；引擎/传输失败走 500）。
 * 继承 kit 的 RouteError → 错误→HTTP 映射全仓只有 writeRouteError 一份。 */
export declare class SyncRouteError extends RouteError {
    /** code：稳定机器码（如 cloud.endpointRequired），由 UI 映射进字典；缺省 = 无码。 */
    constructor(message: string, status?: number, code?: string);
}
/** 同步路由错误出口：等价于 kit 的统一出口（SyncRouteError 是 RouteError 子类，status 保真）。 */
export declare function writeSyncRouteError(res: ServerResponse, error: unknown): void;
/** POST /restore 请求体校验（纯函数；snapshotId 拒绝路径分隔符防 join 越界）。 */
export type BuildRestoreBodyResult = {
    ok: true;
    value: {
        snapshotId: string;
        dryRun: boolean;
        planFingerprint?: string;
    };
} | {
    ok: false;
    error: string;
};
export declare function buildRestoreBody(body: unknown): BuildRestoreBodyResult;
export type BuildFileDiffBodyResult = {
    ok: true;
    value: {
        snapshotId: string;
        kind: RestoreActionKind;
        target?: string;
        blobPath?: string;
    };
} | {
    ok: false;
    error: string;
};
/**
 * POST /snapshots/file-diff 请求体校验（纯函数）。
 * target / blobPath 只是候选路径：真正的越界拦截在 core 的 homeAbs / blobAbs 护栏
 * （本函数不做路径规范化，避免两处规则漂移）。
 */
export declare function buildFileDiffBody(body: unknown): BuildFileDiffBodyResult;
/**
 * 解析「一键上传/我的配置」请求体的 form 字段：仅 { name, description?, categories?, mode? }。
 * name 必填（非空字符串，trim 后取）；description 可选字符串；categories 可选字符串数组；
 * mode 可选 'migrate' | 'share'（F6 分享模式，非法值忽略→缺省 migrate）。非法 → null（调用方返回 400）。
 */
export declare function parseMeForm(raw: unknown): {
    name: string;
    id?: string;
    description?: string;
    categories?: string[];
    mode?: 'migrate' | 'share';
} | null;
/**
 * GitHub 凭据「缺失或失效」判定（issue #29）：`no_token`（credentials 里从未配置 token）与
 * `unauthorized`（401，token 过期/被撤销）对用户都是同一个「未登录」，必须走同一分支——
 * 否则 `no_token` 会落到 500，UI 把「未登录」渲染成「登录状态读取失败」的误导性横幅。
 * 其余分类（network_error / rate_limited / server_error / validation_failed / fork_timeout…）
 * 是真实故障，仍按 500 暴露，绝不伪装成「未登录」。
 */
export declare function isGitHubAuthMissing(error: unknown): boolean;
/**
 * 会话体检的「下一步」建议（**可复制命令**；给应用内修不了的那些损坏类别）。
 *
 * 为什么仍然需要这条出路：应用内修复（T8）只覆盖「重放重复行」这一**能从字节证明**的零损失类；
 * 其余类别（seq 空洞 / 不可解析行 / 容器非法 / 格式超前）必须离线进行（DSH 运行中改写会话会让
 * 它下次启动直接报 corrupt session log）。
 * 界面给不出的动作，就用可复制命令如实交代。
 */
export declare function sessionHealthNextSteps(rowCount: number, summary: {
    bySeverity: Record<string, number>;
    deepUnverified: number;
}): {
    commands: {
        command: string;
        reason: string;
    }[];
    notes: string[];
};
/**
 * 解析 push 请求体的分区选择（sections）——「高级/自定义导出」模式负载。
 * - 缺省 / 非数组 / 空数组 → undefined（= 全部 portable 推荐分区，即「默认/快速导出」模式）；
 * - 元素必须是 knownIds（已知 adapter id）中的非空字符串，非法 → SyncRouteError（不静默吞错）；
 * - 返回去重后的数组（保持原顺序；重复分区不做重复导出）。
 */
export declare function extractSyncSections(body: Record<string, unknown>, knownIds: ReadonlySet<string>): SectionId[] | undefined;
/**
 * push 请求体的 sessions 选项（历史会话「最新 N 个」上限）。
 *
 * 语义：**只有显式提供该对象**，sessions 才被允许进入同步通道（engine 的 opt-in 判定）；
 * 形状非法（数组 / 标量 / 缺对象）→ undefined = 与其它 deviceSpecific 分区一样跳过并告警。
 * limit 非法（非整数 / 负数）→ 归一化为宿主缺省（5）；超大 → 钳制。
 */
export declare function extractSyncSessions(body: Record<string, unknown>): {
    limit?: number;
    include?: string[];
} | undefined;
/** 需要人工决策的 PlanItemKind（一键同步 needsReview 判定 + 逐项确认标记）。
 * 注意：'Install'（安装插件）不在此列 —— 同步拉取差异时插件按「自动安装」处理：
 * 默认采纳、不逐项展示、无需手动选择（product requirement）。
 * issue #35：'Warning' 必须**可见**——它承载「本次同步会剔除哪些无法满足的声明」这类
 * 改变配置语义的信息；此前非决策项默认自动采用且不展示，用户只看到「同步成功」。 */
export declare const REVIEW_KINDS: ReadonlySet<PlanItemKind>;
/**
 * issue #35：会**改变工具链行为**的项 —— 只有 pnpm-workspace.yaml 在本次同步中
 * 移除了无法满足的 patchedDependencies 声明时，才带 detail。
 * 这类项此前属「非冲突项 → 自动采用且不展示」，用户即使已知风险也无法否决
 * （issue #35 正是这条自动采用把目标机 pnpm 弄坏的）。
 * 现在：进确认列表、可见、可取消；但**默认仍采用**（我们的 sanitize 结果严格更安全，
 * 默认不采用反而会静默丢掉 allowBuilds / 冷静期配置）。
 * 注意：与客户端 sync-view.ts 的同名判定必须保持一致（两侧刻意重复，避免跨端 import）。
 */
export declare function isToolchainChangeItem(item: {
    itemId: string;
    detail?: string | undefined;
}): boolean;
/** 一键同步差异项（client 逐项确认的最小契约；与 sync-api.ts SyncConfirmItem 对齐） */
export interface SyncConfirmItem {
    itemId: string;
    adapter: SectionId;
    kind: PlanItemKind;
    description: string;
    /** 变更详情（如插件「当前 1.1 vs 导入 1.6」），与导入恢复向导展示一致 */
    detail?: string;
    severity: 'info' | 'warning' | 'error';
    defaultAdopt: boolean;
    adopt: boolean;
    conflict?: {
        path: string;
        kind: 'key' | 'file' | 'section';
        local?: unknown;
        remote?: unknown;
        ancestor?: unknown;
        diff?: string;
    };
    target?: {
        adapter: SectionId;
        ref: string;
    };
}
/** 把 ImportPlan 投影为逐项可确认的差异项（默认采用 Create/Update/Install；人工项默认不采用）。 */
export declare function planToConfirmItems(plan: ImportPlan): SyncConfirmItem[];
/** autosync interval 类型守卫 */
export declare function isAutosyncInterval(v: unknown): v is AutosyncInterval;
/** 自动同步状态响应（GET /sync/autosync 与 POST 回填；读盘计算 elapsedMs）。 */
export declare function buildAutosyncStatus(dir: string, channel: SyncTransportType): Promise<AutosyncStatusResponse>;
/** 全部通道的自动同步状态（status 路由一次返回；UI 按当前 tab 取对应通道）。 */
export declare function buildAutosyncStatusByChannel(dir: string): Promise<Record<SyncTransportType, AutosyncStatusResponse>>;
/** GET /sync/autosync 响应类型（与 sync-api.ts AutosyncStatusResponse 对齐） */
export interface AutosyncStatusResponse {
    enabled: boolean;
    interval: AutosyncInterval;
    /** 真·自动同步：本地改动即时触发（缺省 true） */
    realtime: boolean;
    /** realtime 下的远端轮询间隔（ms） */
    remoteCheckMs: number;
    /** 自动应用的最高风险等级（缺省 medium：plugins/mcp 也自动落盘） */
    autoApplyTier: AutosyncAutoApplyTier;
    /** 双侧都改时的策略（缺省 local：保留本机并推上去） */
    conflictPolicy: AutosyncConflictPolicy;
    lastRunAt?: string;
    lastRunStatus?: AutosyncRunStatus;
    lastRunMessage?: string;
    /** issue #79：本轮跳过的**结构化原因码**（界面按码取字典；语言在渲染那一刻解析） */
    lastRunSkipReason?: string;
    /** 跳过涉及的分区数（当前仅 conflict：远端另有 N 个分区待确认） */
    lastRunSkipCount?: number;
    consecutiveFailures: number;
    elapsedMs: number;
    lastRunHistoryId?: string;
}
/**
 * 宿主侧恢复动作执行器（真实执行 restore 计划）：
 * 整文件/文件还原与删除走 ctx.fs（home-relative facade，越界由 facade 再拦一道），
 * blob 读取与 pre-restore 副本走快照目录（node fs），插件卸载走官方 dsh plugin CLI。
 */
export interface RestoreExecutor {
    /** 读快照目录内 blob（相对 snapshotDir） */
    readBlob(blobPath: string): Promise<Uint8Array>;
    /** 把当前 home 文件内容复制到 <snapshotDir>/pre-restore/<本次 attempt>/（覆盖/删除前的双保险） */
    savePreRestore(relPath: string): Promise<void>;
    /** 本次执行的 pre-restore attempt 目录（未发生任何备份 → null）；用于报告如实回填 */
    preRestoreDir?(): Promise<string | null>;
    existsHome(relPath: string): Promise<boolean>;
    writeHome(relPath: string, data: Uint8Array): Promise<void>;
    removeHome(relPath: string): Promise<void>;
    /** 卸载插件（官方通道）；失败返回 { ok:false, message } */
    uninstallPlugin(name: string): Promise<{
        ok: boolean;
        message?: string;
    }>;
    /** 装回跟远端删掉的插件（官方通道，issue 132 的反向）；失败返回 { ok:false, message } */
    installPlugin(name: string, target: string): Promise<{
        ok: boolean;
        message?: string;
    }>;
    /**
     * home 相对路径 → 磁盘绝对路径（逐动作 WAL 用：journal 的 ref 必须是绝对路径，
     * reconcile 的 verifyStepFingerprint 直接拿它读盘算指纹）。缺省 = 不登记 WAL。
     */
    absPath?(relPath: string): string;
}
/**
 * 按计划执行恢复动作（纯执行器；逐项 try/catch 不拖垮其余），
 * 返回与 CLI 一致的诚实报告。顺序 = 计划顺序（整文件 → 插件 → file 补偿）。
 * @param onAction - 每项动作执行回调（宿主路由埋点：更新 RunRegistry 进度；
 *   index/1-based、total=计划动作数、detail=动作描述）
 */
export declare function executeRestorePlan(plan: RestorePlan, exec: RestoreExecutor, onAction?: (info: {
    index: number;
    total: number;
    detail: string;
}) => void, journal?: RestoreJournalPort, resumeHint?: RestoreResumeHint): Promise<RestoreReport>;
/** 宿主 restore 执行器装配：ctx.fs（home-relative）+ 快照目录（node fs）+ runDshPlugin。 */
export declare function makeRestoreExecutor(snapshotDir: string, host: HostContext, profile: string): RestoreExecutor;
/**
 * parseSyncBody 的凭据写入依赖（只用到 set；测试可注入内存 mock）。
 */
export interface ParseSyncBodyDeps {
    credentials: Pick<CredentialProvider, 'set'>;
    /**
     * per-profile 作用域：只决定**写哪个凭据槽位**，不影响请求体形状与返回值。
     * 缺省 = 历史（不带后缀）槽位名 —— 单档案用户与既有测试的行为逐字不变。
     */
    scope?: SyncRefScope;
}
/** 把历史槽位名映射到当前档案的最小接口（`SyncScope` 结构上即满足）。 */
export interface SyncRefScope {
    /** 本档案的 git / GitHub token 槽位 */
    tokenRef: string;
    /** 本档案的 WebDAV 口令槽位 */
    webdavPasswordRef: string;
    /** 历史槽位名 → 本档案槽位名（云端点密钥等按需映射） */
    scopeRef(ref: string): string;
}
/**
 * 解析同步请求体，按 transport 分支返回归一化的 SyncConfig（可辨识联合，schemaVersion=2）。
 * 请求体形状（flat，M4 契约）：
 * - git:    { transport:'git', repoUrl, subdir?, token? } —— subdir = 仓库内子目录前缀（issue #131）；
 *   token 非空写 SYNC_CREDENTIAL_REF；
 *   git 可执行文件固定使用系统 PATH 中的 git（不再接受自定义 gitBin）。
 * - webdav: { transport:'webdav', url, username?, password? } —— password 非空写 SYNC_WEBDAV_CREDENTIAL_REF。
 * 返回值不含任何 secret（password/token 只进 credentials，永不回传/落同步文件）。
 */
export declare function parseSyncBody(body: Record<string, unknown>, deps: ParseSyncBodyDeps): Promise<SyncConfig>;
/** 由 SyncConfig 合成 WebDAV 通道 baseUrl（webdav.url，尾部规范化带 '/'；git 通道返回 ''）。 */
export declare function webdavBaseUrl(cfg: SyncConfig): string;
/**
 * 补全 webdav 配置缺失的 username（从持久化配置回填；纯函数，不修改入参）。
 * 语义与 password 一致：请求未带 username（表单留空/挂载自动加载）→ 沿用已保存的值；
 * 请求显式带 username → 原样保留（用户新输入优先）。非 webdav / 无持久化 → 原样返回。
 */
export declare function mergePersistedWebDavUsername(cfg: SyncConfig, persisted: SyncConfig | null): SyncConfig;
