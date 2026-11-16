import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { composeEntries, loadProfileDirectory } from '@deepseek-ai/dsh-app-boot';
import { DshFileSystemFacade } from '../index.ts';
import { DshPatchFileFacade } from './dsh-patch-file.ts';
import { createPluginModuleResolver } from './plugin-module-resolution.ts';
import { dumpPatchDocument, loadPatchDocument } from './patch-yaml.ts';
import { PluginsAdapter } from '../adapters/plugins.ts';
import { makeContext, makeImportContext, MemSnapshotStore } from '../adapters/test-helpers.ts';
import { Exporter } from '../core/exporter.ts';
import { Importer } from '../core/importer.ts';
import { rollback } from '../core/rollback.ts';
import { entryTreeRows } from '../core/entry-tree.ts';
import { PLUGIN_PROFILE_MANIFEST_REF } from '../core/backup.ts';
import type { PluginsSection } from '../schema/types.ts';

const standalone = '@deepseek-ai/dsh-experimental-tool-worktree';
const forge = '@deepseek-ai/dsh-experimental-forge-bundle';
const worktree = [
  { id: 'worktree', name: '@deepseek-ai/dsh-experimental-worktree' },
  { id: 'tool-worktree', name: standalone },
];
const affected = ['system-prompt', 'connection', 'typert-gateway', 'dsh-google-native', 'better-sidebar',
  'session-title-pattern', 'dsh-modes-custom', 'image-gen', 'dsh-claude-native', 'access-review',
  'cot-translation', 'mnemon', 'multisearch', 'spill-policy', 'genui', 'subagent-model-selection-settings'];
const moduleOf = (id: string) => id === 'dsh-modes-custom' ? 'dsh-modes/container'
  : id === 'subagent-model-selection-settings' ? '@deepseek-ai/dsh-tool-subagent/model-selection-settings' : `test-modules/${id}`;

async function fixture(t: test.TestContext, bundles = ['test-base', standalone, forge]) {
  const home = await mkdtemp(join(tmpdir(), 'dcm-integrity-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const profile = join(home, 'profiles/desktop');
  await mkdir(profile, { recursive: true });
  const manifestPath = join(profile, 'package.json');
  await writeFile(manifestPath, JSON.stringify({ name: 'test-profile', dependencies: { unrelated: '1.0.0' }, dsh: { profile: { bundles } } }));
  async function pkg(name: string, exports: Record<string, string>, patches?: unknown[]) {
    const dir = join(profile, 'node_modules', name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', type: 'module', exports,
      ...(patches === undefined ? {} : { dsh: { bundle: { patch: './cordis.patch.yml' } } }),
    }));
    await writeFile(join(dir, 'module.js'), 'throw new Error("resolution must not execute plugin code")');
    if (patches !== undefined) await writeFile(join(dir, 'cordis.patch.yml'), dumpPatchDocument(patches));
  }
  const ordinary = affected.filter((id) => id !== 'mnemon').map((id) => ({ id, name: moduleOf(id), config: {} }));
  await pkg('test-base', {}, [{ insert: [...ordinary, { id: 'mnemon-bundle', group: true,
    config: [{ id: 'mnemon', name: moduleOf('mnemon'), config: { embedding: { enabled: false } } }],
  }] }]);
  await pkg(standalone, { '.': './module.js' }, [{ insert: worktree }]);
  // Exact insert rows from the published 0.2.2-rc.3 forge bundle.
  await pkg(forge, {}, [{ insert: [...worktree,
    { id: 'forge', name: '@deepseek-ai/dsh-experimental-forge' },
    { id: 'forge-github', name: '@deepseek-ai/dsh-experimental-forge-github' },
    { id: 'forge-session', name: '@deepseek-ai/dsh-experimental-forge-session' },
    { id: 'forge-panel', name: '@deepseek-ai/dsh-experimental-client-ui-forge' },
  ] }]);
  await pkg('test-modules', Object.fromEntries(affected.map((id) => [`./${id}`, './module.js'])));
  await pkg('dsh-modes', { './container': './module.js' });
  await pkg('@deepseek-ai/dsh-tool-subagent', { './model-selection-settings': './module.js' });
  const anchor = createRequire(import.meta.url).resolve('@deepseek-ai/dsh-app-boot/package.json');
  const patch = new DshPatchFileFacade(home, 'desktop', undefined, async () => {
    const loaded = loadProfileDirectory('integrity-test', profile, anchor, { userLayer: false });
    assert.deepEqual(loaded.skippedBundles, []);
    return {
      bundleLayers: loaded.layers.map((layer) => ({ name: layer.packageName, patches: layer.patches })),
      entries: composeEntries(loaded.layers.map((layer) => layer.patches)),
      compose: (layers, warn) => composeEntries(layers as Parameters<typeof composeEntries>[0], warn),
      available: createPluginModuleResolver([manifestPath, anchor]),
    };
  });
  const target = { ...makeContext('linux', home, 'desktop'), fs: new DshFileSystemFacade(home), patchFile: patch };
  const section: PluginsSection = { version: 1, plugins: [], patch: affected.map((id) => ({
    file: 'profiles/web/cordis.patch.yml', lineId: id, operation: 'insert',
    raw: { id, name: moduleOf(id), config: id === 'dsh-modes-custom' ? { presets: [{ id: 'standard-copy', title: 'Daily assistant' }] }
      : id === 'mnemon' ? { embedding: { enabled: true, model: 'embedding-model' } } : { synced: true } },
  })) };
  return { home, profile, manifestPath, patch, target, section, anchor };
}

test('reported duplicate bundles, exported subpaths and nested Mnemon restore all affected overrides with the rc.3 composer', async (t) => {
  const { profile, manifestPath, patch, target, section, anchor } = await fixture(t);
  const original = await readFile(manifestPath, 'utf8');
  const adapter = new PluginsAdapter();
  const ctx = makeImportContext(target, new Map([['plugins', section]]));
  const plan = await adapter.analyzeImport(section, ctx);
  assert.equal(await readFile(manifestPath, 'utf8'), original, 'preview is read-only');
  assert.equal(plan[0]?.id, 'plugins:bundle-reconcile');
  assert.equal(plan[0]?.target?.ref, PLUGIN_PROFILE_MANIFEST_REF, 'manifest participates in the pre-import snapshot');
  assert.equal(plan.filter((item) => item.id.startsWith('patch:') && item.kind === 'Update').length, affected.length);
  for (const item of plan) {
    if (item.kind !== 'Update' && item.kind !== 'Create') continue;
    const result = await adapter.applyItem(item, ctx);
    assert.equal(result.ok, true, `${item.id}: ${result.message ?? ''}`);
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.deepEqual(manifest.dsh.profile.bundles, ['test-base', forge]);
  assert.deepEqual(manifest.dependencies, { unrelated: '1.0.0' });
  const loaded = loadProfileDirectory('integrity-test', profile, anchor);
  const entries = entryTreeRows(composeEntries([...loaded.layers.map((layer) => layer.patches), loaded.patches]));
  const ids = entries.map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate startup entries');
  for (const id of affected) {
    const row = entries.find((entry) => entry.id === id);
    assert.ok(row, id);
    assert.deepEqual(row.config, (section.patch.find((entry) => entry.lineId === id)!.raw as { config: unknown }).config, id);
  }
  const local = loadPatchDocument(await readFile(join(profile, 'cordis.patch.yml'), 'utf8')) as unknown[];
  assert.equal(local.some((row) => row && typeof row === 'object' && 'insert' in row), false, 'bundle-owned nested ids remain overrides');
  assert.deepEqual((await patch.readPatchChain()).failures, [], 'host-resolved bundles are not falsely reported as missing');
  assert.equal((await adapter.analyzeImport(section, ctx)).filter((item) => item.kind !== 'Skip').length, 0, 'retry is idempotent');
});

test('declaring overlapping host bundles during import reconciles them before patch writes', async (t) => {
  const { target, section, manifestPath } = await fixture(t, ['test-base']);
  section.plugins = [standalone, forge].map((name) => ({ name, version: '', enabled: true, isBundle: true, inBundles: [name], bundlesOnly: true }));
  const adapter = new PluginsAdapter();
  const ctx = makeImportContext(target, new Map([['plugins', section]]));
  for (const item of await adapter.analyzeImport(section, ctx)) {
    if (item.kind === 'Create' || item.kind === 'Update') {
      const result = await adapter.applyItem(item, ctx);
      assert.equal(result.ok, true, `${item.id}: ${result.message ?? ''}`);
    }
  }
  assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')).dsh.profile.bundles, ['test-base', forge]);
});

test('existing unrelated duplicate rows do not block earlier MCP/prompt writes; new or touched defects remain zero-write rejections', async (t) => {
  const { profile, patch, manifestPath } = await fixture(t);
  const originalManifest = await readFile(manifestPath, 'utf8');
  const path = join(profile, 'cordis.patch.yml');
  const outcome = await patch.applyPatchChanges('profiles/desktop/cordis.patch.yml', [{
    lineId: 'system-prompt', action: 'update', raw: { id: 'system-prompt', config: { synced: true } },
  }]);
  assert.deepEqual(outcome.preexistingInvalid, ['worktree', 'tool-worktree']);
  assert.equal(await readFile(manifestPath, 'utf8'), originalManifest, 'an unrelated write cannot silently change bundle declarations');
  const before = await readFile(path, 'utf8');
  await assert.rejects(patch.applyPatchChanges('profiles/desktop/cordis.patch.yml', [{
    lineId: 'worktree', action: 'update', raw: { id: 'worktree', config: { enabled: true } },
  }]), /worktree/);
  assert.equal(await readFile(path, 'utf8'), before);
  await assert.rejects(patch.applyPatchChanges('profiles/desktop/cordis.patch.yml', [{
    lineId: 'new-group', action: 'insert', raw: { id: 'new-group', group: true,
      config: [{ id: 'system-prompt', name: moduleOf('system-prompt') }],
    },
  }]), /system-prompt/);
  assert.equal(await readFile(path, 'utf8'), before);
  await assert.rejects(patch.applyPatchChanges('profiles/desktop/cordis.patch.yml', [{
    lineId: 'invalid-group', action: 'insert', raw: { id: 'invalid-group', group: true,
      config: [{ name: moduleOf('system-prompt') }],
    },
  }]), /missing-id/);
  assert.equal(await readFile(path, 'utf8'), before);
});

test('real export/import keeps reconciliation in the plan and rollback restores the original profile manifest', async (t) => {
  const { home, target, section, manifestPath } = await fixture(t);
  const before = await readFile(manifestPath, 'utf8');
  const source = makeContext('linux', join(home, 'source'), 'web');
  for (const row of section.patch) source.patchFile.bucket(row.file).set(row.lineId, row);
  const zipPath = join(home, 'snapshot.zip');
  const adapters = [new PluginsAdapter()];
  await new Exporter({ ctx: source, adapters }).export({ includeSecrets: false, outPath: zipPath });
  const store = new MemSnapshotStore();
  const importer = new Importer({ ctx: target, adapters, snapshotStore: store });
  const plan = await importer.createImportPlan(zipPath, { strategy: 'merge', resolutions: {}, pathMappings: [] });
  assert.equal(plan.items.find((item) => item.id === 'plugins:bundle-reconcile')?.kind, 'Update');
  const result = await importer.executeImportPlan(zipPath, plan, { confirm: true });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ineffective ?? [], []);
  assert.equal(result.executed.find((item) => item.itemId === 'plugins:bundle-reconcile')?.status, 'ok');
  assert.deepEqual(JSON.parse(await readFile(manifestPath, 'utf8')).dsh.profile.bundles, ['test-base', forge]);
  const snapshot = await store.load(result.snapshotId!);
  assert.ok(snapshot.entries.some((entry) => entry.ref === PLUGIN_PROFILE_MANIFEST_REF && entry.existed));
  const restored = await rollback({ ctx: target, snapshot, store, adapters });
  assert.equal(restored.full, true, JSON.stringify(restored.failed));
  assert.equal(await readFile(manifestPath, 'utf8'), before, 'bundle cleanup is recoverable byte for byte');
});
