import { isDeepStrictEqual } from 'node:util';

export interface BundlePatchLayer {
  name: string;
  patches: readonly unknown[];
}

export interface BundleReconciliation {
  removed: { name: string; coveredBy: string }[];
}

/** Only a bundle made exclusively of identical root inserts can safely be subsumed. */
function inserts(layer: BundlePatchLayer): Map<string, unknown> | null {
  const rows = new Map<string, unknown>();
  for (const patch of layer.patches) {
    if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return null;
    const value = patch as Record<string, unknown>;
    if (Object.keys(value).some((key) => key !== 'insert') || !Array.isArray(value['insert'])) return null;
    for (const raw of value['insert']) {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const id = (raw as Record<string, unknown>)['id'];
      if (typeof id !== 'string' || id === '' || rows.has(id)) return null;
      rows.set(id, raw);
    }
  }
  return rows.size > 0 ? rows : null;
}

export function reconcileBundleLayers(layers: readonly BundlePatchLayer[]): BundleReconciliation {
  const indexed = layers.map((layer) => ({ layer, rows: inserts(layer) }));
  const removed: BundleReconciliation['removed'] = [];
  for (const [i, candidate] of indexed.entries()) {
    if (candidate.rows === null) continue;
    for (const [j, covering] of indexed.entries()) {
      if (i === j || covering.rows === null || covering.layer.name === candidate.layer.name) continue;
      if (covering.rows.size < candidate.rows.size || (covering.rows.size === candidate.rows.size && j > i)) continue;
      if ([...candidate.rows].every(([id, raw]) => isDeepStrictEqual(raw, covering.rows!.get(id)))) {
        removed.push({ name: candidate.layer.name, coveredBy: covering.layer.name });
        break;
      }
    }
  }
  return { removed };
}
