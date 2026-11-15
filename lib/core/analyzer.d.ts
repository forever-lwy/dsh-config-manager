import { type ZipArchive, type ZipSafetyLimits } from '../utils/zip.ts';
import type { BootSafetyReport } from './boot-safety.ts';
import type { SectionId } from '../schema/types.ts';
import type { MsgFunc } from './messages.ts';
import { type ConfigAdapter, type ExecutedItem, type HostContext, type ImportAnalysis, type ImportDecisions, type ImportPlan, type ImportResult, type SessionFormatProbeResult, type TransactionSnapshotContext, type SnapshotStore } from './types.ts';
/**
 * 执行阶段顺序（设计 §5.4：副作用大的 patch/安装最后）。导出供宿主生命周期等复用同一顺序。
 *
 * t30：分区全集来自注册表 `SECTION_IDS`（已按 applyOrder 升序），本数组只做**稳定排序**按相位分层 ——
 * 原先手抄的 13 项清单已删除，因此不再可能「漏抄一个分区 → 它的计划项被静默跳过」。
 * 与历史顺序的逐项等价由 core/backup-plan.test.ts 钉住（相位内保持注册表顺序 ⇒ 真实分区相对次序不变）。
 */
export declare const APPLY_ORDER: readonly SectionId[];
export interface AnalyzerOptions {
    ctx: HostContext;
    adapters: ConfigAdapter[];
    snapshotStore: SnapshotStore;
    limits?: ZipSafetyLimits;
    /** 依赖存在性检查器（缺省不检查；m5/宿主可注入 which 类实现） */
    dependencyChecker?: (command: string) => Promise<boolean>;
    /** m4 可注入强化版 ZIP 安全解析 */
    parseZipOverride?: (buf: Uint8Array, limits?: ZipSafetyLimits) => ZipArchive;
    /** 消息翻译器（缺省 ctx.msg ?? zh） */
    msg?: MsgFunc;
    /**
     * 会话格式探针（宿主注入；**core 不解析 DSH 存储格式**，只消费探针结果）。
     *
     * 缺省 = 不做会话格式体检（旧调用方零改动）。
     */
    sessionFormatProbe?: (files: readonly {
        relativePath: string;
        data: Uint8Array;
    }[]) => SessionFormatProbeResult;
    /** SEC-05：按分区豁免「表外条目阻断」（缺省空 = 严格）；判据见 security/unverified-file-blocks.ts */
    extraEntryExemptSections?: readonly SectionId[];
}
/** m1：每完成一个计划项的进度回调信息（Host 侧 run 状态更新用） */
export interface PlanItemProgress {
    adapter: SectionId;
    /** 已处理计划项序号（1 起，含 skip/warning 信息项） */
    index: number;
    /** 将实际执行的计划项总数（APPLY_ORDER 内各项合计） */
    total: number;
    /** 该项最终状态（ok/skipped/warning/failed） */
    status?: ExecutedItem['status'];
    /** 当前计划项 id（非敏感） */
    detail?: string;
}
/** 清空已验证归档缓存（测试用；宿主在「归档被本插件自己改写」等场景也可调用）。 */
export declare function clearVerifiedBundleCache(): void;
export declare class Analyzer {
    private readonly ctx;
    private readonly adapters;
    private readonly snapshotStore;
    private readonly limits?;
    private readonly dependencyChecker?;
    private readonly parseZipFn;
    private readonly msg;
    private readonly sessionFormatProbe?;
    private readonly extraEntryExemptSections;
    /**
     * 会话内 bundle 缓存（zipPath → { 身份, 解析结果 }）。
     *
     * t14 / core-F1 修：与跨请求 `verifiedBundles` **共用同一套硬边界** ——
     *  - `refresh`（写盘入口）一律不看它；
     *  - `reuse` 命中也必须身份（大小 + mtimeMs）一致；stat 读不到就不命中（宁可多读）。
     * 修前它只按路径命中且位于身份判定之前，于是**同一个 Importer 实例**上 plan → execute
     * （sync-engine.applyMergePlan 的生产形态）会拿陈旧结果去改用户数据，refresh 语义在门面上不成立。
     */
    private readonly bundleCache;
    constructor(opts: AnalyzerOptions);
    /**
     * 读入 + 校验归档。
     *
     * @param mode `reuse` = 只读入口（analyze / plan）：同一份归档（路径 + 大小 + mtime 全同）
     *   可以复用**已校验**的结果；`refresh` = 写盘入口（execute）：一律重新读盘 + 重新校验，
     *   不给「校验后文件被换掉」留窗口。
     */
    private loadBundle;
    private extractSections;
    /**
     * 会话格式体检（宿主探针 + 本机支持的版本）—— **每份归档只跑一次**，结果供三方共用：
     * 分析告警、计划项标记（`formatUnsupported`）、ImportAnalysis 摘要。
     *
     * 为什么必须在导入前说：DSH 读会话时对**非本 build 的格式版本直接拒绝**，而会话列表
     * （`listArtifacts()`）对这种会话是**静默 continue** 的 —— 不报错、不显示，用户只会看到
     * 「对话没了」。高版本能读低版本（DSH 自带 V0→V4 迁移链），反向不可读，所以只对
     * 「包里的版本 > 本机支持的版本」告警；本机版本解析不到时**不猜**（宁可不报，也不谎报兼容）。
     *
     * 不可判定（无探针 / 无 sessions / 本机版本解析不到 / 探针抛错）一律返回 null。
     */
    private resolveSessionFormats;
    private sessionFormatWarnings;
    private analyzeBundle;
    /**
     * e2e-F1 的第二道门（**不得放宽**）：归档声明携带凭据值（`containsSecrets=true` —— 导出侧只在
     * 凭据原文非空时才置位，见 exporter.ts:449）却一条 ref 都解不出来时，必须显式告警：
     * 「读不到 ≠ 没有凭据」。没给密码的情形由安全阀拒绝（`import.encryptedPasswordRequired`），不重复告警。
     */
    private secretsPayloadWarnings;
    /**
     * @param opts.decryptedCredentials 宿主用备份密码解开 `security/secrets.enc` 后的
     *   `ref → 值` Map（仅内存；issue #39 Feature 2）。**只用于统计 ref 名与「本机是否已配置」**，
     *   绝不写回、绝不进任何返回值/日志。缺省（密码不存在/备份未加密）→ refs 为空数组。
     */
    analyzeImport(zipPath: string, opts?: {
        decryptedCredentials?: Map<string, string>;
    }): Promise<ImportAnalysis>;
    /** 文件集合分区 id：这些分区的相对路径必须逐字保留（见 ConfigAdapter.fileCollection）。 */
    private fileCollectionIds;
    /**
     * @param opts.decryptedCredentials 宿主用备份密码解开 `security/secrets.enc` 得到的 ref→值
     *   （仅内存）。**必须**传进来：它决定「归档里到底有哪些凭据值」——加密备份可能携带
     *   未被任何 settings namespace 引用的 ref（凭据文件是原文加密，不止 credentialsStatus 那几个），
     *   这些值若不在计划里出现就永远不会被写回（真机反馈：导入密钥没生效）。
     */
    createImportPlan(zipPath: string, decisions: ImportDecisions, opts?: {
        decryptedCredentials?: Map<string, string>;
    }): Promise<ImportPlan>;
    executeImportPlan(zipPath: string, plan: ImportPlan, opts?: {
        confirm?: boolean;
        secretInputs?: Record<string, string>;
        decryptedCredentials?: Map<string, string>;
        rollbackOnError?: boolean;
        /** m1：每完成一个计划项调用（真实进度埋点；不传则无埋点） */
        onItem?: (info: PlanItemProgress) => void;
        /** m1：每开始一个计划项调用（供 UI 显示「正在执行项 X」/ 判定跳过按钮；不传则无埋点） */
        onItemStart?: (info: {
            adapter: SectionId;
            index: number;
            total: number;
            detail: string;
        }) => void;
        /** 执行日志回调（逐计划项操作 + 子进程命令行；注入 ImportContext 供适配器调用；不传则无日志） */
        onLog?: (line: string) => void;
        /**
         * Phase 4 生产 journal↔snapshot 绑定（deferred 模式）。
         * 宿主经 runJournaled({ deferredSnapshot:true }) 的 ctx 注入；引擎在快照创建/首 mutation 时绑定，
         * 保证快照 durable+verified 且 journal 已知先于任何写。不传 = 无 journal 绑定（非生产 journaled 路径）。
         */
        snapshotBinding?: TransactionSnapshotContext;
        /**
         * 用户终止信号（宿主 /runs/cancel 触发）。**只在计划项边界检查** ——
         * 绝不在项中途 abort：那是 ImportContext.signal（「跳过当前项」）的语义。
         * 与 rollbackOnError 无关：终止是独立于「失败策略」的用户动作。
         */
        cancelSignal?: AbortSignal;
        /**
         * 在安全点询问用户如何处置已应用部分。缺省 / 抛错 / 超时一律按 **rollback**（安全侧）。
         * 宿主实现：把 run 置为「待决策」并阻塞等 /runs/cancel/decision。
         */
        onCancelDecision?: () => Promise<'rollback' | 'keep'>;
        /**
         * 「保留已应用项」分支的启动自洽审计（宿主注入；缺省 = 未审计，结果里如实标注）。
         * 引擎在**所有分区收尾之后**调用 —— 审计必须看到最终盘面。实现不得抛错
         * （调用方正在正常返回路径上，抛错会把已知结论换成异常并触发 journal SAFE MODE）。
         */
        bootSafetyAudit?: () => Promise<BootSafetyReport>;
    }): Promise<ImportResult>;
    /** 快照状态标记（M1）：成功→done / 失败回滚→rolled-back。元数据写失败只告警不抛错。 */
    private markSnapshotStatus;
    /**
     * 逆序补偿 + 诚实报告（两条触发路径共用：导入失败整体回滚 / 用户终止并选择回滚）。
     *
     * 审计 P0-3：必须把「已就地回滚」的结论上报给 journal 宿主（runJournaled）——
     * 没有这条上报，宿主只能凭「fn 是否返回」推断成功，而这里是「回滚完成 + 正常返回
     * ok:false」，于是整笔 operation 被误记成 COMMITTED 终态（回滚点失去 prune 豁免、
     * 事后审计读到与盘面相反的结论）。可选调用：非 journaled 路径不传 snapshotBinding。
     */
    private rollbackApplied;
    /**
     * 该计划项是否会产生真实 side effect（需 journal step 追踪）。
     * 与「会写目标」同一谓词（backup.planItemWritesTarget 单点）——信息/跳过/错误项与
     * 未采用其导入内容的 Conflict 都不写目标，记录只会保守化 reconcile 而无收益。
     */
    private shouldJournalStep;
    /** 文件类且可指纹 → 返回「根相对路径」（journal 的 ref 身份）；否则 null（不可指纹外部项）。
     *  profile 必须传入：plugins 分区的 pnpm-workspace.yaml / patch 文件位于
     *  `profiles/<profile>/` 下，缺了它算出的相对路径不存在 → 指纹恒 null（issue #35）。 */
    private static fileRelFor;
    /**
     * 文件类且可指纹 → 返回「该分区自己的门面 + 绝对路径」。
     *
     * 为什么不能只拿 home-relative 路径去读：`pluginData` / `pluginAssets` 的根是**系统 home**
     * （见 `core/backup.ts` 的 `fsForSection`），用 `ctx.fs` 读会落到 $DSH_HOME 下的错误位置
     * 或被越界守卫拦下 —— 指纹会静默变成「读不到」，reconcile 因此永远判不出是否已应用。
     * 宿主未提供该门面 / 路径不可解析 → null（保守：不可证明）。
     */
    private static fileTargetFor;
    /** 读目标文件算 sha256（经该分区自己的门面，测试 mock 可注入）。失败返回 null。 */
    private fileFp;
    private applyOne;
}
export { applyMappingsToSections, rebaseMapping, runSchemaMigration } from './import-planning.ts';
