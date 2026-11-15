/**
 * 命令面板的纯数据注册表（UI v2 §5.3）—— `src/client/common/CommandPalette.tsx` 只做装配。
 *
 * 为什么要有它：v2 把一级导航从「功能目录」降级为「最常去的地方」，其余靠 `⌘K` 直达。
 * 于是**增一个功能 = 注册一条命令**，而不是再挤一个页签进 564px 的导航条。
 *
 * 分层铁律：本文件零依赖（不 import react / 浏览器 API / 客户端字典）——
 *   - **文案键**只声明字面量联合（`PaletteTitleKey`），实际文案由壳层用 `t()` 解析；
 *     键不存在于 `src/client/locales.ts` 时，壳层那一句 `t(item.titleKey)` 编译报错。
 *   - **匹配文本**（标题）由调用方通过 `titleOf` 注入，因此本模块与语言无关、node 可测。
 *   - 命令 id 用英文（`go.overview` / `export.open`），顺带充当英文别名：
 *     中文用户敲「导出」命中标题，英文用户敲 "export" 命中 id。
 */
/** 命令分组（渲染顺序见 `COMMAND_GROUP_ORDER`）。 */
export type CommandGroup = 'navigate' | 'library' | 'action' | 'view' | 'rescue';
/** 命令面板的分组渲染顺序。 */
export declare const COMMAND_GROUP_ORDER: readonly CommandGroup[];
/** 命令文案键：必须是 `src/client/locales.ts` 里存在的键（由壳层的 t() 编译校验）。 */
export type PaletteTitleKey = 'nav.home' | 'library.title' | 'nav.sync' | 'environment.title' | 'nav.market' | 'task.title.publish' | 'nav.export' | 'nav.import' | 'environment.tab.maintenance' | 'foreign.source.title' | 'task.title.runs' | 'task.title.history' | 'task.title.about' | 'palette.rescue.recovery' | 'palette.rescue.mode' | 'palette.rescue.rollback' | 'library.source.all' | 'library.kind.snapshot' | 'library.kind.backupFile' | 'library.kind.remote' | 'library.kind.market';
/** 可用性上下文：由壳层从 runStore 现算（不要在注册表里读 store）。 */
export interface CommandContext {
    /** 是否有未解决的恢复事项 */
    recoveryRequired: boolean;
    /** 进行中的任务数 */
    runningCount: number;
}
export interface CommandItem {
    id: string;
    group: CommandGroup;
    titleKey: PaletteTitleKey;
    /** 额外匹配词（同义说法、缩写）；与 id、标题一起参与匹配 */
    keywords: readonly string[];
    /**
     * 缺省 = 始终可用；返回 false 表示当前上下文不可用（面板灰显 + 键盘跳过）。
     *
     * **目的地类命令（页面 / 视图 / 流程面板）一律不用它**：那些去处任何时候都能打开，
     * 面板自己会渲染空状态（「暂无进行中的任务」比一个点不动的灰条有用得多）。
     * 这个口子只留给「当前上下文真的做不了」的动作（例如将来某个需要先选目标档案的动作），
     * 且**必须同时给得出原因**，否则用户只会看到一条无法点击的灰条。
     */
    enabled?: (ctx: CommandContext) => boolean;
}
export interface CommandMatch {
    item: CommandItem;
    /** 当前上下文下不可用：**仍然列出**（灰显），让用户知道这条命令存在、只是现在用不了 */
    disabled: boolean;
}
/** 默认最多返回多少条（面板限高，再多也看不见）。 */
export declare const COMMAND_RESULT_LIMIT = 40;
/**
 * 命令清单（UI v2 §5.3 的完整覆盖面）。
 *
 * 三条纪律：
 *   ① **每个可达去处都有一条命令** —— 页面（首页/产物库/同步/环境）、只读视图
 *      （活动记录 / 迁移历史 / 关于）、流程面板（导出 / 导入 / 逛市场 / 发布到市场）、
 *      维护与诊断（事故恢复与救援模式在其中）。
 *      壳层的 `runCommand` 认不出 id 就什么都不做，所以「dispatch 里有、这里没有」= 死代码。
 *   ② **文案统一复用导航与任务面板已有的键**：用户在导航条/面板标题上学到的名字，
 *      在命令面板里必须还能用（新造一套名字会让搜索无果）。
 *   ③ 关键词补齐中英同义说法与口语（"恢复" 也要命中事故恢复、"磁盘" 也要命中维护与诊断）。
 */
export declare const COMMANDS: readonly CommandItem[];
/**
 * 过滤并排序命令。
 *
 * 语义：
 *   ① 空查询（或全空白）→ 返回全部，**保持声明顺序**（分组渲染由调用方负责）；
 *   ② 大小写不敏感；
 *   ③ 排序：标题前缀 > id/关键词前缀 > 标题子串 > id/关键词子串；同档保持声明顺序（稳定）；
 *   ④ 不可用的命令**仍然列出**（`disabled: true`），只是面板灰显并让键盘跳过；
 *   ⑤ `limit` 兜底，避免把上千条命令塞进限高的面板。
 */
export declare function filterCommands(items: readonly CommandItem[], query: string, titleOf: (key: PaletteTitleKey) => string, ctx: CommandContext, limit?: number): CommandMatch[];
