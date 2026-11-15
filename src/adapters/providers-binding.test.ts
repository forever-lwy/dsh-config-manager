import test from 'node:test'
import assert from 'node:assert/strict'
import { ProvidersAdapter } from './providers.ts'
import { makeContext, makeImportContext } from './test-helpers.ts'
import type { ProviderExportSection } from './providers.ts'

for (const supplied of ['absent', 'decrypted', 'configured', 'differentEndpoint'] as const) {
  test(`provider import with ${supplied} secret preserves usable bindings appropriately`, async () => {
    const target = makeContext('win32', '/tmp/provider-fixture')
    target.settings.ns.set('llm-pi-ai', { revision: 1, secrets: [], value: { providers: { gateway: {
      baseURL: 'https://gateway.example/v1', apiKeyEnv: 'AXON_HUB_API_KEY', models: ['local'],
    } } } })
    await target.credentials.set('AXON_HUB_API_KEY', 'local-test-credential')
    if (supplied === 'configured') await target.credentials.set('OPENAI_API_KEY', 'other-test-credential')
    const data: ProviderExportSection = { version: 1, providers: { gateway: {
      route: 'gateway', namespace: 'llm-pi-ai', revision: 2, raw: { providers: { gateway: {
        baseURL: supplied === 'differentEndpoint' ? 'https://other.example/v1' : 'https://gateway.example/v1/',
        apiKeyEnv: 'OPENAI_API_KEY', models: ['imported'],
      } } },
    } } }
    const ctx = makeImportContext(target, new Map([['providers', data]]), {
      ...(supplied === 'decrypted' ? { decryptedCredentials: new Map([['OPENAI_API_KEY', 'imported-test-credential']]) } : {}),
    })
    const adapter = new ProvidersAdapter()
    const items = await adapter.analyzeImport(data, ctx)
    const result = await adapter.applyItem({ ...items[0]!, kind: 'Update' }, ctx)
    const saved = target.settings.ns.get('llm-pi-ai')?.value as { providers: { gateway: { apiKeyEnv: string; models: string[] } } }
    assert.equal(saved.providers.gateway.apiKeyEnv, supplied === 'absent' ? 'AXON_HUB_API_KEY' : 'OPENAI_API_KEY')
    assert.deepEqual(saved.providers.gateway.models, ['imported'])
    assert.equal(result.warning === true, supplied === 'absent')
    assert.ok(!JSON.stringify(result).includes('local-test-credential'))
  })
}
