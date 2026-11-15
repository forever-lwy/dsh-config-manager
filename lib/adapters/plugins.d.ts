import type { PackLocalPluginsResult } from '../core/local-plugin-pack.ts';
import type { MsgFunc } from '../core/messages.ts';
import { USER_PATCH_FILE } from '../core/patch-layers.ts';
import type { PluginEntry, PluginsSection } from '../schema/types.ts';
import type { ApplyResult, ConfigAdapter, ExportOptions, ExportSection, ExportUnit, HostContext, ImportContext, PlanItem, SectionPreview, SensitiveHit, ValidationResult } from '../core/types.ts';
/**
 * 用户（home）patch 层路径 —— 定义已移到 `core/patch-layers.ts`（issue #71：patch 有 home /
 * profile 两层，层身份属于引擎知识，不属于某个 adapter）。此处 re-export 保持既有 import 面。
 */
export { USER_PATCH_FILE };
/**
 * 本地源插件打包钩子（由宿主注入，见 src/index.ts createAdapters）。
 * 返回打包结果（含字节与重写后的 spec）；不注入 = 不做本地源打包（保持旧行为）。
 */
export type LocalPluginPackHook = (plugins: PluginEntry[], 
/** 结构化类型：HostContext 满足它（core 侧刻意不 import adapters 的 HostContext 类型） */
ctx: Pick<HostContext, 'profile' | 'profileDir'>) => Promise<PackLocalPluginsResult>;
/** 本地插件 tarball 解包到 homeDir 内的固定缓存目录（相对 $DSH_HOME）。 */
export declare const LOCAL_TARBALL_CACHE_REL = "dsh-config-manager/local-plugins";
/** 归档内相对路径 → 缓存目录下的安全文件名（拒绝任何路径穿越）。 */
export declare function localTarballCacheName(relativePath: string): string;
/** profile 目录相对 $DSH_HOME 的路径（patches/ 与 pnpm-workspace.yaml 都挂在这里）。 */
export declare const PNPM_PROFILE_DIR: (profile: string | undefined) => string;
/** pnpm-workspace.yaml 相对 $DSH_HOME 的路径（plugins 分区内按「插件安装配置」管理）。 */
export declare const PNPM_WORKSPACE_REL: (profile: string | undefined) => string;
/** 单个 patch 文件随备份迁移的体积上限（issue #35；patch 是纯文本，超过说明放错了东西）。 */
export declare const MAX_PATCH_FILE_BYTES: number;
export declare class PluginsAdapter implements ConfigAdapter<PluginsSection> {
    readonly id: 'plugins';
    readonly displayName: string;
    readonly defaultIncluded: boolean;
    readonly portability: import("../schema/section-registry.ts").SectionPortability;
    /** 插件自身包名：导出 plugins 分区时不列自己（避免备份里出现「当前正在生成备份的插件」的自引用条目） */
    private readonly selfName;
    /** T1：本地源（link:/file:）插件打包钩子；未注入 = 不打包（保持改造前行为） */
    private readonly localPack;
    constructor(selfName?: string, localPack?: LocalPluginPackHook);
    export(ctx: HostContext, options: ExportOptions): Promise<ExportSection<PluginsSection>>;
    /**
     * issue #136 C：脱敏**归属标注** —— 把 SecretScanner 的命中路径归属回具体 patch 行。
     *
     * 为什么必须做：导出侧把命中字段名/值形状的字符串叶子替换成空串（占位符），语义是「需补录」。
     * 目标机只看到空串，无法区分「被剥空」与「用户主动写空」——于是合并/导入落地时照抄空串，
     * 静默抹掉本机同一行里用户手写的明文（行是整行写回的，行内没有粒度）。
     *
     * 归属规则：命中路径 `patch[i].<内部路径>` → 第 i 行的 `redactedPaths`（行内相对，原样保留
     * 扫描器语法，如 `raw.mcp.args.token`）；未命中的行不写该字段（缺省 = 未知，写回侧走保守分支）。
     *
     * 纯函数：不改入参；命中不落在 patch 行上（plugins / pnpmWorkspace / localTarballs 等）→ 原样返回。
     */
    annotateRedactions(sanitized: unknown, hits: SensitiveHit[]): unknown;
    /**
     * 只读预览（`/export-preview` 用）：与 `export()` **同口径**，但不做任何本地源打包。
     *
     * 为什么必须覆写：基类缺省会让调用方退回 `export()`，而 `export()` 会为每个 `link:`/`file:`
     * 插件 spawn 一次 `npm pack`（真机 12 个本地源插件 ≈12 s）。「总览」页只想知道条目数与体积，
     * 却因此每次都要打包一遍全部本地插件 —— 预览是纯只读路径，不该有任何进程副作用。
     *
     * 与 `export()` 的**唯一**差异：
     * - 不注入 `localTarballs`（没有字节），故清单 spec 保持原样（不做 `file:<tarball>` 改写）；
     * - 插件单元体积改为 `file:` 源的一次 stat（`measureLocalSources`），`link:` 目录按 0；
     * - 体积用一次 `stringify` 算 UTF-8 字节数（与 /export-preview 对 JSON 分区的口径一致）。
     * 其余（清单过滤、patch 行、pnpm-workspace、patchFiles、条目级白名单、告警文案、单元分组）逐字相同。
     */
    preview(ctx: HostContext, options: ExportOptions): Promise<SectionPreview<PluginsSection>>;
    /**
     * 导出与预览的共同内核。
     *
     * `pack=false` 时跳过本地源打包（预览路径）—— 除该段外两条路径逐字共用，
     * 避免「预览说会带什么」与「导出真的带什么」分叉。
     */
    private collect;
    /**
     * 单元清单（Phase 1；零 I/O：直接由 export 产物派生）。
     *
     * 单元 = 插件包 / cordis 补丁行 / pnpm-workspace.yaml / 单个 patch 文件。
     * 后两者构成**原子组**：patchedDependencies 的声明与 patches/** 文件必须同进同出
     * （issue #35 —— 只搬声明会让目标机 pnpm 拒绝一切 add），故互相写进 lockedWith，
     * 由选择模型保证勾选/取消同步。
     */
    listUnits(section: ExportSection<PluginsSection>): ExportUnit[];
    /**
     * 导入后目标机**可能**存在的 patch 文件集合（相对 profile 目录）——issue #35。
     * = 备份携带的 patchFiles ∪ 目标机本来就有的文件。只用于判定「声明能否被满足」，
     * 不做任何写入（写入在 applyItem 内、且先于 pnpm-workspace.yaml）。
     */
    private patchAvailability;
    /**
     * 读目标机 profile 的 `dsh.profile.bundles`（issue #95）。
     *
     * 相对路径与写入目标同源（`profiles/<profile>/package.json`），走 `ctx.target.fs` 而不是
     * 宿主私有通道：与 pnpm-workspace.yaml / patch 文件同一条 I/O 纪律（受限、可被 MemFs 测试）。
     */
    private targetBundles;
    /**
     * 把 host 自带的层声明进目标机 profile 的 `dsh.profile.bundles`（issue #95）。
     *
     * 为什么**不走安装通道**：这类层的包由 DSH 从自己的安装位置解析；按裸包名 `dsh plugin add`
     * 会把 npm `dist-tags.latest` 的副本装进 profile，与 host 的版本线脱节 —— 真机故障：
     * host 0.2.1-rc.2 + 包 0.2.1-alpha.2 的隔离组契约对不上 → `session-controller` 一直 pending
     * → 新建会话 service-unavailable。声明不了时只报非致命 warning（§34.17），不拖垮其余配置。
     */
    private declareHostBundle;
    analyzeImport(data: PluginsSection, ctx: ImportContext): Promise<PlanItem[]>;
    applyItem(item: PlanItem, ctx: ImportContext): Promise<ApplyResult>;
    validate(data: PluginsSection, msg?: MsgFunc): Promise<ValidationResult>;
}
