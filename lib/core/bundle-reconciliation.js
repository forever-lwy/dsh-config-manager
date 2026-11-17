import { isDeepStrictEqual } from 'node:util';
/** Only a bundle made exclusively of identical root inserts can safely be subsumed. */
function inserts(layer) {
    const rows = new Map();
    for (const patch of layer.patches) {
        if (patch === null || typeof patch !== 'object' || Array.isArray(patch))
            return null;
        const value = patch;
        if (Object.keys(value).some((key) => key !== 'insert') || !Array.isArray(value['insert']))
            return null;
        for (const raw of value['insert']) {
            if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
                return null;
            const id = raw['id'];
            if (typeof id !== 'string' || id === '' || rows.has(id))
                return null;
            rows.set(id, raw);
        }
    }
    return rows.size > 0 ? rows : null;
}
export function reconcileBundleLayers(layers) {
    const indexed = layers.map((layer) => ({ layer, rows: inserts(layer) }));
    const removed = [];
    for (const [i, candidate] of indexed.entries()) {
        if (candidate.rows === null)
            continue;
        for (const [j, covering] of indexed.entries()) {
            if (i === j || covering.rows === null || covering.layer.name === candidate.layer.name)
                continue;
            if (covering.rows.size < candidate.rows.size || (covering.rows.size === candidate.rows.size && j > i))
                continue;
            if ([...candidate.rows].every(([id, raw]) => isDeepStrictEqual(raw, covering.rows.get(id)))) {
                removed.push({ name: candidate.layer.name, coveredBy: covering.layer.name });
                break;
            }
        }
    }
    return { removed };
}
//# sourceMappingURL=bundle-reconciliation.js.map