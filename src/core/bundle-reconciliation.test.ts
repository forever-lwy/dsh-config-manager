import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileBundleLayers } from './bundle-reconciliation.ts';

const rows = [
  { id: 'worktree', name: '@deepseek-ai/dsh-experimental-worktree' },
  { id: 'tool-worktree', name: '@deepseek-ai/dsh-experimental-tool-worktree' },
];
const standalone = { name: 'worktree-bundle', patches: [{ insert: rows }] };
const forge = { name: 'forge-bundle', patches: [{ insert: [...rows, { id: 'forge', name: 'forge' }] }] };

test('rc.3 worktree inserts covered by forge remove only the redundant declaration', () => {
  for (const layers of [[standalone, forge], [forge, standalone]]) {
    assert.deepEqual(reconcileBundleLayers(layers), { removed: [{ name: standalone.name, coveredBy: forge.name }] });
  }
  assert.equal(standalone.patches[0]?.insert.length, 2);
});

test('different config, extra rows, patch directives and duplicate ids prevent consolidation', () => {
  for (const patches of [
    [{ insert: [{ ...rows[0], config: { enabled: false } }, rows[1]] }],
    [{ insert: [...rows, { id: 'private', name: 'private' }] }],
    [{ insert: rows }, { id: 'forge', disabled: true }],
    [{ insert: rows, before: 'forge' }],
    [{ insert: [...rows, rows[0]] }],
  ]) assert.deepEqual(reconcileBundleLayers([{ name: 'custom', patches }, forge]).removed, []);
});

test('identical bundles keep the first declaration and empty bundles are preserved', () => {
  assert.deepEqual(reconcileBundleLayers([standalone, { ...standalone, name: 'copy' }, { name: 'empty', patches: [] }]), {
    removed: [{ name: 'copy', coveredBy: standalone.name }],
  });
});
