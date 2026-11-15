/**
 * Export 控制器（规范 §1 / §21，m6-ui）。
 *
 * 职责：
 *  - Quick Export：推荐项 = defaultIncluded 且非 deviceSpecific 的分区（设计 §11.1）；
 *  - Custom Export：按 §1 分组目录逐项勾选（含默认关闭的可选分区 pluginFiles/sessions）；
 *  - 进度事件：调用 core 前后按 §29 阶段文案发出（UI 不冻结）；
 *  - 结果：返回 ExportReport 并渲染 §21 文本报告。
 *
 * 依赖注入：ExportPort 由宿主在挂载时接入真实 Exporter（core/exporter.ts），
 * 测试注入内存 mock —— 本层零依赖 core 实现。
 */
import type { Manifest, SectionId } from '../schema/types.ts';
import type { ExportOptions, ExportReport } from '../core/types.ts';
import { type ExportCategory, type ExportGroup, type ProgressListener } from './types.ts';
import { type UiT } from './i18n.ts';
/** UI → core 的导出端口（宿主注入 Exporter.export；测试注入 mock） */
export interface ExportPort {
    export(options: ExportOptions): Promise<{
        zipPath: string;
        manifest: Manifest;
        report: ExportReport;
    }>;
}
/**
 * 自定义导出文件名的归一化（P0-④ 体验优化）：无需用户手动输入 `.zip`。
 * - trim 首尾空白；空串 → ''（宿主自动命名）；
 * - 非空且未以 `.zip` 结尾 → 自动补全 `.zip`（大小写不敏感判定，统一补小写后缀）；
 * - 已以 `.zip` 结尾 → 原样返回（含首字符为字母数字的校验由调用方/宿主把关）。
 */
export declare function normalizeExportFileName(raw: string): string;
/**
 * 清单读取失败的**分区**（UI-07）。
 *
 * 宿主 /export-preview 只回一个 `sectionsFailed` 数字，拿不到分区 id，所以按
 * 「请求了但没回来」自行判定 —— 与引擎「清单缺失的分区按整体导出处理」的语义一致。
 * 展示层据此逐行标注「读取失败 · 将整体导出」并抑制误导性的「已选 0/0」；
 * 请求**整体失败**（宿主异常 / 断网）时调用方直接把本批在途分区全部计入失败。
 * 纯函数（node 可测），React 壳不自己写判定。
 */
export declare function failedSectionsFromResponse(requested: readonly SectionId[], returned: readonly SectionId[]): SectionId[];
/** 勾选校验结果（结构化；文案由展示层 i18n 渲染，见 validateSelection）。 */
export interface SelectionValidation {
    /** 全部为已知分区 */
    valid: boolean;
    /** 未知 / 不存在的分区 id */
    unknown: SectionId[];
    /** 勾选中属于「设备相关」的分区（跨设备使用时可能不适用；非阻断） */
    deviceSpecific: SectionId[];
}
export interface ExportFlowOptions {
    port: ExportPort;
    /** 分类目录（缺省用内置目录 —— 由分区注册表派生，见 DEFAULT_CATEGORIES） */
    categories?: ExportCategory[];
    onProgress?: ProgressListener;
    /** 报告渲染翻译器（zh/en，见 i18n.ts） */
    t?: UiT;
}
export interface ExportRunResult {
    zipPath: string;
    manifest: Manifest;
    report: ExportReport;
    /** §21 渲染文本（report.ts） */
    text: string;
}
/** 内置分类目录（注册表派生；宿主可经 ExportFlowOptions.categories 覆盖） */
export declare const DEFAULT_CATEGORIES: readonly ExportCategory[];
export declare class ExportFlow {
    readonly categories: readonly ExportCategory[];
    private readonly port;
    private readonly onProgress;
    private readonly t;
    constructor(opts: ExportFlowOptions);
    /** Quick Export 推荐分区（defaultIncluded 且非 deviceSpecific） */
    quickSelection(): SectionId[];
    /** 按 §1 分组返回分类目录（Custom Export 树） */
    groupedCatalog(): {
        group: ExportGroup;
        label: string;
        note?: string;
        categories: ExportCategory[];
    }[];
    /**
     * 校验勾选：未知分区 = invalid；deviceSpecific 分区需就地警示（非阻断，仍可继续）。
     *
     * 返回**结构化结果**（不是拼好的字符串）：文案必须由展示层走 i18n 字典渲染 ——
     * 原实现把中文警告文本硬编码在纯逻辑层，且生产代码无人调用（审计 UI-09），
     * 而同一批文案在 `ui/i18n.ts` 里另有一份（`export.unknownSection` /
     * `export.deviceSpecific`），属于「同一句话两处维护」。展示层按分区 id 自己起名
     * （`common/section-labels.ts`）即可，这里只说「哪些分区有问题」。
     */
    validateSelection(selection: readonly SectionId[]): SelectionValidation;
    /** 执行导出：发进度事件 → 调 core → 渲染 §21 报告 */
    run(selection: readonly SectionId[], opts?: {
        includeSecrets?: boolean;
        fileName?: string;
        note?: string;
        /**
         * 条目级选择（Phase 1）：只在部分勾选的分区上下发（由 selection-model 的
         * buildExportRequest 决定）。缺省不下发 = 这些分区全量导出。
         */
        includeItems?: Partial<Record<SectionId, string[]>>;
    }): Promise<ExportRunResult>;
}
