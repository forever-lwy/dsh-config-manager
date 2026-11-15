import { type DshProfileCopyWarning, type DshProfileIssue, type DshProfileLaunchResult, type DshProfileLaunchWarning, type DshProfileMeta, type DshProfileRunningView, type DshProfileShape, type DshProfileStopOutcome } from '../profiles/dsh-profile-shared.ts';
/** 名称输入校验结果（UI 按码映射 i18n；null = 合法）。 */
export type ProfileNameIssue = 'required' | 'tooLong' | 'illegal' | 'reserved';
/** 校验输入框里的 profile 名：与 host 侧同规则，但把「空」与「过长」细分以便给出更准的提示。 */
export declare function validateProfileNameInput(name: string): ProfileNameIssue | null;
/** 列表排序：当前运行中的置顶 → 接着是「本插件启动的实例」→ 其余按名字（localeCompare）。 */
export declare function sortProfilesForDisplay(profiles: readonly DshProfileMeta[], opts?: {
    currentName?: string | null;
    runningNames?: readonly string[];
}): DshProfileMeta[];
/**
 * 面板阶段：**由切片派生**，不另存 status 字段 —— 列表已恢复时一次后台刷新不该把视图打回
 * 「加载中」（旧实现每次挂载都先置 loading，切回页签必然闪一下空态）；只有真正还没有数据
 * （`profiles === null`）才显示加载中。`loadError` 优先：加载失败要如实报错，不假装有数据。
 */
export type ProfilesPanelPhase = 'loading' | 'ready' | 'error';
export declare function profilesPanelPhase(profiles: readonly DshProfileMeta[] | null, loadError: string | null): ProfilesPanelPhase;
/** 列表页顶部的概览统计（全部来自列表本身，无额外 IO）。 */
export interface ProfilesSummary {
    total: number;
    web: number;
    headless: number;
    generic: number;
    /** 有 issue 的档案数（如 package.json 损坏） */
    broken: number;
    /** 已装 node_modules（有树外插件）的档案数 */
    withNodeModules: number;
    /** patch 条目总数（启发式计数） */
    patchEntries: number;
}
export declare function summarizeProfiles(profiles: readonly DshProfileMeta[]): ProfilesSummary;
/**
 * 列表行摘要事实：行内**只显示计数**（bundle 层数 / patch 条目 / 依赖数 / 是否装了 node_modules），
 * 完整清单（有序 bundle 层、逐条依赖）只在详情弹窗里展开——行内铺开整串包名会把行撑爆
 * （实测 web 档案 13 个包名把元信息挤成窄列）。
 */
export interface ProfileRowFacts {
    bundles: number;
    patchEntries: number;
    deps: number;
    hasNodeModules: boolean;
}
export declare function profileRowFacts(profile: DshProfileMeta): ProfileRowFacts;
/** 档案页展示的版本事实（读不到的一律 null；纯展示，不参与任何判定契约）。 */
export interface ProfileVersionFacts {
    dshVersion: string | null;
    sessionFormatVersion: number | null;
}
export declare function profileVersionFacts(profile: Pick<DshProfileMeta, 'dshVersion' | 'sessionFormatVersion'>): ProfileVersionFacts;
/**
 * 会话格式错配风险（相对**本实例**支持的格式版本）。
 *
 * 为什么值得在档案页提示：DSH 读会话时对非本 build 的 `header.version` 直接拒绝，而会话列表
 * （`listArtifacts()`）对这种会话是**静默 continue** —— 不报错、不显示，用户只会看到「对话消失」。
 *  - `newer`：该档案的 DSH 更新 → 它产生的对话在**本实例**里看不见；
 *  - `older`：该档案的 DSH 更旧 → 本实例产生的对话在**该档案**里看不见；
 *  - `none`：相同，或任一侧读不到版本 —— **不猜**，宁可不提示也不给假结论。
 */
export type ProfileSessionFormatRisk = 'none' | 'newer' | 'older';
export declare function sessionFormatRisk(profile: Pick<DshProfileMeta, 'sessionFormatVersion'>, currentFormatVersion: number | null | undefined): ProfileSessionFormatRisk;
/** 详情弹窗：bundle 层（**保持声明顺序** —— 顺序就是 patch 应用顺序，不可排序）。 */
export declare function bundleLines(profile: DshProfileMeta): string[];
/** 详情弹窗：依赖行（按包名排序，`<name> <spec>`；spec 为空时只给包名）。 */
export declare function dependencyLines(profile: DshProfileMeta): string[];
/**
 * 副本缺依赖时的安装命令（DSH 自己的 `cannot resolve profile bundle` 报错指向的就是这条）。
 * 只作为**文本**给用户复制，本插件不去执行它。
 */
export declare function profileInstallCommand(name: string): string;
/**
 * 复制档案时建议的副本名：`<name>-copy`，被占用则 `-copy-2`、`-copy-3`…（总长不超过 64 = checkProfileName 的上限）。
 * 超长前缀只截断前缀，避免用户一打开弹窗就吃 tooLong 校验。
 */
export declare function suggestCopyName(name: string, existingNames: readonly string[], maxLength?: number): string;
/**
 * 复制告警码 → i18n key。目前只有 `depsNotInstalled` 一类（副本没带 node_modules 却声明了依赖）。
 *
 * 为什么是 `Record<告警码, 文案键>` 而不是 if + 兜底：原先 if 与兜底 return 同一字面量，
 * 任何新告警码都会被静默显示成「缺 node_modules」的文案，注释里承诺的「新增码编译报错」
 * 并不存在（审计 P10-4）。Record 的键即告警码全集 —— 码增删而映射不跟上就是编译错误。
 */
declare const COPY_WARNING_KEY: Record<DshProfileCopyWarning, 'profiles.duplicate.warn.depsNotInstalled'>;
export declare function copyWarningKey(warning: DshProfileCopyWarning): (typeof COPY_WARNING_KEY)[DshProfileCopyWarning];
/** 终端启动命令（非 web 形态没有浏览器界面，只能在终端用它拉起）。 */
export declare function restartCommand(name: string): string;
/**
 * 能否「用该档案启动」独立实例：
 *  - 只有 web 形态有浏览器 GUI（headless/generic spawn 出去只会是用户看不见的进程）；
 *  - Desktop 独占档案（desktop）命令行根本起不来 —— 普通 dsh CLI 对它硬报
 *    'profile "desktop" is managed exclusively by the Electron application'。
 * 判据在 shared（宿主引擎共用同一份），这里只是视图层的名字。
 */
export declare function canLaunchProfile(profile: Pick<DshProfileMeta, 'name' | 'shape'>): boolean;
/**
 * 「启动被挡下」的原因分类 —— UI 据此选文案：managed 档案**不能**给
 * `dsh --profile desktop` 这条命令（那条命令本身就是被拒绝的那条），只能指路桌面端应用。
 */
export type ProfileLaunchBlockReason = 'managed' | 'notWeb';
export declare function launchBlockReason(profile: Pick<DshProfileMeta, 'name' | 'shape'>): ProfileLaunchBlockReason;
/** 启动回执的界面语义：ready = 已就绪（有 URL）；pending = 进程起来了但还没探通/没抓到 URL。 */
export type ProfileLaunchState = 'ready' | 'pending';
export declare function launchState(result: DshProfileLaunchResult): ProfileLaunchState;
/** 该档案是否有实例正在运行（台账 ∪ 心跳的合并视图；UI 的「启动 ↔ 停止」判据）。 */
export declare function isProfileRunning(running: readonly DshProfileRunningView[], name: string): boolean;
/** 取该档案的运行记录（没有 = undefined）；UI 用它显示端口/URL/来源。 */
export declare function runningRecordFor(running: readonly DshProfileRunningView[], name: string): DshProfileRunningView | undefined;
/**
 * 行内按钮该显示什么 —— 唯一判据，UI 不得各写一份。
 *  - `launch`：没有实例在跑 → 「启动」（非 web 形态点了给终端命令）；
 *  - `stop`：有实例在跑且不是自己 → 「停止」（owned = 本插件启动的；否则是别的实例，同样可停）；
 *  - `current`：就是当前这个实例 → 按钮禁用（停自己会死在响应途中，请关窗口/终端）。
 */
export type ProfileRowAction = 'launch' | 'stop' | 'current';
export declare function profileRowAction(name: string, running: readonly DshProfileRunningView[]): ProfileRowAction;
/** 停止回执 → i18n key（强制杀掉要如实说，不能假装是优雅退出）。 */
export declare function stopResultKey(result: DshProfileStopOutcome): 'profiles.stop.done' | 'profiles.stop.forced' | 'profiles.stop.gone';
/** 启动告警码 → i18n key（保持 key 字面量类型，便于 t() 编译期校验）。 */
export declare function launchWarningKey(warning: DshProfileLaunchWarning): 'profiles.launch.warn.notReady' | 'profiles.launch.warn.urlNotFound';
/** 形态 → i18n key（保持 key 字面量类型，便于 t() 编译期校验）。 */
export declare function shapeLabelKey(shape: DshProfileShape): 'profiles.shape.web' | 'profiles.shape.headless' | 'profiles.shape.generic';
/**
 * 该条目是否为「中断的档案复制」留下的半截副本。
 *
 * 判据**只有**宿主 `list()` 显式给出的 `incomplete: true` —— 绝不从 shape / bundles / 缺包名去猜：
 * 「generic + 空 bundles」同样可能是用户手工建的空档案，猜错就会把真档案标成残留（进而隐藏它的启动/改名入口）。
 */
export declare function isIncompleteProfileCopy(profile: Pick<DshProfileMeta, 'incomplete'>): boolean;
/** 残留行的来源事实（读不到一律 null，**不臆造**：host 上标记损坏时就是没有来源可讲）。 */
export interface IncompleteCopyFacts {
    /** 从哪个档案复制出来的 */
    copiedFrom: string | null;
    /** 复制开始时刻（原样 ISO 字符串；展示格式化由调用方决定） */
    startedAt: string | null;
    /** 目标目录绝对路径（界面按既有脱敏口径 redact 后展示） */
    dir: string | null;
}
export declare function incompleteCopyFacts(profile: Pick<DshProfileMeta, 'copiedFrom' | 'copyStartedAt' | 'dir' | 'incomplete'>): IncompleteCopyFacts;
/**
 * 行内可用动作 —— 残留行**只留删除**（判据集中在纯函数层，组件不得各写一份）。
 *
 * 为什么必须掐掉启动/停止/复制/改名：半截副本没有 package.json，`shape` 恒为 generic（`isLaunchableShape` 恒假），
 * 点「启动」必然以 notLaunchable 失败；改名/复制对它也没有意义（源清单都没写完）。把它伪装成普通档案 =
 * 给用户一排注定失败的按钮（t50 的原始症状）。
 * 只读详情（信息区）保留：残留行最有用的信息（目录 / 来源 / 时间）就在那里。
 */
export interface ProfileRowCapabilities {
    /** 信息区可点开只读详情 */
    detail: boolean;
    /** 「启动 / 停止 / 当前」那一格是否出现 */
    launchOrStop: boolean;
    duplicate: boolean;
    rename: boolean;
    /** 删除：普通档案与残留行都保留（残留行的唯一动作） */
    delete: boolean;
}
export declare function profileRowCapabilities(profile: Pick<DshProfileMeta, 'incomplete'>): ProfileRowCapabilities;
/**
 * 残留行展示用的开始时刻文本：可解析则格式化为本地时间，不可解析则原样回显（**绝不显示空** ——
 * 那会让「未完成的副本」看起来像没有来源信息的正常档案）。null = host 没给该字段。
 */
export declare function incompleteCopyStartedAtText(startedAt: string | null): string | null;
/**
 * 行内形态徽章 → i18n key：残留行必须显式标成「未完成的副本」，不得伪装成「自定义（generic）」档案。
 * 返回类型保持字面量联合（`t()` 的编译期键校验才会生效）。
 */
export declare function profileShapeLabelKey(profile: Pick<DshProfileMeta, 'shape' | 'incomplete'>): ReturnType<typeof shapeLabelKey> | 'profiles.shape.incomplete';
/**
 * 列表概览里的「未完成的副本」计数（与档案计数**分开**呈现）。
 *
 * 刻意不改 `summarizeProfiles`：那会动到既有 summary 断言（total/generic 的口径）；
 * 残留清单是独立一类信息，单独给一行计数即可。
 */
export declare function countIncompleteProfileCopies(profiles: readonly Pick<DshProfileMeta, 'incomplete'>[]): number;
/** issue → i18n key。 */
export declare function issueLabelKey(issue: DshProfileIssue): 'profiles.issue.manifestInvalid' | 'profiles.issue.patchTooLarge';
/** 时间戳（毫秒）→ 本地 `YYYY-MM-DD HH:mm`；null / 非法 = 空串。 */
export declare function formatProfileTime(ms: number | null): string;
/** 字节数 → 人类可读（B / KB / MB，保留一位小数）。 */
export declare function formatBytes(bytes: number): string;
export {};
