/**
 * dsh plugin CLI 通道（方案A 主机侧实现，M1）。
 *
 * 本模块是唯一的子进程启动点：把「安装 / 更新 profile 插件」转成官方
 * `dsh plugin --profile <name> <args…>` 调用（dsh CLI 内部转发 pnpm，并在
 * 成功后 reconcile dsh.profile.bundles），以及从 profile 文件实时读取已装
 * 插件清单（不依赖 web 专用 pluginMarketplace / pluginInventory 服务）。
 *
 * 设计对齐：
 *  - dsh 官方实现 @deepseek-ai/dsh/lib/plugin-*.js（runPlugin / reconcilePlugins /
 *    exportsPatch 的 bundle 判定语义）；
 *  - dshmarket src/dsh-cli.ts（dshArgv / spawnShim / killTree / spawnEnv）与
 *    src/profile.ts（readInstalled / readInstalledVersion / hasDshManifest）。
 *
 * 只依赖 node 内置模块，零 DSH 运行时依赖（M5 的 TDD 可直接单测本模块）。
 */
import type { ChildProcess } from 'node:child_process';
import { resolveDesktopCarrier } from '../utils/desktop-carrier.ts';
import type { PluginInfo } from './types.ts';
/**
 * dsh 出厂自带的 in-box bundle（profile 模板自身安装的层）：唯一从「已装
 * 插件清单」中隐藏的名字。社区插件可以合法地发布在官方 scope 下，因此不能
 * 按 scope 整段过滤（dshmarket #28 的结论）。
 */
export declare const INBOX_BUNDLES: ReadonlySet<string>;
/**
 * profile 名合法性校验，与 dsh-app-boot 的 resolveProfileDir 一致：拒绝空名、
 * 路径分隔符与保留名，防止 join(home, 'profiles', name) 越界。
 */
export declare function validateProfileName(profile: string): string;
/** Profile 目录：$DSH_HOME/profiles/<name>（homeDir 由宿主 resolveDshHome() 解析）。 */
export declare function resolveProfileDir(homeDir: string, profile: string): string;
/**
 * `--profile <name>` 的合法取值（同时支持 `--profile <name>` 与 `--profile=<name>`）；
 * 没给 / 缺值 / 值以 '-' 开头 / 校验非法 → null（宽容语义，绝不抛错）。
 * argv 参数化便于测试；缺省读当前进程 argv。
 */
export declare function profileNameFromArgv(argv: readonly string[]): string | null;
/**
 * 从 profile 目录的绝对路径取叶子名（`profileContext.dir` / `DSH_PROFILE_DIR`）：
 * 两种分隔符都切（POSIX 上也可能拿到 Windows 形态路径），取不到 / 非法 → null。
 */
export declare function profileNameFromDir(dir: string): string | null;
/**
 * 从宿主 `profileContext` 服务的值里取 profile 名（issue #52）。
 *
 * DSH ≥ 0.1.7 在 boot 时 `hostCtx.provide('profileContext', { name, dir, patchPath, … })`
 * （取证：0.1.7-rc.2 / 0.2.0-rc.1 的 `@deepseek-ai/dsh` 中 profile-boot 的 provide 调用），
 * 这是「真正启动了哪个档案」的**唯一权威**：DSH Desktop（Electron 外壳）拉起宿主时
 * **不传 `--profile`**（只在 Electron 层把 projectDir / profileContext 交给宿主），
 * 只认 argv 会把 desktop 档案认成 'web'，于是插件清单来源、档案页「当前运行」标记、
 * 备份/导出/恢复目标全部落到 profiles/web。
 *
 * 纯函数便于单测：`name` 缺失/非法时退到 `dir` 的叶子名；两者都取不到 → null
 * （调用方继续回退到 --profile / 环境变量 / web）。
 */
export declare function profileNameFromProfileContext(value: unknown): string | null;
/**
 * 从宿主 `profileContext` 取**当前运行时的安装锚点**（issue #桌面端兼容）：
 * `installAnchor` 是 **拉起本宿主那份** `@deepseek-ai/dsh/package.json` 的绝对路径
 * （dsh 的 profile-boot 在 boot 时写进 profileContext；Desktop 传的是
 * `<app.asar>/dsh/node_modules/@deepseek-ai/dsh/package.json`）。
 *
 * 为什么必须用它：磁盘上 `<home>/profiles/node_modules/@deepseek-ai/dsh/package.json`
 * 是 web profile 装出来的 **hoisted 旧副本**（真机：Desktop 运行时 0.2.0-rc.2，该文件却是
 * 0.1.5-rc.1），只按磁盘猜会让「关于」页与备份 manifest 的 DSH 版本整个报错。
 * 取不到 / 非字符串 / 空串 → null（调用方继续按磁盘候选回退）。
 */
export declare function installAnchorFromProfileContext(value: unknown): string | null;
/**
 * 从进程环境解析 profile 名：`DSH_PROFILE`（名字）→ `DSH_PROFILE_DIR`（绝对目录，取叶子名）。
 * 由启动外壳注入；DSH 自身（0.1.5 / 0.1.7 / 0.2.0 全量扫描）**从不写这两个变量**，
 * 所以它只是 profileContext 之外的一道兜底。两条都读不到 / 非法 → null，绝不抛错。
 */
export declare function resolveProfileNameFromEnv(env?: Readonly<Record<string, string | undefined>>): string | null;
/**
 * 进程侧 profile 名（不依赖 Cordis ctx）：`--profile` 启动参数 →
 * `DSH_PROFILE` / `DSH_PROFILE_DIR` 环境变量 → 'web'。
 * 宿主 apply 的真实优先级更高一层（config.profile → profileContext 服务），见 src/index.ts。
 */
export declare function resolveProcessProfileName(argv?: readonly string[], env?: Readonly<Record<string, string | undefined>>): string;
interface ProfileManifest {
    dependencies?: Record<string, string>;
    dsh?: {
        profile?: {
            bundles?: string[];
        };
    };
}
/** 读 profile package.json；不可读（未初始化 / 损坏）返回 null。 */
export declare function readProfileManifest(profileDir: string): ProfileManifest | null;
/** 写回 profile package.json（2 空格缩进 + 尾换行，与 dsh-app-boot 一致；原子写防半装损坏）。 */
export declare function writeProfileManifest(profileDir: string, manifest: ProfileManifest): void;
/** 真实已装的依赖（in-box bundles 过滤掉）：name → 声明的版本 spec。 */
export declare function readInstalled(profileDir: string): Record<string, string>;
/** node_modules/<name>/package.json 里实际落盘的版本；未装 / 不可读为 null。 */
export declare function readInstalledVersion(profileDir: string, name: string): string | null;
/** 包的 package.json 是否声明 dsh.bundle.patch（即它是一个 bundle / profile 层）。 */
export declare function hasDshBundlePatch(pkgDir: string): boolean;
/**
 * 维护 dsh.profile.bundles 与已装依赖一致（语义对齐官方 plugin 命令的
 * reconcilePlugins，按「已装状态」而非依赖 diff 判定）：
 *  - 声明 dsh.bundle.patch 的依赖必须出现在 bundles（追加在依赖顺序尾部）；
 *  - bundles 中「曾是依赖、但不再是（移除或版本不再声明 patch）」的条目移出；
 *  - in-box bundles 不是依赖，永远不碰（加回与移出两条路都跳过）。
 * 仅在确有变化时写回 package.json。返回是否写回。
 *
 * **这是写操作，只允许挂在写路径上**（安装成功后对账 / 中止安装清理）。
 * 读路径（listInstalledPlugins）调用它 = 用户「只是看一眼」就把 bundles 改回全量，
 * 关掉的插件被重新加回、下次启动照常挂载（issue #111）。
 */
export declare function reconcileBundles(profileDir: string): boolean;
/**
 * 中止安装后清理半装状态（用户「跳过当前插件」）：移除 profile package.json 中的
 * 依赖行 + reconcile bundles + 删 node_modules/<pkg>。
 *
 * 目的：pnpm add 被中途 kill 后，package.json 可能已声明依赖但 node_modules 不完整，
 * 直接启动 DSH 会因缺包而失败。本函数把 manifest 恢复为「该插件未安装」的一致状态，
 * 消除「声明了依赖但没装全」的启动风险。pnpm-lock.yaml 不触碰（运行时不被读取，
 * 下次安装 pnpm 自行对齐）。尽力而为：任何失败不抛错，由调用方记录告警。
 *
 * 删包目录必须走 removeTreeSync 而不是 fs.rmSync(recursive)：包目录常是**链接**（DSH 把
 * node_modules/<pkg> 链到 .dsh-module-fallback），链接目标消失后就是悬空链接，rmSync 遇到
 * 这种树会静默空转（不抛错、一个都不删），于是「跳过当前插件」留下半装残留，下次安装撞缺包。
 * removeTreeSync 只删链接本身（绝不跟进去删 fallback 里的实体）并在删不净时抛错。
 */
export declare function cleanupAbortedInstall(profileDir: string, pkg: string): void;
/**
 * 安装/升级成功后的 bundles 对账（**写路径专用**，issue #111）。
 *
 * 为什么单独一层：reconcileBundles 会写 profile package.json，绝不能出现在读路径上。
 * 它原先挂在 listInstalledPlugins 里，于是「打开设置 → 备份与迁移」就顺手把
 * dsh.profile.bundles 改回全量（用户关掉的插件被重新加回），这正是 #111 的现象。
 * 安装成功后补一次对账，把这条副作用挪到真正该发生的地方：官方 `dsh plugin add`
 * 自己也会 reconcilePlugins，这里只是旧宿主版本的兜底，因此失败不抛——包已经装好了，
 * 不因为一次对账写失败把成功否掉。
 */
export declare function reconcileBundlesAfterInstall(profileDir: string): boolean;
/**
 * 实时读 profile 已装插件清单（**纯读，零写入**）。
 *
 * 曾经这里第一句是 reconcileBundles(dir)：读一次清单就写一次 package.json，
 * 把用户在 bundles 里关掉的插件重新加回（issue #111）。bundle 属性本来就按
 * node_modules 里的 package.json 现算（hasDshBundlePatch），根本不依赖 bundles
 * 已被对账，所以读路径不需要它；需要写的地方是安装成功 / 中止安装清理。
 */
export declare function listInstalledPlugins(homeDir: string, profile: string): PluginInfo[];
/**
 * 「只在 `dsh.profile.bundles` 里声明、`dependencies` 里没有该包」的条目判定（issue #95）。
 *
 * 为什么要一个共享判据：导出端的显式字段（`bundlesOnly`）只存在于新备份；旧备份只能按形状
 * 推断——**有依赖 spec 的绝不是**（那是普通依赖，哪怕本机没装全）；**没有 spec 且读不到已装版本**
 * 的才是（本 profile 里没有任何东西提供它，DSH 只能从自己的安装位置解析，issue #95）。
 */
export declare function isBundlesOnlyEntry(entry: {
    bundlesOnly?: unknown;
    spec?: unknown;
    version?: unknown;
}): boolean;
/**
 * 把 `name` 声明进 profile package.json 的 `dsh.profile.bundles`（issue #95）。
 *
 * 只做「追加一个名字」：其余字段逐字保留，重复声明返回 `changed: false`（幂等，不空写文件）。
 * 形状不可认（JSON 坏 / `dsh.profile` 非对象 / `bundles` 非字符串数组）→ 返回 null：
 * 调用方必须**如实报告**并放弃这次声明，绝不重建一份清单出来（那会抹掉 profile 的其它字段）。
 *
 * `bundles` 字段**缺省也拒绝**：DSH 的语义是「bundles 非空即替换默认插件栈」，凭空造一个只含
 * 一个名字的数组 = 悄悄改掉目标机的装配语义（应当由 DSH 自己写这个字段）。
 */
export declare function mergeBundleDeclaration(pkgText: string, name: string): {
    text: string;
    changed: boolean;
} | null;
/** `pluginInstallTarget()` 的输入：全部来自备份里的 `PluginEntry`（都可缺省 = 旧备份）。 */
export interface PluginInstallTargetInput {
    /** 备份记录的实际安装版本（`PluginEntry.version`）：具体 semver 时精确安装到它（issue #101）。 */
    version?: string | undefined;
    /** 备份记录的声明依赖 spec（`PluginEntry.spec`）：非 registry 来源原样，registry 区间带包名。 */
    spec?: string | undefined;
    /** 备份内自带 tarball 解包后的绝对路径：优先于 spec（T1 本地源插件迁移）。 */
    tarballPath?: string | undefined;
}
/**
 * 安装目标：可直接交给 `dsh plugin add` 的**完整参数**（issue #101）。
 *
 * 为什么不能只传裸包名：pnpm add 会尊重目标机 `package.json` 里既有的 spec —— 固定版不动、
 * 已经满足的区间也不动，于是「备份里记着 0.9.5、目标机装着 0.9.3」的升级会**空转却报成功**。
 * 规则按优先级排列（`src/core/plugin-cli.test.ts` 表驱动钉住）：
 *  ① 备份内 tarball → `file:<abs>`（换机后原绝对路径必然失效）；
 *  ② 非 registry 来源（github:/git+/file:/link:）→ spec 原样（裸包名在 registry 上查不到）；
 *  ③ `version` 是具体 semver → `<pkg>@<version>`（精确版本，pnpm 无法被既有 spec 挡住）；
 *  ④ 其余 spec（`^1.2.3` / dist-tag）→ `<pkg>@<spec>`（交给 pnpm 解析，至少不会退回裸包名）；
 *  ⑤ 什么都没有（旧备份 / 无版本记录）→ 裸包名（npm 最新版，改造前行为）。
 */
export declare function pluginInstallTarget(pkg: string, input?: PluginInstallTargetInput): string;
/** 一次 CLI 调用的启动描述（env 只在需要覆写子进程环境时出现）。 */
export interface DshCliArgv {
    file: string;
    args: string[];
    cwd: string | undefined;
    viaShell: boolean;
    /** 额外/覆写的子进程环境（Desktop 载体需要 ELECTRON_RUN_AS_NODE=1）。 */
    env?: Readonly<Record<string, string>>;
}
/**
 * 重放启动当前宿主进程的 dsh CLI：
 *  - **Desktop 保留档案（`--profile desktop`）**：普通 dsh CLI 会硬拒绝（见
 *    `utils/desktop-carrier.ts` 的说明），必须改用桌面端自带的 CLI 载体
 *    `@deepseek-ai/dsh-desktop-host/lib/cli.js`（它以 `manageDesktopProfile: true` 启动
 *    runCli，并用桌面端内置 runtime + 内置 pnpm）。检测不到载体时落回下面的通用路径，
 *    失败信息由 classifyDshPluginFailure 的 desktop-profile-reserved 分类给可操作说明；
 *  - process.argv[1] 是 dsh 入口（全局 bin / 源码启动的 bin.ts / bin.js）→ 用
 *    当前 Node 重新执行该入口（execArgv 原样保留，cwd 靠近入口保持相对导入可解析）；
 *  - 否则退回 PATH 上的 `dsh`（Windows 是 .cmd，需经 shell）。
 */
export declare function dshArgv(profile?: string, carrier?: ReturnType<typeof resolveDesktopCarrier>): DshCliArgv;
/** 为一个 argv token 构造 cmd.exe 命令行引用（需要引用的 token 用双引号包裹并加倍内部引号）。 */
export declare function quoteCmdArg(arg: string): string;
/** 由 argv 构造 cmd.exe 命令行（仅 Windows 垫片路径使用）。 */
export declare function cmdCommandLine(argv: readonly string[]): string;
/**
 * 杀掉子进程整棵进程树：Windows 的 kill() 只终止包装进程、pnpm 子进程还活着，
 * 用 taskkill /T /F；POSIX 子进程独立进程组启动（detached），先 SIGTERM 组、
 * 5 秒后 SIGKILL 兜底。
 */
export declare function killTree(child: ChildProcess): void;
/** 一次 dsh plugin 子进程调用的原始结果（M2 失败分类器的输入）。 */
export interface DshPluginResult {
    exitCode: number | null;
    timedOut: boolean;
    /** 经 AbortSignal 中止（用户跳过/取消）：进程树被 kill，非失败语义 */
    aborted?: boolean;
    stdout: string;
    stderr: string;
    /** spawn 自身失败（如 ENOENT）；此时 exitCode 固定为 127。 */
    spawnError?: string;
}
/**
 * 运行 `dsh plugin --profile <profile> <pluginArgs…>`：
 * cwd=profile 目录、CI 环境、windowsHide、pipe 输出、15 分钟超时杀进程树。
 * 永远 resolve（不 throw），由调用方判定成败。
 *
 * signal：可选 AbortSignal。中止时立即 killTree 杀掉整棵进程树（dsh 包装 + pnpm 孙进程），
 * 结果标记 aborted=true（调用方据此判定「用户跳过/取消」，而非失败）。
 */
export declare function runDshPlugin(profileDir: string, profile: string, pluginArgs: readonly string[], timeoutMs?: number, signal?: AbortSignal): Promise<DshPluginResult>;
/**
 * 已识别的 pnpm/dsh CLI 失败模式（纯函数，可独立单测）。
 * 识别语义对齐 dshmarket src/pnpm-compat.ts：dsh 的包装行不提供原因，必须
 * 从 pnpm 的真实诊断文本里认。
 */
export type DshPluginFailureCode = 'hoist-pattern-diff' | 'adding-to-root' | 'not-a-workspace' | 'release-age-violation' | 'git-build-blocked' | 'fetch-404' | 'transient-network' | 'pnpm-missing' | 'patch-file-missing' | 'desktop-profile-reserved';
export interface DshPluginFailure {
    code: DshPluginFailureCode;
    /** 双语可操作消息（同一字符串内 zh / en）。 */
    message: string;
    /** true = 按消息指示重跑（重建 / 直接重试）通常即可恢复；false = 需要人工动作。 */
    recoverable: boolean;
}
/**
 * 瞬时网络故障判定：pnpm 的 5xx 拉取码、meta 拉取放弃、以及穿透 dsh 包装的
 * 原始 socket 错误。永久的形态（404、鉴权）刻意排除——重试只会加倍等坏消息。
 */
export declare function isTransientDshPluginFailure(output: string): boolean;
/**
 * 把一次失败的 dsh plugin 调用的合并输出映射到已知失败模式。
 * @param output - stdout+stderr 合并文本。
 * @returns 分类结果；未识别返回 null（调用方展示原始摘要）。
 */
export declare function classifyDshPluginFailure(output: string): DshPluginFailure | null;
/**
 * 卸载一个插件（issue #132 的唯一写入口）：`dsh plugin remove`，不自己改 package.json。
 *
 * 为什么不复用安装后的 reconcileBundlesAfterInstall：对账是「安装成功后补一次」的写操作，
 * 卸载后 bundles 由 CLI 自己收尾；这里再补一次只会在失败语义上制造歧义。
 */
export declare function uninstallViaCli(homeDir: string, profile: string, pkg: string, runner: (profileDir: string, profile: string, argv: readonly string[], input?: undefined, signal?: AbortSignal) => Promise<DshPluginResult>, signal?: AbortSignal): Promise<{
    needsRestart: boolean;
}>;
/** 卸载失败（issue #132）→ 与安装同一套分类口径的双语可读 Error。 */
export declare function uninstallErrorFor(pkg: string, result: DshPluginResult): Error;
/** 安装失败 → 分类后的双语可读 Error；未识别则保留 stderr 尾部摘要。 */
export declare function installErrorFor(pkg: string, result: DshPluginResult): Error;
export {};
