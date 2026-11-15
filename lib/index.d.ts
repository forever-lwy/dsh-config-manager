/**
 * dsh-config-manager — host half.
 *
 * Mounts the backup / export / import engine (src/core Exporter + Importer
 * three-stage flow) behind the `/api/dsh-config-manager/*` route family that
 * the browser half (`./client`) calls, and wraps the real DSH host services
 * into the engine's `HostContext` facade (src/core/types.ts):
 *
 *   ctx.settings           -> SettingsFacade      (@deepseek-ai/dsh-settings)
 *   ctx.credentials        -> CredentialsFacade   (@deepseek-ai/dsh-credentials)
 *   ctx.plugins            -> PluginsFacade       (官方 dsh plugin CLI 通道 + profile 文件，
 *                                                  见 src/core/plugin-cli.ts)
 *   ctx.workspaceRegistry  -> WorkspaceFacade     (@deepseek-ai/dsh-workspace)
 *   ~/.dsh/cordis.patch.yml-> PatchFileFacade     (js-yaml; home 层 + profiles/<p>/ 层)
 *   ctx.skills             -> SkillStoreFacade    (@deepseek-ai/dsh-skill 注册表，技能备份用)
 *   $DSH_HOME files        -> FileSystemFacade    (node:fs, home-relative)
 *   resolveDshHome()       -> homeDir             (@deepseek-ai/dsh-home-paths)
 *
 * Security posture (mirrors the verified @linxin666/dsh-ssh@0.1.12 routes):
 *  - the trust fence is installed once in the kit (loopback/same-origin → 403, method
 *    allowlist → 405); it — not the DSH cookie — is the auth boundary: DEVELOPERS.md §认证边界;
 *  - uploads/exported ZIPs are staged under $DSH_HOME/dsh-config-manager/{tmp,exports}
 *    and every `path`/`zipPath` reference is confined to those roots;
 *  - the encryption password is in-memory only: used to derive the AES-256-GCM
 *    key for secrets.enc, never written to any file, manifest, or log;
 *  - the import execute endpoint refuses to run without `confirm: true`
 *    (core ImportNotConfirmedError safety valve).
 *
 * Optional services are read with ctx.get() at call time (never injected), so
 * the engine keeps working in profiles without the web-only workspace
 * service; hard dependencies are the core `settings`/`credentials` services
 * present in every profile. Plugin install/list no longer depend on the
 * web-only pluginMarketplace/pluginInventory services: both go through the
 * official `dsh plugin --profile <name>` CLI (pnpm forwarder) and read the
 * profile's package.json / node_modules directly.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { Importer } from './core/index.ts';
import { DshProfileLauncher, DshProfileManager, DshProfileRuntimeRegistry } from './profiles/index.ts';
import { type BootSafetyReport } from './core/boot-safety.ts';
import { type RecoveryExecutorFns, type RecoveryOrchestrator } from './core/recovery-orchestrator.ts';
import { RunRegistry } from './core/run-registry.ts';
import { type MsgFunc } from './core/messages.ts';
import { runDshPlugin } from './core/plugin-cli.ts';
import { type ConfigAdapter, type CredentialsFacade, type FileSystemFacade, type HostContext, type PatchFileFacade, type PluginInfo, type PluginsFacade, type Portability, type SessionMoveResult, type SessionParentRelation, type SessionRewriteResult, type SessionStoreFacade, type SettingsFacade, type SkillStoreFacade, type WorkspaceFacade } from './core/types.ts';
import { type SelfUpdateOutcome } from './core/self-update.ts';
export { DshPatchFileFacade } from './utils/dsh-patch-file.ts';
import { type SessionMetaIndex } from './core/session-meta.ts';
import { type MutationLockContext, type MutationLockPort } from './utils/env-lock.ts';
import { type RecursiveListing } from './utils/recursive-walk.ts';
import type { JournalRunContext } from './core/phase3-host.ts';
import { type GitWorkDirFacts } from './sync/git/git-transport.ts';
import { DeviceFlowStore, GitHubAuthClient } from './sync/github-auth.ts';
import { SyncEngine } from './sync/sync-engine.ts';
import { SyncSessionStore } from './sync/sync-session.ts';
import { AutoSyncScheduler } from './sync/autosync-scheduler.ts';
import { BackupScheduler } from './sync/backup-scheduler.ts';
import { MigrationStore, type MigrationKind, type MigrationResult } from './core/migration-history.ts';
import type { SyncConfig, SyncTransportType } from './sync/sync-config.ts';
import type { SyncSelection, SyncSelectionMode } from './sync/sync-selection.ts';
import { GitMarketReader } from './market/reader.ts';
import type { MarketIndex, MarketSummary } from './market/types.ts';
import { GitHubAuthRest } from './market/github-repos.ts';
import { MyRepoService } from './market/my-repo.ts';
import { StarCache } from './market/star-cache.ts';
import { type ConfiguredSecretPatterns } from './security/secret-scanner.ts';
import type { SectionId } from './schema/types.ts';
import { type Logger } from './utils/logger.ts';
import { type SyncScope } from './sync/sync-scope.ts';
export { ROUTE_TIMEOUT_MS, REVIEW_KINDS, SYNC_CREDENTIAL_REF, SYNC_ENCRYPT_PASSWORD_REF_PREFIX, SYNC_DECRYPT_PASSWORD_REF_PREFIX, SYNC_WEBDAV_CREDENTIAL_REF, SyncRouteError, buildAutosyncStatus, buildAutosyncStatusByChannel, buildFileDiffBody, buildRestoreBody, credentialRef, decryptErrorText, executeRestorePlan, extractSyncSections, extractSyncSessions, isAutosyncInterval, isControlledPath, isGitHubAuthMissing, isToolchainChangeItem, makeRestoreExecutor, parseMeForm, planToConfirmItems, safeCredentialRef, sessionHealthNextSteps, syncPasswordRef, tryDecryptCredentials, withTimeout, writeProfileError, writeRequestBodyToFile, writeSyncRouteError } from './routes/route-support.ts';
export type { AutosyncStatusResponse, BuildFileDiffBodyResult, BuildRestoreBodyResult, RestoreExecutor, SyncConfirmItem } from './routes/route-support.ts';
/** Stable cordis plugin name — must match the cordis.patch.yml row id. */
export declare const name = "config-manager";
/** Services required before the engine can mount (present in every profile). */
export declare const inject: string[];
/** Plugin version, kept in sync with package.json ("version"). */
export declare const PLUGIN_VERSION = "0.9.1";
/**
 * Star 引导弹窗指向的 GitHub 仓库（用户引导点 Star 的目标）。
 * 与 package.json 的 repository 字段保持一致；界面不可改（硬编码，参照
 * 「一键上传」目标仓库先例）。仅在 GET /star-prompt 响应中返回，供弹窗按钮跳转。
 */
export declare const STAR_PROMPT_REPO_URL = "https://github.com/xiajiajun516/dsh-config-manager";
/**
 * 内置 GitHub OAuth App 的 client_id（「使用 GitHub 登录」device flow 缺省值）。
 * Client ID 是公开标识（GitHub 官方明确非机密）：内置后所有安装者开箱即用，
 * 无需各自注册/配置 OAuth App；token 仍按用户私有（各自授权、各自存 credentials）。
 * 插件配置的 githubClientId 优先于本默认值（换自有 App 时覆盖）。
 */
export declare const DEFAULT_GITHUB_CLIENT_ID = "Ov23liq4i7n8UsylGRfb";
/** Plugin config (composition entry); the loader applies it as-is. */
export interface Config {
    /** Master switch; defaults to true. */
    enabled?: boolean;
    /** Data root override; defaults to $DSH_HOME/dsh-config-manager. */
    dataDir?: string;
    /** 管理的 profile 名（插件依赖读写/安装目标）；缺省取启动参数 --profile，再缺省 'web'。 */
    profile?: string;
    /**
     * GitHub OAuth App 的 client_id（「使用 GitHub 登录」device flow）。
     * 缺省使用内置 DEFAULT_GITHUB_CLIENT_ID（公开标识，开箱即用）；
     * 显式配置可覆盖（换自有 OAuth App 时）。
     */
    githubClientId?: string;
    /**
     * GitHub OAuth App 的 client_secret（confidential app 必需；public app 可省略）。
     * 只存在于宿主进程：device flow 轮询时由宿主直接发送给 GitHub，绝不回传浏览器/日志。
     */
    githubClientSecret?: string;
    /**
     * pluginFiles 分区：额外白名单文件（相对 ~/.dsh 根的单文件名或子路径）。
     * 与默认白名单（dsh-ssh.json、pet.json）合并；用于精确指定要随导出携带的插件配置文件。
     */
    pluginFiles?: string[];
    /**
     * pluginFiles 分区：约定的插件配置目录（相对 ~/.dsh 根，如 'plugin-config'）。
     * 导出时递归收集该目录下所有文件（按相对 ~/.dsh 根的路径写回），实现「往目录放文件即自动随备份携带」。
     */
    pluginFilesDir?: string;
    /**
     * F2 个人隐私规则（对齐 dsh-packer config.personalPatterns）：个人化敏感字段名 /
     * 引用字段 / 值形状模式，由部署者注入（个人昵称、本机用户名等），不进开源代码。
     * 未配置时扫描器行为与默认完全一致。
     */
    personalPatterns?: ConfiguredSecretPatterns;
}
/**
 * 本文件保留的 7 条路由的路径（被源码级守卫按文件窗口钉住，见下方 routesList 注释）。
 *
 * 其余 75 条路由的路径**声明在各自的组文件里**（src/routes/*.ts 的 endpoint({ path, methods })）——
 * 新增一条 API 只需那一条声明，不再有「常量表 + 路由对象」两处要同步。
 */
export declare const API: {
    readonly status: '/api/dsh-config-manager/status';
    readonly export: '/api/dsh-config-manager/export';
    readonly exportPreview: '/api/dsh-config-manager/export-preview';
    readonly analyze: '/api/dsh-config-manager/analyze';
    readonly plan: '/api/dsh-config-manager/plan';
    readonly crash: '/api/dsh-config-manager/crash';
    readonly rescue: '/api/dsh-config-manager/rescue';
};
/**
 * 定位「本机 DSH」的候选 `@deepseek-ai/dsh/package.json`（只读，**顺序就是真伪顺序**）。
 *
 *  ① `profileContext.installAnchor` —— 拉起本宿主的那份 `@deepseek-ai/dsh/package.json`。
 *     Desktop 从 `app.asar` 内加载运行时（0.2.0-rc.2），**磁盘上其它任何位置都没有它**；
 *  ② 当前档案自己的依赖树 `<home>/profiles/<profile>/node_modules/...`；
 *  ③ `<home>/profiles/node_modules/...`（pnpm hoisted 树）与 <home>/profiles/web/...。
 *
 * 为什么不能用 ③ 打头（原实现的 bug）：那棵树是 web 档案装出来的 **hoisted 副本**，
 * 真机上它是 0.1.5-rc.1，而 Desktop 实际跑的是 0.2.0-rc.2 —— 「关于」页与导出 manifest
 * 的 DSH 版本因此整个报错版本号。会话格式版本（`resolveSessionFormatVersion`）共用同一份候选。
 */
export declare function dshPackageJsonCandidates(home: string, profile?: string, installAnchor?: string | null): string[];
/** 当前真正在跑的 DSH 版本（只读；候选顺序见 `dshPackageJsonCandidates`）。 */
export declare function resolveDshVersion(home: string, profile?: string, installAnchor?: string | null): string;
/** 包名 → patch 行 id slug（仿 marketplace ensureRow）：去 @、非法字符→-、连续-合并、去首尾-。 */
export declare function slugOf(name: string): string;
/** 某 patch 行（raw）是否激活了指定包名（兼容单行与 insert 块成员）。 */
export declare function patchRowActivates(raw: unknown, name: string): boolean;
/**
 * 非 bundle 插件安装成功后，幂等补 profile cordis.patch.yml 激活行
 * （{id: pm-<slug>, name: <pkg>}，仿 marketplace ensureRow）。bundle 包不写行
 * （CLI 的 reconcile 已维护 dsh.profile.bundles）。
 *
 * 第 4 参 `profile`（issue #71）：patch 的层身份是**相对 homeDir 的路径**，
 * 目标层 = `profiles/<profile>/cordis.patch.yml`。省略时按缺省档案名（web）—— 兼容旧调用方。
 */
export declare function ensureActivationRow(patchFile: PatchFileFacade, pkgDir: string, pkg: string, profile?: string): Promise<void>;
/**
 * Plugins facade：官方 dsh plugin CLI 通道（任何 profile 可用）+ profile 文件
 * 实时清单 + 非 bundle 插件激活行幂等补写。不再依赖 web 专用
 * pluginMarketplace / pluginInventory 服务。
 *
 * 导出 + runner 可注入：M5 单测用 mock runner 验证「无 marketplace 时 install
 * 走 CLI 通道」的行为契约，不触发真实子进程；生产路径默认参数不变。
 */
export declare class DshPluginsFacade implements PluginsFacade {
    private readonly homeDir;
    private readonly profile;
    private readonly patchFile;
    private readonly msg;
    private readonly runner;
    constructor(homeDir: string, profile: string, patchFile: PatchFileFacade, runner?: typeof runDshPlugin, msg?: MsgFunc);
    listInstalled(): Promise<PluginInfo[]>;
    install(pkg: string, target?: string, signal?: AbortSignal): Promise<{
        needsRestart: boolean;
        installedVersion?: string | null;
    }>;
    /** 卸载插件（issue #132）：走官方 CLI `dsh plugin remove`，不自己改 package.json、也不补对账。 */
    uninstall(pkg: string, signal?: AbortSignal): Promise<{
        needsRestart: boolean;
    }>;
}
/**
 * 宿主 `sessionPersistence` 的 API 形状（**按 API 形状探测，绝不按 DSH 版本号猜**）。
 *
 * 为什么必须探测：DSH 的会话存储换过基线 —— 新基线有 `open()`（handle 形态，`list()` 的元素是
 * 带 `header` 的 snapshot 对象），旧基线只有服务级的 `readFrom()` / `append()`（header 字段
 * **平铺在元素上**）。本插件只读 `list()` 的结果，而两种形状里 header 的位置不同。
 *
 * 真机事故级的后果（F-1）：按写死的形状读，在另一种宿主上「一个都匹配不上」——
 * `reindexSessionHeader` 恒 false、`parentRelations` 退化成**空 Map**（而空 Map 还会进 5 s 的
 * TTL 缓存），于是「导出子代理会话时连带父对话」这条已经修好的能力在旧宿主上**静默失效**。
 * 参照竞品 dsh-claude-move 的 isSessionHandle / storedSessionIdOf（index.mjs:88-154）。
 */
export type SessionPersistenceShape = 'handle' | 'legacy' | 'unknown';
/** 会话存储**列举**接口的最小形状（两种基线都有 `list()`；本插件只读它，不写会话）。 */
export interface SessionListService {
    list(): Promise<readonly unknown[]>;
}
/** 按 API 形状探测会话存储基线：有 `open` → handle；只有 `readFrom`/`append` → legacy；都没有 → unknown。 */
export declare function sessionPersistenceShapeOf(service: unknown): SessionPersistenceShape;
/** 归一后的列举元素 header 视图（只含本插件用到的字段）。 */
export interface ListedSessionView {
    id: string;
    /** 父会话 id（磁盘 header 名 `parentSession`；DSH 的 RPC 投影名 `parentSessionId` 一并认） */
    parent?: string;
    /** header.origin（'subagent' = 子代理会话）——原样保留，不在这里做筛选 */
    origin: unknown;
    /**
     * **原样的 header 对象**（handle 形态 = `element.header`；legacy 形态 = 元素自身）。
     * 回传给 DSH `WorkspaceRegistry.indexHeader()` 时必须用它 —— 绝不自己造一个 header。
     */
    raw: unknown;
}
/**
 * 把一个列举元素归一成 header 视图（**两种基线形状都认**）。
 *
 * 认不出 id → undefined：这是「读侧兼容失败」的唯一信号，调用方必须**响亮处理**
 * （记日志 / 抛错），绝不当成「本机没有会话」。
 */
export declare function normalizeListedSession(element: unknown): ListedSessionView | undefined;
/** 归位成功的两种情形（都经 `list()` 复核过）。 */
export type WorkspaceAttachSuccessReason = 
/** 官方 fork 已经归位（能按成员/血缘解析到工作区）——本兜底只补复核，不重复写。 */
'already-attached'
/** 本兜底真的写成功且复核通过。 */
 | 'attached';
/**
 * 归位失败的具体理由（机器码）。
 *
 * 为什么必须区分而不是一个笼统的 `false`：真机现场「回退后子会话进未分组」长期不可见，
 * 根因之一就是 attach 失败被吞成布尔（无日志、无理由）。每一档都能单独定位：
 *  · registry-unavailable / registry-list-unavailable / registry-list-failed —— 服务缺失或形状不符；
 *  · attach-session-missing —— 工作区记录上**没有** `attachSession`（形状不符，未发起任何写）；
 *  · attach-rejected —— `attachSession` 真的抛错（目录不存在 / cwd 对不上 / 域未就绪）；
 *  · directory-missing —— `resolveByPath` 在 realpath 阶段拒绝，或回落档 realpath 失败（目录不存在）；
 *  · no-workspace-for-cwd —— 目录存在但不属于任何已注册工作区；
 *  · cwd-unavailable —— 读不到子会话 cwd（绝不猜路径）；
 *  · verify-failed —— 写调用没抛错，但 `list()` 复核不含该子会话（最终判据不通过，**不许报成功**）；
 *  · unexpected-error —— 其它未预期异常。
 */
export type WorkspaceAttachFailureReason = 'registry-unavailable' | 'registry-list-unavailable' | 'registry-list-failed' | 'attach-session-missing' | 'attach-rejected' | 'directory-missing' | 'no-workspace-for-cwd' | 'cwd-unavailable' | 'verify-failed' | 'unexpected-error';
/** 归位失败（`detail` 是技术细节：errno / 路径 / 形状码，供日志与排查，不是用户文案）。 */
export interface WorkspaceAttachFailure {
    ok: false;
    reason: WorkspaceAttachFailureReason;
    detail?: string;
}
/** 一次工作区归位的结果（成功/失败都带**具体**理由）。 */
export type WorkspaceAttachOutcome = {
    ok: true;
    reason: WorkspaceAttachSuccessReason;
    workspaceId?: string;
} | WorkspaceAttachFailure;
/** 归位失败时给调用方的 warning 串（稳定前缀 + 具体理由码）。 */
export declare const WORKSPACE_ATTACH_FAILED_PREFIX = "workspace-attach-failed";
/**
 * DSH 官方 fork 在「子会话已创建、但 `workspace.attachSession` 失败」时抛的错误码。
 *
 * 依据 DSH 源码：`dsh-api-session-controller/lib/index.js` L829-836 抛
 * `new RemoteError('session/workspace-attach-failed', …, { sessionId: childId, workspaceId })`。
 */
export declare const WORKSPACE_ATTACH_FAILED_ERROR_CODE = "session/workspace-attach-failed";
/**
 * 从官方 fork 的 `session/workspace-attach-failed` 错误里取回**已经创建好的子会话 id**。
 *
 * 字段名**不是猜的** —— DSH 自己的客户端就是这么取的（同款姿势）：
 * `dsh-api-session-controller/lib/client.js` L3013-3015 的 `workspaceAttachSessionId(error)`：
 *   `error.code === 'session/workspace-attach-failed' ? error.details.sessionId : undefined`
 * 错误类是 `dsh-typert-protocol/lib/index.js` L11-28 的 `RemoteError`（`code` + `details`；
 * DSH 明文规定「判别只按 code，never by instanceof」，故这里也只按 `code`，不 import 那门包）。
 *
 * 形状不符（不是对象 / code 不是这个 / 没有 details.sessionId / 空串）一律 undefined ——
 * 调用方据此**保持现状**报 fork-failed，绝不假装成功、也绝不猜别的字段名。
 */
export declare function workspaceAttachFailureChildId(error: unknown): string | undefined;
/**
 * 归位失败 → warning 串；成功 → undefined。
 *
 * 为什么是「前缀:理由码」而不是新字段：`RollbackForkSeam`（core/types.ts，本任务 scope 外）的返回
 * 形状只有 `{ childSessionId, warning? }`，warning 是**唯一**能把具体理由带到调用方的通道；
 * core 只判「非空」并落成 `rollback.guidance.sessionNotAttached`（界面如实上屏），
 * 前缀保持稳定以便既有 grep / 诊断脚本继续命中。
 */
export declare function workspaceAttachWarningOf(outcome: WorkspaceAttachOutcome): string | undefined;
/**
 * 目录同一性比较用的折叠（**只在 `resolveByPath` 拿不到时的回落档**使用）。
 *
 * 分隔符统一为 `/`；win32 大小写不敏感（Windows 路径大小写等价）。
 * 注意：本函数只比较**两侧都经 realpath 规范化**过的路径 —— 绝不拿「原样 cwd」与「规范 path」直接比，
 * 那正是真机 2026-10-12 的根因（工作区 path 经 `realpathNormalize`、会话头 cwd 是原样字符串）。
 */
export declare function foldWorkspacePath(value: string): string;
export declare class DshSessionStoreFacade implements SessionStoreFacade {
    private readonly ctx;
    /** DSH 缺省会话根（配置改过时只影响快路径命中率，慢路径仍正确） */
    private readonly root;
    /**
     * 插件数据根（`<DSH_HOME>/dsh-config-manager`）—— **只**用于归位失败的诊断落盘。
     * 权威状态仍在 DSH（工作区注册表 / 会话存储），这里绝不旁路写任何 DSH 数据。
     */
    private readonly dataDir;
    /**
     * 父子关系的短 TTL 缓存（见 `PARENT_RELATIONS_CACHE_TTL_MS`；同 key 并发合并成一次列举）。
     * F-1 后**只缓存成功结果**：列举失败/形状识别失败会让 `parentRelations()` 抛错，
     * 而 ttl-cache 的语义是「失败不缓存」→ 下一次调用立刻重试（行为见 utils/ttl-cache.ts）。
     */
    private readonly parentRelationsCache;
    /**
     * 宿主日志（F-1）：会话存储的形状异常/列举异常必须**响亮**（绝不退化成空结果），
     * 缺省不注入时用一个只输出 warn/error 的本地记录器（测试构造三参即可，行为不变）。
     */
    private readonly log;
    /** 文案翻译器（F-1 的形状异常诊断走字典，禁止硬编码用户可见字符串） */
    private readonly msgFunc;
    /**
     * 目录规范化（t10）：工作区归位第 ③ 档的**回落**比较用。
     *
     * 缺省 = `node:fs/promises` 的 `realpath`（与 DSH 的 `realpathNormalize` 同一套系统调用）；
     * 可注入是为了让「大小写/短名/分隔符不同」这条判定能被**确定性**单测覆盖（不依赖真实盘符/短名）。
     */
    private readonly realpath;
    constructor(ctx: Context, homeDir: string, msg?: MsgFunc, log?: Logger, realpath?: (path: string) => Promise<string>);
    /**
     * 回退到稳定边界的**子会话**（S3：工作区 + 会话回滚）。
     *
     * 走 **DSH 自己的 fork 路径**：`ctx.get('sessionController').fork({ sessionId, atSeq })`
     * （宿主 `SessionController.fork` → `SessionCommandController.fork`；惰取服务，**绝不**属性访问
     * `ctx.sessionController` —— 未声明 inject 时属性访问会抛错并致宿主启动崩溃）。
     *
     * 为什么**必须**走它、而不能直接调底层 `SessionStore.fork`（真机 2026-10-12 定案）：
     *  · 官方路径用 `ctx.agents.create(...)` 建子会话 ⇒ 子会话有 agent、**会落盘**、id 是 uuid；
     *    它**会尝试**挂回工作区，但只按「成员/血缘」两档解析（见 `attachChildToParentWorkspace` 的
     *    事实锁定）——解析不到就**不归位**；
     *  · 底层 `SessionStore.fork` 只在内存 store 里造一条会话记录（id 还是进程内计数 `session-1`），
     *    没有 agent、没有持久化 ⇒ 用户回退后想继续对话时，宿主 `resolve → resume →
     *    sessionQuery.observeSession` 在磁盘上找不到它，界面直接报
     *    `resume failed for session "session-1": SessionPersistenceNotFoundError`（用户截图 2026-10-12）。
     *
     * 契约：**任何异常与任何形状不符都收成 `{ error }`**，调用方必须如实结构化降级
     * （`fork-failed` 等），绝不静默假装成功。
     *
     * **唯一的例外（t16）：官方 fork 的 attach 失败不算 fork 失败。** 那时 `SessionCommandController.fork`
     * 已经建好子会话（uuid + 落盘），只是 `workspace.attachSession` 抛了错 —— 它把整件事报成
     * `session/workspace-attach-failed`（细节带 childId）。旧实现把它整体收成 `{ error }` ⇒ 引擎报
     * fork-failed ⇒ 用户看到「回退失败」，而磁盘上却多出一条「未分组」的子会话。现在：
     * 从错误里**按 DSH 客户端同款字段**取回 childId（见 workspaceAttachFailureChildId），
     * 取到 ⇒ 不再报失败，改由 attachChildToParentWorkspace 兜底归位；取不到 ⇒ 保持现状报失败。
     *
     * 工作区归位：官方能解析到工作区时它已经写过（本方法只复核）；解析不到（官方缺同目录档）才由
     * attachChildToParentWorkspace 兜底写。**归位失败一定带具体理由**：日志留痕 + warning 串
     * 形如 `workspace-attach-failed:<reason>`（core 落成 `rollback.guidance.sessionNotAttached` 如实上屏）。
     */
    forkSession(sessionId: string, boundarySeq: number): Promise<{
        childSessionId: string;
        warning?: string;
    } | {
        error: string;
    }>;
    /**
     * 把 fork 出来的子会话挂回**原会话所属工作区**（只读匹配 + 官方写 + 复核）。
     *
     * 三档判定，每一档都只相信 DSH 自己的成员语义（真正的成员判据是
     * “子会话 header 的 canonical cwd === 工作区 path”，`attachSession` 落盘前会再复核一次）：
     *  ① **直接命中**：某工作区的 `sessionIds` 含原会话 —— 与 DSH `forkWorkspace` 第一档同口径；
     *  ② **血缘**：原会话是子代理会话时，它的**祖先**才在某个工作区里 —— DSH `forkWorkspace`
     *     对 `origin === 'subagent'` 正是沿 `parentSession` 链上溯（有环保护 + 深度上限）；
     *  ③ **同目录**：子会话 header 的 cwd 与某工作区的 `path` 指向**同一个目录** —— 这正是 DSH 的成员判据本身。
     *     目录同一性**由 DSH 判定**：优先 `workspaceRegistry.resolveByPath(cwd)`（异步、按注册表同一套
     *     realpath 规范化、目录不存在直接在 realpath 阶段拒绝）；拿不到该方法才回落「双端 realpath +
     *     win32 大小写折叠」。**绝不**用未归一化的裸字符串比较 —— 真机 2026-10-12 的根因正是它：
     *     工作区 path 经 `realpathNormalize`、会话头 cwd 是原样字符串，Windows 上大小写 / 短名 / 分隔符任一
     *     不同即判不相等 ⇒ 三档全落空 ⇒ 子会话永久停在「未分组」，且失败被吞成布尔、一直不可见。
     *
     * **官方 fork 是否已自带归位（要求 D 的事实锁定，依据 DSH 源码）**：
     *  · `dsh-api-session-controller/lib/index.js` 的 `SessionCommandController.fork` 会先调
     *    `forkWorkspace(source.header)`（L802）再 `workspace.attachSession(childId)`（L829-836），
     *    attach 失败时抛 `session/workspace-attach-failed`（错误细节带 childId）；
     *  · 但 `forkWorkspace`（L1036-1045）**只有两档**：`sessionIds` 直接命中、`origin==='subagent'` 时沿
     *    祖先上溯 —— **没有同目录档**；两档都落空就返回 undefined ⇒ 官方**不归位**（本机现场：
     *    父会话不属于那 8 个工作区中的任何一个，于是每次回退都留下「未分组」的子会话）。
     *  结论：官方能解析到工作区时**它已经写了**，本兜底只补最后一道复核（`already-attached`）；
     *  官方解析不到（缺同目录档）才由本兜底的 ③ 档写 —— **不重复写、也不两处都写**。
     *
     * 任一档写失败（工作区目录已不存在 / cwd 对不上 / 形状不符）**只换下一档继续找**；三档都拿不到才返回带
     * **具体理由**的失败（调用方经 warning 通道如实上屏 + 日志留痕）—— **绝不猜、也绝不假装已归位**。
     */
    private attachChildToParentWorkspace;
    /**
     * 读一次注册表列举：形状不符（没有 list / 返回非数组）与抛错**分开**报，绝不吞成一个 false。
     */
    private registryRecordsOf;
    /** 列举里第一个 `sessionIds` 含该会话的工作区记录（形状不符一律跳过，绝不猜）。 */
    private workspaceRecordWithMember;
    /**
     * 对一条工作区记录调官方 `attachSession(childId)`，并返回**具体理由**（绝不静默返回 false）。
     *
     * `attach` 必须 `.call(record, ...)` 保留 receiver（实体方法内部用 `this.host` / `this.record`）。
     * 两种失败**分开**：记录上根本没有 `attachSession`（形状不符，未发起任何写）vs 真的抛错（写被拒）。
     */
    private attachChildTo;
    /**
     * ③ 档：cwd 指向的**已注册工作区**记录（目录同一性由 DSH 判定，绝不裸字符串比较）。
     *
     * 优先 DSH 自己的 `resolveByPath(cwd)`：
     *  · 它按注册表同一套 realpath 规范化（Windows 大小写 / 短名 / 分隔符差异都能对上）；
     *  · **目录不存在时它在 realpath 阶段拒绝** —— 那正是「目录不存在」的判定，如实转成 `directory-missing`；
     *  · 目录存在但不属于任何工作区 → 返回 undefined（`no-workspace-for-cwd`）；
     *  · 返回的工作区实体自带 `attachSession`，直接用它（就是 DSH 判定的那一个目录，不需要再按字符串回查）。
     * 拿不到该方法（老宿主 / 形状不符）才回落 {@link resolveWorkspaceByCwdFallback}。
     */
    private resolveWorkspaceByCwd;
    /**
     * ③ 档回落（`resolveByPath` 不可用）：**双端** realpath + win32 大小写折叠比较。
     *
     * 两侧都必须 realpath 过才比：cwd 侧失败 = 目录不存在（`directory-missing`）；工作区侧失败 =
     * 该工作区目录已不在（**跳过它**，不猜「像同一个」）。
     */
    private resolveWorkspaceByCwdFallback;
    /**
     * 归位后的**复核**（要求 C）：`list()` 里该工作区的 `sessionIds` 是否真的包含子会话。
     *
     * 为什么必须复核：`sessionIds` 由 DSH 按 `sessionPath(id) === record.path` 过滤（dsh-workspace
     * 实体 getter），是「这个会话到底归没归位」的**最终判据**；attach 返回成功只代表那次写调用没抛错。
     * 复核不通过一律按失败处理并给出理由 —— **不许报成功**。
     */
    private verifyChildAttached;
    /**
     * 从**活的**会话存储沿 `parentSession` 上溯祖先 id（不含起点；有环保护与深度上限）。
     *
     * 读不到会话 / 读不到 header / 形状不符一律停在这一层返回已收集的祖先 —— 这是只读探测，
     * 宁少不猜（DSH 官方用 `sessionQuery.traceSession`；这里只依赖 `sessions.get(id).header`）。
     */
    private ancestorSessionIds;
    /**
     * 会话 cwd 的**多源**读取（活会话 → 宿主会话存储列举）。
     *
     * 为什么不能只读活会话（真机 2026-10-17 根因之一）：旧实现只看 `ctx.get('sessions').get(id)`，
     * 拿不到就整体放弃归位 ⇒ fork 出来的子会话停在侧栏「未分组」。而 DSH 自己的读法有**磁盘回落**
     * （`dsh-workspace` 的 `readSessionHeader`：活会话 → `sessionPersistence.list()` 的 header 缓存），
     * 本方法与该回落同源，绝不猜路径、绝不拿父会话目录以外的任何东西凑数。
     *
     * 失败时返回**具体细节**（哪个来源、为什么），由调用方拼进诊断；绝不静默成 undefined。
     */
    private sessionCwdOf;
    /**
     * 归位失败的**诊断落盘**（一行 JSON，追加写）。
     *
     * 为什么需要：桌面版 DSH 的宿主 stdout 不落盘 ⇒ 用户界面上只有「未挂回原工作区」这句，
     * 具体理由（registry 拿不到 / attach 被拒 / cwd 读不到 / 复核不过）谁都看不到，
     * 「为什么会进未分组」于是长期不可排查。这里只记 id、理由码与路径来源，**不含任何凭据**。
     * 落盘失败绝不升级成回退失败（诊断是旁路，不是回退的一部分）。
     */
    private recordAttachDiagnostic;
    /**
     * 活会话 header（`ctx.get('sessions').get(id).header`）。
     *
     * 形状不符（服务未挂载 / 会话不活）返回 undefined —— 与 DSH 的 `readSessionHeader` 第一优先
     * 同源（它也是先看活会话，再看落盘列举）；这里不做落盘回落，避免把「文件系统上的旧 header」
     * 当成「这次 fork 的孩子」。
     */
    private liveSessionHeader;
    /**
     * 按**相对会话根**的目录搬迁会话目录（issue #45 ④ 导入期归位）。
     *
     * 与 `moveSession` 同一套安全约束，区别只在「怎么找到目录」：这条**不依赖会话存储的解析接口** ——
     * 刚导入完、位置还与 header 不一致时，存储的 list/解析会抛错（DSH 的 corrupt session log），
     * 只有按路径搬这一条路可用。
     */
    relocateDir(sessionDirRel: string, targetProjectKey: string): Promise<SessionMoveResult>;
    /**
     * 按**路径**改写一个会话目录下全部 generation 的首帧 cwd（导入期跨机映射用，issue #45）。
     *
     * 与 rewriteCwd 的区别：这条不依赖会话存储的解析接口（导入刚写完时那里可能是坏的），只认路径。
     * 安全序列与在线改写完全一致（utils/session-log.ts 的 rewriteSessionLogDir）：只换第 1 帧、
     * 尾部逐字节流式拷贝、发布前自检、失败回滚其它 generation。
     */
    rewriteLogDir(sessionDirRel: string, newCwd: string): Promise<SessionRewriteResult>;
    /** 相对会话根的目录 → 绝对目录（越界 / 含 .. / 空一律 undefined，绝不拼出会话根之外的路径）。 */
    private sessionDirFromRel;
    /**
     * 只读：从会话日志**字节**里取出首帧 header 的 cwd（issue #45 ④ 导入期校验用）。
     * 解不出来（非 zstd / 首帧不完整 / 非单行 JSON / 无 cwd）→ undefined：调用方按「无法判定」处理，绝不猜。
     */
    readLogCwd(bytes: Uint8Array): string | undefined;
    /** 搬迁实现（绝对目录；目标段白名单 + 不覆盖 + 锁文件 + 搬后自检失败回滚）。 */
    private relocateDirAbsolute;
    /**
     * 让工作区注册表重新索引某个会话的 header（改写后**必须**调用）。
     *
     * 为什么需要：注册表在启动时就把所有已存储会话的 header 缓存进内存，`attachSession`
     * 走的正是这份缓存 —— 改写磁盘后若不刷新，校验用的仍是旧 cwd（在目标机不解析）而必然失败。
     *
     * 实现依赖 DSH `WorkspaceRegistry` 的 `indexHeader`（d.ts 标为 private，运行时可调用）：
     * 这是本功能对 DSH 内部唯一的越界点，**刻意只用一个方法、且永不整体重建索引**
     * （整体重建 replaceHeaderIndex 会清空 sessionPaths，可能连带隐藏本进程的活跃会话）。
     * 不可用/失败 → 返回 false，由调用方如实标注「需重启 DSH 后再执行一次归位」。
     */
    reindexSessionHeader(sessionId: string): Promise<boolean>;
    /**
     * 列举宿主会话存储并**把两种元素形状归一**（F-1 唯一入口）。
     *
     * 返回 `ok:false` 的两种情形必须被调用方**响亮处理**（记日志 + 抛错/明确失败返回）：
     *  - `unavailable`：服务或 `list()` 不可用（抛错 / 返回非数组）；
     *  - `shape-unknown`：有元素、但**一个都解析不出 id**（宿主形状既不是 handle 也不是 legacy）。
     * 这两种**绝不**降级成「本机没有会话 / 没有父子关系」的空结果 —— 那正是 F-1 的真机事故。
     * 元素**部分**认不出时保留已认出的并记一条警告（部分可用比全丢好，但必须可见）。
     */
    private listSessionElements;
    /**
     * 本机会话的父子关系（子会话 id → 父会话 id）。
     *
     * 实现走 DSH 会话存储的列举（与 `session/list` 同一数据源）：只取 header 的 `parentSession`，
     * 不解析任何日志字节 —— 让「导出父对话时连带子代理会话」不为此读一遍整棵会话树。
     * 字段名以磁盘 header 为准（`parentSession`，两种写法都认；DSH 的 RPC 投影才改名为 `parentSessionId`）。
     * 元素形状按 **API 形状探测**归一（handle 的 `element.header` 与 legacy 的平铺字段都认，F-1）。
     *
     * 失败语义（F-1，**不得放宽**）：
     *  - 服务**未接线** → 空 Map（确定性事实：宿主没有会话存储，不是读失败）；
     *  - 列举失败 / 元素形状一个都认不出 → **抛错**（带明确原因）。绝不返回空 Map ——
     *    空 Map 会进 5 s TTL 缓存，且让「本机一条父子关系都没有」与「读不出来」无法区分，
     *    「导出子代理会话连带父对话」就会再次静默失效。调用方各自有回退路径（见 `loadParentRelations`）。
     */
    parentRelations(): Promise<Map<string, SessionParentRelation>>;
    /** 真正列举一次 DSH 会话存储（语义见 `parentRelations()`；本方法不做缓存） */
    private loadParentRelations;
    private exists;
}
/** File facade over $DSH_HOME, confined to the home root. */
export declare class DshFileSystemFacade implements FileSystemFacade {
    private readonly homeDir;
    private readonly msg;
    constructor(homeDir: string, msg?: MsgFunc);
    private abs;
    readFile(relPath: string): Promise<Uint8Array>;
    writeFile(relPath: string, data: Uint8Array): Promise<void>;
    exists(relPath: string): Promise<boolean>;
    copy(from: string, to: string): Promise<void>;
    /**
     * 递归删除（home 内，缺失目标视为成功）。**不用 fs.rm(recursive)**：目录里有悬空链接时它静默
     * 空转（报告写「已还原」而磁盘原样在）。removeTree 逐条删、只删链接本身、删不净就抛错。
     */
    remove(relPath: string): Promise<void>;
    /** 仅路径列表（既有契约）：委托 listRecursiveDetailed，丢弃诊断。 */
    listRecursive(dir: string): Promise<string[]>;
    /**
     * 跟随 junction / 符号链接的遍历 + 被跳过链接清单（issue #37）。
     * 实现下沉到 utils/recursive-walk.ts（可用真实临时目录直接单测）。
     */
    listRecursiveDetailed(dir: string): Promise<RecursiveListing>;
    /**
     * 文件 mtime（毫秒；不存在 / 读不到 → null）。sessions 的「最新 N 个」依赖它：
     * 排序用「最新一份会话日志」的时间，而不是目录 mtime（增量写入时不可靠）。
     */
    mtimeMs(relPath: string): Promise<number | null>;
    mkdir(dir: string): Promise<void>;
    /**
     * 一次 stat 同时取「字节数 + mtime」（只读预览用；不存在 / 读不到 / 非普通文件 → null）。
     *
     * 为什么合并：`/export-preview` 对同一个文件既要体积（`statSize`）又要时间（`mtimeMs`，
     * sessions 的排序兜底）—— 分两次调用就是两次 `fs.stat`（实测会话树 983 个文件，第二趟是净开销）。
     * 与 `mtimeMs`/`statSize` 同一条安全约定：`this.abs()` 的越界错误向上抛。
     */
    statInfo(relPath: string): Promise<{
        size: number;
        mtimeMs: number;
    } | null>;
    /**
     * 文件字节数（只读预览用；不存在 / 读不到 → null）。
     *
     * 与 mtimeMs 同一条安全约定：`this.abs()` 的越界错误向上抛（被 catch 吞成 null 会让
     * 「越界」看起来像「正常缺文件」）。非普通文件返回 null —— 交给调用方退回 readFile，
     * 由那条路径给出真实错误，而不是返回一个毫无意义的目录 size。
     *
     * 为什么需要它：`/export-preview` 只需要「N 个文件 / X MiB」，实测本机会话树 941 个文件
     * / 528 MB，走 readFile 取长度要 2.27 s、常驻内存 +306 MiB；stat 只取元数据。
     */
    statSize(relPath: string): Promise<number | null>;
    /**
     * 绝对路径 realpath（issue #45 会话归位）。
     *
     * 与 DSH 的 realpathNormalize 同语义：只接受**已存在**的目录，解析符号链接 / `..` /
     * 结尾斜杠后返回规范化路径；不存在 / 非目录 / 权限不足 → null（**绝不**回退原字符串，
     * 否则「源机不存在的 cwd」会被误判成与某个工作区同一目录）。
     *
     * 注意：本方法走绝对路径，不受 home 目录边界限制——入参只可能来自会话 header 的 cwd
     * 与工作区记录的 path，都已是绝对路径；越界字符串由 realpath 自身失败兜底。
     */
    realpathDir(absPath: string): Promise<string | null>;
    /**
     * 目录体积上界（只读预览：本地源插件的 `link:` 目录）。
     *
     * 与 realpathDir 同族的「绝对路径」方法：入参只可能是本机插件 spec 推导出的绝对路径
     * （`link:` 常指向 $DSH_HOME 之外的桌面端 resources 目录），因此**不受 home 边界限制**。
     *
     * 约束（宁可低估，不可卡住预览）：
     *  - 不跟随符号链接 / junction：`readdir(withFileTypes)` 对链接目录的 isDirectory() 恒 false，
     *    按「既不是文件也不是目录」跳过，既不会绕圈也不会跑出该目录；
     *  - 跳过 node_modules：`npm pack` 自身也排除它，数进去只会把量级抬高一个数量级；
     *  - `maxEntries` 兜底（默认 20000）：超出即停并返回已累计值；
     *  - 不是目录 / 读不到 → null（调用方对这类目录退回「体积按 0」）。
     */
    dirSizeBytes(absPath: string, opts?: {
        maxEntries?: number;
    }): Promise<number | null>;
    /**
     * 建缺失目录（issue #45：导入工作区记录前把缺失的项目目录建出来）。
     *
     * 安全边界（路径来自备份 = 不可信输入）：
     *  - 必须是完全限定的绝对路径（相对路径拒绝 —— 会跟随进程 cwd）；
     *  - 任何 `..` 段一律拒绝（即便 resolve 会折叠，也说明来源可疑）；
     *  - 已存在的层级不动；返回**实际新建**的目录（由外到内）供报告展示；
     *  - 路径上出现同名文件（非目录）→ 抛错，由调用方按非致命警告处理（绝不静默）。
     */
    ensureDir(absPath: string): Promise<string[]>;
}
/** The engine's HostContext over real DSH services. */
export declare class ConfigManagerHostContext implements HostContext {
    readonly platform: string;
    readonly arch: string;
    readonly homeDir: string;
    readonly dshVersion: string;
    readonly profile: string;
    /** profile 目录绝对路径（profiles/<name>；宿主解析，避免拼接布局猜错） */
    readonly profileDir: string;
    readonly log: Logger;
    readonly msg: MsgFunc;
    /** 应用语言（**调用期解析**：resolveAppLanguage 的活源；导出历史报告 locale 用） */
    get language(): 'zh' | 'en';
    readonly settings: SettingsFacade;
    readonly credentials: CredentialsFacade;
    readonly plugins: PluginsFacade;
    readonly workspace: WorkspaceFacade;
    readonly patchFile: PatchFileFacade;
    readonly fs: FileSystemFacade;
    /** 系统 home（第三方插件数据分区 pluginData / pluginAssets 的根；见 HostContext 的说明） */
    readonly osHomeDir: string;
    /** 以系统 home 为根的文件门面（同样越界即抛；只有上面两个分区能用） */
    readonly homeFs: FileSystemFacade;
    /** 会话存储端口（issue #45 会话归位；对 ctx.sessionPersistence 的薄适配） */
    readonly sessions: SessionStoreFacade;
    /**
     * 技能服务端口（issue #71；对 ctx.skills 的薄适配）。
     *
     * 为什么需要：真机上 89 个 SKILL.md 全在 `profiles/<p>/node_modules` 里（技能 provider 由
     * 插件注册），`$DSH_HOME/skills` 根本不存在 —— 只扫目录的分区必然是空的。
     *
     * 可选：宿主没有 skills 服务时（旧外壳）缺省 undefined，skills 分区退回纯目录扫描。
     */
    readonly skills: SkillStoreFacade | undefined;
    /**
     * 本机 DSH 支持的**会话日志格式版本**（`SESSION_FORMAT_VERSION`；解析不到 = undefined）。
     *
     * 用于导入/同步的「这条对话目标机读不读得了」体检：DSH 对读不出的格式是**静默跳过**的
     * （不报错、不出现在工作区列表里）。解析不到时**不猜** —— 体检整体跳过，绝谎报兼容。
     */
    readonly sessionFormatVersion: number | undefined;
    /** Phase 2 跨进程环境锁端口（宿主注入；测试 mock 不注入 → 无锁环境） */
    mutationLock?: MutationLockPort;
    /** Phase 3 SAFE MODE：注入同步谓词（读内存标志，供 withMutationLock isBlocked 用；env-lock 不识 policy） */
    safeModeIsBlocked?: () => boolean;
    /** Phase 3 恢复/事务（JournalStore + reconcile + SAFE MODE + runJournaled）。apply() 注入。 */
    phase3Recovery?: import('./core/phase3-host.ts').Phase3Recovery;
    /**
     * 本机自请求能力（F-2：官方 session.export 通道的探测与代理）。
     *
     * 只有「让 DSH 自己的 /api/session.export 说一遍它自己的状态」这一种用法 ——
     * 绝不拿它去访问外部网络（插件对外的网络调用有各自的既有通道）。
     */
    fetch?: (input: string, init: RequestInit) => Promise<Response>;
    /** 本实例 web 监听端口（webServer 就绪前为 undefined → 探测不发请求、如实降级）。 */
    webPort?: number;
    constructor(ctx: Context, homeDir: string, profile: string);
}
/**
 * 路由组依赖（src/routes/**）的真值类型。
 *
 * 为什么是「打印出来的字面类型」而不是 ReturnType<typeof makeRouteEnv>：makeRouteEnv 是
 * makeRoutes 内部的闭包构造，TypeScript 不能把函数内的推断类型导出。做法是：临时加一行
 * const probe: number = makeRouteEnv()，用 tsc --noEmit --noErrorTruncation 打印推断类型
 * （见 W1 报告的重测配方），把结果落到这里；makeRoutes 里的 const routeEnv: RouteEnvInferred =
 * 注解保证两侧不漂移（新增依赖漏登记会在构造点报错）。
 */
/**
 * 路由组依赖（src/routes/**）的真值类型。
 *
 * 为什么是「打印出来的字面类型」而不是 ReturnType<typeof makeRouteEnv>：makeRouteEnv 是
 * makeRoutes 内部的闭包构造，TypeScript 不能把函数内的推断类型导出。做法是：临时加一行
 * const probe: number = makeRouteEnv()，用 tsc --noEmit --noErrorTruncation 打印推断类型
 * （见 W1 报告的重测配方），把结果落到这里；makeRoutes 里的 const routeEnv: RouteEnvInferred =
 * 注解保证两侧不漂移（新增依赖漏登记会在构造点报错）。
 */
export type RouteEnvInferred = {
    sessionExportFetch: ((input: string, init: RequestInit) => Promise<Response>) | undefined;
    sessionExportPort: number | undefined;
    adapters: ConfigAdapter<unknown>[];
    sessionHealth: {
        homeDir: string;
        targetFormatVersion: () => number | undefined;
        workspaceKeys: () => Promise<ReadonlySet<string>>;
        knownSessionIds: () => Promise<ReadonlySet<string>>;
        sessionMeta: (ids: readonly string[]) => Promise<SessionMetaIndex>;
    };
    backupScheduler: BackupScheduler;
    bootSafetyAudit: () => Promise<BootSafetyReport>;
    cancelDecisionTimeoutMs: number;
    buildMarketSummary: (e: {
        url: string;
        addedAt: string;
    }) => Promise<MarketSummary>;
    credentials: CredentialProvider;
    dataDir: string;
    exportsDir: string;
    syncRootDir: string;
    syncScope: SyncScope;
    githubAuth: GitHubAuthClient;
    githubClientId: string | undefined;
    githubClientSecret: string | undefined;
    githubFlows: DeviceFlowStore;
    history: MigrationStore;
    host: ConfigManagerHostContext;
    itemCached: (url: string, itemId: string) => Promise<boolean>;
    knownSyncSectionIds: Set<SectionId>;
    makeImporter: () => Importer;
    makeMarketReader: () => GitMarketReader;
    makeRecoveryExecutors: (runId: string) => RecoveryExecutorFns;
    makeSyncEngine: (cfg: SyncConfig, engineOpts?: {
        optInSections?: readonly SectionId[];
    }) => SyncEngine;
    marketBootAutoRefreshed: {
        value: boolean;
    };
    marketCacheIndex: (url: string) => string;
    marketDir: string;
    marketCacheItemDir: (url: string) => string;
    marketStarCache: StarCache;
    marketWorkDir: (url: string) => string;
    meGitHubRest: GitHubAuthRest;
    meService: MyRepoService;
    meTokenProvider: () => Promise<string>;
    msg: MsgFunc;
    prepareSync: (body: Record<string, unknown>) => Promise<SyncConfig>;
    pluginVersion: string;
    profileLauncher: DshProfileLauncher;
    profileRuntime: DshProfileRuntimeRegistry;
    profiles: DshProfileManager;
    pruneStagedMarketZips: () => Promise<void>;
    readCachedIndexObj: (url: string) => Promise<MarketIndex | null>;
    recoveryOrchestrator: RecoveryOrchestrator;
    resolveSyncPassword: (ref: string) => Promise<string | undefined>;
    roots: string[];
    runAbortControllers: Map<string, AbortController>;
    runCancels: Map<string, {
        signal: AbortController;
        settle: (d: 'rollback' | 'keep') => void;
        decided: boolean;
    }>;
    runs: RunRegistry;
    scheduler: AutoSyncScheduler;
    selectionCache: Partial<Record<SyncTransportType, SyncSelection>>;
    selectionOptInSections: (channel: SyncTransportType, onlyAuto?: boolean) => SectionId[];
    selectionView: (channel: SyncTransportType) => Promise<SelectionView>;
    selectionViewByChannel: () => Promise<Record<SyncTransportType, SelectionView>>;
    snapshotEntrySections: (snapshotDir: string) => Promise<string[]>;
    snapshotsDir: string;
    starPromptRepoUrl: string;
    syncCredentialsByChannelView: () => Promise<Record<SyncTransportType, {
        encryptPasswordConfigured: boolean;
        decryptPasswordConfigured: boolean;
    }>>;
    syncDir: string;
    syncPasswordConfigured: (ref: string) => Promise<boolean>;
    syncWorkDir: {
        inspect: (repoUrl: string, opts?: {
            detail?: boolean;
            subdir?: string;
        }) => Promise<{
            facts: GitWorkDirFacts;
        } | {
            error: string;
        }>;
        rebuild: (repoUrl: string, mode: 'relink' | 'adopt' | 'reclone', subdir?: string) => Promise<GitWorkDirFacts>;
    };
    syncSectionCatalog: {
        id: SectionId;
        displayName: string;
        portability: Portability;
        defaultIncluded: boolean;
    }[];
    syncSessions: SyncSessionStore;
    tmpDir: string;
    tryAppendHistory: (raw: {
        kind: MigrationKind;
        result: MigrationResult;
        sections: string[];
        operationId?: string;
        snapshotId?: string;
        runId?: string;
        source: 'api' | 'autosync' | 'backup-scheduler' | 'recovery' | 'cli' | 'internal';
        summary: string;
        error?: string;
    }) => Promise<string | undefined>;
    withMutationGate: (op: string, handler: (req: IncomingMessage, res: ServerResponse, lockCtx?: MutationLockContext, journalCtx?: JournalRunContext) => Promise<void>, opts?: {
        journaled?: boolean;
        deferredSnapshot?: boolean;
    }) => ((req: IncomingMessage, res: ServerResponse) => Promise<void>);
    selfUpdate: (targetVersion: string) => Promise<SelfUpdateOutcome>;
    writeItemCache: (url: string, itemId: string, manifestRaw: string, zipBytes: Uint8Array) => Promise<void>;
};
export { mergePersistedWebDavUsername, parseSyncBody, webdavBaseUrl } from './routes/route-support.ts';
export type { ParseSyncBodyDeps } from './routes/route-support.ts';
/** /status 的插件诊断位（issue #28）。仅回非敏感元信息：目录、profile 名、计数。 */
export interface PluginDiagnostics {
    homeDir: string;
    profile: string;
    /** profile 目录的 package.json 是否可读（不可读 → 清单必然为空） */
    profileManifestReadable: boolean;
    /** 插件清单来源 = package.json 的 dependencies 里非 in-box 的包 */
    installedPluginCount: number;
    installedPluginNames: string[];
    /** dsh.profile.bundles 声明（非空即「替换默认插件栈」） */
    bundles: string[];
}
type SelectionView = {
    mode: SyncSelectionMode;
    sections: SectionId[];
    sessionsLimit: number;
    sessionsInclude: string[];
    encrypt: boolean;
    includeSecrets: boolean;
    deletePlugins: boolean;
};
/**
 * Mount the config-manager engine: host context, adapters, and the
 * /api/dsh-config-manager routes (when a webServer is present).
 * @param ctx - host plugin context carrying settings/credentials/webServer.
 * @param config - resolved plugin config.
 */
export declare function apply(ctx: Context, config?: Config): void;
