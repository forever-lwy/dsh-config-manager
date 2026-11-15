/**
 * 外部 agent 导入的**展示模型**（t17）—— 框架无关纯函数，node 可测。
 *
 * 数据来源两个（都只读）：
 *  - `GET /foreign-sources`：各来源的本机检测结果（found / 相对位置 / 机器码）；
 *  - 交付给向导前的「将导入什么」摘要（分区 + 计数 + 凭据引用名 + 未迁移项）。
 *
 * 本模块只做四件事，全部可单测：
 *  ① 检测结果 → 可渲染的来源行（显示名 / 状态徽章语义 / 命中路径 / 未迁移码）；
 *  ② 摘要 → 计数徽章与分区清单；
 *  ③ **机器码 → 字典键**的唯一映射（界面据此渲染人话）；
 *  ④ **三类已知有损**的展示行（F-5：只让它们可见，不改任何引擎语义）；
 *  ⑤ **展示顺序**（命中优先 + 显示名升序 —— 用户 2026-10-12 要求的「默认按名称排序」）。
 *
 * 三条纪律（都有单测钉住）：
 *  ① **禁止渲染裸机器码**：每个 skip 码必须经 SKIP_KEY 映射到字典键；映射表是
 *     `Record<ForeignSkipCode, …>`（不是 Partial），新增码而忘了配文案 = 编译失败，
 *     而不是用户界面上冒出一个 session-id-conflict。
 *  ② **未知来源不编造**：id 不在来源词表时显示「未识别的来源」并保留原始 id，
 *     绝不硬套某个来源的名字（那会让用户以为导的是 A、实际是 B）。
 *  ③ **未检测到 ≠ 错误**：found=false 是正常状态（未安装），用中性徽章；
 *     只有 skipped 里真有码时才升到警示色。
 *
 * 本模块**不含任何文案字面量**：所有用户可见文本来自注入的 `UiT`（src/ui/i18n.ts）。
 */
import type { ForeignSkip, ForeignSkipCode, ForeignSourceId } from '../foreign/types.ts';
import type { UiT, UiTextKey } from './i18n.ts';
/** `GET /foreign-sources` 返回的一条来源检测结果（与宿主 ForeignSourceStatus 同构） */
export interface ForeignSourceStatusInput {
    id: string;
    /** 宿主给的字典键（如 foreign.source.claude-code）；**只作为兜底**，正常走 id 映射 */
    labelKey?: string;
    found: boolean;
    /** 命中位置（相对 home 的 POSIX 路径；宿主保证绝不是绝对路径） */
    paths: readonly string[];
    skipped?: readonly ForeignSkip[];
}
/** `GET /foreign-sources` 响应 */
export interface ForeignSourcesResponse {
    conflictPolicy?: string;
    projectScoped?: boolean;
    sources: readonly ForeignSourceStatusInput[];
}
/** 一条未迁移项（码 + 人话 + 来源/条数） */
export interface ForeignSkipLine {
    code: string;
    /** 字典键（'foreign.skip.' + code） */
    key: UiTextKey;
    /** 已翻译说明 */
    text: string;
    /** 外部侧位置（server 名 / skill 名 / 文件名；不含任何值） */
    origin?: string;
    /** 同码聚合条数 */
    count?: number;
}
/** 徽章语义（与 common/ui.tsx 的 BadgeKind 一一对应；本层不 import 组件） */
export type ForeignBadgeKind = 'ok' | 'info' | 'warn' | 'error';
/** 一条来源的展示行 */
export interface ForeignSourceRow {
    id: string;
    /** 显示名（已翻译；未知 id → 「未识别的来源」+ 保留原始 id） */
    label: string;
    found: boolean;
    /** 本机是否认得这个 id（false = 宿主回了词表外的 id，界面如实标注） */
    known: boolean;
    /** 状态徽章语义：未检测到 = info（正常），检测到 = ok，有未迁移项 = warn */
    badge: ForeignBadgeKind;
    /** 状态徽章文本（已翻译） */
    statusText: string;
    /** 命中位置（原样透传；渲染层逐个显示） */
    paths: readonly string[];
    /** 未迁移项（已翻译） */
    skips: readonly ForeignSkipLine[];
    /** true = 本机检测到该来源但**一个可导入分区都没有**（界面据此禁用「导入」） */
    empty: boolean;
}
/** 整个来源列表的展示模型 */
export interface ForeignSourcesViewModel {
    rows: readonly ForeignSourceRow[];
    /** 至少有一条 found=true（界面据此决定是否提示「未检测到任何来源」） */
    anyFound: boolean;
    /** 冲突策略（用户决策：同 id 不覆盖、跳过并报码）；宿主未回 = null，界面不渲染该行 */
    conflictPolicy: string | null;
}
/**
 * 未迁移机器码 → 字典键（**全量**，不是 Partial）。
 *
 * 为什么用 `Record<ForeignSkipCode, UiTextKey>` 而不是 `Record<string, UiTextKey>`：
 * src/foreign/types.ts 的 ForeignSkipCode 是**冻结 union**，用全量 Record 让「新增码但忘了
 * 配文案」变成**编译期错误**。t16 已把冻结码的 zh/en 文案都写进两本字典（档 B 新增两条
 * 同步补上），这里只是索引。
 */
export declare const FOREIGN_SKIP_KEY: Record<ForeignSkipCode, UiTextKey>;
/**
 * 机器码 → 字典键。**未知码（未来版本 / 第三方宿主）回退键名本身**，
 * 界面仍显示原始码 —— 这比编一个解释诚实（用户可据此搜索/上报）。
 *
 * 注意：本函数返回**键**而不是文案，翻译由调用方注入的 `t` 完成 ——
 * 视图模型不持有字典，测试才能逐键断言。
 */
export declare function foreignSkipKey(code: string): string;
/** 来源 id 是否在本插件的冻结词表内。 */
export declare function isKnownForeignSource(id: string): id is ForeignSourceId;
/** 单条 skip → 可渲染行（码 + 已翻译说明 + 来源/条数） */
export declare function foreignSkipLine(skip: ForeignSkip, t: UiT): ForeignSkipLine;
/**
 * 检测结果 → 一行来源。
 *
 * 徽章语义三分（**未检测到不是错误**，这条最容易被写成红色）：
 *  · found=false            → info（正常状态：没装这个工具）
 *  · found=true  且 有 skip → warn（能导，但有东西没搬过来，用户需要知道）
 *  · found=true  且 无 skip → ok
 *
 * `empty` = found 但**一条路径都没命中**（宿主理论上不会这么回，但第三方实现可能）——
 * 界面据此禁用「导入」，避免用户点进一个必然空手的流程。
 */
export declare function foreignSourceRow(source: ForeignSourceStatusInput, t: UiT): ForeignSourceRow;
/** 命中位置的一行文本（无命中时给明确的「没有命中」而不是空白）。 */
export declare function foreignPathsText(row: ForeignSourceRow, t: UiT): string;
/**
 * 响应 → 整表展示模型（组件只摆放）。
 *
 * `?projectDir=` 的项目级作用域如实透传（`projectScoped`）—— 界面把它显示出来，
 * 否则用户会以为「本机没装 Cursor」而实际上是「项目级配置没被扫」。
 *
 * 行顺序由 compareForeignSourceRows 决定（命中优先 + 显示名升序），**只排新数组**：
 * 宿主回传的 `response.sources` 一个元素都不动。
 */
export declare function foreignSourcesViewModel(response: ForeignSourcesResponse | null, t: UiT): ForeignSourcesViewModel | null;
/**
 * 三类**已知有损**的稳定标识（与字典键一一对应；新增一项必须同步 zh/en 两本字典）。
 *
 * 为什么要有这一层：这三条都是「**不阻断导入、但结果与用户预期不同**」的既有行为，
 * 此前在界面上没有任何入口说明它们（兼容性评分也不产出原因）。本层**只做可见性**，
 * 不改动任何引擎语义（分区内容、ZIP 条目名规则、prompts 落盘形态全部原样）。
 */
export type ForeignLossyKind = 'file-section-secrets' | 'entry-backslash' | 'prompt-persona-reshape';
/** 有损项的严重级（warn = 内容或落点确实不同；info = 形状变化、文本无损） */
export type ForeignLossySeverity = 'warn' | 'info';
/** 一条「已知有损」的展示行（标题与说明均已翻译） */
export interface ForeignLossyRow {
    kind: ForeignLossyKind;
    severity: ForeignLossySeverity;
    /** 短标题（已翻译） */
    title: string;
    /** 说明（已翻译） */
    detail: string;
    /**
     * 本包是否适用：
     *  · `true` / `false`：**已产包**，按包内分区判定；
     *  · `null`：**尚未产包**，界面不渲染适用性徽章 —— 绝不把「还没判定」写成「不适用」。
     */
    applicable: boolean | null;
}
/** 渲染顺序（固定，不随调用方漂移） */
export declare const FOREIGN_LOSSY_KINDS: readonly ForeignLossyKind[];
/**
 * 三类有损 → 可渲染行（组件只摆放）。
 *
 * `sections` = 刚产出的包内分区（`ForeignImportResponse.sections`），尚未产包时传 `null`：
 *  · **文件类分区**（`isFileSection`，注册表是唯一权威）→ 内容不做秘密剥离（G-09 边界）；
 *  · **条目名中段反斜杠**（G-11）→ 浏览器只看得到分区与计数、看不到条目名，因此只要产了包
 *    就**如实提示**（宁可多说一句，也不谎称「本包不涉及」）；
 *  · **`prompts` 分区** → `systemPrompt` 由字符串写成 `{ persona }` 对象（bundle-format §7.3）。
 */
export declare function foreignLossyRows(sections: readonly string[] | null, t: UiT): readonly ForeignLossyRow[];
/**
 * 导入失败 → 可见载荷（码 + 后端原话 + 一句人话）。
 *
 * 为什么要有它：宿主把「为什么没东西可导」放在 **400 的 body**（`code` + `skipped`），
 * 而客户端过去只显示 `err.message` —— 于是 `sessions-not-migrated`、
 * `trae-db-key-invalid` 这些**字典里早就有中英文案**的码，用户根本看不到。
 * 现在按同一本字典把码翻成文案（skip 码走冻结映射，`nothing-to-import` 走单独一条键），
 * 翻不出才回落后端 message —— 绝不吞掉原因，也绝不编解释。
 */
export interface ForeignImportFailure {
    /** 稳定机器码（后端 400 带的 code；没有则为 null） */
    code: string | null;
    /** 后端原始 message（渲染处再过 redact） */
    message: string;
    /** 展示文案（字典优先；没有就用 message） */
    text: string;
}
/** 失败载荷的构造（未知码 → 原样返回 message，绝不猜语义） */
export declare function foreignImportFailure(err: unknown, t: UiT): ForeignImportFailure;
