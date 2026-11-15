/**
 * 顶部导航条的自适应布局（UI v2，替代 v1 的 nav-overflow.ts）。
 *
 * 背景：v1 把「7 个文字页签 + 2 个文字动作按钮放不进 564px 画布」当成**可发现性问题**处理
 * —— `overflow-x: auto` 但隐藏滚动条 + 两侧渐隐遮罩，用户得按住 shift 滚轮才能看到右边的页签。
 * v2 承认它是**容量问题**：放不下就从末项开始移进「更多 ▾」菜单，绝不让页签藏在视口外。
 *
 * 本模块是纯函数（零依赖，node 可测）：
 *   - 输入宽度必须是**实测值**（标签文案随语言变化），由壳层用 ResizeObserver 量取；
 *   - **失败兜底优先于任何优化**：只要有一个度量不可信（非有限数 / 负数 / 容器宽 ≤ 0），
 *     就返回「全部可见」—— 宁可横向溢出（视觉瑕疵），也不能因为量不出来而把页签藏掉（功能丢失）。
 */
/** 页签条溢出的像素级容差：亚像素布局（缩放 / 字体度量）不该被当成「还能滚 0.4px」。 */
export declare const NAV_OVERFLOW_EPSILON = 1;
/** 布局结果：visible 是留在条上的项下标，overflow 是进「更多」菜单的项下标（都按原顺序）。 */
export interface NavLayout {
    visible: number[];
    overflow: number[];
}
/**
 * 计算导航条布局。
 *
 * @param itemWidths 各项的实测宽度（当前语言下，含图标与左右内边距）
 * @param availWidth 容器**可用于页签**的宽度（已扣掉自身内边距）
 * @param moreWidth  「更多 ▾」按钮自身的实测宽度
 * @param gap       项间距
 *
 * 规则：
 *   ① 全放得下 → 全部可见，不渲染「更多」；
 *   ② 放不下 → 从**末项**开始移入 overflow，并为「更多」按钮及其占用的一个间隔留位；
 *   ③ 连「一个页签 + 更多」都放不下 → 隐藏没有收益，返回全部可见；
 *   ④ 任何度量不可信 → 全部可见。
 */
export declare function navLayout(itemWidths: readonly number[], availWidth: number, moreWidth: number, gap: number): NavLayout;
