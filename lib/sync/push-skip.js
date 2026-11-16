/**
 * 本轮要扣下（held）的分区集合 = 调用方点名的分区 ∪ 磁盘上**仍在等裁决**的分区（`force` 时不扣：强推就是明确覆盖远端）。
 * 触发条件是「调用方传了 `skipSections`」而不是「传了非空数组」：自动同步本轮没判出新冲突时也必须
 * 传空数组 —— 磁盘上上一轮留下的待裁决照样要扣下（否则任何一轮别的分区有改动就把它推上去，#146 复发）。
 * 不传（`undefined`）= 手动推送：照旧不受历史待裁决影响。
 * 读不到状态 ⇒ 只扣点名的分区（不猜），但绝不因此放行点名要扣的那些。
 */
export async function resolveHeldSections(opts, load) {
    if (opts.force === true || opts.skipSections === undefined)
        return new Set();
    const held = new Set(opts.skipSections);
    if (load !== undefined) {
        try {
            for (const id of (await load()).pendingMerge?.sections ?? [])
                held.add(id);
        }
        catch {
            // 读不到就只扣点名分区
        }
    }
    return held;
}
/**
 * 计算本轮推送目标并扣掉 `held` 里的分区（**唯一过滤点**）。
 * 未指定 sections = portable 全量 + 本次放行的可选分区；未知 id 交给 `onSkipNonPortable` 告警。
 */
export function resolvePushTargets(portable, optIn, sections, held, onSkipNonPortable) {
    const all = [];
    if (sections === undefined || sections.length === 0) {
        all.push(...portable, ...optIn);
    }
    else {
        const byId = new Map(portable.map((a) => [a.id, a]));
        for (const a of optIn)
            byId.set(a.id, a);
        for (const id of sections) {
            const adapter = byId.get(id);
            if (adapter === undefined)
                onSkipNonPortable(id);
            else
                all.push(adapter);
        }
    }
    if (held === undefined || held.size === 0)
        return { targets: all, held: [] };
    return {
        targets: all.filter((a) => !held.has(a.id)),
        held: all.filter((a) => held.has(a.id)).map((a) => a.id),
    };
}
/**
 * 推送成功后的待裁决：只剔除**真正推上去**的分区（其余 sections 与 since 原样保留）。
 * 按 `pushed` 剔除而不是按「被扣下的分区」剔除：本轮不在候选里的分区（如未放行的可选分区）
 * 根本没推上去，它的待裁决必须留下，否则等于静默丢记录。
 * 一条都不剩 → `null`（这次推送已把本机版本推成远端最新，待裁决随之消解）；
 * 读不到状态 → `undefined`（recordBaseline 只在 `null` 时删字段 ⇒ 读失败保留原记录）。
 */
export async function pendingMergeAfterPush(load, pushed) {
    try {
        const prev = (await load()).pendingMerge;
        if (prev === undefined)
            return null;
        const kept = prev.sections.filter((s) => !pushed.includes(s));
        return kept.length === 0 ? null : { ...prev, sections: kept };
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=push-skip.js.map