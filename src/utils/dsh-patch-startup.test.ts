import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { composeEntries, loadProfileDirectory, resolveBundleDir } from '@deepseek-ai/dsh-app-boot'
import { createRequire } from 'node:module'
import { DshPatchFileFacade } from './dsh-patch-file.ts'
import { loadPatchDocument } from './patch-yaml.ts'
import { PluginsAdapter } from '../adapters/plugins.ts'
import { makeContext, makeImportContext } from '../adapters/test-helpers.ts'
import type { PluginsSection } from '../schema/types.ts'

const base = [
  { id: 'system-prompt', name: '@deepseek-ai/dsh-system-prompt' },
  { id: 'connection', name: '@deepseek-ai/dsh-host-client-connection' },
  { id: 'image-gen', name: '@forever-lwy/dsh-image-gen' },
]

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const home = await mkdtemp(join(tmpdir(), 'dcm-startup-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  await mkdir(join(home, 'profiles/desktop'), { recursive: true })
  const patch = new DshPatchFileFacade(home, 'desktop', undefined, async () => ({
    entries: base,
    compose: (layers, warn) => composeEntries(layers as Parameters<typeof composeEntries>[0], warn),
    available: (name) => base.some((entry) => entry.name === name),
  }))
  return { home, patch, path: join(home, 'profiles/desktop/cordis.patch.yml') }
}

test('Web legacy snapshot overrides desktop bundle entries without duplicate inserts', async (t) => {
  const { home, patch, path } = await fixture(t)
  const target = { ...makeContext('win32', home, 'desktop'), patchFile: patch }
  const section: PluginsSection = { version: 1, plugins: [], patch: [
    { file: 'profiles/web/cordis.patch.yml', lineId: 'connection', raw: { id: 'connection', config: { cookieMaxAgeDays: 365 } } },
    { file: 'profiles/web/cordis.patch.yml', lineId: 'image-gen', raw: { id: 'image-gen', name: '@forever-lwy/dsh-image-gen', config: { enabled: true } } },
  ] }
  const adapter = new PluginsAdapter()
  const ctx = makeImportContext(target, new Map([['plugins', section]]))
  for (const item of await adapter.analyzeImport(section, ctx)) {
    if (item.kind === 'Create') assert.equal((await adapter.applyItem(item, ctx)).ok, true)
  }
  const doc = loadPatchDocument(await readFile(path, 'utf8')) as Parameters<typeof composeEntries>[0][number]
  const actual = composeEntries([[{ insert: base }], doc])
  assert.equal(actual.filter((entry) => entry.id === 'connection').length, 1)
  assert.equal(actual.find((entry) => entry.id === 'connection')?.name, base[1]!.name)
  assert.equal(actual.filter((entry) => entry.id === 'image-gen').length, 1)
  assert.equal((await patch.readPatchLines('profiles/desktop/cordis.patch.yml'))[0]?.operation, 'update')
  // Reapplying the same snapshot remains idempotent.
  assert.ok((await adapter.analyzeImport(section, ctx)).every((item) => item.kind === 'Skip'))
})

test('invalid startup candidate leaves original file byte-for-byte intact', async (t) => {
  const { patch, path } = await fixture(t)
  const original = '# original comment\n- id: connection\n  config: { cookieMaxAgeDays: 365 }\n'
  await writeFile(path, original)
  await assert.rejects(patch.applyPatchChanges('profiles/desktop/cordis.patch.yml', [
    { lineId: 'unknown', raw: { id: 'unknown', config: {} }, action: 'insert' },
  ]), /unknown/)
  assert.equal(await readFile(path, 'utf8'), original)
  await assert.rejects(patch.applyPatchChanges('profiles/desktop/cordis.patch.yml', [
    { lineId: 'missing', raw: { id: 'missing', name: 'missing-package' }, action: 'insert' },
  ]), /missing/)
  assert.equal(await readFile(path, 'utf8'), original)
})

test('failed plugin installation defers its activation row', async (t) => {
  const { home, patch, path } = await fixture(t)
  const target = { ...makeContext('win32', home, 'desktop'), patchFile: patch }
  target.plugins.install = async () => { throw Error('install timed out') }
  const section: PluginsSection = { version: 1, plugins: [{ name: '@forever-lwy/dsh-image-gen', version: '0.11.103', enabled: true, isBundle: true, inBundles: [] }], patch: [
    { file: 'profiles/web/cordis.patch.yml', lineId: 'image-gen', raw: base[2] },
  ] }
  const ctx = makeImportContext(target, new Map([['plugins', section]]))
  const adapter = new PluginsAdapter()
  const items = await adapter.analyzeImport(section, ctx)
  assert.equal((await adapter.applyItem(items.find((item) => item.kind === 'Install')!, ctx)).warning, true)
  const result = await adapter.applyItem(items.find((item) => item.id === 'patch:image-gen')!, ctx)
  assert.equal(result.warning, true)
  assert.equal(result.ok, false)
  await assert.rejects(readFile(path), { code: 'ENOENT' })
})

test('source syntax survives export and home override of profile insert is valid', async (t) => {
  const { home, patch } = await fixture(t)
  await writeFile(join(home, 'profiles/desktop/cordis.patch.yml'), '- insert:\n  - id: custom\n    name: "@deepseek-ai/dsh-system-prompt"\n')
  await patch.applyPatchChanges('cordis.patch.yml', [{ lineId: 'custom', raw: { id: 'custom', config: { text: 'updated' } }, action: 'update' }])
  const target = { ...makeContext('win32', home, 'desktop'), patchFile: patch }
  const exported = await new PluginsAdapter().export(target, { includeSecrets: false })
  assert.equal(exported.data.patch.find((entry) => entry.lineId === 'custom')?.operation, 'update')
})

test('installed rc.3 base and web bundles retain their original module names after import', async (t) => {
  const { home, path } = await fixture(t)
  const dir = join(home, 'profiles/desktop')
  await writeFile(join(dir, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } } }))
  const anchor = createRequire(import.meta.url).resolve('@deepseek-ai/dsh-app-boot/package.json')
  const loaded = loadProfileDirectory('test', dir, anchor, { userLayer: false })
  assert.equal(loaded.layers.length, 2, JSON.stringify(loaded.skippedBundles))
  const entries = composeEntries(loaded.layers.map((layer) => layer.patches))
  const patch = new DshPatchFileFacade(home, 'desktop', undefined, async () => ({
    entries,
    compose: (layers, warn) => composeEntries(layers as Parameters<typeof composeEntries>[0], warn),
    available: (name) => { try { resolveBundleDir('test', name, anchor, dir); return true } catch { return false } },
  }))
  const before = entries.find((entry) => entry.id === 'connection')
  assert.ok(before?.name)
  await patch.applyPatchChanges('profiles/desktop/cordis.patch.yml', [
    { lineId: 'connection', raw: { id: 'connection', config: { cookieMaxAgeDays: 365 } }, action: 'insert' },
  ])
  const rows = composeEntries([[{ insert: entries }], loadPatchDocument(await readFile(path, 'utf8')) as Parameters<typeof composeEntries>[0][number]])
  assert.equal(rows.filter((entry) => entry.id === 'connection').length, 1)
  assert.equal(rows.find((entry) => entry.id === 'connection')?.name, before.name)
})

test('config-only override for a failed bundle reports a warning without writing it', async (t) => {
  const { home, patch, path } = await fixture(t)
  const target = { ...makeContext('win32', home, 'desktop'), patchFile: patch }
  const section: PluginsSection = { version: 1, plugins: [], patch: [
    { file: 'profiles/web/cordis.patch.yml', lineId: 'missing-bundle-row', raw: { id: 'missing-bundle-row', config: { enabled: true } } },
  ] }
  const adapter = new PluginsAdapter()
  const ctx = makeImportContext(target, new Map([['plugins', section]]))
  const result = await adapter.applyItem((await adapter.analyzeImport(section, ctx))[0]!, ctx)
  assert.equal(result.ok, false)
  assert.equal(result.warning, true)
  await assert.rejects(readFile(path), { code: 'ENOENT' })
})
