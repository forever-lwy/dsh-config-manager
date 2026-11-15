/** 用户忽略规则文件名（分块根） */
export declare const IGNORE_RULE_FILE_NAME = ".dsh-rollback-ignore";
interface IgnorePattern {
    /** 规则原文（诊断用） */
    raw: string;
    negated: boolean;
    dirOnly: boolean;
    /** 已编译的正则（匹配「相对规则文件所在目录」的斜杠路径） */
    re: RegExp;
}
/** 一份已解析的规则表（空规则 = 没有任何用户规则） */
export interface IgnoreRules {
    readonly root: string;
    readonly patterns: readonly IgnorePattern[];
}
/**
 * glob body → RegExp（* / ? 不跨段，** 跨段）。导出只为让单测逐条钉住编译结果。
 */
export declare function ignoreGlobToRegExp(body: string): RegExp;
/** 解析规则文件正文 → 规则表（无法解析的行一律跳过，绝不因此拒绝整份规则） */
export declare function parseIgnoreRules(text: string, root: string): IgnoreRules;
/** 读分块根的规则文件；不存在 / 读不出 / 空文件 → 空规则（绝不因此让捕获失败） */
export declare function loadIgnoreRules(root: string): Promise<IgnoreRules>;
/**
 * 一条相对规则根的斜杠路径是否被忽略（最后一条命中的规则说了算）。
 * isDir 只影响 dirOnly 规则的匹配；被忽略目录的后代由调用方整棵跳过，不在这里递归判断。
 */
export declare function ignoreRuleMatches(rules: IgnoreRules, relPath: string, isDir: boolean): boolean;
/** 分块根 → 该路径的规则相对路径（斜杠形式）。不在分块内返回 null（调用方按无规则处理）。 */
export declare function ignoreRelativePath(root: string, target: string): string | null;
/**
 * 内置敏感文件判据：命中返回原因码 `'sensitive'`（含凭据，**不回滚**），否则 null。
 *
 * `relPath` 是**相对分块根**的斜杠路径（来自 {@link ignoreRelativePath}）——只看文件名与后缀，
 * 不看目录：密钥常散落在任意子目录（src/a.key）。
 *
 * 与用户忽略规则的关键区别：**不可被 `!` 反向取消**。调用方在判定处独立调用本函数，
 * 而不是把它编译进 parseIgnoreRules 的 patterns —— 用户写 `!.env` 的动机通常是「我要能回滚我的
 * .env」，但那会把明文密码送进内容寻址仓库；这类文件宁可少回滚，也不明文物化。
 *
 * 大小写折半比较（Windows / macOS 上 .ENV 与 .env 是同一个文件）：宁可保守。
 * 刻意放行：`.env.example` / `.env.sample` / `.env.template`（模板是文档）、`*.pub`（公钥）。
 */
export declare function builtinSensitiveReason(relPath: string): string | null;
export {};
