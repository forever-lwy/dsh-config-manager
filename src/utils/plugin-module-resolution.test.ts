import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createPluginModuleResolver } from './plugin-module-resolution.ts';

test('exported module subpaths resolve without a package.json export or code execution', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'dcm-modules-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const pkg = join(dir, 'node_modules/dsh-modes');
  await mkdir(pkg, { recursive: true });
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'dsh-modes', type: 'module', exports: { './container': './container.js' } }));
  await writeFile(join(pkg, 'container.js'), 'throw new Error("must never execute plugin code")');
  const anchor = join(dir, 'package.json');
  const available = createPluginModuleResolver([anchor]);
  assert.equal(available('dsh-modes/container'), true);
  assert.equal(available('dsh-modes'), false);
  assert.equal(available('dsh-modes/private'), false);
  assert.equal(available('dsh-modes/package.json'), false);
  const host = createPluginModuleResolver([anchor], (specifier, parent) => {
    assert.equal(parent, pathToFileURL(anchor).href);
    if (specifier === 'dsh-modes/container') return join(pkg, 'container.js');
    throw new Error('export unavailable');
  });
  assert.equal(host('dsh-modes/container'), true);
  assert.equal(host('dsh-modes/private'), false);
  const fallback = createPluginModuleResolver([anchor], () => { throw new Error('Plugin metadata requires the Node module resolver'); });
  assert.equal(fallback('dsh-modes/container'), true);
  // A live host resolver is authoritative even if Node's require resolver would find it.
  assert.equal(createPluginModuleResolver([anchor], () => { throw new Error('not allowed by exports'); })('dsh-modes/container'), false);
});
