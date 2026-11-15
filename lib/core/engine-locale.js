/**
 * 语言源允许的缓存上界（毫秒）。
 *
 * 只给**非请求路径**（调度器、后台任务）兜底：请求入口应调用 invalidateEngineLocale()
 * 让每个请求都拿到最新语言（见 routes/kit.ts 的注册点）。
 */
export const LANGUAGE_TTL_MS = 1000;
const DEFAULT_LANGUAGE = 'zh';
let source = DEFAULT_LANGUAGE;
let cachedLanguage = DEFAULT_LANGUAGE;
let cachedAt = 0;
let cachedValid = false;
function normalize(value) {
    return value === 'en' ? 'en' : 'zh';
}
/** 设定引擎语言（固定值）：构造宿主时按 resolveAppLanguage(ctx) 初始化。 */
export function setEngineLocale(locale) {
    source = locale;
    invalidateEngineLocale();
}
/**
 * 注册「调用期解析」的语言活源（宿主用 () => resolveAppLanguage(ctx)）。
 *
 * 与 setEngineLocale 同源：后者给构造期的初值，本函数让**之后**每次取文案都能跟随用户切语言。
 */
export function setEngineLanguageSource(resolve) {
    setEngineLocale(resolve);
}
/** 强制失效：下一次 getEngineLocale() 必须重新解析（路由入口 / 测试用）。 */
export function invalidateEngineLocale() {
    cachedValid = false;
    cachedAt = 0;
}
/**
 * 当前引擎语言（调用期解析）。
 *
 * 函数源的结果按 LANGUAGE_TTL_MS 缓存；固定值源缓存无副作用。解析失败一律回落 zh（绝不抛错）。
 * now 可注入（单测用假时钟验证 TTL 上界）。
 */
export function getEngineLocale(now = Date.now()) {
    if (cachedValid && now - cachedAt < LANGUAGE_TTL_MS)
        return cachedLanguage;
    let next = DEFAULT_LANGUAGE;
    try {
        next = normalize(typeof source === 'function' ? source() : source);
    }
    catch {
        next = cachedValid ? cachedLanguage : DEFAULT_LANGUAGE;
    }
    cachedLanguage = next;
    cachedAt = now;
    cachedValid = true;
    return next;
}
/* ------------------------------------------------------------- 目录注册 */
const registry = [];
let baseZh;
let baseEn;
/**
 * 注册基础目录（zh 源 / en 镜像）。
 *
 * 由 src/core/messages.ts 在模块初始化时调用一次 —— 这样本模块不必 import 它（避免循环依赖）。
 * 直接 import engine-locale 而不 import messages.ts 的模块，engineMsg 只能拿到注册目录 + 键名。
 */
export function registerBaseMessageCatalog(catalogs) {
    baseZh = catalogs.zh;
    baseEn = catalogs.en;
}
/**
 * 注册一本追加目录（领域模块的键并入既有目录）。
 *
 * **只在既有目录未命中时生效**（makeMsg / engineMsg 的查找顺序：既有目录 → 注册目录 → 键名）；
 * 同一键先注册者优先。en 语言下注册目录未命中时再回退注册目录的 zh（与既有 en → zh 同口径）。
 */
export function registerMessageCatalog(catalog) {
    registry.push(catalog);
}
/** 已注册的追加目录（只读快照，诊断用）。 */
export function registeredMessageCatalogs() {
    return registry;
}
/** 清空追加目录（测试 / 装配隔离用）。 */
export function resetMessageCatalogs() {
    registry.length = 0;
}
/** 注册目录里查一条（未命中 → undefined）。 */
export function registeredMessage(lang, key) {
    for (const catalog of registry) {
        const hit = catalog[lang]?.[key];
        if (hit !== undefined)
            return hit;
    }
    if (lang === 'en') {
        for (const catalog of registry) {
            const hit = catalog.zh?.[key];
            if (hit !== undefined)
                return hit;
        }
    }
    return undefined;
}
/* --------------------------------------------------------------- 翻译器 */
/** 插值：{param} → 形参值；缺参原样保留（便于排查）。与改造前的 messages.ts 逐字同口径。 */
export function interpolate(template, params) {
    if (params === undefined)
        return template;
    return template.replace(/\{(\w+)\}/g, (match, key) => {
        const value = params[key];
        return value === undefined ? match : String(value);
    });
}
/**
 * 活翻译器（宿主 / 引擎半的 MsgFunc）：每次调用按 getEngineLocale() 选目录。
 *
 * 查找顺序：既有目录（当前语言）→ en 语言下回退既有 zh → 注册目录（同语言 → zh）→ 键名。
 * 未设定语言时 = zh 目录，行为与改造前逐字一致；未知键回退键名，绝不抛错。
 */
export function engineMsg(key, params) {
    const lang = getEngineLocale();
    const dict = lang === 'en' ? baseEn : baseZh;
    const fallback = lang === 'en' ? baseZh : undefined;
    const template = dict?.[key] ?? fallback?.[key] ?? registeredMessage(lang, key) ?? key;
    return interpolate(template, params);
}
//# sourceMappingURL=engine-locale.js.map