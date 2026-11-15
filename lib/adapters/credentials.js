import { msgOf, zhMsg } from '../core/messages.js';
import { namespaceFromMap, readNamespaceMap, resolveNamespaces } from './settings.js';
import { sectionMeta } from '../schema/section-registry.js';
import { validateJsonSection } from './json-section.js';
import { entryByteSize, filterByUnits } from './units.js';
/** 缺省 ref 收集：遍历 settings namespace，收集 llm apiKeyEnv / providers[].apiKeyEnv，
 * 以及 secrets 标记中「引用类字段」（apiKeyEnv/tokenEnv…）的字段值。
 * 注意 secrets[].path[0] 是 settings 文档内的字段路径（如 ['apiKey']），本身不是凭据 ref（设计 §4.2），
 * 只有指向 env 名的引用字段才值得收集。 */
export function defaultCredentialRefs(namespaces) {
    return async (ctx) => {
        const refs = new Set();
        const names = await resolveNamespaces(namespaces, ctx);
        // 快路径：宿主能一次读回全部 namespace 时只读一趟（理由见 settings.ts readNamespaceMap）
        const all = names.length > 0 ? await readNamespaceMap(ctx) : null;
        for (const ns of names) {
            try {
                const info = all !== null ? namespaceFromMap(all, ns) : await ctx.settings.describe(ns, { redactSecrets: true });
                const value = (info.value ?? {});
                // 引用类字段名（值 = env/凭据引用名，非秘密本身）
                const REFERENCE_REF_FIELDS = new Set([
                    'apikeyenv', 'api_key_env', 'apikeyname', 'tokenenv', 'accesstokenenv',
                    'refreshtokenenv', 'clientsecretenv', 'passwordenv',
                ]);
                for (const s of info.secrets) {
                    const first = s.path?.[0];
                    if (typeof first !== 'string' || first === '')
                        continue;
                    const norm = first.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (!REFERENCE_REF_FIELDS.has(norm))
                        continue;
                    const val = value[first];
                    if (typeof val === 'string' && val !== '')
                        refs.add(val);
                }
                if (typeof value['apiKeyEnv'] === 'string' && value['apiKeyEnv'] !== '')
                    refs.add(value['apiKeyEnv']);
                const providers = value['providers'];
                if (providers !== null && typeof providers === 'object') {
                    for (const pv of Object.values(providers)) {
                        if (pv !== null && typeof pv === 'object' && typeof pv.apiKeyEnv === 'string' && pv.apiKeyEnv !== '') {
                            refs.add(pv.apiKeyEnv);
                        }
                    }
                }
            }
            catch {
                // namespace 不存在则跳过
            }
        }
        return [...refs];
    };
}
export class CredentialsAdapter {
    id = 'credentialsStatus';
    // 元数据唯一来源 = 注册表（t31）：不再与 ui/export-flow.ts 的导出目录各写一份
    displayName = sectionMeta('credentialsStatus').displayName;
    defaultIncluded = sectionMeta('credentialsStatus').defaultIncluded;
    portability = sectionMeta('credentialsStatus').portability;
    refs;
    constructor(options = {}) {
        this.refs = options.refs ?? defaultCredentialRefs(options.namespaces ?? []);
    }
    async export(ctx, options) {
        const credentials = [];
        const warnings = [];
        for (const ref of await this.refs(ctx)) {
            try {
                const status = await ctx.credentials.describe(ref);
                credentials.push({
                    ref,
                    required: true,
                    configured: status.configured,
                    source: status.source ?? 'file',
                    hasValue: false, // 值未导出（安全不变量）
                });
            }
            catch (err) {
                warnings.push(msgOf(ctx)('adapter.credStatusReadFailed', { ref, reason: err instanceof Error ? err.message : String(err) }));
            }
        }
        // 条目级白名单：未勾选的凭据 ref 不进「需补录」清单（少带一条 = 少录一个值）
        const picked = filterByUnits(credentials, options.includeItems?.[this.id], (c) => this.unitId(c.ref));
        return {
            sectionId: 'credentialsStatus',
            data: { version: 1, credentials: picked },
            counts: { credentials: picked.length },
            warnings,
        };
    }
    /** 单元 id：`credentialsStatus:<凭据 ref>` */
    unitId(ref) {
        return this.id + ':' + ref;
    }
    /** 条目级单元清单（零 I/O）；label = 凭据 ref，detail = 本机是否有值（不含任何敏感值） */
    listUnits(section) {
        return (section.data.credentials ?? []).map((c) => ({
            id: this.unitId(c.ref),
            label: c.ref,
            detail: c.configured ? 'configured' : 'missing',
            sizeBytes: entryByteSize(c),
        }));
    }
    async analyzeImport(_data, _ctx) {
        // MissingSecret 计划项由引擎在 createImportPlan 兜底生成（analyzer.ensureMissingSecrets），
        // 依据 = 本分区里 configured=true 的凭据 → 用户补录清单。这里保持零写入纯计算。
        return [];
    }
    async applyItem(item, ctx) {
        const ref = item.target?.ref;
        if (!ref)
            return { ok: false, message: ctx.msg('adapter.missingTargetRef') };
        const value = ctx.secretInputs[ref] ?? ctx.decryptedCredentials?.get(ref);
        if (value === undefined || value === '')
            return { ok: false, message: ctx.msg('adapter.credentialValueMissing') };
        await ctx.target.credentials.set(ref, value);
        return { ok: true };
    }
    async validate(data, msg = zhMsg) {
        return validateJsonSection('credentialsStatus', data, msg, (section, issues) => {
            if (!Array.isArray(section.credentials)) {
                issues.push({ path: 'credentials', message: msg('adapter.validate.array', { subject: 'credentials' }), severity: 'error' });
            }
            else {
                for (const c of section.credentials) {
                    if (c === null || typeof c !== 'object' || typeof c.ref !== 'string' || c.ref === '') {
                        issues.push({ path: 'credentials[]', message: msg('adapter.validate.credentialRef'), severity: 'error' });
                    }
                    if (c.hasValue === true) {
                        // 安全不变量：普通导出恒不携带值；若备份声称有值，视为结构异常
                        issues.push({ path: `credentials.${c.ref}.hasValue`, message: msg('adapter.validate.hasValueFalse'), severity: 'error' });
                    }
                }
            }
        }, 'credentials');
    }
}
//# sourceMappingURL=credentials.js.map