import { type TextShape } from './text-fidelity.ts';
/** 合并结论（`ok:false` 时调用方必须**零写入**） */
export type ThreeWayMergeReason = 'clean' | 'conflict' | 'degraded' | 'binary' | 'non-utf8';
export interface ThreeWayMergeResult {
    /** true = 结果可直接写入；false = 必须放弃写入并如实报告 */
    ok: boolean;
    /** 合并结果（`ok:false` 时是 theirs 原文 —— 方便调用方做「保持现状」的比较，绝不写入） */
    text: string;
    reason: ThreeWayMergeReason;
    /** 冲突块数（>0 ⇒ ok=false） */
    conflicts: number;
    /** 本次合并**撤销**的行数（base 有、ours 没有）与**保留**的对方新增行数（诊断用） */
    revertedLines: number;
    /** 依赖风险提示（启发式；空数组 = 未发现明显风险，**不代表安全**） */
    risks: string[];
    /**
     * 输出的**字节形态**（判据 3/5）：落盘必须用 encodeTextBytes(result.text, result.shape) ——
     * result.text 里**不含** BOM，BOM 由 shape.bom 承载。
     */
    shape: TextShape;
    /** 输入里出现过**不止一种行尾风格**（单个文件内混合 / 各侧风格不同）⇒ 输出的行尾已被统一，不谎称「原样」 */
    eolMixed: boolean;
    /** 输出的行尾**不再逐字节等于输入**（含「显式 shape 与输入风格不同」）⇒ 行尾被改写，绝不静默 */
    eolRewritten: boolean;
}
/**
 * 三方合并（纯函数、无 I/O）。
 *
 * **文本保真（2026-10-18 缺陷：旧实现用 join('\n') 收尾 ⇒ 把整份 CRLF 文件转成 LF）**：
 *  · 形态（EOL / BOM）显式给了 options.shape 就按它；没给就从 **theirs 探测**（磁盘上真实的那一侧），
 *    绝不擅自把 CRLF 改成 LF。落在未变更区域的行取自 base，且只含**行内容**（不含行尾），输出统一按
 *    shape.eol 收尾 —— 输入行尾若与输出不一致，用 eolMixed / eolRewritten 如实标注，不假装「原样」。
 *  · 输入按契约是**已解码文本**（BOM 已由 decodeTextBytes 剥离）；残留的前导 U+FEFF 会被剥掉并记进
 *    shape.bom，免得调用方 encode 时写出双 BOM。落盘必须用 encodeTextBytes(result.text, result.shape)。
 *  · 输入若含孤立代理项或孤立 CR（TextShape 表达不了的形态）⇒ reason='non-utf8'，**零写入**。
 *
 * 语义：结果是 `ours` 上再应用 `(theirs - base)` —— 撤销「我们从 base 改到 ours 的那部分」，
 * 同时保留「别人从 base 改到 theirs 的那部分」。
 */
export declare function mergeThreeWay(ours: string, base: string, theirs: string, options?: {
    shape?: TextShape;
}): ThreeWayMergeResult;
