/** 单侧预览文本上限（2 KiB **字符**预算）：超出截断并追加省略号。 */
export declare const MERGE_PREVIEW_TEXT_LIMIT = 2048;
/**
 * 预览文本统一出口：先 redact（敏感值绝不回传浏览器），再截断到 2 KiB。
 *
 * 顺序恒为「先 redact 再截断」：反过来会把跨边界的敏感值切成半个形状，让脱敏匹配不到它
 * （等于把秘密截一半发出去）。redact 之后的剩余文本已不含秘密形状，截断才安全。
 */
export declare function finalizePreviewText(text: string): string;
/** 把任意冲突侧值转成**可读字符串**；二进制只回传形状与字节数，绝不回传原始值对象。 */
export declare function previewTextOf(value: unknown): string;
