function indexByKey(list, keyOf) {
    const index = new Map();
    let malformed = false;
    for (const item of list ?? []) {
        if (item === null || typeof item !== 'object') {
            malformed = true;
            continue;
        }
        const key = keyOf(item);
        if (key === '') {
            malformed = true;
            continue;
        }
        if (index.has(key)) {
            malformed = true;
            continue;
        }
        index.set(key, item);
    }
    return { index, malformed };
}
export function mergeKeyedList(args) {
    const { spec } = args;
    const localIdx = indexByKey(args.local, spec.keyOf);
    const remoteIdx = indexByKey(args.remote, spec.keyOf);
    const ancestorIdx = indexByKey(args.ancestor, spec.keyOf);
    if (localIdx.malformed || remoteIdx.malformed || ancestorIdx.malformed) {
        return { merged: [], conflicts: [], mergePoints: 0, malformed: true };
    }
    const { index: localIndex } = localIdx;
    const { index: remoteIndex } = remoteIdx;
    const { index: ancestorIndex } = ancestorIdx;
    const order = [...localIndex.keys()];
    for (const key of remoteIndex.keys())
        if (!localIndex.has(key))
            order.push(key);
    const merged = [];
    const conflicts = [];
    let mergePoints = 0;
    for (const key of order) {
        const l = localIndex.get(key);
        const r = remoteIndex.get(key);
        const a = ancestorIndex.get(key);
        const peers = [l, r, a].filter((item) => item !== undefined);
        // 同一键的并集/路径解析只做一次；同一条目在一轮合并里被问到多次也只算一次。
        const context = spec.identityContextOf?.(peers);
        const identities = new Map();
        const identity = (item) => {
            if (item === undefined)
                return '';
            const cached = identities.get(item);
            if (cached !== undefined || identities.has(item))
                return cached ?? '';
            const value = spec.identityOf(item, peers, context);
            identities.set(item, value);
            return value;
        };
        const conflict = (reason) => {
            conflicts.push({ path: spec.pathOf(key), kind: 'key', reason, autoMergeAttempted: false, local: l ?? null, remote: r ?? null, ancestor: a ?? null });
        };
        if (l !== undefined && spec.keepLocal?.(l) === true) {
            merged.push(l);
            // 只有真的采纳了远端内容才算一个合并点（远端根本没这条时不算，复审 P2-3）
            if (r !== undefined && identity(l) !== identity(r))
                mergePoints += 1;
            continue;
        }
        if (l !== undefined && r !== undefined) {
            const [li, ri] = [identity(l), identity(r)];
            if (li === ri) {
                merged.push(l);
                continue;
            }
            if (a === undefined) {
                conflict('both-modified');
                continue;
            }
            const ai = identity(a);
            if (li === ai) {
                merged.push(spec.compose?.(l, r) ?? r);
                mergePoints += 1;
                continue;
            }
            if (ri === ai) {
                merged.push(l);
                mergePoints += 1;
                continue;
            }
            conflict('both-modified');
            continue;
        }
        if (l !== undefined) {
            if (a === undefined) {
                merged.push(l);
                mergePoints += 1;
                continue;
            } // 本机独有
            if (identity(l) !== identity(a)) {
                conflict('modify-delete');
                continue;
            } // 本机改过 → 交人工
            if (spec.followDelete) {
                mergePoints += 1;
                continue;
            } // 跟随远端删除
            merged.push(l);
            continue;
        }
        if (r !== undefined) {
            if (a === undefined) {
                merged.push(r);
                mergePoints += 1;
                continue;
            } // 远端独有
            if (identity(r) !== identity(a)) {
                conflict('delete-modify');
                continue;
            } // 本机删了、远端改过 → 交人工
            mergePoints += 1; // 远端未改，本机删过它 → 跟随本机删除
        }
    }
    return { merged, conflicts, mergePoints, malformed: false };
}
//# sourceMappingURL=merge-keyed.js.map