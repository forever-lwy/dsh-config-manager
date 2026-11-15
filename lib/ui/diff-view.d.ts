/**
 * 差异视图渲染模型（框架无关纯函数，node 可测）。
 *
 * 输入：utils/line-diff.ts 产出的 hunks（行级编辑脚本）
 * 输出：左右双栏对照所需的「行对」——左边=当前（before），右边=快照（after）。
 *
 * 对齐规则：上下文行两侧同一行；连续的删除块与新增块**按下标配对**成「修改行对」
 * （左红右绿），多出来的删除行只占左侧、多出来的新增行只占右侧。
 * 本层不产出文案（渲染层按 kind 决定样式与标题）。
 */
import type { DiffHunk, DiffLine } from '../utils/line-diff.ts';
/** 行对语义：context=未变 / change=成对修改 / del=仅删除（右侧空）/ add=仅新增（左侧空） */
export type SideKind = 'context' | 'change' | 'del' | 'add';
export interface SideBySideRow {
    kind: SideKind;
    left: DiffLine | null;
    right: DiffLine | null;
}
export interface SideBySideHunk {
    /** unified 风格的块头（@@ -a,b +c,d @@） */
    header: string;
    rows: SideBySideRow[];
}
/** 块头文本（与 git unified diff 一致；UI 直接展示，不参与 i18n）。 */
export declare function hunkHeader(hunk: DiffHunk): string;
/** hunks → 左右双栏渲染模型（每块带块头）。 */
export declare function toSideBySide(hunks: readonly DiffHunk[]): SideBySideHunk[];
/**
 * 行号最大位数（双栏行号列宽的档位依据）：取实际渲染的行号里最长的那个，
 * 让行号列只占「最宽行号」需要的宽度，剩余空间全部留给代码列。
 */
export declare function maxLineDigits(hunks: readonly DiffHunk[]): number;
/** 行对总数（渲染层做「超长截断」提示时的分母）。 */
export declare function countSideRows(groups: readonly SideBySideHunk[]): number;
/** 增删行数（编辑器式文件头的 `+A` / `−R` 用；上下文行不计）。 */
export interface DiffLineCounts {
    added: number;
    removed: number;
}
/**
 * 一侧的行数统计：**只数 unidiff 语义的增删行**（与 git 的 `+A −R` 同口径）。
 * 成对修改在 unidiff 里本来就是「一删一增」，所以这里不需要按行对再折算。
 */
export declare function diffLineCounts(hunks: readonly DiffHunk[]): DiffLineCounts;
