import { isBundlesOnlyEntry } from '../core/plugin-cli.js';
function byName(list) {
    const map = new Map();
    for (const p of list ?? []) {
        if (p !== null && typeof p === 'object' && typeof p.name === 'string' && p.name !== '')
            map.set(p.name, p);
    }
    return map;
}
/** 判定「该不该删」。调用方只在 `applied` 含 plugins 时才真正执行。 */
export function planPluginRemovals(input) {
    const plan = { removals: [], conflicts: [], kept: [] };
    if (input.ancestor === undefined)
        return plan; // 没有祖先：无删除语义（无法区分「对方删了」与「本机独有」）
    const remote = byName(input.remote);
    const local = byName(input.local);
    for (const a of input.ancestor) {
        const name = a.name;
        if (typeof name !== 'string' || name === '')
            continue;
        if (remote.has(name)) {
            plan.kept.push({ name, reason: 'still-in-remote' });
            continue;
        }
        if (input.selfName !== undefined && name === input.selfName) {
            plan.kept.push({ name, reason: 'self' });
            continue;
        }
        const l = local.get(name);
        if (isBundlesOnlyEntry(a) || (l !== undefined && isBundlesOnlyEntry(l))) {
            plan.kept.push({ name, reason: 'bundles-only' });
            continue;
        }
        if (l === undefined) {
            plan.kept.push({ name, reason: 'not-installed' });
            continue;
        }
        if (!input.enabled) {
            plan.kept.push({ name, reason: 'switch-off' });
            continue;
        }
        if (l.version !== a.version) {
            plan.conflicts.push({ name, reason: 'version-changed', ancestorVersion: a.version, localVersion: l.version });
            continue;
        }
        plan.removals.push({ name, version: a.version, ...(a.spec === undefined ? {} : { spec: a.spec }) });
    }
    return plan;
}
/* --------------------------------------------------------------- 分区级三方合并 */
/** 形状闸门：不认识就交回通用路径（畸形数据由通用路径拒绝，这里不另造一套判定）。 */
function asPlugins(data) {
    if (data === null || typeof data !== 'object')
        return undefined;
    const obj = data;
    if (obj.version !== 1 || !Array.isArray(obj.plugins))
        return undefined;
    return data;
}
/** 决定「同一个插件是否还是同一个东西」的身份字段（version + 来源 spec + bundlesOnly 形态）。 */
function entryKey(e) {
    return [e.version ?? '', e.spec ?? '', e.bundlesOnly === true ? '1' : '0'].join('\u0000');
}
/** 插件列表以外的字段（patch 行 / pnpm-workspace 原文 / 本地 tarball / patch 文件）必须两侧相等才介入。 */
function sameShell(l, r) {
    const pick = (s) => JSON.stringify({
        patch: s.patch ?? [],
        pnpmWorkspace: s.pnpmWorkspace ?? null,
        localTarballs: s.localTarballs ?? [],
        patchFiles: s.patchFiles ?? [],
    });
    return pick(l) === pick(r);
}
/**
 * plugins 分区的按名三方合并（`merge.ts` 的 `GRANULAR_MERGES.plugins`）。
 *
 * 逐名规则与 git 同口径，祖先只用于判断「谁动了它」，绝不猜：
 *  - 两侧都有：身份相同 → 保留；某一侧与祖先相同 → 取另一侧；两侧都变（或没有祖先）→ both-modified 冲突；
 *  - 只有本机：有祖先且与祖先相同 → 跟随远端删除（真删除）；无祖先 → 本机独有，保留；有祖先且不同 →
 *    modify-delete 冲突（用户在 A 机卸载、B 机却升级过它，不能替用户选）；
 *  - 只有远端：有祖先且与祖先相同 → 本机删除，跟随（不复活）；无祖先 → 远端独有，采纳；有祖先且不同 →
 *    delete-modify 冲突；
 *  - 两侧都没有：消失。
 *
 * 插件列表以外的字段不一致时返回 `undefined`：patch 行/pnpm-workspace 有各自的既有口径，
 * 在这里再造一套合并只会和通用路径打架（通用路径会整分区处理，其中包含 plugins 数组的旧行为）。
 */
export function mergePluginsSection(local, remote, ancestor, hooks = {}) {
    // 开关关着 → 钩子不参与（交回通用合并 = 与 #132 之前逐字一致）。若照常「跟随远端删除」，
    // 合并结果会丢掉本机条目：插件包还在盘上，下一轮导出会把它当「本机独有」推回远端 = 复活。
    if (hooks.deletePlugins !== true)
        return undefined;
    const l = asPlugins(local);
    const r = asPlugins(remote);
    if (l === undefined || r === undefined)
        return undefined;
    const a = ancestor === undefined ? undefined : asPlugins(ancestor);
    if (ancestor !== undefined && a === undefined)
        return undefined;
    if (!sameShell(l, r))
        return undefined;
    const aMap = byName(a?.plugins);
    const rMap = byName(r.plugins);
    const merged = [];
    const conflicts = [];
    let mergePoints = 0;
    const conflict = (path, reason, lp, rp, ap) => {
        conflicts.push({ path, kind: 'key', reason, autoMergeAttempted: false, local: lp, remote: rp, ancestor: ap });
    };
    for (const lp of l.plugins) {
        const name = lp.name;
        const rp = rMap.get(name);
        const ap = aMap.get(name);
        if (rp !== undefined) {
            if (entryKey(lp) === entryKey(rp)) {
                merged.push(lp);
                continue;
            }
            const lChanged = ap === undefined || entryKey(lp) !== entryKey(ap);
            const rChanged = ap === undefined || entryKey(rp) !== entryKey(ap);
            if (lChanged && rChanged) {
                conflict(`plugins.${name}`, 'both-modified', lp, rp, ap);
                continue;
            }
            if (lChanged) {
                merged.push(lp);
                mergePoints += 1;
                continue;
            }
            merged.push(rp);
            mergePoints += 1;
            continue;
        }
        // 只有本机有
        if (ap === undefined) {
            merged.push(lp);
            mergePoints += 1;
            continue;
        } // 本机独有
        if (entryKey(lp) === entryKey(ap)) {
            mergePoints += 1;
            continue;
        } // 本机未改、远端删 → 跟随删除
        conflict(`plugins.${name}`, 'modify-delete', lp, undefined, ap);
    }
    // 只有远端有的
    for (const rp of r.plugins) {
        const name = rp.name;
        if (l.plugins.some((p) => p.name === name))
            continue;
        const ap = aMap.get(name);
        if (ap === undefined) {
            merged.push(rp);
            mergePoints += 1;
            continue;
        } // 远端独有
        if (entryKey(rp) === entryKey(ap)) {
            mergePoints += 1;
            continue;
        } // 远端未改、本机删 → 跟随删除
        conflict(`plugins.${name}`, 'delete-modify', undefined, rp, ap);
    }
    if (conflicts.length > 0)
        return { merged: l, conflicts, mergePoints };
    return { merged: { ...l, plugins: merged }, conflicts: [], mergePoints };
}
//# sourceMappingURL=plugin-removals.js.map