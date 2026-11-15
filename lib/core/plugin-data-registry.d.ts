/**
 * 第三方插件「数据目录」来源注册表（pluginData / pluginAssets 两个分区的唯一知识源）。
 *
 * 为什么需要它：DSH 插件的数据目录不由宿主统一提供（2026-10-14 核对 dsh-config-manager /
 * dsh-mnemon / dsh-better-sidebar 的 package.json，均无任何「数据目录」声明字段），而现实里它们
 * 散落在 ~/.dsh-<name>/、~/.<name>/、~/.dsh/<name>/ 三种形态 —— 既有的 pluginFiles 分区只认
 * 「相对 ~/.dsh 根的白名单文件」，够不到其中任何一类。
 *
 * 本模块只做三件事，全部是纯函数 / 静态数据（零 I/O、零 node 内置依赖）：
 *  ① 冻结来源与「区域（area）」的形状；
 *  ② 内置已取证来源（每条如实标注取证强度，与 src/foreign/types.ts 的 ForeignEvidenceKind 同款纪律）；
 *  ③ 提供「路径 → 区域」的最长前缀匹配与 dsh.dataDirs 自述声明的解析。
 *
 * 三条不变量：
 *  - 不猜：路径一律来自插件自己的 README 明示位置或本机实测；不确定的来源宁可不收。
 *  - 缓存永不收录：role === 'cache' 的区域只用于报告（「我知道它在那儿，但不带」），绝不进包 ——
 *    缓存是可再生产物，带出去只会撑爆包体。
 *  - 环境变量覆盖即跳过且不读值：区域被环境变量覆盖时，绝不去读那个变量指向的目录（目标机的
 *    同名变量可能指向完全不同的盘符，按 home 相对路径写进包，换机后就落到「看起来对」的错误位置）。
 */
import type { SectionId } from '../schema/types.ts';
/** 第三方插件数据分区（两个：配置类与资产类） */
export type PluginDataSection = Extract<SectionId, 'pluginData' | 'pluginAssets'>;
/**
 * 区域角色 —— 决定它进哪个分区：
 *  - config：配置与轻量状态（进 pluginData）；
 *  - assets：大体积用户数据（上传的壁纸、本地数据库；进 pluginAssets）；
 *  - cache：可再生产物，两个分区都不进，只出现在报告里。
 */
export type PluginDataRole = 'config' | 'assets' | 'cache';
/** 取证强度（字段必填：未取证的来源不可能被悄悄列出来） */
export type PluginDataEvidence = 
/** 本机实测：目录确实存在，且据此实现 */
'measured'
/** 有可复现取证方式：夹具 + 单测端到端跑同一份布局 */
 | 'fixture'
/** 只有插件自己的文档（README 明示的位置/环境变量） */
 | 'documented';
/** 一个数据区域：home 相对 POSIX 路径（文件或目录同形，按磁盘实际形态判定） */
export interface PluginDataArea {
    readonly relPath: string;
    readonly role: PluginDataRole;
    /**
     * 会整体搬走本区域的环境变量名（任一存在即跳过本区域并报码）。
     *
     * 必须把「祖先区域的环境变量」也列进来：wallpaper-engine 的 DSH_WE_DATA_DIR 搬走的是整个
     * ~/.dsh-wallpaper-engine，只列 DSH_WE_UPLOAD_DIR 会让 uploads 在数据目录已被搬走时仍被当成
     * 「默认位置」去读（读到空目录 → 用户以为「没有上传的壁纸」）。
     */
    readonly envOverrides?: readonly string[];
    /** 仅目录区域：永不收集的**区域相对**子路径（POSIX 前缀），如 cache / bin */
    readonly excludeRel?: readonly string[];
}
/** 一个第三方插件来源 */
export interface PluginDataSource {
    /** 稳定机器 id（进单元 id 与报告；不随文案变化） */
    readonly id: string;
    /** 该来源对应的 npm 包名（自述声明的去重键） */
    readonly packages: readonly string[];
    readonly evidence: PluginDataEvidence;
    readonly areas: readonly PluginDataArea[];
}
/**
 * 内置来源 —— 只放已取证的。
 *
 * 收录口径（2026-10-14 调研：按 GitHub star + npm 周下载量排序后逐一核对）：
 *  - 有自有数据目录（不在 DSH 三个核心存储里，也不在 profile 树里）；
 *  - 目录里不含凭据（~/.commandcode/auth.json、~/.dsh/agy-accounts 这类命中即整来源不收录 ——
 *    文件类分区的内容不进 SecretScanner 的剥离路径，带出去就是明文）；
 *  - 位置由插件自己的 README 明示，或本机实测。
 *
 * 未收录但确实有数据目录的插件（如实登记，避免「没列出来 = 不存在」的误读）：
 *  - dsh-better-sidebar（4175 star）：状态全在 DSH settings/storages，已被既有分区覆盖；
 *  - @mars-sea/dsh-commandcode-provider（389 star）：~/.commandcode/ 含 auth.json（凭据）；
 *  - dsh-agy-link（111 star）：~/.dsh/agy-accounts 为账号池（凭据）。
 */
export declare const BUILTIN_PLUGIN_DATA_SOURCES: readonly PluginDataSource[];
/** 角色 → 分区（cache 不属于任何分区） */
export declare function sectionOfRole(role: PluginDataRole): PluginDataSection | null;
/** 该分区要收集的区域清单（保序：来源顺序 → 区域内顺序） */
export declare function areasForSection(sources: readonly PluginDataSource[], section: PluginDataSection): readonly {
    source: PluginDataSource;
    area: PluginDataArea;
}[];
/**
 * home 相对路径归一化 + 安全判定。
 *
 * 只接受 POSIX 相对路径：拒绝绝对路径（含 Windows 盘符写法 C:/x）、..、反斜杠、空段、
 * 以 / 结尾、含 NUL 的值。
 * 返回 null = 调用方必须报错/跳过，绝不「尽力而为」地拼一个路径出来。
 */
export declare function normalizeHomeRel(value: unknown): string | null;
/**
 * 目录区域的排除判定（issue：**excludeRel 是区域相对路径，rel 是 home 相对路径**）。
 *
 * 必须先把 rel 折成区域相对再比：`excludeRel: ['uploads']` 配 `.dsh-wallpaper-engine` 区域时，
 * 真正的判别对象是 `uploads/a.mp4`（区域相对），不是 `.dsh-wallpaper-engine/uploads/a.mp4`（home 相对）——
 * 直接拿 home 相对路径去 startsWith，排除项永远不命中，缓存与大资产会悄悄跟着配置分区一起进包。
 */
export declare function isExcludedRel(area: PluginDataArea, rel: string): boolean;
/** rel 是否属于该区域（文件区域 = 精确相等；目录区域 = 精确相等或前缀） */
export declare function relInArea(area: PluginDataArea, rel: string): boolean;
/**
 * 路径 → 区域（最长前缀优先）。
 *
 * 为什么必须最长优先：.dsh-wallpaper-engine 与 .dsh-wallpaper-engine/uploads 同时是区域，
 * 短前缀先匹配会把上传的壁纸算进「配置」分区（用户取消勾选大资产也照样带走几百 MB）。
 */
export declare function areaOfPath(entries: readonly {
    source: PluginDataSource;
    area: PluginDataArea;
}[], rel: string): {
    source: PluginDataSource;
    area: PluginDataArea;
} | null;
/**
 * 解析一个已安装插件 package.json 里的自述声明（dsh.dataDirs）—— 「让别的插件自己适配」的钩子。
 *
 * 契约（对外文档见 docs/contracts/plugin-data-declaration.md）：
 *   { "dsh": { "dataDirs": [ { "path": ".my-plugin", "role": "config", "env": ["MY_PLUGIN_DIR"] } ] } }
 *
 * 形状不认识就整条丢弃（返回 null），绝不猜；path 非法（绝对路径 / .. / 空段）同样丢弃。
 */
export declare function parseDeclaredDataDirs(packageName: string, manifest: unknown): PluginDataSource | null;
