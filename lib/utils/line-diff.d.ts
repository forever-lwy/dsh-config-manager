/**
 * 行级文本 diff 内核（零依赖纯函数，node 可测）。
 *
 * 用途：为「恢复计划预览」等场景产出**左右双栏对照 / 统一格式**差异所需的
 * 行级编辑脚本（hunks）。只做行级比较（不做词级 / 字符级高亮），不读写文件、
 * 不产出任何文案 —— 文件读取与上限策略在 core 层（src/core/snapshot-diff.ts），
 * 渲染模型在 ui 层（src/ui/diff-view.ts）。
 *
 * 算法：先裁掉公共前缀 / 后缀（配置文件的 diff 通常极小，裁剪后变更区很小），
 * 剩余变更区用 Myers O((N+M)·D) 贪心算法求最短编辑脚本；变更规模超过预算
 * （maxLines / maxD）时**降级为整块替换**（全删 + 全增），保证任何输入都有确定
 * 耗时的输出 —— 大文件不会卡死宿主。
 *
 * 预算怎么定（2026-10-15 真机实测，本仓 rollback-point.ts 的一对版本）：
 *  · 时间是 (N+M)·D 量级：D=4000、两侧合计 ~7500 行时 ≈ 70 ms（D=8000 ≈ 115 ms）；
 *  · 内存是 O(D²)·4B（回溯要逐轮留 V 快照）：D=2000 时 RSS +~30 MB、D=4000 +~100 MB、D=8000 +~175 MB。
 *  ⇒ 缺省取 2000（覆盖「大文件只改了几处」这一大类）；单文件按需查看的调用方可以往上调，
 *    到 4000 仍是一次点击可接受的开销；再大就该换线性空间算法，而不是继续加预算。
 *
 * 行为约定：
 *  - 行尾 \r\n 归一为 \n；文本末尾的换行不产生"空行"（行数 = 换行符语义）。
 *  - 仅空白差异同样是差异（不做 ignoreWhitespace）。
 *  - 完全一致时 hunks 为空、identical=true。
 */
export type DiffLineKind = 'context' | 'add' | 'del';
export interface DiffLine {
    kind: DiffLineKind;
    /** 行内容（不含行尾换行） */
    text: string;
    /** 旧侧行号（1-based；新增行为 null） */
    oldNo: number | null;
    /** 新侧行号（1-based；删除行为 null） */
    newNo: number | null;
}
/** 连续变更块（含上下文），行号语义与 unified diff 的 @@ 头一致 */
export interface DiffHunk {
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    lines: DiffLine[];
}
export interface DiffResult {
    hunks: DiffHunk[];
    added: number;
    removed: number;
    /** 两侧内容一致（无任何变更行） */
    identical: boolean;
    /** 因规模预算降级为「整块替换」（结果仍然正确，只是不是最小编辑脚本） */
    degraded: boolean;
}
export interface DiffOptions {
    /** 变更块外保留的上下文行数（缺省 3，与 git 一致） */
    context?: number;
    /** 参与 Myers 的变更区行数上限（两侧合计；超出 → 降级整块替换） */
    maxLines?: number;
    /** Myers 最大编辑距离 D（超出 → 降级整块替换）；越大越接近最小编辑脚本，内存随 D² 增长（见文件头） */
    maxD?: number;
}
/** 文本 → 行数组（CRLF 归一、尾换行不产生空行）。 */
export declare function splitLines(text: string): string[];
/**
 * 行级 diff：两段文本 → hunks + 行数统计。
 * 纯函数、无 I/O；超大输入请由调用方先行截断或改用 replaceAll（degraded 已覆盖）。
 */
export declare function diffLines(before: string, after: string, opts?: DiffOptions): DiffResult;
/** 二进制探测：含 NUL 字节即视为二进制（与 git 同口径，只看前 8KB）。 */
export declare function looksBinary(text: string): boolean;
