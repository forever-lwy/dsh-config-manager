/**
 * providers 分区 adapter（设计 §3.3/§13.1）：
 * 数据源 = settings.yaml 的 llm-deepseek / llm-pi-ai section（providers 与 models 天然同 section，不拆文件）。
 *
 * 导入走 settings 写通道（replace llm-* namespace + 乐观锁）：
 * 每项携带 raw（该 namespace 的完整 redacted 值）用于整体写回，apiKey 值经 credentials 状态占位（不导出值）。
 */
import { isDeepStrictEqual } from 'node:util';
import { msgOf, zhMsg } from '../core/messages.js';
import { resolveNamespaces, isEmptyValue } from './settings.js';
import { sectionMeta } from '../schema/section-registry.js';
import { validateJsonSection } from './json-section.js';
import { entryByteSize, filterByUnits } from './units.js';
export const DEFAULT_PROVIDER_NAMESPACES = ['llm-deepseek', 'llm-pi-ai'];
/** 无 raw 时的兜底重建：只取 ProviderEntry 已知字段 */
function stripEntry(entry) {
    const out = {};
    for (const key of ['apiKeyEnv', 'displayName', 'baseURL', 'models', 'modelOverrides', 'reasoning', 'transport', 'retryPolicy']) {
        if (entry[key] !== undefined)
            out[key] = entry[key];
    }
    return out;
}
/** Preserve a working local binding only when the same provider has no usable imported key. */
async function providerValue(entry, current, ctx) {
    const value = structuredClone(entry.raw ?? stripEntry(entry));
    const kept = [];
    const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) ? v : undefined;
    const preserve = async (incoming, local) => {
        if (local === undefined)
            return;
        const endpoint = (v) => typeof v === 'string' ? v.replace(/\/+$/, '') : v;
        if (endpoint(incoming['baseURL']) !== endpoint(local['baseURL']))
            return;
        const oldRef = local['apiKeyEnv'];
        const newRef = incoming['apiKeyEnv'];
        if (typeof oldRef !== 'string' || oldRef === '' || typeof newRef !== 'string' || oldRef === newRef)
            return;
        if (ctx.decryptedCredentials?.has(newRef) || ctx.secretInputs[newRef])
            return;
        if (newRef !== '' && (await ctx.target.credentials.describe(newRef)).configured)
            return;
        if (!(await ctx.target.credentials.describe(oldRef)).configured)
            return;
        incoming['apiKeyEnv'] = oldRef;
        kept.push(oldRef);
    };
    const local = record(current);
    const routes = record(value['providers']);
    if (routes !== undefined) {
        const localRoutes = record(local?.['providers']);
        for (const [route, v] of Object.entries(routes)) {
            const incoming = record(v);
            if (incoming !== undefined)
                await preserve(incoming, record(localRoutes?.[route]));
        }
    }
    else
        await preserve(value, local);
    return { value, kept };
}
export class ProvidersAdapter {
    id = 'providers';
    // 元数据唯一来源 = 注册表（t31）：不再与 ui/export-flow.ts 的导出目录各写一份
    displayName = sectionMeta('providers').displayName;
    defaultIncluded = sectionMeta('providers').defaultIncluded;
    portability = sectionMeta('providers').portability;
    namespaces;
    constructor(namespaces = DEFAULT_PROVIDER_NAMESPACES) {
        this.namespaces = namespaces;
    }
    async export(ctx, options) {
        const providers = {};
        const warnings = [];
        for (const ns of await resolveNamespaces(this.namespaces, ctx)) {
            let info;
            try {
                info = await ctx.settings.describe(ns, { redactSecrets: true });
            }
            catch (err) {
                warnings.push(msgOf(ctx)('adapter.providerNsReadFailed', { ns, reason: err instanceof Error ? err.message : String(err) }));
                continue;
            }
            const value = (info.value ?? {});
            // llm-pi-ai 形态：value.providers = { route: {...} }；llm-deepseek 形态：value 即单 provider 配置
            const routes = value.providers !== null && typeof value.providers === 'object'
                ? Object.entries(value.providers)
                : [[ns, value]];
            for (const [route, pv] of routes) {
                // 每个 route 独立深拷贝 secrets / pv / raw：同一 namespace 的多 route 若共享引用，
                // m4 强化版 createSecretScanner 的 visited 循环检测会误判「检测到循环引用」（见 providers.test.ts）。
                providers[route] = {
                    route,
                    namespace: ns,
                    revision: info.revision,
                    secrets: structuredClone(info.secrets),
                    ...structuredClone(pv),
                    raw: structuredClone(value),
                };
            }
        }
        const picked = this.pickProviders(providers, options.includeItems?.[this.id]);
        return {
            sectionId: 'providers',
            data: { version: 1, providers: picked },
            counts: { providers: Object.keys(picked).length },
            warnings,
        };
    }
    /** 单元 id：`providers:<route>`（route 是 providers 记录的键，天然唯一） */
    unitId(route) {
        return this.id + ':' + route;
    }
    /**
     * 条目级单元清单（零 I/O）：一台 provider（记录里的一个 route）= 一个单元。
     *
     * detail 给来源 namespace —— 用户靠它区分「同一个模型走哪个 ns」，不放任何 key 值。
     */
    listUnits(section) {
        return Object.entries(section.data.providers ?? {}).map(([route, entry]) => ({
            id: this.unitId(route),
            label: route,
            detail: entry.namespace,
            sizeBytes: entryByteSize(entry),
        }));
    }
    /**
     * 白名单过滤 + raw 重建。
     *
     * 为什么必须重建 raw：每个 entry.raw 存的是**整个 namespace** 的快照（导入按 namespace 整体替换）。
     * 只勾 llm-pi-ai 下的一条 route 时若原样带走 raw，未勾的 route 会随 raw 一起进包、
     * 导入时又被整 namespace 写回目标机 —— 用户看到「没勾却没生效」，选择器等于撒谎。
     * 因此这里把每个 namespace 的 raw.providers 收窄成「该 ns 里被勾选的 route」集合。
     */
    pickProviders(providers, allow) {
        const picked = filterByUnits(Object.entries(providers), allow, ([route]) => this.unitId(route));
        const out = {};
        const keepByNs = new Map();
        for (const [route, entry] of picked) {
            out[route] = entry;
            const keep = keepByNs.get(entry.namespace) ?? new Set();
            keep.add(route);
            keepByNs.set(entry.namespace, keep);
        }
        if (allow === undefined)
            return out; // 全量导出不动 raw（保持与旧备份逐字节一致）
        for (const entry of Object.values(out)) {
            const raw = entry.raw;
            if (raw === null || typeof raw !== 'object')
                continue;
            const pv = raw['providers'];
            if (pv === null || typeof pv !== 'object' || Array.isArray(pv))
                continue;
            const keep = keepByNs.get(entry.namespace) ?? new Set();
            const narrowed = {};
            for (const [route, value] of Object.entries(pv)) {
                if (keep.has(route))
                    narrowed[route] = value;
            }
            entry.raw = { ...raw, providers: narrowed };
        }
        return out;
    }
    async analyzeImport(data, ctx) {
        const msg = ctx.msg;
        const items = [];
        for (const [route, entry] of Object.entries(data.providers)) {
            const id = `provider:${route}`;
            let current = null;
            let targetUnavailable = false;
            try {
                current = await ctx.target.settings.describe(entry.namespace, { redactSecrets: true });
            }
            catch {
                // 目标未注册该 namespace（缺少提供它的插件）→ 写入必失败，按依赖缺失处理（§15）
                targetUnavailable = true;
            }
            if (targetUnavailable) {
                items.push({
                    id, kind: 'MissingDependency', adapter: 'providers',
                    description: msg('adapter.providerUnregistered', { route, ns: entry.namespace }),
                    severity: 'warning', target: { adapter: 'providers', ref: entry.namespace },
                });
            }
            else if (current !== null && isDeepStrictEqual(current.value, (await providerValue(entry, current.value, ctx)).value)) {
                // 值相等优先于「目标为空」——与 settings.planNamespaceItems 同一口径与顺序（issue #73）
                items.push({ id, kind: 'Skip', adapter: 'providers', description: msg('adapter.providerSame', { route }), severity: 'info' });
            }
            else if (current === null || isEmptyValue(current.value)) {
                // 目标已注册但为空**且导入值非空** → 初始化（Create）
                items.push({
                    id, kind: 'Create', adapter: 'providers',
                    description: msg('adapter.providerCreate', { route, ns: entry.namespace }), severity: 'info',
                    target: { adapter: 'providers', ref: entry.namespace },
                });
            }
            else {
                items.push({
                    id, kind: 'Conflict', adapter: 'providers',
                    description: msg('adapter.providerDiff', { route }),
                    detail: `namespace=${entry.namespace} current=${JSON.stringify(current.value)} imported=${JSON.stringify(entry.raw ?? stripEntry(entry))}`.slice(0, 200),
                    severity: 'warning', target: { adapter: 'providers', ref: entry.namespace },
                });
            }
        }
        return items;
    }
    async applyItem(item, ctx) {
        const route = item.id.replace(/^provider:/, '');
        const data = ctx.sections.get('providers');
        const entry = data?.providers[route];
        if (!entry)
            return { ok: false, message: ctx.msg('adapter.providerMissing', { route }) };
        let current;
        let expected;
        try {
            current = await ctx.target.settings.describe(entry.namespace, { redactSecrets: true });
            expected = current.revision;
        }
        catch {
            expected = undefined; // 目标 namespace 不存在（Create）
        }
        const { value, kept } = await providerValue(entry, current?.value, ctx);
        await ctx.target.settings.replace(entry.namespace, value, expected);
        return { ok: true, ...(kept.length > 0 ? { warning: true, message: ctx.msg('adapter.providerSecretRefKept', { refs: kept.join(', ') }) } : {}) };
    }
    async validate(data, msg = zhMsg) {
        return validateJsonSection('providers', data, msg, (section, issues) => {
            if (section.providers === null || typeof section.providers !== 'object') {
                issues.push({ path: 'providers', message: msg('adapter.validate.missingObject', { subject: 'providers' }), severity: 'error' });
            }
            else {
                for (const [route, entry] of Object.entries(section.providers)) {
                    if (entry === null || typeof entry !== 'object') {
                        issues.push({ path: `providers.${route}`, message: msg('adapter.validate.recordObject', { subject: 'provider' }), severity: 'error' });
                        continue;
                    }
                    if (typeof entry.namespace !== 'string' || entry.namespace === '') {
                        issues.push({ path: `providers.${route}.namespace`, message: msg('adapter.validate.sourceNamespace'), severity: 'error' });
                    }
                    if (typeof entry.revision !== 'number') {
                        issues.push({ path: `providers.${route}.revision`, message: msg('adapter.validate.number', { subject: 'revision' }), severity: 'error' });
                    }
                }
            }
        });
    }
}
//# sourceMappingURL=providers.js.map