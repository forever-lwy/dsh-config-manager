/**
 * JSON 深度保护：解析/序列化/克隆带嵌套深度上限（防 JSON 深度攻击，规范 §19.5）。
 * 解析分两段：JSON.parse 可能因引擎栈限制抛 RangeError（捕获并归一），
 * 再对结果做显式栈 walk 检查深度（避免 walk 自身递归爆栈）。
 */
export declare const DEFAULT_MAX_JSON_DEPTH = 64;
export declare const DEFAULT_MAX_JSON_BYTES: number;
/**
 * **本插件自产载荷**的体积上限（加密同步快照单文件，issue #59）。
 *
 * 为什么必须与不可信输入的上限分开：`DEFAULT_MAX_JSON_BYTES`（64 MiB）是防「外部喂进来的
 * 巨型 JSON」的闸门，而加密同步快照是**我们自己写出去的**——加密单文件布局把明文
 * sections 序列化 → base64 → 整体加密 → 再 base64，膨胀约 1.78 倍，勾选 sessions 分区
 * 后单文件轻松越过 64 MiB（真机 4 个快照均 ≈66 MiB）。
 *
 * 越界的后果不是报错而是**静默**：`list()` 里解析失败被吞掉 → 远端列表恒为空；
 * `download()` 报「快照损坏」→ 拉取彻底不可用；`hasNewRemoteSnapshot()` 恒 false →
 * 自动同步永远 `upToDate`。故读取侧必须显式抬到与写出能力相称的上限。
 */
export declare const MAX_OWN_PAYLOAD_JSON_BYTES: number;
export declare class JsonDepthError extends Error {
    constructor(message?: string);
}
/** 测量对象/数组的嵌套深度（迭代式显式栈，不会递归爆栈；二进制视为叶子） */
export declare function measureDepth(value: unknown): number;
/** 深度保护解析：超限抛 JsonDepthError，非法 JSON 抛 SyntaxError */
export declare function parseJsonSafe(text: string, opts?: {
    maxDepth?: number;
    maxBytes?: number;
}): unknown;
/** 深度保护序列化：先测深度再 stringify（默认不缩进） */
export declare function stringifyJsonSafe(value: unknown, opts?: {
    maxDepth?: number;
    space?: number;
}): string;
/** 深度保护深拷贝（迭代式，安全） */
export declare function deepClone<T>(value: T, maxDepth?: number): T;
/** JSON-compatible values shared by the core without a host SDK dependency. */
export type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
