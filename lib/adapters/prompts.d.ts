import type { MsgFunc } from '../core/messages.ts';
import './messages.ts';
import type { PromptEntry } from '../schema/types.ts';
import type { ApplyResult, ConfigAdapter, ExportOptions, ExportSection, ExportUnit, HostContext, ImportContext, PlanItem, ValidationResult } from '../core/types.ts';
/** 导出记录：PromptEntry 之外记录来源行名与所在层（导入重建 / 写回定位用） */
export interface PromptExportEntry extends PromptEntry {
    sourceLineName?: string;
    /**
     * 来源 patch 层（相对 homeDir 的 POSIX 路径；见 core/patch-layers.ts）。
     * 缺省 = 用户层（旧备份包没有该字段 → 按旧行为写回 home 层）。
     */
    sourceFile?: string;
}
export interface PromptsExportSection {
    version: 1;
    prompts: PromptExportEntry[];
}
/**
 * 从 patch 行 config 中提取 prompt 条目（systemPrompt.persona / planMode.sections[].text）。
 *
 * 行对象可带 `file`（层身份）：带上时逐条目记录 `sourceFile`，导入写回落回原层。
 */
export declare function extractPrompts(lines: {
    lineId: string;
    raw: unknown;
    file?: string;
}[]): PromptExportEntry[];
/** 把 prompt 文本合并进目标行 config（systemPrompt.persona 或 planMode.sections） */
export declare function mergePromptIntoLine(raw: unknown, prompt: PromptExportEntry): Record<string, unknown>;
/** 由导出条目构造「重建行」raw（Create 导入用；行名取自来源行，缺失时用占位名） */
export declare function buildPromptLine(lineId: string, prompt: PromptExportEntry): Record<string, unknown>;
export declare class PromptsAdapter implements ConfigAdapter<PromptsExportSection> {
    readonly id: 'prompts';
    readonly displayName: string;
    readonly defaultIncluded: boolean;
    readonly portability: import("../schema/section-registry.ts").SectionPortability;
    export(ctx: HostContext, options: ExportOptions): Promise<ExportSection<PromptsExportSection>>;
    /** 单元 id：`prompts:<条目 id>`（条目 id 已含来源行与 persona/section 名，天然唯一） */
    private unitId;
    /** 条目级单元清单（零 I/O）；label = 条目名，detail = 类型（数据，不是 UI 文案） */
    listUnits(section: ExportSection<PromptsExportSection>): ExportUnit[];
    analyzeImport(data: PromptsExportSection, ctx: ImportContext): Promise<PlanItem[]>;
    applyItem(item: PlanItem, ctx: ImportContext): Promise<ApplyResult>;
    validate(data: PromptsExportSection, msg?: MsgFunc): Promise<ValidationResult>;
}
