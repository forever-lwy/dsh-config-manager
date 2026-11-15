/**
 * 启动自洽审计（Launch Safety Audit）——「终止导入并保留已应用项」分支的安全闸门。
 *
 * 为什么必须有它：用户选择「保留」= 允许一笔**只应用了一部分计划项**的导入留在盘上。
 * 盘面不自洽时 DSH 下次启动可能直接失败，而用户看到的却是「已保留」的绿色结论。
 * 本模块复用仓库里已有的两套原语，不新造检查：
 *  - `computeSafeBundles`（./boot-rescue.ts）：救援模式剪 bundle 用的同一函数 ——
 *    profile `dsh.profile.bundles` 里解析不到的包会让 DSH 启动失败，这是「插件装一半」
 *    最典型的坏盘面，也是本审计里**唯一会自动修正**的一项；
 *  - `BOOT_CRITICAL_RELS` / `profileCriticalRels`（./boot-paths.ts）：启动关键文件清单。
 *
 * 纪律（与 boot-rescue 一致）：
 *  - **只做可证明安全的自动修正**（剔除解析不到的 bundle，与救援模式同一判据）；
 *    其余问题一律如实上报，绝不静默「修好」；
 *  - 审计结论三态：safe（未发现问题）/ repaired（发现问题且已定点修正）/ unsafe
 *    （存在未修正的 error 级问题）。**能力未注入的检查记入 unchecked，绝不当作通过**；
 *  - 审计自身**绝不抛错**（调用方处于「用户已选择保留」的正常返回路径上，抛错会把
 *    「已知结论」换成异常并触发 journal NEEDS_ATTENTION + SAFE MODE）。
 *  - core 与 DSH 解耦：读文件 / 写文件 / bundle 解析 / YAML 解析全部由宿主注入。
 */
import { RESCUE_KEEP_BUNDLE_PREFIXES, computeSafeBundles } from './boot-rescue.js';
import { BOOT_CRITICAL_RELS, profileCriticalRels } from './boot-paths.js';
import { zhMsg } from './messages.js';
import { engineMsg } from './messages-core.js';
/** 可解析性检查的目标（.json → JSON.parse；.yaml/.yml → 注入的 parseYaml）。 */
function parseKind(rel) {
    if (rel.endsWith('.json'))
        return 'json';
    if (rel.endsWith('.yaml') || rel.endsWith('.yml'))
        return 'yaml';
    return 'none';
}
/** 从 pnpm-workspace.yaml 解析出的 patchedDependencies 值（patch 文件相对路径）。 */
function patchedDependencyRefs(parsed) {
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
        return [];
    const raw = parsed['patchedDependencies'];
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
        return [];
    const out = [];
    for (const value of Object.values(raw)) {
        if (typeof value === 'string' && value !== '')
            out.push(value);
    }
    return out;
}
/** 解析 profile package.json 的 dsh.profile.bundles；非普通对象返回 undefined。 */
function readBundles(pkg) {
    if (pkg === null || typeof pkg !== 'object' || Array.isArray(pkg))
        return undefined;
    const dsh = pkg['dsh'];
    if (dsh === null || typeof dsh !== 'object' || Array.isArray(dsh))
        return undefined;
    const profile = dsh['profile'];
    if (profile === null || typeof profile !== 'object' || Array.isArray(profile))
        return undefined;
    return profile['bundles'];
}
/** 写回 dsh.profile.bundles（仅当 dsh / dsh.profile 均为普通对象）；返回是否写入。 */
function writeBundles(pkg, bundles) {
    const dsh = pkg['dsh'];
    if (dsh === null || typeof dsh !== 'object' || Array.isArray(dsh))
        return false;
    const profile = dsh['profile'];
    if (profile === null || typeof profile !== 'object' || Array.isArray(profile))
        return false;
    profile['bundles'] = bundles;
    return true;
}
function errorText(err) {
    return err instanceof Error ? err.message : String(err);
}
/**
 * 写回后的读回校验：profile package.json 的 bundles 已不含待剔除条目（且全为字符串）→ true。
 * 为什么需要它：「writeText 没抛错」只证明字节发出去了，不证明盘面变成了我们要的形状
 * （审计 P3-2：drop 集合用 describeEntry 生成的展示名，filter 与真实条目永不相等，写回后
 * 非字符串条目仍在，却仍报 fixed:true/repaired）。读不到 / 解析失败 / 结构异常一律 false ——
 * 修没修成只看盘面，宁可报 unfixed 让用户手动处理，也不假装启动风险已消除。
 */
async function bundlesPrunedOnDisk(readText, rel, drop) {
    let text;
    try {
        text = await readText(rel);
    }
    catch {
        return false;
    }
    if (text === null)
        return false;
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        return false;
    }
    const bundles = readBundles(parsed);
    if (!Array.isArray(bundles))
        return false;
    return bundles.every((b) => typeof b === 'string' && !drop.has(b));
}
/**
 * 执行启动自洽审计。**绝不抛错**：任何单项失败转成 issue / unchecked。
 */
export async function auditBootSafety(deps) {
    const msg = deps.msg ?? zhMsg;
    const issues = [];
    const unchecked = [];
    let prunedBundles = [];
    const profileRels = profileCriticalRels(deps.profile);
    const allRels = [...BOOT_CRITICAL_RELS, ...profileRels];
    // ---------- ① 插件清单：解析不到的 bundle 必须剔除（唯一自动修正项） ----------
    const pkgRel = `profiles/${deps.profile}/package.json`;
    let pkgText = null;
    try {
        pkgText = await deps.readText(pkgRel);
    }
    catch (err) {
        issues.push({ id: 'bundleListUnreadable', severity: 'warn', detail: msg('bootSafety.bundleListUnreadable', { rel: pkgRel, reason: errorText(err) }), fixed: false });
    }
    if (pkgText !== null) {
        let pkg = null;
        try {
            const parsed = JSON.parse(pkgText);
            if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed))
                pkg = parsed;
        }
        catch (err) {
            issues.push({ id: 'criticalFileUnparsable', severity: 'error', detail: msg('bootSafety.criticalFileUnparsable', { rel: pkgRel, reason: errorText(err) }), fixed: false });
        }
        if (pkg !== null) {
            const bundles = readBundles(pkg);
            const safe = await computeSafeBundles(bundles, deps.resolveBundle);
            // 防御性收窄（与救援模式同一不变量）：`@deepseek-ai/*` 是 DSH 自身核心 bundle，
            // **绝不**因为「本机解析探测失败」就把它从清单里剪掉 —— 那等于我们亲手让 DSH 起不来。
            // 探测本身也可能只是「没从正确的根解析」，故核心项一律只告警、不修、不升级为 unsafe。
            // 核心项**静默保留**：`@deepseek-ai/*` 由 DSH 从它自己的安装位置解析，本机探测不到属预期
            // （profile 的 node_modules 里通常就没有它们）。既不能剪，也不该每次保留都刷一条告警。
            const isCore = (name) => RESCUE_KEEP_BUNDLE_PREFIXES.some((prefix) => name.startsWith(prefix));
            const prunable = safe.pruned.filter((p) => !isCore(p.name));
            prunedBundles = prunable;
            if (safe.inputWasArray && prunable.length > 0) {
                const names = prunable.map((p) => p.name).join(', ');
                let written = false;
                let failReason = '';
                try {
                    // 只剔除「不可解析且非核心」的条目：其余条目（含解析不出的核心项）原样保留
                    const drop = new Set(prunable.map((p) => p.name));
                    const rawBundles = Array.isArray(bundles) ? bundles : [];
                    // 非字符串条目一律剔除，且必须按**真实类型**判定：pruned 里它的 name 是
                    // describeEntry(entry) 生成的展示名（42 → '42'），拿展示名去比数组里的真实条目
                    // 永不命中，写回后条目仍在（审计 P3-2）。非字符串不可能是合法 bundle 名。
                    const next = rawBundles.filter((b) => typeof b === 'string' && !drop.has(b));
                    if (!writeBundles(pkg, next))
                        throw new Error(engineMsg('core.bootSafety.bundlesNotArray'));
                    await deps.writeText(pkgRel, JSON.stringify(pkg, null, 2) + '\n');
                    written = await bundlesPrunedOnDisk(deps.readText, pkgRel, drop);
                    if (!written)
                        failReason = 'bundles-still-present';
                }
                catch (err) {
                    failReason = errorText(err);
                }
                if (written) {
                    issues.push({ id: 'bundlesUnresolved', severity: 'error', detail: msg('bootSafety.bundlesPruned', { count: String(prunable.length), names }), fixed: true });
                }
                else {
                    issues.push({ id: 'bundlesUnresolvedUnfixed', severity: 'error', detail: msg('bootSafety.bundlesPrunedFailed', { count: String(prunable.length), names, reason: failReason }), fixed: false });
                }
            }
        }
    }
    // ---------- ② 启动关键文件：存在性 + 可解析性（只上报，不自动改写） ----------
    for (const rel of allRels) {
        let text;
        try {
            text = await deps.readText(rel);
        }
        catch (err) {
            issues.push({ id: 'criticalFileUnreadable', severity: 'warn', detail: msg('bootSafety.criticalFileUnreadable', { rel, reason: errorText(err) }), fixed: false });
            continue;
        }
        if (text === null)
            continue; // 不存在不是问题（多数机器没有 settings.json / .env）
        const kind = parseKind(rel);
        if (kind === 'json') {
            try {
                JSON.parse(text);
            }
            catch (err) {
                issues.push({ id: 'criticalFileUnparsable', severity: 'error', detail: msg('bootSafety.criticalFileUnparsable', { rel, reason: errorText(err) }), fixed: false });
            }
            continue;
        }
        if (kind === 'yaml') {
            if (deps.parseYaml === undefined) {
                if (!unchecked.includes('yaml'))
                    unchecked.push('yaml');
                continue;
            }
            try {
                const parsed = deps.parseYaml(text);
                // patchedDependencies 指向的 patch 文件必须真实存在（issue #35：缺失会让 pnpm 拒绝一切 add）
                if (rel.endsWith('pnpm-workspace.yaml')) {
                    for (const ref of patchedDependencyRefs(parsed)) {
                        const patchRel = ref.startsWith('/') ? ref.slice(1) : ref;
                        let present = null;
                        try {
                            present = await deps.readText(patchRel);
                        }
                        catch {
                            present = null;
                        }
                        if (present === null) {
                            issues.push({ id: 'patchFileMissing', severity: 'error', detail: msg('bootSafety.patchFileMissing', { ref }), fixed: false });
                        }
                    }
                }
            }
            catch (err) {
                issues.push({ id: 'criticalFileUnparsable', severity: 'error', detail: msg('bootSafety.criticalFileUnparsable', { rel, reason: errorText(err) }), fixed: false });
            }
        }
    }
    // ---------- ③ 宿主附加检查（会话位置 / 工作区登记等） ----------
    if (deps.extraChecks === undefined) {
        unchecked.push('extra');
    }
    else {
        try {
            issues.push(...await deps.extraChecks());
        }
        catch (err) {
            unchecked.push('extra');
            issues.push({ id: 'extraCheckFailed', severity: 'warn', detail: msg('bootSafety.extraCheckFailed', { reason: errorText(err) }), fixed: false });
        }
    }
    const hasUnfixedError = issues.some((i) => i.severity === 'error' && !i.fixed);
    const hasFixed = issues.some((i) => i.fixed);
    return {
        verdict: hasUnfixedError ? 'unsafe' : hasFixed ? 'repaired' : 'safe',
        issues,
        prunedBundles,
        unchecked,
    };
}
//# sourceMappingURL=boot-safety.js.map