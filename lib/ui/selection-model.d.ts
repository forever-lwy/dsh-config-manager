/**
 * 导出内容选择模型（Phase 1 条目级导出选择；框架无关纯函数，node 可测）。
 *
 * 为什么需要这一层：导出页原本有两种状态 ——「快速」与「自定义分区勾选」—— 是两条各自
 * 渲染的代码路径。一旦加入条目级勾选，就会出现「同一套勾选框、两套行为」。本模块把选择
 * 收敛成**唯一**的稀疏表示，快速/自定义变成同一模型上的两个预设：
 *
 *   Selection { sections: SectionId[]; excluded: string[] }
 *
 * - `sections`：勾选的分区（稀疏 —— 初值即推荐分区，与改造前 Custom 的初值一致）；
 * - `excluded`：被**排除的单元 id**（稀疏 —— 默认全选、只记例外），
 *   因此 sessions 上千条也不会把 sessionStorage 里的持久化状态撑大。
 *
 * 分区不可细分（node.units 为空）时自然退化为整体开关 —— 不需要第二套分支。
 * 单元 id 由宿主侧 ConfigAdapter.listUnits() 产出，与导入侧 PlanItem.id 同一命名空间。
 */
import type { SectionId } from '../schema/types.ts';
import type { ImportPlan, PlanItem, PlanItemKind, PluginAreaRef, Portability } from '../core/types.ts';
import type { ExportGroup } from './types.ts';
/** 一个可单独勾选的最小单元（来自 /export-preview 的 items）。 */
export interface SelectionUnit {
    id: string;
    label: string;
    /** 副标题（版本 / 绝对路径；宿主的原始数据，非 UI 文案） */
    detail?: string;
    /** 成员文件数（文件类单元） */
    fileCount?: number;
    sizeBytes: number;
    /** 原子组：必须与之同进同出的其它单元 id（如 pnpm-workspace.yaml ↔ patch 文件） */
    lockedWith?: string[];
    /**
     * 二级分组名（宿主直出：sessions 按工作区聚合时为工作区标题）。缺省 = 平铺渲染，
     * 与既有分区（skills / pluginFiles / …）的表现完全一致。纯展示层，不参与勾选契约。
     */
    group?: string;
    /**
     * 本单元拥有的会话 id（工作区单元专用；issue #45）。
     *
     * 用途：勾选联动 —— 勾了会话就自动勾上它所属的工作区，取消工作区就取消它的会话。
     * 取值 = 工作区记录 sessionIds **原样**（DSH 一律写 `session-<uuid>`）；与会话单元 id 的末段（目录名，
     * 可能是 `session-<uuid>` 也可能是裸 `<uuid>`）用 `sessionIdKey()` 归一化后配对 —— 两种形态直接做
     * 字符串比较会失配（真机实测 546/570 会话因此联不上工作区）。
     */
    sessionIds?: string[];
    /**
     * 本单元 **path 的 cwd 目录键**（工作区单元专用；issue #45 勾选联动的第二判据）。
     *
     * 为什么需要它：DSH 注册表 `sessionIds` 覆盖率很低（真机实测一次可选择的 570 条会话里只有 23 条在
     * 里面），而 DSH 自己按「会话 cwd 的目录键 == 工作区 path 的目录键」会话显示在工作区下。勾选联动若
     * 只认 sessionIds，就会出现「界面明明把对话挂在某工作区下、勾它却不联动」。
     */
    projectKey?: string;
    /**
     * 父对话的会话裸键（**只有子代理会话才有值**；宿主在 /export-preview 里按 DSH 的会话存储关系下发）。
     *
     * 用途：「父 ↔ 子代理会话」勾选联动（勾父自动勾上它的子代理会话、勾子自动带上父）。没有这个字段
     * 时联动整段失效 —— 界面勾了什么与包里装了什么就会不一致（真机事故：勾 2 条、包里 41 条）。
     */
    parentSessionId?: string;
    /**
     * 空白会话（从未提问过；宿主下发的**事实**，只有 sessions 分区可能有值）。
     *
     * 用途：DSH 自己给这类会话的标题是本地化的「新会话」—— 界面据此显示同样的占位名，
     * 而不是把 `session-<uuid>` 当标题（用户要求「始终用对话标题」）。文案由界面按当前语言解析。
     */
    blank?: boolean;
    /**
     * 该插件**声明的**第三方数据区域（宿主下发；只有 `plugin:<包名>` 单元可能有值）。
     *
     * 用途：「按插件看」视图的树骨架 —— 静态知识（内置来源表 + 插件自述 dsh.dataDirs），
     * **零数据目录 I/O**；体积与「磁盘上到底有没有」等该分区清单到货后再填。
     * 纯展示字段，不参与勾选/导出契约（契约只认 id）。缺省 = 该插件没有已知关联（不猜）。
     */
    relatedAreas?: readonly PluginAreaRef[];
}
/** 一个分区及其可勾选单元；units 为空 = 本分区不可细分（UI 只给整体开关）。 */
export interface SelectionSection {
    section: SectionId;
    /** 宿主报告的条目总数（不可细分分区用于展示） */
    count: number;
    sizeBytes: number;
    units: SelectionUnit[];
    /**
     * 清单**尚未读取**（调用方逐分区惰性拉取时的显式标记；缺省 = 已读过，或这条分区不可细分）。
     *
     * 为什么必须与「units 为空」分开：`units` 为空有两种完全相反的事实 ——
     *  ①「读过了，这条分区没有可拆单元」（整体开关，如 ui / credentialsStatus）；
     *  ②「还没去读」（导出页只预取已勾选分区）。
     * 混为一谈的实测后果（2026-10-12 用户反馈）：未勾选的分区既**没有展开控件**、又没有条目可选，
     * 用户必须先勾上整个分区才能展开与逐项挑选 —— 顺序被反过来了。
     * 纯展示标记：不参与勾选/导出契约（sectionPickState / buildExportRequest 一律不看它）。
     */
    unitsUnread?: boolean;
    /**
     * 可移植性（来自分类目录 ExportCategory.portability）。UI-09：选择器据此给
     * 「设备相关」徽章，并在勾选到这类分区时就地警示 —— 「全选」不得静默把
     * sessions / pluginFiles / credentialsStatus 一起勾上而毫无提示。
     * 未知来源（如导入侧由计划项派生的分区）留空 = 不渲染徽章（不猜）。
     */
    portability?: Portability;
    /** 涉及秘密状态（如 credentialsStatus）：安全提示用，绝不显示值。 */
    sensitive?: boolean;
    /**
     * 分区所属的**导出分组**（`ui/types.ts` 的 EXPORT_GROUPS）。
     *
     * 用途：选择器在分组切换处插入标题行（General / 插件与扩展 / …）。渲染顺序**由调用方给的顺序
     * 决定**（宿主目录本来已按分组排好，UI 不重排）。缺省 = 不渲染分组标题 ——
     * 导入向导与市场通道的节点没有这个概念，行为逐像素不变。
     */
    group?: ExportGroup;
}
/** 唯一的导出选择状态。 */
export interface Selection {
    sections: SectionId[];
    excluded: string[];
}
/** 分区级三态。 */
export type SectionPickState = 'all' | 'none' | 'partial';
/**
 * 单元列表的**默认渲染上限**（UI-15）。
 *
 * 取值理由（2026-09 用户反馈修正）：此前是 100，而真实会话库实测 660 个单元 —— 用户展开
 * 「历史会话」只看到前 100 条 + 一行「显示全部」，读成了「只有这些 / 只选了这些」，
 * 必须再点一次才敢确认，是纯粹的困惑来源。现在放宽到 1000：真实规模的库**展开即全量**，
 * 折叠只在异常大的分区（上万条）上兜底 —— 「显示全部」仍在，但不再挡在常见规模前面。
 * 660 行静态 DOM 的渲染代价可接受；**不引入第三方虚拟列表**（AGENTS.md 默认禁止），
 * 真到上万条再谈虚拟化。
 */
export declare const UNIT_RENDER_LIMIT = 1000;
/** 单元列表渐进披露结果（UI-15）。 */
export interface VisibleUnits {
    /** 本帧要渲染的单元 */
    shown: SelectionUnit[];
    /** 被折叠的单元数（0 = 已全部渲染） */
    hidden: number;
}
/** 单元列表渐进披露：默认只给前 limit 条，`showAll` 为 true 时全量。 */
export declare function visibleUnits(units: readonly SelectionUnit[], showAll: boolean, limit?: number): VisibleUnits;
/**
 * 中段省略（UI-16）：用 `…` 收掉字符串**中段**，保留尾部 —— 会话名 / 路径 / 文件名
 * 的区分信息通常在尾部（时间戳、版本、扩展名），尾部截断会让两条记录看起来一模一样
 * （DESIGN.md §9 anti-pattern 5）。
 *
 * 纯函数（node 可测）：只改显示文本，不改数据；完整值由调用方放进 `title`。
 * 与 CSS `text-overflow: ellipsis` 叠加使用（CSS 兜底实际容器宽度）。
 */
export declare function tailWeightedEllipsis(text: string, max?: number): string;
/** 缺省：全选（excluded 为空 = 没有任何例外）。 */
export declare function defaultSelection(sections: SectionId[]): Selection;
/** 把 /export-preview 的分区响应映射为选择模型的分区（宿主类型 → UI 模型，显式转换一次）。 */
export declare function sectionsFromPreview(preview: readonly {
    section: SectionId;
    count: number;
    sizeBytes: number;
    items?: readonly SelectionUnit[];
}[]): SelectionSection[];
/** 一个二级分组；label = null 表示「没有分组的单元」（非 sessions 分区就是这一种）。 */
export interface UnitGroup {
    label: string | null;
    units: SelectionUnit[];
}
/**
 * 按声明的分组名把单元切成二级分组。
 *
 * 语义要点：
 *  - **没有任何单元带 group → 返回单个 label:null 分组**，渲染路径与改造前逐像素一致
 *    （skills / pluginFiles / self 等分区零变化）；
 *  - 组顺序 = 首次出现顺序（宿主已按「工作区 → 最近活跃」排好，UI 不再重排）；
 *  - 无分组的单元单独成一组，排在**最前**（它们通常是该分区的公共条目）。
 */
export declare function groupUnits(units: readonly SelectionUnit[]): UnitGroup[];
/**
 * 分组内已勾选单元数。
 *
 * **必须先看所属分区**（与 sectionPickState / selectedUnitCount 同一口径）：稀疏表示下
 * 「不在 excluded 里」只说明「没有显式排除」，分区整体没勾时同样成立 —— 只看 excluded 会渲染出
 * 「分区 已选 0/13、13 个子项却全部打勾」的自相矛盾（用户实测：点「全不选」后子项仍然勾着）。
 */
export declare function groupSelectedCount(sel: Selection, group: UnitGroup, section: SectionId): number;
/** 二级分组三态（与分区三态同一套口径；分组只是分区内的视图）。 */
export declare function groupPickState(sel: Selection, group: UnitGroup, section: SectionId): SectionPickState;
/** 分组级勾选：整组一起选/取消（并保证其所属分区处于勾选状态）。 */
export declare function toggleUnitGroup(sel: Selection, node: SelectionSection, group: UnitGroup, checked: boolean): Selection;
export declare function isUnitSelected(sel: Selection, unitId: string): boolean;
/**
 * 单元勾选态（**渲染层唯一口径**）。
 *
 * 与 `isUnitSelected` 的差别：后者是稀疏表示下的「未显式排除」，分区整体没勾时它依然为 true，
 * 直接拿它渲染勾选框会出现「分区计数 0/13 + 13 个子项全打勾」的自相矛盾（用户实测：
 * 点「全不选」后分区标题变成未勾选，子项却还是勾的）。渲染必须先看分区，再看排除集。
 */
export declare function unitChecked(sel: Selection, section: SectionId, unitId: string): boolean;
/** 分区三态：不可细分分区退回整体开关。 */
export declare function sectionPickState(sel: Selection, node: SelectionSection): SectionPickState;
/** 已勾选条目数（不可细分分区用宿主的 count 兜底）。 */
export declare function selectedUnitCount(sel: Selection, node: SelectionSection): number;
/**
 * 分区行是否渲染**展开控件**。
 *
 * - `units` 非空 = 清单已在手上，当然可展开；
 * - `unitsUnread === true` = 清单**尚未读取** —— 同样必须渲染展开控件：展开就是触发读取的入口。
 *
 * 此前只有「已勾选分区」会预取清单，于是未勾选分区连展开控件都没有（用户必须先勾整个分区才能
 * 逐项挑选）；现在懒加载的入口挪到展开动作上，顺序才符合直觉。
 */
export declare function sectionExpandable(node: Pick<SelectionSection, 'units' | 'unitsUnread'>): boolean;
/** 分区行计数区的状态（组件只按它渲染）。 */
export type SectionCountState = 'pending' | 'failed' | 'unread' | 'count';
/**
 * 计数区状态：读取中 > 读取失败 > 未读 > 正常计数。
 *
 * 「未读」必须自成一态：它此前共用「已选 0/0」的渲染，用户读到的是「这条分区是空的」，
 * 而事实是「还没去读」（与 F-03 同一条口径：没读到清单的分区绝不显示 0 条目）。
 * 读取中 / 读取失败优先，因为它们比「未读」更具体 —— 有结论时不说「不知道」。
 */
export declare function sectionCountState(node: Pick<SelectionSection, 'unitsUnread'>, state: {
    pending: boolean;
    failed: boolean;
}): SectionCountState;
/**
 * 勾选/取消一个单元。
 * - **lockedWith 原子组联动**：组内任一成员的状态变化同步到全组（issue #35：
 *   pnpm-workspace.yaml 与 patch 文件拆开会让目标机 pnpm 拒绝一切 add）；
 * - 勾选单元时自动勾选其所属分区（避免出现「勾了条目却没选分区」的空转状态）。
 */
export declare function toggleUnit(sel: Selection, nodes: SelectionSection[], unitId: string, checked: boolean): Selection;
/** 分区级勾选（整体开关；不可细分分区只切 sections，不碰 excluded）。 */
export declare function toggleSection(sel: Selection, node: SelectionSection, checked: boolean): Selection;
/** 全选 / 全不选（工具栏批量动作）：作用于当前可见（可能是搜索过滤后的）分区集合。 */
export declare function selectAll(nodes: SelectionSection[], checked: boolean): Selection;
export interface PickerSummary {
    /** 已勾选分区数 */
    sections: number;
    /** 已勾选单元数（可细分分区按单元计，不可细分分区按整体计 1） */
    units: number;
    /** 可见单元/分区总数（用于「N/M」） */
    totalUnits: number;
    /** 估算体积合计（按勾选比例摊到分区，避免为未勾选项额外请求宿主） */
    sizeBytes: number;
}
export declare function pickerSummary(sel: Selection, nodes: SelectionSection[]): PickerSummary;
export interface ExportRequestPlan {
    only: SectionId[];
    /** 只在「部分勾选」的分区上下发；整分区全选或缺省 = 不下发（少一次误解的机会） */
    includeItems?: Partial<Record<SectionId, string[]>>;
}
/**
 * Selection → 导出请求参数。这是本模型与引擎契约的唯一出口。
 *
 * 关键语义：**分区勾选但单元全被排除 = 该分区不导出**（不产出空载荷分区，
 * manifest.sections 如实为 false），与「取消勾选整个分区」等价 —— 用户在 UI 上
 * 看到的「一个都没勾」与引擎行为必须一致。
 */
export declare function buildExportRequest(sel: Selection, nodes: SelectionSection[]): ExportRequestPlan;
/** 搜索过滤：按分区名/单元名/副标题匹配；命中的分区保留其全部单元（便于继续勾选同分区其它项）。 */
/** 会话单元 id（sessions:<projectKey>/<sessionId>）→ sessionId；非会话单元 → undefined。 */
/**
 * 会话单元 id（`sessions:<项目键>/<目录名>`）→ **cwd 目录键**（项目键）；非会话单元 / 形状不符 → undefined。
 *
 * 用途：勾选联动的第二判据 —— 与工作区单元的 `projectKey` 比较，口径与 DSH「把会话显示在工作区下」一致。
 */
/**
 * 工作区单元的 cwd 目录键：宿主直出的 `projectKey` 优先，缺省时用 `detail`（= 工作区绝对路径）现算。
 *
 * 为什么要有兜底：`projectKey` 是后加的宿主字段，**旧宿主**（未重启的 DSH 进程）不会回传它，而工作区单元的
 * `detail` 一直就是绝对路径。只在 detail 形如绝对路径时才现算 —— 计划项的 detail 是描述文案
 * （如 `current={...} imported={...}`），绝不会被误当成路径。
 */
export declare function workspaceProjectKeyOf(unit: {
    projectKey?: string;
    detail?: string;
}): string | undefined;
export declare function sessionProjectKeyOfUnit(unitId: string): string | undefined;
export declare function sessionIdOfUnit(unitId: string): string | undefined;
/** 本次勾选动作（哪个单元、点完后是勾还是取消）—— 父/子两条规则必须按动作方向定夺。 */
export interface SessionParentChange {
    unitId: string;
    checked: boolean;
}
/**
 * 父对话 ↔ 子代理会话联动。三件事，全部由**用户勾选的父对话**这一侧驱动：
 *  - **勾父** → 连带勾上它的子代理会话（传递：子会话自己还有子会话也一起带）；
 *  - **勾子** → 连带勾上它的父对话（父链向上传递）—— 与导出的「向上补父对话」同口径，
 *    否则界面勾了子、包里却多出父，勾选与包内容不一致；
 *  - **取消父** → 连带取消它的子代理会话；**取消子** → 只取消这一条（父对话留着）。
 *
 * 为什么必须按动作方向（而不是无脑闭包）：两条规则会互相抵消 —— 取消父之后若还跑
 * 「已勾选的子 ⇒ 勾上父」，父立刻被勾回来（与工作区联动完全同一个坑，见 focus 的注释）。
 *
 * @param change 本次点击的单元与状态；缺省（分区/分组/全选等批量动作、清单到货后补跑）
 *   只做**正向闭包**：已勾选的父把子补齐、已勾选的子把父补齐，绝不取消任何东西。
 */
export declare function applySessionParentCoupling(sel: Selection, nodes: SelectionSection[], change?: SessionParentChange): Selection;
/**
 * 会话 ↔ 工作区联动（issue #45）：① 勾了会话 → 自动勾上「拥有它的工作区」；② 取消工作区 → 它的会话也取消。
 *
 * 为什么写在选择模型层：导出页与导入向导共用同一个 ContentPicker，规则写一次两端行为一致
 * （「同样的勾选框不一样的行为」是本仓库明确要消灭的状态）。只按 sessionIds 匹配、不翻译路径：
 * 跨机时工作区路径与会话 cwd 都是源机形态，按路径匹配不可靠。无 sessionIds 的单元一律不参与联动（不猜）。
 */
/**
 * 本次勾选动作的方向：① 只勾会话 → 带上其工作区；② 只动工作区 → 撤销未勾工作区的会话；both = 两条都跑。
 *
 * 为什么必须有方向：两条规则在「会话勾着、它的工作区却被取消」这种状态下会互相抵消（谁后跑谁翻盘）。
 * 用动作方向定夺，行为才是确定的：取消工作区一定连带取消它的会话，勾上会话一定带上它的工作区。
 */
export type SessionWorkspaceCouplingFocus = 'sessions' | 'workspaces' | 'both';
/**
 * 会话↔工作区联动需要的**伙伴分区**（导出页的清单是逐分区惰性拉的）。
 *
 * 联动的唯一数据源是**工作区单元上的 `sessionIds`**：勾了会话但工作区清单还没读出来 → 没有 sessionIds 可读 →
 * 联动**静默失效**（用户真机复验：取消工作区后再勾一个对话，对应工作区不会回来）。所以只要勾了会话，就
 * 必须把工作区清单一起读出来；工作区记录是纯元数据（每条几十字节），这点代价可以忽略。
 *
 * 反向刻意不加（勾着工作区、会话清单没读）：那种状态下会话单元根本不在选择器里，没有需要联动的会话。
 */
export declare function couplingInventorySections(sections: readonly SectionId[]): SectionId[];
/** 两份选择是否等价（按集合；用于「清单到货后补一次联动」避免无谓写库 / 自激渲染）。 */
export declare function sameSelection(a: Selection, b: Selection): boolean;
export declare function applySessionWorkspaceCoupling(sel: Selection, nodes: SelectionSection[], focus?: SessionWorkspaceCouplingFocus): Selection;
export declare function filterSections(nodes: SelectionSection[], query: string): SelectionSection[];
/**
 * 高风险分区（严格分层信任的默认：须用户显式勾选）。
 * 市场通道（配置市场装回）与本地导入共用同一份定义 —— 不再各自维护一套。
 */
export declare const HIGH_RISK_ADAPTERS: ReadonlySet<SectionId>;
export declare function isHighRiskAdapter(adapter: SectionId): boolean;
/** 该项是否需要重启 DSH 才生效（Install 及插件级变更）。 */
export declare function itemNeedsRestart(adapter: SectionId, kind: PlanItemKind): boolean;
/** 计划中出现过的分区（去重）。 */
export declare function planAdapters(plan: ImportPlan): SectionId[];
/**
 * 单元展示名：剥掉分区前缀（`skills:bar` → `bar`）与常见实体前缀（`plugin:x` → `x`）。
 * 导出给 `src/ui/market-import.ts`（市场逐项摘要用同一套命名口径，不另写一套剥前缀规则）。
 */
export declare function unitLabel(unitId: string, adapter: SectionId): string;
/**
 * 计划 → 选择模型（分区 → 最小单元）。
 * 单元 id 优先取 PlanItem.unitId（适配器声明），缺省退回项 id；与导出侧同一命名空间。
 */
export declare function sectionsFromPlan(plan: ImportPlan): SelectionSection[];
/**
 * 计划的默认选择。
 * - `highRiskDefaultOff: false`（本地导入，D2）：全部勾选 —— 本地备份的信任级别高于市场，
 *   且保持改造前的行为（原本就是全量导入），不制造"看起来能导入却没勾"的困惑；
 * - `highRiskDefaultOff: true`（市场装回）：高风险分区默认不勾（严格分层信任）。
 * 差异只由这一个入参表达，**不是两套逻辑**。
 */
export declare function defaultSelectionFromPlan(plan: ImportPlan, opts?: {
    highRiskDefaultOff?: boolean;
}): Selection;
/** 该项是否被排除（未勾选其分区，或其自身/所属单元命中排除集）。 */
export declare function isPlanItemExcluded(item: PlanItem, selection: Selection): boolean;
/** 被用户排除的计划项（供报告如实展示「N 项未导入」）。 */
export declare function excludedPlanItems(plan: ImportPlan, selection: Selection): PlanItem[];
/**
 * 本次导入**确实会写盘**的分区集合。
 *
 * 用途：路径映射阶段的过滤依据 —— PathIssue 只说明「这条路径来自哪个分区」，
 * 还需要「这个分区这次会不会写」才能判断该不该问用户（工作区全为 Skip 或整个分区被取消时，
 * 为它填映射是纯粹的无效劳动）。
 *
 * 入参必须是**已裁剪**的子计划（buildSelectedPlan 的产物）：本函数只按 kind 判定，
 * 不再重复做选择语义，避免出现第二套「哪些项会被导入」的判定。
 */
export declare function planWriteSections(plan: ImportPlan): Set<SectionId>;
/**
 * 选择是否**留下了**计划中的任何一项（UI-05「全不选」守卫）。
 *
 * 无 = 用户把所有分区/条目都取消了 → 执行这次导入不会写入任何东西
 * （只会建一个安全快照并报成功），所以向导必须在预览步就地提示并禁用「下一步」，
 * 与导出侧的 `nothingSelected`（`buildExportRequest(...).only.length === 0`）同一套语义。
 * 判据与执行侧完全同源（同一个 isPlanItemExcluded）—— 不写第二套「空」判定。
 */
export declare function selectionHasItems(plan: ImportPlan, selection: Selection): boolean;
/**
 * 按选择裁剪计划 → 子计划。这是本模型与导入引擎的唯一出口。
 *
 * 三处必须**同步重算**，否则会出鬼故事（实测过的坑）：
 *  - `items`：执行依据（引擎只跑 plan.items）；
 *  - `needsRestart`：不能沿用整份计划的值，否则取消安装插件后仍提示「需重启」；
 *  - `estimatedActions`：进度/预估口径（与 analyzer 一致地跳过 Skip/Warning）；
 *  - `missingSecrets`：**必须跟着过滤** —— 否则用户取消了某插件，向导仍会索要它的密钥。
 */
export declare function buildSelectedPlan(plan: ImportPlan, selection: Selection): ImportPlan;
/**
 * 导入选择 + 它所属的 ZIP 路径。
 *
 * 为什么要绑定 zipPath：换一份备份后，旧选择里的分区 id 可能在新计划里不存在，
 * 直接沿用会让「未勾选该分区」= 全部项被排除 —— 导入会**静默变成什么都没做**。
 * 绑上 zipPath 后，陈旧选择自动失效回落到默认全选，无需在向导的每个 reset 点手动清空
 * （那种散落的清空逻辑正是最容易漏一处的地方）。
 */
export interface ImportSelectionState {
    zipPath: string;
    selection: Selection;
}
/** 生效的导入选择：陈旧（不同 ZIP）或未设置 → 默认全选。 */
export declare function effectiveImportSelection(plan: ImportPlan | null, zipPath: string | null, state: ImportSelectionState | null): Selection | null;
/** 生效的导入计划（选择裁剪后的子计划）；plan 为空时返回 null。 */
export declare function effectiveImportPlan(plan: ImportPlan | null, zipPath: string | null, state: ImportSelectionState | null): ImportPlan | null;
/** 树上一个叶子的种类：插件清单条目 / 配置类数据区域 / 大文件区域 */
export type PluginLeafKind = 'plugin' | 'config' | 'assets';
export interface PluginTreeLeaf {
    kind: PluginLeafKind;
    section: SectionId;
    /** 单元 id（present 时可勾；unread / absent 时只是占位，不可勾） */
    unitId: string;
    /** 宿主直出文本：插件包名 / 区域 home 相对路径 */
    label: string;
    /** 单元副标题（版本等；只有已读到清单时才有） */
    detail?: string;
    sizeBytes: number;
    /** present=清单里确有该单元（可勾）；unread=该分区清单还没读；absent=已读但没有这个单元 */
    state: 'present' | 'unread' | 'absent';
}
export interface PluginTreeEntry {
    /** 插件包名（= plugins 单元 id 的 `plugin:` 后缀） */
    name: string;
    /** 插件清单条目（该分区还没读到清单时为 undefined） */
    main?: PluginTreeLeaf;
    /** 该插件声明的数据区域（宿主静态表；可能为空数组） */
    areas: PluginTreeLeaf[];
    /** main + areas（渲染顺序：清单条目在前，区域按宿主声明顺序） */
    leaves: PluginTreeLeaf[];
}
/** 「无法归属到具体插件」的桶：整块来自某个分区（不猜归属）。 */
export interface PluginTreeBucket {
    section: SectionId;
    /** 该分区的清单是否已读到（false = 还没读 / 读取失败，界面给「读取该分区」入口） */
    loaded: boolean;
    units: SelectionUnit[];
}
export interface PluginTree {
    /** 插件清单是否已读到；未读到时 entries 为空（界面提示先读取插件分区） */
    pluginsLoaded: boolean;
    entries: PluginTreeEntry[];
    /** 桶：无归属的分区单元（插件的补丁行 / pnpm-workspace.yaml；pluginFiles 整块） */
    buckets: PluginTreeBucket[];
}
/**
 * 合并进「按插件看」那棵树的分区（导出选择器里「插件与扩展」组的成员）。
 *
 * 这四项的归属键只有 npm 包名（plugin:<包名> ↔ 来源注册表的 packages）；self（配置管理器设置）
 * **不在**这里 —— 它不是插件，仍按普通分区行渲染。清单顺序仍由调用方给的节点顺序决定
 * （宿主目录已按 EXPORT_GROUPS 排好，树只在第一个成员处渲染一次）。
 */
export declare const PLUGIN_TREE_SECTIONS: readonly SectionId[];
/** 该分区是否合并进「按插件看」的树（见 PLUGIN_TREE_SECTIONS）。 */
export declare function isPluginTreeSection(section: SectionId): boolean;
/** 把选择器分区模型投影成「按插件看」的树（纯函数）。 */
export declare function pluginTree(nodes: readonly SelectionSection[]): PluginTree;
/** 树上的搜索过滤：插件名命中 → 保留它全部叶子；否则只保留标签命中的叶子；桶按单元标签过滤。 */
export declare function filterPluginTree(tree: PluginTree, query: string): PluginTree;
/** 该插件节点下**真实可勾选**的叶子（unread / absent 不参与勾选）。 */
export declare function pluginEntryLeaves(entry: PluginTreeEntry): PluginTreeLeaf[];
/**
 * 该插件名下**已知**的叶子（存在 + 还没读到清单的区域声明）。
 *
 * 计数与三态用它，**不用 pluginEntryLeaves（只含 present）**：否则「已选 n/m」会随清单到货跳动 ——
 * 折叠时显示 1/1、展开（触发了读取）后变成 1/3，用户看到的是「数字自己变了」（2026-10-17 实测反馈）。
 * absent（注册表说有、盘上确实没有）不计入：它永远不可勾，算进去只会让分母虚高。
 */
export declare function pluginEntryKnownLeaves(entry: PluginTreeEntry): PluginTreeLeaf[];
export declare function pluginEntryTotalCount(entry: PluginTreeEntry): number;
export declare function pluginEntrySelectedCount(sel: Selection, entry: PluginTreeEntry): number;
/**
 * 插件节点三态（与分区/分组同一套口径，但分母用**已知**叶子）。
 *
 * 还有区域没读到（unread）时最多只能是 `partial`：那些单元此刻勾不上，
 * 报「全选」会让用户以为已经全带上（真正补齐见 ContentPicker 的待补勾队列）。
 */
export declare function pluginEntryPickState(sel: Selection, entry: PluginTreeEntry): SectionPickState;
/**
 * 插件节点级勾选：把它名下**存在的**单元一起勾 / 取消。
 *
 * 逐个走 toggleUnit：分区未勾时「勾一个单元 = 只勾这一个」的既有语义因此自动生效，
 * 不会因为一键操作就把整个 pluginData / pluginAssets 分区静默全选。
 */
export declare function togglePluginEntry(sel: Selection, nodes: SelectionSection[], entry: PluginTreeEntry, checked: boolean): Selection;
/** 树上所有**真实可勾选**的叶子（各插件名下存在单元的合计；不含未归属 / 遗留数据桶）。 */
export declare function pluginTreeLeaves(tree: PluginTree): PluginTreeLeaf[];
export declare function pluginTreeLeafCount(tree: PluginTree): number;
/** 树上**已知**的叶子（存在 + 未读取；不含 absent）—— 一级区块的计数与三态用它，口径同插件节点。 */
export declare function pluginTreeKnownLeaves(tree: PluginTree): PluginTreeLeaf[];
export declare function pluginTreeTotalCount(tree: PluginTree): number;
export declare function pluginTreeSelectedCount(sel: Selection, tree: PluginTree): number;
/**
 * 「插件」一级区块（把全部插件收在一个可折叠区块里）的三态。
 *
 * 只算**插件名下真实存在的叶子**：未归属 / 遗留数据是「无法归属的东西」，不参与这个勾选框 ——
 * 否则「全选所有插件」会顺手把没人认领的散落配置一起带上。
 */
export declare function pluginTreePickState(sel: Selection, tree: PluginTree): SectionPickState;
/** 一级区块勾选：把所有插件名下存在的单元一起勾 / 取消（逐个走 toggleUnit；含未归属桶吗？不含）。 */
export declare function togglePluginTree(sel: Selection, nodes: SelectionSection[], tree: PluginTree, checked: boolean): Selection;
/**
 * 展开「插件」一级区块前还需要读取哪些分区的清单（惰性）。
 *
 * **插件清单自己没读到也要报**（否则一级区块展开后只有一句「先读取插件分区」却没有入口）。
 */
export declare function pluginTreeUnreadSections(tree: PluginTree): SectionId[];
/** 一条待补勾请求（键 = 「插件」一级区块，或某个插件名）。 */
export interface PluginPendingCheck {
    key: string;
    kind: 'root' | 'entry';
}
/**
 * 待补勾的出队判定（纯函数，node 可测）。
 *
 * 背景：清单是**惰性**读取的 —— 用户勾「插件」一级区块或某个插件时，它名下可能还有区域没读到
 * （unread），那些单元此刻勾不上。若就此结束，用户会以为「全带上了」，实际包里少了数据目录/大文件。
 * 调用方在点击时先勾已知的、把没到齐的键入队；清单到货（nodes 变化）后再调本函数补齐。
 *
 * 判据 = 该节点名下**已无 unread 叶子**（`pluginEntryUnreadSections` / `pluginsLoaded`）：
 * 到齐 → 出队并补齐；没到齐 → 留在队列里继续等（绝不猜成「已勾」）。
 */
export declare function applyPluginPendingChecks(sel: Selection, nodes: SelectionSection[], tree: PluginTree, pending: readonly PluginPendingCheck[]): {
    selection: Selection;
    remaining: PluginPendingCheck[];
};
/**
 * 两条待补勾队列是否等价（同序、同 key、同 kind）。
 *
 * 为什么必须有它：`applyPluginPendingChecks` 每轮都返回**新数组**（内容可完全不变）。
 * 调用方若无条件写回 state，effect 依赖 [pendingChecks, …] 就会自激成无界重渲染
 * （清单读不到时队列永不出队 → 页面卡死，审计 P9-1）。
 */
export declare function samePendingChecks(a: readonly PluginPendingCheck[], b: readonly PluginPendingCheck[]): boolean;
/** 勾上该插件前还需要读取哪些分区的清单（展开/点击时触发惰性读取）。 */
export declare function pluginEntryUnreadSections(entry: PluginTreeEntry): SectionId[];
