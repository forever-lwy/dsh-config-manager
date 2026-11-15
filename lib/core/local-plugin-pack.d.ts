/** 本地源插件 tarball 在 ZIP 内的存放目录（相对分区前缀之下，如 plugin-files/ 之下） */
export declare const LOCAL_PLUGIN_DIR = "local-plugins";
/** 单插件 tarball 体积上限（超过则跳过并告警，防异常巨大的插件撑爆备份） */
export declare const MAX_LOCAL_TARBALL_BYTES: number;
/** 依赖 spec 的来源类别 */
export type LocalPluginSourceKind = 'link' | 'file' | 'registry' | 'git' | 'other';
/**
 * 分类依赖 spec。
 * - `link:` → 'link'（本地目录）
 * - `file:` → 'file'（本地 tarball / 目录）
 * - `github:` / `gitlab:` / `bitbucket:` / `git+` / `http(s):` → 'git'
 * - 空 / `workspace:` / 版本区间（`^1.2.3`、`~1.2`、`1.2.3`、`latest`、`*`）→ 'registry'
 * - 其余 → 'other'
 */
export declare function classifyPluginSpec(spec: string | undefined): LocalPluginSourceKind;
/** 是否本地源（换机后必然不可达，需打包） */
export declare function isLocalPluginSpec(spec: string | undefined): boolean;
/**
 * 包名 → 归档内安全的文件名片段。
 * `@scope/name` → `@scope__name`（斜杠被替换，**结果绝不含 `/` 或 `\`**）。
 * 其余非法字符（路径分隔符、`:`、空白）一并折叠为 `-`。
 */
export declare function safePackageFileFragment(pkgName: string): string;
/** tarball 在归档内的相对路径（一律 `local-plugins/<fragment>.tgz`，pkgName 已脱离 version） */
export declare function tarballNameFor(pkgName: string, version: string): string;
/**
 * **已打包 tarball** 的归档名：保留源文件名（issue #57）。
 *
 * 为什么不像目录那样按「包名-版本」重命名：源文件里就带着它自己的包名与版本
 * （`pnpm pack` 的 `dsh-academic-research-0.0.1.tgz`），改名只会让「备份里的是哪一份」
 * 变得对不上；而且 `file:` 指向的 tarball 未必叫 `npm pack` 的默认名。
 * 只做**文件名净化**（丢目录、把路径分隔符与非法字符折叠为 `-`），杜绝穿越。
 */
export declare function safeTarballFileNameFor(packageName: string, sourceFileName: string): string;
/**
 * 本地 spec → 绝对路径。
 * - `link:D:/x` / `link:/abs/x` → 绝对路径原样（规范化分隔符）；
 * - `link:./x` / `link:../x` → 相对 profileDir 解析；
 * - `~` 开头 → 相对 homeDir 展开；
 * - 裸路径（无前缀，如 `./plugin`）→ 同样按相对 profileDir 处理。
 *
 * 平台无关：不读 `process.platform`，交给 `path.resolve` / `path.isAbsolute`。
 */
export declare function resolveLocalPluginPath(spec: string, opts: {
    homeDir: string;
    profileDir: string;
}): string;
/**
 * 把不可移植的本地 spec 重写成可移植形式。
 * 幂等：对已是 `file:` 前缀的输入再次调用不改变语义（前缀保留、路径部分原样）。
 */
export declare function rewriteLocalSpec(spec: string, opts: {
    tarballRel: string;
}): string;
/**
 * 判断一个 spec 是否已是「重写后的可移植形式」（`file:local-plugins/...`）。
 * 导入端据此避免二次重写。
 */
export declare function isPackedLocalSpec(spec: string | undefined): boolean;
/**
 * 本地 spec 是否**必然指向 tarball**（而非目录）—— `.tgz` / `.tar.gz` 后缀。
 *
 * 只是提示：真正的形态判定在打包期由 `statKind`（stat 实测）决定，本函数不作判据，
 * 用于文档/UI 说明「哪些 spec 会走直读路径」。非 file:/link: 前缀的 spec 一律 false。
 */
export declare function isTarballLocalSpec(spec: string | undefined): boolean;
/** 打包所需的插件最小信息（只依赖 core/types.ts 的 PluginInfo 子集，便于测试构造） */
export interface LocalPluginCandidate {
    name: string;
    version: string;
    spec?: string;
}
/** 命令执行结果（与 child_process 的 execFile 回调对齐；不 import node:child_process） */
export interface PackExecResult {
    stdout: string;
    stderr: string;
    code: number | null;
}
/** 命令执行器签名：`exec(file, args, opts)` → Promise */
export type PackExec = (file: string, args: string[], opts: {
    cwd: string;
    timeoutMs?: number;
}) => Promise<PackExecResult>;
export interface PackLocalPluginsOptions {
    plugins: readonly LocalPluginCandidate[];
    /** $DSH_HOME 绝对路径 */
    homeDir: string;
    /** profile 目录绝对路径（profiles/<name>） */
    profileDir: string;
    /** tarball 临时产物目录（调用方保证存在或由本函数创建） */
    packDir: string;
    /** 命令执行器（注入；生产传 npm pack 的 execFile 包装） */
    exec: PackExec;
    /** 读文件（注入，便于测试）——只在打包成功后调用 */
    readFile: (absPath: string) => Promise<Uint8Array>;
    /** 确保目录存在（注入） */
    mkdir: (absDir: string) => Promise<void>;
    /**
     * 路径形态判定（注入；缺省“判不出”）。
     *
     * issue #57：`file:` spec 可能直接指向**已打包的 .tgz**（`file:/abs/x.tgz`），
     * 此时该文件本身就是 `npm pack` 的产物 —— 再拿它当 cwd 去 spawn `npm pack`
     * 必然 `spawn ENOTDIR`，插件代码静默不进备份。有了这个探测就能「直接收编」：
     * 读文件 + 重写 spec，跳过 npm pack。
     *
     * 契约：返回 'file' | 'dir'；**判不出来（不存在 / 无权限 / 未注入）必须返回 'unknown'**，
     * 让调用方落回既有目录流程去产出可读告警，绝不把「判不出」当成文件。
     */
    statKind?: (absPath: string) => Promise<'file' | 'dir' | 'unknown'>;
    /** 目标平台校验（可选；'win32' 时 npm 是 .cmd 垫片，调用方负责 exec 形态） */
    timeoutMs?: number;
    /** tarball 体积上限（缺省 MAX_LOCAL_TARBALL_BYTES） */
    maxTarballBytes?: number;
    /** 是否把 `npm pack` 的 stderr 作为告警捕获（缺省 true） */
    collectStderr?: boolean;
}
/** 单个本地插件的打包结果 */
export interface PackedLocalPlugin {
    packageName: string;
    version: string;
    /** 归档内相对路径（`local-plugins/<x>.tgz`，正斜杠） */
    relativePath: string;
    /** 重写后的 spec（`file:local-plugins/<x>.tgz`） */
    rewrittenSpec: string;
    data: Uint8Array;
}
/**
 * 因体积上限被**丢弃**的本地插件（tarball 大于 maxTarballBytes）。
 *
 * 单独带出来（而不是只留一条 warning）是为了让宿主侧做**超限负缓存**：
 * 真机实测单个 210MB 的本地插件一次 npm pack 44.7s，而结果每次都被上限丢掉 ——
 * 每 60s 一轮的自动同步于是每分钟白烧 45s CPU 与磁盘。宿主拿到这条事实后，
 * 在源没变的前提下可以不再重复打包（见 core/local-plugin-host.ts 的负缓存）。
 */
export interface OversizeLocalPlugin {
    packageName: string;
    /** 解析后的源路径（目录，或 file: 直接指向的 .tgz）—— 负缓存以它为键 */
    sourcePath: string;
    /** 超限形态：'archive' = file: 指向的归档本身太大；'dir' = 打包后太大 */
    source: 'archive' | 'dir';
    /** 实测字节数与上限（用于告警文案与缓存命中时复述） */
    size: number;
    maxBytes: number;
}
export interface PackLocalPluginsResult {
    packed: PackedLocalPlugin[];
    /** packageName → 重写后的 spec */
    rewritten: Record<string, string>;
    /** 非致命告警（跳过原因等；调用方并入分区 warnings） */
    warnings: string[];
    /** 被体积上限丢弃的插件（见 OversizeLocalPlugin；调用方做完负缓存后无需再管） */
    oversize: OversizeLocalPlugin[];
}
/**
 * 从 `npm pack --json` 的 stdout 解析出 tarball 文件名。
 * 兼容三种形态：
 *  1. `--json` 数组：`[{"filename":"x.tgz", ...}]` → 取 filename
 *  2. 旧版单对象：`{"filename":"x.tgz"}` → 取 filename
 *  3. 纯文本：末行非空即文件名（兜底）
 * 解析失败返回 null（调用方按文件名约定回退）。
 */
export declare function parsePackOutput(stdout: string, expectedPkg: string, version: string): string | null;
/**
 * 对全部本地源插件执行打包。
 *
 * 行为要点：
 *  - 只处理 `isLocalPluginSpec(spec)` 的插件；非本地源直接跳过（**不产生告警**，属正常）；
 *  - 每个插件独立 try/catch：任一步失败 → 该插件进 warnings，**其余继续**；
 *  - 目录不存在 / 非绝对可达 → 告警跳过（不抛错）；
 *  - 成功产出 `packed`（含字节）与 `rewritten` 映射。
 */
export declare function packLocalPlugins(opts: PackLocalPluginsOptions): Promise<PackLocalPluginsResult>;
/**
 * 判断 spec 是否是「裸本地路径」（无任何前缀，如 `./plugin`、`D:\dev\x`）。
 * 这类 spec 在 DSH profile 中不常见（pnpm 侧通常要求 `link:` / `file:` 前缀），
 * 但一旦出现，同样指向本机路径、换机后不可达。
 *
 * **当前无生产调用点**（`packLocalPlugins` 目前只处理带前缀的 spec）——这是**有意的**
 * 预留扩展点，不是死代码：保留它可让「无前缀裸路径」这一已识别的边界有明确表达，
 * 后续若要在 `packLocalPlugins` 中一并处理，直接复用即可。
 * （若哪天决定不支持该形态，请连同本注释与对应测试一起删除。）
 */
export declare function isBareLocalPath(spec: string | undefined): boolean;
