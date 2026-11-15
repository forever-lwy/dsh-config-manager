import type { SecretScanner, SensitiveHit } from '../core/types.ts';
/** 剥离占位（与 core defaultSecretScanner 语义一致：空串 = 需补录提示） */
export declare const REDACTED_PLACEHOLDER = "";
/**
 * 敏感字段名单（规范化名：小写、无分隔符）。
 * 覆盖规范 §6 原始清单 + 设计 §7.2 + core logger 名单，并保持克制以防误伤
 * （不收录 `key`/`session` 等过宽子串——`sessionIds`/`monkey` 不得中招）。
 */
export declare const DEFAULT_SECRET_FIELD_NAMES: readonly string[];
/** 引用字段（值只是「名字」而非秘密）：规范化精确命中即豁免 */
export declare const DEFAULT_REFERENCE_FIELDS: readonly string[];
/** 值形状强模式（默认开）：一眼可辨的密钥/凭据形态（包含式：值内任意位置出现即命中） */
export interface ValuePattern {
    name: string;
    re: RegExp;
}
/**
 * 前缀型模式的**误剥边界**（t83）：修既有过剥 —— `task-management` / `risk-assessment` / `disk-space-report`
 * 这类**正常内容**里的词会命中 `sk-` 模式（`sk-management` / `sk-assessment` / `sk-space-report`），而
 * `src/utils/logger.ts` 日志脱敏、core 导出导入的字段值扫描、界面 `redact()` **三条通道共用本表** ⇒
 * 误剥 = **静默改写用户内容**（实测 `redact('risk-assessment')` → `ri***REDACTED***`），属数据保真问题。
 * 取证（误剥表 / 过剥侧 / redact 侧三段原始输出）：`outputs/bug-audit/fix-wordboundary/`。
 *
 * **为什么 `sk-` 用「载荷形状守卫」而不是左边界 `(?<![A-Za-z0-9])`**：左边界会连带漏剥 t18/t40-b 实测的
 * **真实**形态 `'p'.repeat(10000) + 'sk-…'`（密钥紧贴长串之后）—— 漏剥 = 明文进包，代价高于词误剥。
 * 载荷守卫两者兼得：`sk-` 后若是「1–24 个纯小写字母/连字符」= 英文词/标识符形态 → 放行；真实 `sk-` 密钥的
 * 载荷必然含数字或大写（OpenAI 形态 `sk-` + 40+ 位 base62），且 ≥25 位纯小写载荷也仍然命中（见下）。
 * 残余（如实登记）：`sk-` + ≤24 个纯小写字母/连字符（无数字、无大写）不再命中 —— 即「载荷形状像词」的边界。
 *
 * **逐个模式判断，不一刀切**（其余三条不加工，各有实测理由）：
 *  - `aws-access-key`（`AKIA…`）/ `github-token`（`gh[pousr]_…`）/ `github-pat`（`github_pat_…`）：**不加边界**。
 *    ① 自然语言/标识符里**不存在**这些字面前缀（词里不会出现 `AKIA`/`ghp_`/`github_pat_`），无词误剥可修；
 *    ② 加左边界会与 `sk-` 同样削弱「长串内嵌」检出（t40-b/t40-c 的 `longPad` 形态对它们是同类风险）；
 *    ③ 实测「前邻字母数字」的命中（`xAKIA0123456789ABCDEF`、`xghp_…`）只能由**人为拼接**造出，不是正常内容。
 *  - `jwt`（`eyJ…`）：**不加**。它需要三段 base64 且以 `.` 分隔，普通词触发不了 ⇒ 加边界换不来收益，
 *    反而会让「紧贴字母的真 JWT」漏检（如两段 JWT 相连）。
 *  - `pem-private-key`：**不加**。形态是 `-----BEGIN … PRIVATE KEY-----`，普通词无法触发。
 *  - `bearer-token` / `bearer-token-anycase`：**不加**。scheme 是自然语言词，过剥已由 t72 的 token 侧三道
 *    guards 处理（`bearer credentials are required` 不命中）；且 t72 的验收要求规范形态 `Bearer …` 行为**逐字不变**。
 *
 * 保守性核对（不得削弱真检测）：`token=sk-…` / `"key":"sk-…"` / `apikey=sk-…` / `MY_sk-…` / `x-sk-…` /
 * `'p'.repeat(10000) + 'sk-…'` / `sk-proj-…` / `sk-ant-api03-…` **全部仍命中**（见 `t83-b` / `t83-f`）。
 */
export declare const SECRET_VALUE_PATTERNS: readonly ValuePattern[];
/** 值是否命中强模式 secret 形状（示例/占位形态 → null；返回命中模式名；未命中返回 null）。
 *  extraPatterns 为可选的个人化附加值形状模式（与 SECRET_VALUE_PATTERNS 合并判定，默认内置优先）；
 *  单参调用行为与历史完全一致（向后兼容）。 */
export declare function matchSecretValuePattern(value: string, extraPatterns?: readonly ValuePattern[]): string | null;
export interface SecretScannerOptions {
    /** 附加敏感字段名（任意原始形态，内部会规范化） */
    extraFieldNames?: string[];
    /** 附加引用字段名（规范化后精确命中即豁免） */
    extraReferenceFields?: string[];
    /**
     * 附加值形状强模式（个人化规则，如昵称/用户名格式；与 SECRET_VALUE_PATTERNS 合并参与值形状判定，
     * 默认内置模式优先；示例/占位形态同样降噪放行）。来自部署配置 personalPatterns，不进开源代码。
     */
    extraValuePatterns?: ValuePattern[];
    /** 值形状启发式开关（默认 true） */
    valuePatterns?: boolean;
    /** 高熵长串启发式（默认 false：误伤风险高，需显式开启） */
    highEntropy?: boolean;
    /**
     * 宽松档（默认 false = 保守档）。
     * 保守档（导出/同步脱敏）：字段名敏感即命中，值形状优先、引用/env 名豁免；
     * 宽松档（市场发布扫描）：字段名敏感**且**值像真实字面量凭据才命中——占位符 /
     * 模板引用 / 代码表达式 / 类型词 / 短标识符放行，消除「值不是秘密」的误报。
     */
    literalValueOnly?: boolean;
    /** 最大递归深度（默认 64，与 JSON 深度上限一致） */
    maxDepth?: number;
}
/** 规范化字段名：小写 + 去 `_-. ` 分隔符（用于名单匹配） */
export declare function normalizeFieldName(name: string): string;
/** 是否为「环境变量名」形态（全大写下划线，如 DEEPSEEK_API_KEY）→ 视为引用名 */
export declare function isEnvVarName(value: string): boolean;
/** 是否为模板/环境变量引用形态（${VAR} / {{VAR}} / %VAR% / $VAR）→ 值是名字不是秘密。
 *  注意：文本扫描的 `field: value` 正则用 `[^\s,;}]` 取值，`${...}` / `{{...}}` 的右花括号
 *  会被截断，因此除完整闭合形态外，也接受「以 ${ / {{ / % 开头、内容全为变量名字符」的截断形态。 */
export declare function isTemplateReference(value: string): boolean;
/** 字段名是否命中敏感名单（规范化后精确 / 敏感后缀 / 敏感前缀） */
export declare function isSensitiveFieldName(field: string, extra?: readonly string[]): boolean;
/** 是否为引用字段（值只是名字，不剥离） */
export declare function isReferenceField(field: string, extra?: readonly string[]): boolean;
/** 递归扫描 + 剥离（纯函数，不改原数据；深度保护；返回清洗后数据与命中清单） */
export declare function scanAndRedact(data: unknown, opts?: SecretScannerOptions): {
    sanitized: unknown;
    hits: SensitiveHit[];
};
/** 文本级扫描：逐行找「敏感字段名 + 疑似真实字面量凭据」与「值形状」命中（只报告，不修改文本）。
 *  2026-08-20 优化：字段名命中不再是充分条件 —— 值必须是「非代码引用 / 非占位符 / 非类型词 /
 *  非短标识符」的字面量，消除技能/代码文档中 `token:`/`password:` 等示例命名的误报；
 *  2026-08-21 优化：值形状（sk-/ghp_/AKIA/JWT/PEM/Bearer）对示例/占位形态（含 your/example/
 *  xxx/test/<...> 等占位词）放行；混合字符串需像真实凭据（含数字/符号/大小写混合）才报告。 */
export declare function scanText(text: string, opts?: SecretScannerOptions): SensitiveHit[];
/** 强化版 SecretScanner（对齐 core SecretScanner 契约，可注入 Exporter.scanner） */
export declare function createSecretScanner(opts?: SecretScannerOptions): SecretScanner;
/**
 * 部署配置（F2 个人隐私规则注入，对齐 dsh-packer config.personalPatterns 设计）：
 * 通用隐私规则开源内置（DEFAULT_SECRET_FIELD_NAMES / SECRET_VALUE_PATTERNS 等），
 * 个人化规则（昵称/用户名等）由部署者注入，不进开源代码。
 */
export interface ConfiguredSecretPatterns {
    /** 附加敏感字段名（个人账号/昵称等字段） */
    extraFieldNames?: string[];
    /** 附加引用字段名（值只是名字，如引用环境变量名的个人字段） */
    extraReferenceFields?: string[];
    /** 附加值形状强模式（个人昵称/用户名等一眼可辨格式） */
    extraValuePatterns?: ValuePattern[];
}
/** 从部署配置构造扫描器；未配置（undefined 或全部为空）时返回默认 createSecretScanner()，
 *  行为与默认完全一致。配置了个人化规则时将其作为附加字段名 / 引用字段 / 值形状模式合并进扫描器。 */
export declare function createConfiguredSecretScanner(patterns: ConfiguredSecretPatterns | undefined): SecretScanner;
