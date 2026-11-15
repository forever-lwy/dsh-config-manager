import { FileCollectionAdapter } from './file-collection.ts';
import type { HostContext, ImportContext, PlanItem, SkillDefinitionView } from '../core/types.ts';
import type { FilesSection } from '../schema/types.ts';
import type { RecursiveListing } from '../utils/recursive-walk.ts';
/** 技能服务技能的虚拟路径（相对 baseDir）：`<name>/SKILL.md`。 */
export declare function skillServiceRel(name: string): string;
/**
 * 该来源的技能能否进本分区备份（issue #102）。
 *
 * `bundled` = 插件包 / DSH 内置目录里随插件发行的技能（宿主的 `SkillSummaryView.source`）。
 * 技能服务端口只暴露 **SKILL.md 文本**（`ctx.skills.get()` 返回 name/description/content），
 * 技能的 `scripts/`、模板、资源文件一律拿不到 —— 备份出来必然是**残缺影子**；导入后它还会以
 * 同名同 rank 落在 `$DSH_HOME/skills`，跟插件自己的版本争谁生效，且不随插件升级更新。
 * 正确姿势是「装/升级对应的插件」，不是搬 SKILL.md。
 *
 * `source === undefined`（旧宿主不报来源）必须当**可迁移**：否则旧宿主上一个技能都备份不到。
 */
export declare function isMigratableSkillSource(source?: string): boolean;
/**
 * 由技能定义重建 `SKILL.md` 文本。
 *
 * 字段口径与 dsh-skill-filesystem 的解析器逐一对齐（多写一个键就会让 DSH 报
 * 「unsupported」并**忽略整个技能**，少写一个键则会丢失调用策略）：
 *  - 必需：`name` / `description`；
 *  - 可选：`whenToUse`；
 *  - 调用策略**只接受** `disable-model-invocation` / `user-invocable`
 *    （`modelInvocable` / `userInvocable` 会被判为 legacy 键并拒绝）。
 */
export declare function buildSkillFile(def: SkillDefinitionView): string;
export declare class SkillsAdapter extends FileCollectionAdapter {
    readonly id: 'skills';
    readonly displayName: string;
    readonly defaultIncluded: boolean;
    readonly portability: import("../schema/section-registry.ts").SectionPortability;
    readonly baseDir = "skills";
    /** 本趟由技能服务贡献的技能定义（相对路径 → 定义）。每次 collect 前重建，避免跨趟串味。 */
    private serviceSkills;
    /**
     * 枚举 = 目录扫描 ∪ 技能服务清单。
     *
     * 服务不可用（旧宿主 / 无 skills 服务）时**完全退回**目录扫描：一个告警都不多加，
     * 行为与改造前逐项一致（file-collection.test.ts 钉住「无服务时不产生新告警」）。
     */
    protected listRelPaths(ctx: HostContext): Promise<RecursiveListing>;
    /** 分区内相对路径 → 枚举清单口径（含 baseDir；本分区 baseDir 恒为 `skills`，没有根分区形态）。 */
    private listRelPathOf;
    /**
     * 读成员：先看本趟的服务清单（虚拟 `<name>/SKILL.md`），命中则用重建文本；
     * 否则走基类的文件读（含 statSize 快路径）。
     *
     * 两条路都必须给出**同一个体积口径**（UTF-8 字节数），否则字节闸门在预览与导出之间分叉。
     */
    protected readMember(ctx: HostContext, rel: string, mode: 'content' | 'size', statTimes?: Map<string, number>): Promise<{
        data: Uint8Array;
        sizeBytes: number;
        contentHash: string;
    }>;
    /**
     * 导入侧：备份里的 bundled 技能一律跳过（issue #102）。
     *
     * 旧备份（本修复之前导出的）会把插件内置技能写成残缺影子，导入后落在 `$DSH_HOME/skills`，
     * 与插件自己的同名技能争生效顺序。这里在**计划阶段**就把它们降级成 Skip（不写盘、不进
     * 冲突收集器），并给出可理解的说明；不是静默丢弃。
     *
     * 目标机技能清单只查一次（`ctx.target.skills.list()`）—— 逐文件调 `get()` 会是 O(n²)；
     * 查不到（旧宿主 / 服务抛错）就**原样放行**，绝不因为判不出而少导入用户真正的技能。
     */
    analyzeImport(data: FilesSection, ctx: ImportContext): Promise<PlanItem[]>;
}
