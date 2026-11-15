/**
 * Import 向导状态机（规范 §9/§10/§28，m6-ui）。
 *
 * 步骤：Select ZIP → Analyzing → Compatibility → Import Preview → Resolve Conflicts
 *       → Path Mapping → Secrets → Importing → Result。
 *
 * 关键安全/正确性约束：
 *  - analyzeImport / createImportPlan 零写入（Dry Run 复用，规范 §10）；
 *  - executeImportPlan 必须 confirm=true（core 安全阀），UI 在用户点「确认导入」后传入；
 *  - **显式传 rollbackOnError**：场景 E（§36）要求导入中途失败整体回滚，
 *    本向导默认 rollbackOnError=true，UI 可在执行前让用户选择（true=整体回滚 / false=单项失败继续 §34.17）；
 *  - 秘密补录值仅内存（secretInputs），绝不落日志/落盘。
 */
import type { CompatibilityReason, GlobalConflictStrategy, ImportAnalysis, ImportPlan, ImportResult, PathIssue, PathMapping, PlanItem } from '../core/types.ts';
import type { SectionId } from '../schema/types.ts';
import type { ImportPort, ImportPreviewSummary, ImportStep, ProgressListener, WizardSnapshot } from './types.ts';
import { type SessionFormatDisposition } from './session-format-disposition.ts';
import { type UiT } from './i18n.ts';
import { type FlowPhase } from './flow.ts';
export interface ImportWizardOptions {
    port: ImportPort;
    onProgress?: ProgressListener;
    /** 默认回滚策略（场景 E：true=整体回滚；UI 可在执行前覆盖；缺省取 `DEFAULT_ROLLBACK_ON_ERROR`） */
    defaultRollbackOnError?: boolean;
    /**
     * 渲染层翻译器（UiT）。缺省 = **活**翻译器 `liveUiT`（随 DSH 语言变化）——
     * 绝不是 `zhUiT` 那种加载期快照：英文界面下向导的错误文案不得回落中文。
     */
    t?: UiT;
}
/**
 * 凭据补录：把**单个 ref 的输入**合并进当前提交集合（UI-06）。
 *
 * 为什么必须是「在最新集合上合并」而不是「以组件本地 state 整体替换」：补录页是可以
 * 来回切换的中间步骤（「上一步」→「下一步」），组件会随阶段切换卸载重挂。若以组件本地
 * state 为准会出现两种错误行为 —— ① 回到该页时输入框全空，但上一次的值仍在提交集合里
 * （看到的值 ≠ 提交的值）；② 在空表上编辑任一字段会把其它 ref 已填的值从提交集合里丢掉。
 * 统一以「最新的提交集合」为唯一事实：**看到什么就提交什么**。
 */
export declare function mergeSecretInput(current: Record<string, string>, ref: string, value: string): Record<string, string>;
/** 导入适用阶段判定输入（全部来自 Dry Run 产物与仅内存的容器状态；不含任何 React 状态） */
export interface ImportFlowInputs {
    /** 上传的是整体加密容器（DCA1）—— 未解锁前不得分析/继续 */
    containerEncrypted: boolean;
    /** 容器已解锁（仅内存；刷新后需重输密码） */
    archiveUnlocked: boolean;
    hasConflicts: boolean;
    hasPathIssues: boolean;
    hasSecrets: boolean;
}
/**
 * 仍需用户补录的凭据：剔除「解密已覆盖」的 ref（加密备份解锁时顺带恢复了这些凭据）。
 * secrets 阶段的数据与「是否存在 secrets 阶段」的判定共用本函数（此前组件里各写一遍 filter）。
 */
export declare function pendingSecretRequests(plan: Pick<ImportPlan, 'missingSecrets'> | null, decryptRefs: readonly string[]): {
    ref: string;
    required: boolean;
}[];
/**
 * 从 Dry Run 原始产物派生三个「是否有该阶段」标志。
 * 语义：基于原始 analysis/plan，**不因用户已解决而重算**（见 flow.ts 的只前进导航）。
 */
export declare function importFlowFlags(args: {
    plan: Pick<ImportPlan, 'items' | 'missingSecrets'> | null;
    analysis: Pick<ImportAnalysis, 'pathIssues'> | null;
    decryptRefs: readonly string[];
    /**
     * 已按**本次选择**裁剪过的路径问题（`applicablePathIssues` 的产物）。
     * 缺省 = `analysis.pathIssues` 全量（保持既有语义：不做选择裁剪的调用方零改动）。
     * 传了它，用户取消工作区 / 只勾 Skip 项时 path-mapping 阶段就不会出现。
     */
    pathIssues?: readonly PathIssue[];
}): {
    hasConflicts: boolean;
    hasPathIssues: boolean;
    hasSecrets: boolean;
};
/**
 * 按「本次真的会写盘的分区」过滤路径问题 —— 导入向导 path-mapping 阶段的**唯一**输入来源。
 *
 * 为什么不能直接渲染 `analysis.pathIssues`（真机反馈）：那是一份对**整包**的探测结果，
 * 用户没勾工作区时仍会列出 7 条工作区路径并要求逐条指定新位置 —— 对不会写入任何东西的分区
 * 索要设置，既费事又让人怀疑自己刚才的勾选没生效。
 *
 * 语义细节：
 *  - `sections === null`（还没有计划）→ 原样返回，不做裁剪；
 *  - `issue.section` 缺省（旧宿主未回传来源）→ **保留**：宁可按老行为多问一句，也不静默丢掉一条
 *    会写盘的路径映射（漏映射 = 目标机路径错位，比多一次输入严重）；
 *  - `section` 有值 → 只有该分区这次会写盘时才保留。
 */
export declare function applicablePathIssues(issues: readonly PathIssue[], sections: ReadonlySet<SectionId> | null): PathIssue[];
/**
 * 适用阶段的有序列表（仅含需要用户处理的阶段 + 确认页）。
 * 整体加密容器未解锁时恒先插入 decrypt-archive：不解锁不得分析/继续导入。
 */
export declare function importApplicablePhases(inputs: ImportFlowInputs): FlowPhase[];
/** 阶段推进（只前进）：在适用阶段列表里取 from 的下一项（from 不在列表 → 取第一项） */
export declare function nextImportPhase(inputs: ImportFlowInputs, from: FlowPhase): FlowPhase;
/** 兼容性等级（与 ImportAnalysis.compatibility 同域；运行时出现未知值 → 按历史行为落到 'excellent'） */
export type CompatibilityLevel = 'unsupported' | 'partial' | 'good' | 'excellent';
export declare function compatibilityLevel(compatibility: ImportAnalysis['compatibility'] | string): CompatibilityLevel;
/** 兼容性徽章语义（Badge kind）；未支持=error、部分=warn、其余=ok */
export declare function compatibilityBadgeKind(level: CompatibilityLevel): 'error' | 'warn' | 'ok';
/** 原因 → 字典键（**客户端字典**：本模块只产出键名，文案解析在 client 侧，见 ImportWizardView 的注释） */
export type CompatibilityNoteKey = 'import.reason.schemaUnsupported' | 'import.reason.crossPlatform' | 'import.reason.missingSections' | 'import.reason.sourceNewer' | 'import.reason.sourceOlder';
/** 一条可直接喂给 `t(key, params)` 的解释项 */
export interface CompatibilityNote {
    key: CompatibilityNoteKey;
    params: Record<string, string>;
}
/**
 * 结构化原因 → 可渲染的解释项（顺序与 core 的 `compatibilityReasons` 一致）。
 *
 * 老宿主（未回传 `compatibilityReasons`）或字段缺失 → 空数组：界面不编原因、只显示评分
 * （「不知道为什么」和「没有问题」必须可区分）。
 */
export declare function compatibilityNotes(reasons: readonly CompatibilityReason[] | undefined): CompatibilityNote[];
/** 预览步的两页：迁移前咨询（只读结论）/ 选择要导入的内容 */
export type ImportPreviewStage = 'consult' | 'select';
/**
 * 预览步状态转移：换备份/重走流程 → 回咨询页（不让上一份备份的选择残留）；
 * 点「下一步」→ 内容选择页（已在该页时保持）。
 */
export declare function importPreviewStageAfter(event: 'new-zip' | 'next', current: ImportPreviewStage): ImportPreviewStage;
/**
 * 导入中是否可「跳过当前项」：仅当**正在安装插件**（/progress 的 detail 是正在执行项 id，
 * 插件安装项带 `plugin:` 前缀）且尚未请求过跳过。其余项（配置写入等）不可跳过。
 */
export declare function isSkippablePluginInstall(detail: string | undefined, running: boolean, skipRequested: boolean): boolean;
export declare class ImportWizard {
    private readonly port;
    private readonly onProgress;
    private readonly tracker;
    private step;
    private zipPath;
    private analysis;
    private plan;
    private result;
    private rollbackOnError;
    private errors;
    private decisions;
    private secretInputs;
    /** 加密备份的解密密码（仅内存，绝不持久化；刷新后要求重输） */
    private decryptPassword;
    /**
     * 会话格式处置（T1）：`abort` = 计划阶段阻断（缺省，安全侧）。宿主以每次 plan/execute
     * 请求携带的值为准，所以这里只是「用户当前选择」的唯一事实，不缓存任何服务端结论。
     */
    private sessionFormatDisposition;
    /** 整体加密备份容器是否已解锁（upload 探测到 encrypted 容器后为 false；unlockArchive 成功后为 true） */
    private archiveUnlocked;
    /**
     * 解锁后的明文 ZIP 路径（仅内存，绝不持久化；指向受控临时目录）。
     * decryptArchive 端点解出明文 ZIP 并返回新 zipPath，后续 analyze/plan/execute 都基于它。
     */
    private unlockedZipPath;
    private readonly t;
    constructor(opts: ImportWizardOptions);
    /** 当前状态快照（React 绑定 / 测试断言用） */
    snapshot(): WizardSnapshot;
    get currentStep(): ImportStep;
    /**
     * 解析「当前应传给 analyze/plan/execute 的 ZIP 路径」：
     * - 已解锁的整体加密容器 → 用解密后的明文 ZIP 路径；
     * - 否则 → 直接上传/传入的路径。
     */
    private resolvedZipPath;
    /**
     * 设置整体加密备份容器是否为 encrypted（upload 探测结果；仅内存）。
     * 调用方先在解密阶段展示密码输入，成功后调用 unlockArchive。
     * 传入 zipPath 时同步记录容器路径（供 unlockArchive/selectZip 引用，
     * 避免 syncWizard 把 store 中已 patch 的 zipPath 覆盖回 null）。
     */
    setArchiveEncrypted(encrypted: boolean, zipPath?: string): void;
    /**
     * 解锁整体加密备份容器（只读，零写入）：用备份密码解密上传的容器 → 明文 ZIP。
     * 成功后 archiveUnlocked=true；之后 analyze/plan/execute 基于解密后的 ZIP 路径。
     * 返回明文 ZIP 路径与解密覆盖的凭据 ref 名（导出时容器密码与 secrets.enc 密码
     * 同源，解锁即完成凭据解密验证）——导入全程只需输入这一次密码。
     */
    unlockArchive(encryptedPath: string, password: string): Promise<{
        zipPath: string;
        refs: string[];
    }>;
    /** 步骤 1-2：选 ZIP → Analyzing → Compatibility（analyzeImport 零写入） */
    selectZip(path: string): Promise<ImportAnalysis>;
    /**
     * 计划期共用参数：解密密码（仅内存）。加密备份的计划生成也必须能看到归档里的凭据，
     * 否则「随加密备份恢复」的凭据不会进计划、导入时静默丢掉（execute 侧同源传参）。
     */
    private planOpts;
    /** 步骤 3→4：用户确认兼容性后进入 Preview（Dry Run：用当前决策生成计划摘要，零写入） */
    confirmCompatibility(): Promise<ImportPlan>;
    /** 更新全局冲突策略（merge/replace/skipExisting，规范 §11） */
    setStrategy(strategy: GlobalConflictStrategy): void;
    /** 设置逐项冲突决策（keepCurrent/useImported/review） */
    setResolutions(resolutions: Record<string, 'keepCurrent' | 'useImported' | 'review'>): void;
    /** 设置路径映射（§12） */
    setPathMappings(mappings: PathMapping[]): void;
    /** 设置秘密补录值（仅内存，绝不持久化） */
    setSecretInputs(inputs: Record<string, string>): void;
    /** 设置加密备份的解密密码（仅内存，绝不持久化；导出密码不可复用，无明文存储） */
    setDecryptPassword(password: string): void;
    /** 设置会话格式处置（T1；'abort' / 'skip' / 'guide'，缺省 abort） */
    setSessionFormatDisposition(next: SessionFormatDisposition): void;
    /** 当前的会话格式处置（渲染与报告回显用） */
    get currentSessionFormatDisposition(): SessionFormatDisposition;
    /**
     * Preview 摘要（规范 §10 数值化；基于当前 plan 与 analysis）。
     *
     * `plan` 参数（2026-09 用户反馈）：传**裁剪后的子计划**时，所有计数只算这次真的会导入的项 ——
     * 否则用户在预览页取消一批条目后，徽章仍在报整包的数字（「将变更 N 项」与选择器 footer
     * 的合计自相矛盾，也会把未导入分区的问题摆到台面上）。缺省 = 未裁剪的整份计划。
     */
    previewSummary(plan?: ImportPlan | null): ImportPreviewSummary;
    /** 冲突项（供 ConflictCollector 使用） */
    conflictItems(): PlanItem[];
    /** 设置回滚策略（场景 E 选择；执行前调用） */
    setRollbackOnError(enable: boolean): void;
    /**
     * 步骤 10-14：确认导入 → 快照 → 执行 → 校验 → 结果。
     * 用最终决策重建计划（与预览一致），显式传 rollbackOnError。
     */
    execute(opts: {
        confirm: boolean;
        rollbackOnError?: boolean;
        /**
         * 计划裁剪钩子（Phase 2 内容选择）：在 createImportPlan 之后、执行之前套用。
         * 用钩子而不是让向导依赖选择模型 —— 向导保持「不认识 UI 选择语义」，且
         * **Dry Run 与真实执行走同一套裁剪**（两边不一致是最容易出鬼故事的地方）。
         */
        planFilter?: (plan: ImportPlan) => ImportPlan;
    }): Promise<ImportResult>;
    /** 可重试项计数：执行失败（failed）或用户跳过（skippedByUser）的项。 */
    retryableCount(): number;
    /** 可重试项 id 集合（与 result.executed 对齐；供 executeRetry 过滤计划）。 */
    private retryableIds;
    /**
     * 步骤 10-14（重试版）：只重跑「失败 + 用户跳过」的子集计划（结果页「重试」按钮）。
     * - 复用已解析的最终计划（this.plan，含冲突决策/路径映射），过滤出可重试项；
     * - 仍走 executeImportPlan 全流程：快照 → 子集 apply → 校验 → 结果（幂等）；
     * - 已成功的项不重跑，不重建整体导入；secret 补录值仍沿用仅内存的 secretInputs。
     */
    executeRetry(opts: {
        rollbackOnError?: boolean;
    }): Promise<ImportResult>;
    /** 重置向导（可复用实例开始新导入） */
    reset(): void;
}
/**
 * 导入计划 → 「已自动重定基」提示行（issue #45：跨机基础路径不同，见 ImportPlan.automaticMappings）。
 *
 * 形态用结构化参数（只读 oldPrefix/newPrefix 两个字段）：宿主/引擎只需给出这两项，
 * 本模块不必依赖 core 的具体类型，也不猜别的字段。
 */
export declare function importBasePathNotices(plan: {
    automaticMappings?: readonly {
        oldPrefix: string;
        newPrefix: string;
    }[];
} | null): {
    from: string;
    to: string;
}[];
