import type { MsgFunc } from '../core/messages.ts';
import type { RecursiveListing } from '../utils/recursive-walk.ts';
import type { FilesSection, SectionId } from '../schema/types.ts';
import type { ApplyResult, ConfigAdapter, ExportOptions, ExportSection, ExportUnit, HostContext, ImportContext, PlanItem, Portability, SectionPreview, ValidationResult } from '../core/types.ts';
/**
 * 文件类分区导出的**单分区累计字节闸门**：分区内文件内容合计放不下的单元整块剔除（见 export()）。
 *
 * 取值依据（不是随手拍的数）：
 *  1) **对称性** —— 导入侧对上传的备份包有硬上限 256 MiB（MAX_UPLOAD_BYTES，src/index.ts 与
 *     src/routes/kit.ts 的上传路径）；导出侧此前**没有任何体积约束**，于是会出现「导出成功、
 *     传不回来」（审计 core-flow F-12 / sync#F-12）。取同一个 256 MiB 作**单分区**上限：
 *     任何单个分区都落在导入侧上传路径能收的范围内。
 *  2) **内存峰值** —— 导出时文件内容以完整 Uint8Array 驻留内存（ZIP 组装前全量在内存里），同步通道
 *     还要再写一份。闸门把「单分区常驻」钳在 256 MiB 以内（峰值 ≈ 上限 + 正在读的那个单元），
 *     不再是「会话附件多大就多吃多少」。
 *  3) **与既有同类上限同量级** —— MAX_MARKET_ZIP_BYTES = 64 MiB、DEFAULT_MAX_JSON_BYTES = 64 MiB、
 *     MAX_LOCAL_TARBALL_BYTES = 100 MiB、MAX_PATCH_FILE_BYTES = 2 MiB。文件类分区装的是**用户真实
 *     文件**，所以取「导入侧能收」的 256 MiB，而不是为省内存随意调小（那会平白少带用户数据）。
 *  4) **为什么按分区而不是按整包** —— 整包体积由用户勾选跨分区决定；闸门要能给出「哪些分区、哪些
 *     单元没进去」的可执行信息，落在分区/单元层才可解释。
 *
 * 超限时**绝不静默**：被整块剔除的单元清单进 ExportSection.warnings（导出报告可见）。
 */
export declare const MAX_FILE_SECTION_BYTES: number;
export declare abstract class FileCollectionAdapter implements ConfigAdapter<FilesSection> {
    /** 文件集合：`relativePath` 是身份而非配置 → 永不被导入时的前缀映射改写（见 ConfigAdapter.fileCollection） */
    readonly fileCollection = true;
    abstract readonly id: SectionId;
    abstract readonly displayName: string;
    abstract readonly defaultIncluded: boolean;
    abstract readonly portability: Portability;
    /** 相对 homeDir 的基准目录（与 core/backup.ts FILE_BASES 一致） */
    abstract readonly baseDir: string;
    /**
     * 最小可拆单元的 id（相对 baseDir 的路径）。
     *
     * 缺省 = **首个路径段** —— 目录 bundle 整体成一个单元，这是技能/会话/预设的正确粒度
     * （拆开即失效）。平铺文件即自身。pluginFiles / self 覆写为「整条相对路径」：
     * 它们的白名单文件彼此独立，不构成 bundle。
     */
    protected unitIdOf(relativePath: string): string;
    /** 清单里的路径 → 相对 baseDir 的路径（baseDir 为空表示整目录即根）。 */
    protected relPathOf(rel: string): string;
    /**
     * 单分区累计字节上限（缺省 MAX_FILE_SECTION_BYTES = 256 MiB，见该常量注释）。
     *
     * 生产代码不覆写；留成受保护方法只为让测试能构造「超限」场景（真实阈值 256 MiB 无法在单测里
     * 造出来而不吃掉 256 MiB 内存）。若要给用户配置入口，应走 ExportOptions（src/core/types.ts），
     * 而不是在子类里飘一个隐式默认值。
     */
    protected sectionByteLimit(): number;
    /**
     * 条目级选择（Phase 1）：只导出白名单命中的单元。
     *
     * 过滤发生在 readFile **之前** —— 未勾选的文件不读盘，大分区（sessions）取消勾选后
     * 导出耗时应显著下降。allow === undefined（键缺省）= 全量，与改造前完全一致。
     */
    /**
     * 单元级预筛选钩子（缺省 null = 不筛选）。
     *
     * 子类可据 `options` 与清单计算「允许导出的单元」子集（如 sessions 的「最新 N 个」，
     * 见 core/session-select.ts）；`keep: null` = 本次不施加单元级筛选（但仍可带告警）。
     * 在 readFile **之前**执行：未入选的文件不读盘。
     */
    protected restrictUnits(_ctx: HostContext, _rels: readonly string[], _options: ExportOptions): Promise<{
        keep: Set<string> | null;
        warnings: string[];
    } | null>;
    export(ctx: HostContext, options: ExportOptions): Promise<ExportSection<FilesSection>>;
    /**
     * 只读预览（`/export-preview`）：与 `export()` **共用同一个内核**（`collect`），
     * 只把「读文件内容 + SHA-256」换成 `ctx.fs.statSize`。
     *
     * 为什么必须共用：预览说的「会带哪些单元、各多大」就是用户勾选的依据，一旦与真实导出
     * 分叉，用户会按预览勾选却拿到不同的包（`file-collection.test.ts` 逐项断言两者相等）。
     */
    preview(ctx: HostContext, options: ExportOptions): Promise<SectionPreview<FilesSection>>;
    /**
     * 分区收集内核（`export` / `preview` 共用）。
     *
     * - `mode === 'content'`：读文件内容 + 算 SHA-256（真实导出）；
     * - `mode === 'size'`：只取字节数（`ctx.fs.statSize`），不解码、不哈希（预览）。
     *
     * 两种模式共用**同一套**单元分组、条目级白名单、单分区字节闸门与告警生成 ——
     * 因此「预览的单元 / 体积 / 告警」与「导出的单元 / 体积 / 告警」逐项相等。
     *
     * 返回值里的 `entries` **只含** `relativePath`/`data`/`contentHash` 三个字段：
     * `FilesSection` 是备份格式的一部分，多带内部字段会被序列化出去；体积走旁路 `sizes`。
     */
    private collect;
    /**
     * 分区清单枚举（`export` / `preview` 共用；两者必须走同一份清单，否则预览与导出分叉）。
     *
     * **单文件分区必须覆写它**：`AgentInstructionsAdapter` 的 `baseDir` 是 ''（AGENTS.md 就放在
     * `$DSH_HOME` 根），走缺省实现会递归**整个 home** —— 实测 4016 个文件 / 242 MB / 4.8 s，而且
     * 选择器会把 `profiles/`、`sessions/`、`attachments/` 这些无关目录当成该分区的「单元」。
     */
    protected listRelPaths(ctx: HostContext): Promise<RecursiveListing>;
    /**
     * 读一个成员文件。
     *
     * - `content`：读内容并按需算 SHA-256（真实导出）；
     * - `size`：优先 `ctx.fs.statSize`（只 stat，不读内容）；门面未实现或返回 null（文件消失 /
     *   读不到）时**退回 readFile** —— 与改造前把「读不到」暴露成同一个错误，绝不把未知体积
     *   当成 0（0 会让字节闸门少算，把本该剔除的单元放进预览，预览与导出就分叉了）。
     *
     * 受保护而非私有（issue #71）：`SkillsAdapter` 的成员有一部分**不在磁盘上**
     * （来自 `ctx.skills` 技能服务的技能被重建成 `<name>/SKILL.md` 虚拟路径），
     * 需要在这里按路径分流 —— 覆写后基类的单元分组 / 字节闸门 / 告警 / 预览-导出一致性全部照旧。
     */
    protected readMember(ctx: HostContext, rel: string, mode: 'content' | 'size', statTimes?: Map<string, number>): Promise<{
        data: Uint8Array;
        sizeBytes: number;
        contentHash: string;
    }>;
    /** 单元清单（零 I/O：直接由 export 产物归并）。 */
    listUnits(section: ExportSection<FilesSection>): ExportUnit[];
    /**
     * **身份内容**（相对 baseDir 路径 + 盘上/包内字节 → 参与哈希与导出的字节）。
     *
     * 缺省 = **原字节**：对文件类分区来说「相对路径 + 内容哈希」就是身份语义，不得改动。
     * 覆写者只应用于剔除**不属于「配置身份」的易变字段**（见 SelfAdapter 的两个调度配置：
     * 运行态每轮都被改写，整文件哈希会恒判 Conflict —— issue #73；同一批字段还会让
     * 分区 hash 每轮都变 → 自动同步每轮真推一次 —— issue #127）。
     *
     * 用途有两处，且**必须共用同一份字节**，否则「判等」与「落地」分叉：
     *   1. analyzeImport 的幂等判定（包内 vs 盘上）；
     *   2. collect() 的导出载荷与 contentHash —— hashSection 按字节算分区 hash，
     *      载荷里留着易变字段就等于每轮都判「本地有改动」。
     * 两条契约：
     *   1. **必须收敛**：applyItem 写盘后再分析一次必须判 Skip，否则同步永不收敛；
     *   2. **未改写时返回同一引用** —— 调用方据此复用导入侧已算好的 contentHash，
     *      不给 sessions 这类大分区白算一遍哈希。
     * 判不出可比形态（解析失败等）时必须**原样返回**：绝不把「判不出来」当成「相同」或「不同」。
     */
    protected comparableContent(_relativePath: string, data: Uint8Array): Uint8Array;
    analyzeImport(data: FilesSection, ctx: ImportContext): Promise<PlanItem[]>;
    applyItem(item: PlanItem, ctx: ImportContext): Promise<ApplyResult>;
    /**
     * 结构校验（5 个文件类分区共用：skills / agentPresets / agentInstructions / sessions / self）。
     *
     * **整段样板都接入共享骨架 `validateJsonSection`** —— t7 接入 version 守卫与形状检查收尾，t11 接入
     * object 守卫；dataVersion 由注册表按 `this.id` 派生，等价于此前的字面量 `!== 1`
     * （SECTION_DATA_VERSION = 1）。本类里已无手写样板。
     *
     * object 守卫的**文案**为什么还要参数：文件类分区历史上用的是**专用消息键**
     * `adapter.validate.fileSection`（'文件分区数据必须是对象'，不含 `{subject}` 占位符），与骨架缺省的
     * `adapter.validate.object` + `{subject}` 是**键**级差异 —— 第 5 参 subject 补不了它。t11 给骨架加了
     * 可选第 6 参 `objectMessageKey`，这里传专用键：5 个分区的用户可见报错文案与改造前**逐字相同**，
     * 同时不放任何手写样板。等价由 src/adapters/file-collection.test.ts 与 outputs/t7-equiv/ 的差分脚本钉住。
     */
    validate(data: FilesSection, msg?: MsgFunc): Promise<ValidationResult>;
}
