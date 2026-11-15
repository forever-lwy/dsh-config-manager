/** Proxy environment for the official dsh/pnpm/Git install subprocesses. */
import { execFileSync } from 'node:child_process'
import { readProxyEnv } from './proxy.ts'

function readWindowsInternetSettings(): string {
  return execFileSync('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'], {
    encoding: 'utf8', windowsHide: true, timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'],
  })
}

export function pluginProxyEnv(
  env: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
  readSettings: () => string = readWindowsInternetSettings,
): NodeJS.ProcessEnv {
  const result = { ...env }
  if (/^(off|none|0|false|disable|disabled)$/i.test(env['DSH_CONFIG_MANAGER_PROXY'] ?? '')) return result
  const configured = readProxyEnv(env)
  let http = configured.httpProxy
  let https = configured.httpsProxy
  if (http === null && https === null && platform === 'win32') {
    let settings: string
    try { settings = readSettings() } catch { return result }
    if (!/ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(settings)) return result
    const server = /ProxyServer\s+REG_SZ\s+([^\r\n]+)/i.exec(settings)?.[1]?.trim()
    if (!server) return result
    if (!server.includes('=')) http = https = server
    else {
      const pairs = Object.fromEntries(server.split(';').map((part) => part.trim().split('=', 2)))
      http = pairs['http'] ?? null
      https = pairs['https'] ?? http
    }
  }
  const url = (value: string | null): string | undefined => {
    if (value === null) return undefined
    try {
      const parsed = new URL(value.includes('://') ? value : `http://${value}`)
      return /^(http|https):$/.test(parsed.protocol) ? parsed.toString() : undefined
    } catch { return undefined }
  }
  const httpUrl = url(http ?? https)
  const httpsUrl = url(https ?? http)
  // pnpm and libcurl/Git use different spellings; keep the install process consistent.
  if (httpUrl !== undefined) Object.assign(result, { HTTP_PROXY: httpUrl, http_proxy: httpUrl, npm_config_proxy: httpUrl })
  if (httpsUrl !== undefined) Object.assign(result, { HTTPS_PROXY: httpsUrl, https_proxy: httpsUrl, npm_config_https_proxy: httpsUrl })
  return result
}
