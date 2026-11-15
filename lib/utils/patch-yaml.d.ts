/** `!!js` 表达式的内存形态（与 DSH / cordis 的 `{__jsExpr}` 逐字同形）。 */
export interface PatchJsExpr {
    __jsExpr: string;
}
/** 与 cordis `isJsExpr` 同判据（`value instanceof Object && '__jsExpr' in value`）。 */
export declare function isPatchJsExpr(value: unknown): value is PatchJsExpr;
/** patch 文件的 YAML schema（= DSH 的 `entryListSchema` 同款）。 */
export declare const PATCH_YAML_SCHEMA: import("js-yaml").Schema;
/**
 * 载入 patch 文档（任意 YAML 值）。
 *
 * 解析失败**抛出**（不吞）：调用方要么把它转成可见告警，要么拒绝覆盖写入 —— 两条路都好过
 * 「当作空文档、把用户的整层配置抹掉」。
 */
export declare function loadPatchDocument(text: string): unknown;
/**
 * 写回 patch 文档：`{__jsExpr}` 还原成 `!!js`，字符串一律带引号（issue #135）。
 *
 * `forceQuotes` 不是风格偏好，而是**跨大版本读回的前提**：本插件装在 js-yaml 5.x 上打印，
 * DSH 本体用 4.x 读回（桌面版随包 4.3.2）。5.x 的渲染器只按自己的解析规则决定要不要加引号，
 * 于是 `""` `Null` `~` `True` `007` `0x10` `.inf` 这类**字符串**被写成裸标量，
 * 4.x 按 YAML 1.1 隐式解析成 `null` / `true` / `7` / `16` / `Infinity` —— 两边读到不同的值，
 * 把该字段声明为必填 string 的插件启动时直接 ZodError。
 *
 * 代价（已知且接受）：字符串值普遍带引号；普通多行字符串从 `|` 块退化为双引号 + `\n`
 * （`!!js` 的块标量带标签，不受影响）。只影响写出去的字节，读侧语义不变：
 * 已经写成空标量的历史文件仍由 `loadPatchDocument` 读成 `""`，该层下次被写回时自动复原。
 */
export declare function dumpPatchDocument(value: unknown): string;
/**
 * 键名在 DSH 读端（js-yaml 4.x）的**改判**形态。
 *
 * 为什么需要单独一层检查：`forceQuotes`（issue #135）只保**值**，键名是 js-yaml 自己决定加不加
 * 引号的 —— 5.x 只给「YAML 1.2 会改判」的键加引号，1.1-only 的形态（`007`、`True`、`.5`、`~`）
 * 一律裸写，于是 4.x 把键读成 `7` / `true` / `0.5` / `null`：配置静默改名，插件读不到自己的键。
 * 空键名更糟 —— `: 'v'` 会让 4.x **整份文件解析失败**（该层所有行一起失效）。
 */
export type PatchKeyHazardEffect = 'parse-fail' | 'rename';
/** 一处键名风险。 */
export interface PatchKeyHazard {
    /** 键所在容器的路径（`''` = 顶层；数组元素记作 `items[3]`） */
    path: string;
    /** 出问题的键名原文（空串 = 空键名） */
    key: string;
    /** `parse-fail` = 4.x 整份文件解析失败；`rename` = 键被改判成数字 / 布尔 / null */
    effect: PatchKeyHazardEffect;
}
/**
 * 找出一个 patch 行里**会跨大版本读坏**的键名（issue #137）。
 *
 * 只扫键、不扫值（值由 `dumpPatchDocument` 的 `forceQuotes` 兜住）；`{__jsExpr}` 是本模块的
 * 内存形态不是用户键名，整棵子树跳过；YAML 锚点可以造环，同一对象只走一次。
 * 返回空数组 = 这一行写出去 4.x / 5.x 读到的键名一致。
 */
export declare function findPatchKeyHazards(value: unknown): PatchKeyHazard[];
/**
 * 解析报错的**安全摘要**：只取首行。
 *
 * 为什么必须截断：js-yaml 的 `Error.message` 会在首行之后附带**出错处的源码片段**，而
 * `cordis.patch.yml` 里可能内联字面量密钥（`!!js` 表达式旁会出现明文 token / API Key）。
 * 这段摘要会流进启动日志、导出告警与浏览器回执 —— 片段一律不得带出去。
 */
export declare function describePatchYamlError(err: unknown): string;
