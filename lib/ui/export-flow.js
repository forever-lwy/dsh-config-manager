import { SECTION_IDS, sectionMeta } from '../schema/section-registry.js';
import { EXPORT_GROUPS, isQuickRecommended, } from './types.js';
import { EXPORT_STAGES, ProgressTracker } from './progress.js';
import { renderExportReport } from './report.js';
import { liveUiT } from './i18n.js';
/**
 * 自定义导出文件名的归一化（P0-④ 体验优化）：无需用户手动输入 `.zip`。
 * - trim 首尾空白；空串 → ''（宿主自动命名）；
 * - 非空且未以 `.zip` 结尾 → 自动补全 `.zip`（大小写不敏感判定，统一补小写后缀）；
 * - 已以 `.zip` 结尾 → 原样返回（含首字符为字母数字的校验由调用方/宿主把关）。
 */
export function normalizeExportFileName(raw) {
    const trimmed = raw.trim();
    if (trimmed === '')
        return '';
    return /\.zip$/i.test(trimmed) ? trimmed : `${trimmed}.zip`;
}
/**
 * 清单读取失败的**分区**（UI-07）。
 *
 * 宿主 /export-preview 只回一个 `sectionsFailed` 数字，拿不到分区 id，所以按
 * 「请求了但没回来」自行判定 —— 与引擎「清单缺失的分区按整体导出处理」的语义一致。
 * 展示层据此逐行标注「读取失败 · 将整体导出」并抑制误导性的「已选 0/0」；
 * 请求**整体失败**（宿主异常 / 断网）时调用方直接把本批在途分区全部计入失败。
 * 纯函数（node 可测），React 壳不自己写判定。
 */
export function failedSectionsFromResponse(requested, returned) {
    const got = new Set(returned);
    return requested.filter((s) => !got.has(s));
}
/**
 * 目录条目描述的**字典键**（报告文本 / 日志 / 勾选目录用，非分区显示名）——
 * 文案本身在 `ui/i18n.ts`（zh 源 / en 镜像），这里只留键：静态目录混着中文字面量时，
 * 英文界面会把中文原样透出（且这些字符串原先只存在于本文件，无第二份副本）。
 *
 * 键类型 `Exclude<SectionId, 'secrets'>`：secrets 无 ZIP 载荷、不进导出目录，
 * 因此除它以外的分区**全部**必须有描述 —— 漏一个即编译失败（与注册表同一穷举纪律）。
 */
const CATEGORY_DESCRIPTION_KEY = {
    settings: 'export.category.settings',
    providers: 'export.category.providers',
    plugins: 'export.category.plugins',
    pluginFiles: 'export.category.pluginFiles',
    self: 'export.category.self',
    mcp: 'export.category.mcp',
    prompts: 'export.category.prompts',
    skills: 'export.category.skills',
    agentPresets: 'export.category.agentPresets',
    agentInstructions: 'export.category.agentInstructions',
    workspaces: 'export.category.workspaces',
    ui: 'export.category.ui',
    credentialsStatus: 'export.category.credentialsStatus',
    sessions: 'export.category.sessions',
    pluginData: 'export.category.pluginData',
    pluginAssets: 'export.category.pluginAssets',
};
/** 需在 UI 标注安全提示、但绝不显示值的分区（凭据状态只有 configured 标记） */
const SENSITIVE_SECTIONS = new Set(['credentialsStatus']);
/**
 * 内置分类目录 —— **从分区注册表派生**（t31）。
 *
 * 改动前这里与 `src/adapters/*` 各自维护一份 defaultIncluded / portability / 显示名，
 * 是「同一事实两处维护」的典型（且 credentialsStatus 的显示名已经漂移）。现在：
 *  - `label` ← `sectionMeta(id).displayName`（唯一英文规范名，与 client 字典 section.<id> 的 en 一致）；
 *  - `group` ← `sectionMeta(id).group`；
 *  - `defaultIncluded` / `portability` ← 注册表同名派生值；
 *  - 只有 `description`（报告文案）与 `sensitive`（安全提示）留在本文件。
 *
 * **顺序是行为的一部分**（Custom Export 树的展示顺序）：外层按 `EXPORT_GROUPS` 顺序、
 * 内层按 `SECTION_IDS`（= applyOrder 升序），与改造前的手写顺序逐项一致。
 * `payload.kind === 'none'` 的分区（secrets）不进目录 —— 其值走独立加密容器。
 */
function buildDefaultCategories() {
    const categories = [];
    for (const group of EXPORT_GROUPS) {
        for (const id of SECTION_IDS) {
            const meta = sectionMeta(id);
            if (meta.payload.kind === 'none')
                continue;
            if (meta.group !== group.id)
                continue;
            categories.push({
                id,
                label: meta.displayName,
                descriptionKey: CATEGORY_DESCRIPTION_KEY[id],
                defaultIncluded: meta.defaultIncluded,
                portability: meta.portability,
                group: meta.group,
                ...(SENSITIVE_SECTIONS.has(id) ? { sensitive: true } : {}),
            });
        }
    }
    return categories;
}
/** 内置分类目录（注册表派生；宿主可经 ExportFlowOptions.categories 覆盖） */
export const DEFAULT_CATEGORIES = buildDefaultCategories();
export class ExportFlow {
    categories;
    port;
    onProgress;
    t;
    constructor(opts) {
        this.port = opts.port;
        this.categories = opts.categories ?? DEFAULT_CATEGORIES;
        this.onProgress = opts.onProgress;
        // 缺省用**活**翻译器（随 DSH 语言变化）：构造期快照会在切到英文后恒为中文。
        this.t = opts.t ?? liveUiT;
    }
    /** Quick Export 推荐分区（defaultIncluded 且非 deviceSpecific） */
    quickSelection() {
        return this.categories.filter(isQuickRecommended).map((c) => c.id);
    }
    /** 按 §1 分组返回分类目录（Custom Export 树） */
    groupedCatalog() {
        return EXPORT_GROUPS.map((g) => ({
            group: g.id,
            label: g.label,
            // 说明文案按当前语言取词（键住在 EXPORT_GROUPS；此处才解析）
            ...(g.noteKey !== undefined ? { note: this.t(g.noteKey) } : {}),
            categories: this.categories.filter((c) => c.group === g.id),
        }));
    }
    /**
     * 校验勾选：未知分区 = invalid；deviceSpecific 分区需就地警示（非阻断，仍可继续）。
     *
     * 返回**结构化结果**（不是拼好的字符串）：文案必须由展示层走 i18n 字典渲染 ——
     * 原实现把中文警告文本硬编码在纯逻辑层，且生产代码无人调用（审计 UI-09），
     * 而同一批文案在 `ui/i18n.ts` 里另有一份（`export.unknownSection` /
     * `export.deviceSpecific`），属于「同一句话两处维护」。展示层按分区 id 自己起名
     * （`common/section-labels.ts`）即可，这里只说「哪些分区有问题」。
     */
    validateSelection(selection) {
        const known = new Set(this.categories.map((c) => c.id));
        const unknown = selection.filter((id) => !known.has(id));
        const deviceSpecific = this.categories
            .filter((c) => c.portability === 'deviceSpecific' && selection.includes(c.id))
            .map((c) => c.id);
        return { valid: unknown.length === 0, unknown, deviceSpecific };
    }
    /** 执行导出：发进度事件 → 调 core → 渲染 §21 报告 */
    async run(selection, opts = {}) {
        const tracker = new ProgressTracker(EXPORT_STAGES, this.onProgress);
        // 只有一个导出流程：导出的就是调用方传进来的这个集合（内容选择器的唯一出口）。
        const only = [...selection];
        // 导出工作全部发生在 port.export() 的单次请求内，客户端无法逐阶段上报真实进度。
        // 旧实现把整串阶段一次性 emit，请求期间 UI 会静止在假的「Calculating checksums... 86%」，
        // 任何慢请求/挂起请求看起来都像卡死。改为：请求期间只发一个不带 step/total 的 in-flight
        // 阶段（ProgressBar 显示不定态动画），完成后发 done（100%）。超时/失败由 api 层显式抛出。
        tracker.emit('exporting');
        const result = await this.port.export({
            includeSecrets: opts.includeSecrets ?? false,
            only,
            // 条目级白名单（稀疏：只有部分勾选的分区才会出现）
            ...(opts.includeItems !== undefined ? { includeItems: opts.includeItems } : {}),
            // P0-④：透传自定义文件名/备注（非敏感；host 做安全校验与持久化）
            ...(opts.fileName !== undefined && opts.fileName !== '' ? { outPath: opts.fileName } : {}),
            ...(opts.note !== undefined ? { note: opts.note } : {}),
        });
        tracker.emit('done');
        return { ...result, text: renderExportReport(result.report, this.t) };
    }
}
//# sourceMappingURL=export-flow.js.map