/**
 * 日志/文本脱敏（规范 §24 / 设计 §9.8 / core utils/logger.ts 的强化层）。
 *
 * 与 core logger.redact 的分工：core 版按固定字段名单做子串替换（不感知字段边界）；
 * 本模块为强化版，两模式：
 *  1. **结构化字段形态**：JSON `"field": "value"` / `field=value` / `field: value`，
 *     字段名命中敏感名单（复用 secret-scanner 的 `isSensitiveFieldName`，单一来源防漂移）→ 值替换。
 *  2. **值形状模式**：与字段名无关，文本任意位置出现 sk- / JWT / AKIA / GitHub PAT /
 *     PEM 私钥 / Bearer / URL query 的敏感参数值 → 替换。
 *
 * 幂等性：替换产物 `***REDACTED***` 不匹配任何模式，重复 redact 结果不变；
 * JSON 行的引号结构保留（输出仍是合法 JSON）。
 */
import { DEFAULT_SECRET_FIELD_NAMES } from './secret-scanner.ts';
export declare const REDACTED = "***REDACTED***";
/**
 * 值形状模式（**单一来源**，G-36 残余 ③ 于 t78 收口）：
 * 表内容 = `secret-scanner.ts` 的 `SECRET_VALUE_PATTERNS`（**同一份**，含 t72 的
 * `bearer-token-anycase`），本模块只做两件不改语义的事：① 复制成**带 `/g`** 的新实例
 * （replace 需要 `/g`；新实例也避免共享正则的 lastIndex 跨调用泄漏）；
 * ② 追加上面那条**只放宽**的通用 PEM 头。
 *
 * 于是本条修正了「两份独立表会持续漂移」（本队已多次抓到的「同一语义两套实现」）：
 * scanner 侧新增/收窄形状时，redact() 自动跟随（漂移守卫见 `redaction.test.ts` 的 t78 组）。
 */
export declare const REDACTION_VALUE_PATTERNS: readonly {
    name: string;
    re: RegExp;
}[];
/** 高熵长 token 掩码（日期戳形态豁免；回调逐个 run 判定，避免误伤文件名/时间戳）。 */
export declare function maskHighEntropy(text: string): string;
/**
 * 文本脱敏（幂等）。blacklist 为**附加**规范化字段名（小写无分隔符，如 'clientsecret'）。
 * 输出仍保留结构化形态（JSON 行合法）。
 */
export declare function redact(text: string, blacklist?: readonly string[]): string;
/** 对象级掩码：字段名命中敏感名单 → 整值替换（返回新对象，不改原对象；结构与类型保留） */
export declare function redactValue(value: unknown, blacklist?: readonly string[]): unknown;
/**
 * 预编译脱敏器（多次调用复用；blacklist 为附加规范化字段名）。
 * 正则实例**在创建时**各复制一份：模块级常量若与本函数共享，多线程无害但会让「谁动了 lastIndex」
 * 不可追溯；复制成本只有一次，换来每个脱敏器实例自持状态。
 */
export declare function createRedactor(blacklist?: readonly string[]): (text: string) => string;
/** 默认名单（文档用；redact 的默认附加名单为空，内置判定已含 DEFAULT_SECRET_FIELD_NAMES） */
export { DEFAULT_SECRET_FIELD_NAMES };
