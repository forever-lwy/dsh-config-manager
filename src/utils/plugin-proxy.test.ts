import test from 'node:test'
import assert from 'node:assert/strict'
import { pluginProxyEnv } from './plugin-proxy.ts'

test('Windows installs inherit an enabled system HTTP proxy without changing the parent environment', () => {
  const env = { NO_PROXY: 'localhost', PATH: 'bin' }
  const result = pluginProxyEnv(env, 'win32', () => ' ProxyEnable REG_DWORD 0x1\n ProxyServer REG_SZ 127.0.0.1:7890\n')
  assert.equal(result.HTTPS_PROXY, 'http://127.0.0.1:7890/')
  assert.equal(result.http_proxy, result.HTTP_PROXY)
  assert.equal(result.npm_config_https_proxy, result.HTTPS_PROXY)
  assert.equal(result.NO_PROXY, 'localhost')
  assert.deepEqual(env, { NO_PROXY: 'localhost', PATH: 'bin' })
})

test('explicit proxy, disabled system proxy and opt-out take precedence', () => {
  let calls = 0
  const read = (): string => { calls++; return 'ProxyEnable REG_DWORD 0x0\nProxyServer REG_SZ localhost:7890' }
  assert.equal(pluginProxyEnv({ HTTPS_PROXY: 'http://proxy:8080' }, 'win32', read).https_proxy, 'http://proxy:8080/')
  assert.equal(calls, 0)
  assert.equal(pluginProxyEnv({}, 'win32', read).HTTPS_PROXY, undefined)
  assert.deepEqual(pluginProxyEnv({ DSH_CONFIG_MANAGER_PROXY: 'off' }, 'win32', read), { DSH_CONFIG_MANAGER_PROXY: 'off' })
  assert.equal(calls, 1)
  assert.deepEqual(pluginProxyEnv({}, 'linux', read), {})
})

test('per-protocol Windows proxies are parsed and unavailable registry reads fall back safely', () => {
  const result = pluginProxyEnv({}, 'win32', () => 'ProxyEnable REG_DWORD 0x1\nProxyServer REG_SZ http=localhost:1;https=localhost:2;socks=localhost:3')
  assert.equal(result.HTTP_PROXY, 'http://localhost:1/')
  assert.equal(result.HTTPS_PROXY, 'http://localhost:2/')
  assert.deepEqual(pluginProxyEnv({}, 'win32', () => { throw Error('unavailable') }), {})
})
