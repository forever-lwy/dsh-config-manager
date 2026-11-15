/**
 * m-sync-flow：行级文本三方合并 + 递归 JSON 结构化合并（零依赖纯函数）。
 *
 * 职责边界（本文件只做纯计算：不读配置、不落盘、不打日志）：
 *  - looksLikeText / tryParseJson：内容形态判定（文本 / JSON）；
 *  - mergeJsonValues：JSON 值级递归三方合并（对象按 key 递归；数组绝不按索引合并）；
 *  - mergeTextThreeWay：文本级三方合并（三段都是合法 JSON 时优先走结构化合并）；
 *  - mergeBytesThreeWay：字节级入口，非文本 / 超限 / 缺祖先一律如实拒绝（绝不猜）。
 *
 * 安全口径（改这里前先读）：
 *  - 冲突优先于猜测：语义不明的合并（数组双侧改动、同一区域双侧改动、类型互换）一律报冲突，
 *    绝不静默丢弃任一侧的键 / 插件配置 / 用户数据。
 *  - 行对齐只走 LCS（base→local、base→remote），同一行内容重复时也不会错位；单侧变更区间
 *    超过 DP 上限时退化为「整段替换」——宁可粗粒度报冲突，也不做定位猜测。
 *  - 文本比较按「去行尾」后的内容进行：CRLF/LF 混用不得误报冲突；输出保留输入的行尾风格。
 *  - 缺共同祖先（ancestor === undefined）→ ok:false：由上层按整文件冲突处理，本模块不猜。
 */
/** 文本判定与文本合并的缺省字节上限：1 MiB。超限一律按「太大不合并」处理。 */
export declare const TEXT_MERGE_MAX_BYTES: number;
/** 单条冲突。local/remote/ancestor 是原始值：JSON 合并给原始 JSON 值，文本合并给字符串片段。 */
export interface TextMergeConflict {
    /** 冲突位置：JSON 合并是点号路径（'a.b.c'，根为 ''）；文本合并是 'line 12-14'（或单点 'line 7'）。 */
    path: string;
    reason: 'overlap' | 'array' | 'format' | 'binary' | 'too-large';
    local?: unknown;
    remote?: unknown;
    ancestor?: unknown;
}
/** JSON 值级合并结果；ok 为 false 时 merged 缺省（绝不把半成品当结果）。 */
export interface JsonMergeResult {
    ok: boolean;
    merged?: unknown;
    conflicts: TextMergeConflict[];
}
/** 合并内容形态：合法 JSON 文本 / 行级文本 / 二进制 / 超限。 */
export type TextMergeKind = 'text' | 'json' | 'binary' | 'too-large';
/** 文本（或字节）三方合并结果。 */
export interface TextMergeResult {
    ok: boolean;
    merged?: string;
    conflicts: TextMergeConflict[];
    kind: TextMergeKind;
}
/** 字节三方合并结果。 */
export interface TextBytesMergeResult {
    ok: boolean;
    merged?: Uint8Array;
    conflicts: TextMergeConflict[];
    kind: TextMergeKind;
}
/**
 * 是否像文本：含 NUL 字节 / 非法 UTF-8 / 超过 maxBytes（缺省 1 MiB）→ false。
 * 只做形态判定，不做解码；调用方拿到 true 后可用 UTF-8 解码。
 */
export declare function looksLikeText(bytes: Uint8Array, maxBytes?: number): boolean;
/** 严格 JSON 解析（不做 JSON5 / 注释 / 尾逗号宽容）：解析失败返回 ok:false。 */
export declare function tryParseJson(text: string): {
    ok: true;
    value: unknown;
} | {
    ok: false;
};
/**
 * 三方合并 JSON 值（递归，任意深度）。
 *  - 双侧相同 → 该值（收敛）；
 *  - 仅一侧相对祖先改动 → 采纳该侧；
 *  - 对象（祖先缺省或同为对象）→ 按键递归，**缺失键 = 删除语义**：
 *      一侧删除 + 另一侧未改 → 删除胜出；一侧删除 + 另一侧改了 → 冲突；
 *      单侧新增（祖先没有）→ 采纳；双侧都新增且不同 → 冲突；
 *  - 数组绝不按索引合并：双侧都改且不 deepEqual → 冲突（reason='array'）；
 *  - 其余（标量双向改动、类型互换）→ 冲突（reason='overlap'）。
 */
export declare function mergeJsonValues(ancestor: unknown, local: unknown, remote: unknown, path?: string): JsonMergeResult;
/**
 * 行级三方合并：base→local、base→remote 各自算变更区间，不重叠的全部应用；
 * 重叠区间两侧结果逐字相同 → 收敛为一份，否则冲突（path='line X-Y'）。
 */
export declare function mergeTextThreeWay(ancestor: string, local: string, remote: string): TextMergeResult;
/**
 * 字节三方合并：
 *  - ancestor === undefined → ok:false（无共同祖先，由上层按整文件冲突处理，绝不猜）；
 *  - 任一侧二进制 / 超限（含 ancestor）→ ok:false，kind 如实（'binary' / 'too-large'）；
 *  - 否则解码为文本走 mergeTextThreeWay，成功后按 UTF-8 编码回字节。
 */
export declare function mergeBytesThreeWay(ancestor: Uint8Array | undefined, local: Uint8Array, remote: Uint8Array): TextBytesMergeResult;
