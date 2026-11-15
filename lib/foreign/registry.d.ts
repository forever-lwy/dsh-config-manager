import type { SectionId } from '../schema/types.ts';
import type { ForeignPlatform } from './platform-paths.ts';
import type { ForeignConflictPolicy, ForeignEvidenceKind, ForeignImportResult, ForeignSkip, ForeignSkipCode, ForeignSourceId } from './types.ts';
/**
 * 30 个来源 id（顺序 = §8.2 真值表顺序 = source-modules.ts 的形状表，稳定不变；UI 列表顺序取注册顺序而非此表）。
 *
 * **必须与 `FOREIGN_SOURCE_MODULE_SHAPES` 逐项同序**（file-budget / source-registry 双向断言）——
 * 漏扩这里会让 file-budget 的 C 档把来源模块误报成「未登记共享模块」。
 */
export declare const FOREIGN_SOURCE_IDS: readonly ForeignSourceId[];
export declare function isForeignSourceId(v: string): v is ForeignSourceId;
/**
 * 宿主交给来源的只读上下文。
 *
 * `env` 只用于**位置覆盖**判定（CLAUDE_CONFIG_DIR / HERMES_HOME / CODEX_HOME / COPILOT_HOME），
 * 来源不得把 env 里的值写进产物（凭据铁律：值绝不进包）。
 */
/** 可选上限覆盖：定义在叶子模块 types.ts（读器都 import 它，避免读器 → registry 的 type 环） */
import type { ForeignLimitOverrides } from './types.ts';
export type { ForeignLimitOverrides };
export interface ForeignSourceContext {
    /** 用户 home（Windows = %USERPROFILE%，macOS/Linux = $HOME） */
    readonly homeDir: string;
    /** 进程环境快照（只读；测试注入假值，不需要真实凭据类变量） */
    readonly env: Readonly<Record<string, string | undefined>>;
    /**
     * 目标机 DSH 的 SESSION_FORMAT_VERSION；缺省 = 不转码任何会话（绝不猜版本）
     */
    readonly targetSessionFormatVersion?: number;
    /**
     * 可选的项目目录（**additive**，2026-10，t22 接线）：契约 §8.2 为 Cursor / Codex 规定了
     * **项目级**路径（`<项目>/.cursor/mcp.json`、`<项目>/.cursor/rules/*.mdc`、`<项目>/.codex/config.toml`）。
     * 缺省 undefined = 只读用户级（与接线前的行为**逐字一致**，绝不猜「项目就是 cwd」）；
     * CLI 由 `--cwd` 显式传入（缺省 = 进程 cwd），宿主路由由 `?projectDir=` 传入。
     * 来源必须把它当作**只读第二作用域**：绝不写盘、绝不把绝对路径回传（那是机器身份）。
     */
    readonly projectDir?: string;
    /**
     * 目标平台（档 B，2026-10-05 补）：真值表函数**一律显式收平台**，绝不在纯函数里读
     * `process.platform`（理由见 platform-paths.ts 文件头：同一个函数必须在三平台 CI 上
     * 给出三种可离线覆盖的结果，Windows 分支不能只在 Windows 上跑得到）。
     *
     * 缺省 = 由来源装配层兜底为运行平台 —— 全仓唯一的兜底点是 `sessionSourceOf` 的
     * `ctx.platform ?? process.platform`；目标机与运行机不是同一平台（例如按 Windows
     * 真值表离线算路径）时由调用方显式传入。
     */
    readonly platform?: ForeignPlatform;
    /**
     * 可选上限覆盖（t36，**additive**）：缺省 undefined = 各来源默认值逐字不变。
     * 装配层（builtinForeignSources 的 build / sessionSourceOf）用 limitOverridesOf() 原样透传给读器。
     */
    readonly limits?: ForeignLimitOverrides;
}
/** 只读探测结果（GUI/CLI 的「本机装了什么」） */
export interface ForeignSourceDetection {
    /** 本机是否找到来源痕迹。找不到 ≠ 错误（未安装是正常状态） */
    readonly found: boolean;
    /** 命中的真值表位置（相对 home 的 POSIX 路径）。**只允许路径，绝不含任何值** */
    readonly paths: readonly string[];
    /** 探测期发现的问题（只读失败 / 0 字节 / 位置被覆盖），机器码见 types.ts */
    readonly skipped?: readonly ForeignSkip[];
}
/**
 * 探测选项（真值表函数与 `probePaths` 的入参）。
 *
 * 与 `session-source.ts` 的 `RootProbeOptions` **逐字段同形**（那里是会话类来源读盘层的
 * 入口形状）：`platform` 刻意是 `string` —— 归一化留给真值表函数自己走
 * `normalizePlatform`，调用方不必先猜一遍平台。契约层不反向 import 实现层，故在此声明。
 */
export interface ForeignProbeOptions {
    readonly homeDir: string;
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly platform: string;
    /** 显式项目目录（项目级真值位置；缺省不猜「项目 = cwd」） */
    readonly projectDir?: string | undefined;
}
/**
 * 一个外部来源。
 *
 * 两条实现纪律（由注册表测试与各来源自己的测试钉住）：
 *  - `detect` 只读、幂等、**绝不抛**：读不到 → found:false；部分读不到 → found:true + skipped
 *  - `build` 读盘 + 纯翻译，**不写盘**：产物是标准 bundle v1 的分区载荷，凭据值已剥离
 */
export interface ForeignSource {
    readonly id: ForeignSourceId;
    /** i18n 字典键（UI 侧映射文案；本层不产出用户可见字符串） */
    readonly labelKey: string;
    /**
     * **取证强度**（档 B，2026-10-05）：measured / fixture / documented 三档，逐来源**如实**
     * 取自真值表（`truth-table.ts` 是它的单一事实源，来源定义里不得自己填更好看的一档）。
     *
     * 设计意图见 `types.ts` 的 `ForeignEvidenceKind`：做成**必填字段**之后，
     * 「未取证却把来源列出来」在类型层就不可能悄悄发生。
     */
    readonly evidence: ForeignEvidenceKind;
    /**
     * 目标平台下的**静态探测位置**（真值表；运行时再在它下面动态枚举，绝不在这里读盘）。
     *
     * 配置类来源由同 id 的真值表条目派生（见 `probePathsOf`）；会话类来源由
     * `session-source.ts` 的 `sessionSourceOf` 传入各自 wiring 的实现。
     */
    probePaths(opts: ForeignProbeOptions): readonly string[];
    detect(ctx: ForeignSourceContext): Promise<ForeignSourceDetection>;
    build(ctx: ForeignSourceContext): Promise<ForeignImportResult>;
}
export type ForeignRegistryErrorCode = 
/** 同一个 id 注册两次（装配期错误：宁可炸，也不让后注册的悄悄覆盖先注册的） */
'duplicate-source'
/** 未知 id（CLI --from 与宿主路由的对外面） */
 | 'unknown-source'
/** 形状非法（id 不在冻结词表 / labelKey 为空 / detect|build 不是函数） */
 | 'invalid-source';
export declare class ForeignSourceError extends Error {
    readonly code: ForeignRegistryErrorCode;
    /** 相关来源 id（unknown 时 = 用户给的那个字符串） */
    readonly sourceId: string;
    /** 当前已注册 id 清单（按注册顺序）；CLI/宿主据此给出「可用来源」提示 */
    readonly available: readonly string[];
    constructor(code: ForeignRegistryErrorCode, sourceId: string, available: readonly string[]);
}
export declare class ForeignSourceRegistry {
    private readonly sources;
    constructor(initial?: readonly ForeignSource[]);
    register(source: ForeignSource): this;
    has(id: string): boolean;
    /** 按 id 查找；未知 id 抛稳定错误（绝不返回 undefined，也绝不回退到默认来源） */
    get(id: string): ForeignSource;
    /** 注册顺序（= UI 列表顺序，稳定；与 FOREIGN_SOURCE_IDS 的顺序无关） */
    list(): readonly ForeignSource[];
    ids(): readonly string[];
    get size(): number;
}
export declare function createForeignSourceRegistry(initial?: readonly ForeignSource[]): ForeignSourceRegistry;
/** 外部来源单元 id 的固定首段。**刻意不是** SectionId 的任一取值，见 dshUnitIdNamespaceOf */
export declare const FOREIGN_UNIT_ID_PREFIX = "foreign";
/** DSH 既有单元 id 的**非分区**命名空间（src/adapters/units.ts 的 plugin:/patch:/workspace:） */
export declare const DSH_UNIT_ID_NAMESPACES: readonly string[];
/**
 * 外部来源单元的**来源限定** id：`foreign:<source>:<section>:<unit>`。
 *
 * 用途只有一个：**选择 / 诊断 / 报告**（GUI 与 CLI 需要说清「这条来自哪个来源」）。
 * 它**绝不进入 bundle 相对路径**，也**绝不替换** DSH 既有单元 id —— 目标机适配器仍然
 * 按 `<section>:<unit>` 计算（sessions 单元 = `sessions:<projectKey>/<目录名>`）。
 */
export declare function foreignUnitId(source: ForeignSourceId, section: SectionId, unit: string): string;
export interface ForeignUnitIdParts {
    readonly source: ForeignSourceId;
    readonly section: SectionId;
    readonly unit: string;
}
/**
 * 解析外来源单元 id；**不是**外来源形态一律返回 null（不认识就说不认识，绝不猜）。
 * 未知 source / 未知 section 也返回 null —— 向后兼容靠「additive：旧值不变」，不靠宽松解析。
 */
export declare function parseForeignUnitId(id: string): ForeignUnitIdParts | null;
export declare function isForeignUnitId(id: string): boolean;
/**
 * DSH 既有单元 id 的命名空间：分区 id（17 个 SectionId）或 plugin/patch/workspace；
 * 外来源形态（首段 = foreign）与无法识别的前缀一律 **null**。
 *
 * 两个方向都不误判是这条契约的核心（§8.3）：`foreign` 不在 SectionId 词表里、也不等于
 * plugin/patch/workspace，因此两个命名空间按构造互斥，且既有 id 的形态一字未动。
 */
export declare function dshUnitIdNamespaceOf(id: string): string | null;
/**
 * 同 id 会话冲突的机器码：**后者不覆盖、跳过并报码**（用户决策）。
 * 类型标注为 ForeignSkipCode —— 该码被从 types.ts 的 union 里删掉时这里直接编译失败。
 */
export declare const FOREIGN_SESSION_CONFLICT_CODE: ForeignSkipCode;
/** 外部来源导入唯一的冲突策略；语义上不存在覆盖分支（见 types.ts 的 ForeignConflictPolicy） */
export declare const FOREIGN_CONFLICT_POLICY: ForeignConflictPolicy;
/**
 * 一个来源的本机检测结果（GUI 的来源发现路由 / CLI 的摘要共用）。
 *
 * 三个**只读**保证：paths 是 §8.2 真值表里的**相对位置**（绝不回传绝对路径 = 机器身份），
 * skipped 只含机器码，二者都不含任何配置值（凭据铁律在检测层同样成立）。
 */
export interface ForeignSourceStatus {
    readonly id: ForeignSourceId;
    readonly labelKey: string;
    readonly found: boolean;
    readonly paths: readonly string[];
    readonly skipped: readonly ForeignSkip[];
}
/**
 * 30 个内置来源（顺序 = §8.2 真值表顺序 = `source-modules.ts` 的形状表；
 * 每调用一次返回一份新定义，注册表逐次装配）。前 6 个配置类内联定义，后 24 个会话类调各自工厂。
 */
export declare function builtinForeignSources(): readonly ForeignSource[];
/** 30 个内置来源的注册表（宿主路由与 CLI 的**唯一**装配点） */
export declare function createBuiltinForeignSourceRegistry(): ForeignSourceRegistry;
/**
 * 逐来源检测（**绝不抛**）：单来源探测失败只影响它自己，其余来源照常返回。
 * 失败时如实给一条 source-unreadable（origin = 来源 id），绝不静默把它当成「未安装」。
 */
export declare function detectForeignSources(registry: ForeignSourceRegistry, ctx: ForeignSourceContext): Promise<ForeignSourceStatus[]>;
