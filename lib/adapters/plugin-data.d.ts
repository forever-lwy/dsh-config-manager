import type { RecursiveListing } from '../utils/recursive-walk.ts';
import type { PluginDataArea, PluginDataSource, PluginDataSection } from '../core/plugin-data-registry.ts';
import { FileCollectionAdapter } from './file-collection.ts';
import type { FilesSection } from '../schema/types.ts';
import type { ApplyResult, ExportOptions, ExportSection, ExportUnit, HostContext, ImportContext, PlanItem, SectionPreview } from '../core/types.ts';
/** 区域条目（来源 + 区域），编译期与运行期唯一的区域表示 */
export type PluginDataEntry = {
    source: PluginDataSource;
    area: PluginDataArea;
};
export interface PluginDataAdapterOptions {
    /** 内置来源（缺省 = BUILTIN_PLUGIN_DATA_SOURCES；测试注入假来源） */
    readonly sources?: readonly PluginDataSource[];
    /** 自述声明缓存 TTL；测试可传 0 关闭缓存 */
    readonly declaredTtlMs?: number;
    /**
     * 环境变量快照（缺省 process.env）。
     *
     * 为什么走构造参数而不是 HostContext：HostContext 上没有 env（它是宿主门面的集合），
     * 而「区域被环境变量搬走」这件事必须在**同一次调用**里可判定、可注入测试值 ——
     * 直接读 process.env 会让单测无法造「被覆盖」的场景（本机若恰好设了该变量，测试还会 flaky）。
     */
    readonly env?: Readonly<Record<string, string | undefined>>;
}
export declare class PluginDataAdapter extends FileCollectionAdapter {
    readonly id: PluginDataSection;
    readonly displayName: string;
    readonly defaultIncluded = false;
    readonly portability: 'deviceSpecific';
    /** home 根（相对路径 = home 相对路径，与 agentInstructions 同形） */
    readonly baseDir = "";
    private readonly builtin;
    private readonly declaredTtlMs;
    private readonly env;
    /**
     * 自述声明缓存。**必须带 ctx 键**（homeDir + profile）：这台机器装了某插件，不代表另一台装了 ——
     * 缓存若按实例共享，导入到「没装该插件」的目标机时会拿源机的声明去放行写入，
     * 白名单就变成了「谁先导入谁说了算」。
     */
    private declaredMemo;
    /** 每次收集调用一份作用域（listRelPaths 写、unitIdOf 读）：绝不放实例字段，否则并发两路互相覆盖 */
    private readonly scope;
    /**
     * 产物 section → 本轮区域表。
     *
     * `listUnits()` 在收集**结束之后**才被调用（作用域已退出），但它必须用「当初归组这批文件的那张区域表」
     * —— 重新解析会与清单不一致（声明来源在这期间装了/卸了插件就会出现「单元 id 不在清单里」）。
     * 键是产物对象本身，因此两路并发各挂各的，不存在覆盖。
     */
    private readonly unitsOf;
    constructor(section: PluginDataSection, options?: PluginDataAdapterOptions);
    /** 本分区可收集区域（内置 + 自述声明） */
    private allowedEntries;
    private allSources;
    /**
     * 已安装插件的自述声明（dsh.dataDirs）—— 本方法只做**缓存**，扫描实现见 plugin-data-declared.ts。
     *
     * 为什么缓存必须带 ctx 键（homeDir + profile）：DSH 的插件装在 \`profiles/<profile>/node_modules\`
     * 下（pnpm 隔离布局），而「这台机器装了某插件」不代表另一台装了 —— 缓存若按实例共享，
     * 导入到「没装该插件」的目标机时会拿源机的声明去放行写入，白名单就变成「谁先导入谁说了算」。
     */
    private declaredSources;
    /**
     * 区域是否被环境变量覆盖（覆盖 → 返回变量名；未覆盖 / 未声明 → null）。
     *
     * 判定口径：变量**存在且解析结果与默认位置不同**才算覆盖 —— 仅仅 \`DSH_WE_DATA_DIR=~/.dsh-wallpaper-engine\`
     * 这种「设成同一个值」的写法不该让区域凭空消失（那会让用户以为「没有数据」）。
     * 解析只做 \`~\` 展开与分隔符归一（不做 realpath：不读盘、不猜）。
     */
    private envOverrideOf;
    /**
     * 区域是否是**普通文件**（而不是目录 / 不存在）。
     *
     * 判据顺序为什么是这样：`statSize` 对「非普通文件」与「不存在」都返回 null，无法单独区分
     * 目录与缺失；所以先判「是文件」，其余一律按目录走遍历 —— 目录不存在时遍历返回空，
     * 结果同样是「没有内容」，不会把缺失误报成文件，也不会把目录误读成空内容而静默丢数据。
     * 门面未实现 statSize（旧宿主）时退回读一次内容：读得出来就是文件。
     */
    private isRegularFile;
    private static emptyListing;
    /**
     * 清单枚举 = 来源注册表的区域（覆写基类的目录递归；baseDir='' 时基类实现会递归**整个 home**）。
     *
     * **必须覆写**：home 根上递归会遍历 profiles/ sessions/ attachments/ 等全部内容（本机实测
     * 4000+ 文件 / 数百 MB），既慢又会把无关目录当成该分区的「可勾选单元」。
     */
    protected listRelPaths(ctx: HostContext): Promise<RecursiveListing>;
    /**
     * 单元 = 区域（最长前缀归属）。
     *
     * 用「本轮清单写入的区域表」而不是重新解析：listRelPaths 与本函数在同一次 collect 里成对调用，
     * 重算会让两次解析结果不一致时出现「单元 id 不在清单里」（选择器勾不上）。测试/异常路径下
     * \`active\` 可能是 undefined（例如直接调 listUnits），此时退回**内置来源**的最长前缀 —— 与清单口径同源。
     */
    protected unitIdOf(relativePath: string): string;
    /**
     * 读一个成员文件：**换根到系统 home 门面**（基类的其余逻辑 —— 体积、哈希、字节闸门 —— 一字不动）。
     *
     * 能走到这里说明 listRelPaths 产出过条目（缺门面时它不产出任何路径），因此缺门面即**抛错**，
     * 不再造一个「空文件」出来（那会把缺通道伪装成空内容）。
     */
    protected readMember(ctx: HostContext, rel: string, mode: 'content' | 'size', statTimes?: Map<string, number>): Promise<{
        data: Uint8Array;
        sizeBytes: number;
        contentHash: string;
    }>;
    export(ctx: HostContext, options: ExportOptions): Promise<ExportSection<FilesSection>>;
    preview(ctx: HostContext, options: ExportOptions): Promise<SectionPreview<FilesSection>>;
    /**
     * 收集结束后按**那一次收集**的区域表归组（审计 P2-7）。
     *
     * listUnits 通常在 export/preview 返回之后才被调用（作用域已退出），因此 export/preview 把区域表
     * 挂在产物对象上；这里重新铺作用域再交给基类，unitIdOf 规则只有一处实现。
     * 拿不到登记（例如消费者自己构造的 section、来自快照反序列化）→ 交给基类，走内置来源的兜底口径。
     */
    listUnits(section: ExportSection<FilesSection>): ExportUnit[];
    /**
     * 导入分析 + **写入路径白名单**（本分区唯一的越界防线）。
     *
     * 判据：路径必须是本机可解析的某个区域（内置来源，或已安装插件的自述声明）之下，且未被该区域
     * 的 excludeRel 排除。不满足 → Error（计划里可见、执行期不写），绝不「尽力而为」地写出去。
     */
    analyzeImport(data: FilesSection, ctx: ImportContext): Promise<PlanItem[]>;
    /** 应用前再查一遍白名单（纵深防御：plan 可能来自消费者手工构造/缓存反序列化） */
    applyItem(item: PlanItem, ctx: ImportContext): Promise<ApplyResult>;
}
