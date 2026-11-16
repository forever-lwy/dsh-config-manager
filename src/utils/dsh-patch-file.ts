/** Host patch-file I/O and validation before atomic writes. */
import fs from 'node:fs/promises'
import { resolve } from 'node:path'
import type { PatchFileFacade } from '../core/types.ts'
import { zhMsg, type MsgFunc } from '../core/messages.ts'
import { describePatchDocument, describePatchLayoutDrift, patchDocumentEntries, planPatchDocument, PatchStartupInvalidError, unprovidedTopLevelIds } from '../core/patch-document.ts'
import { entryTreeRows, entryTreeIssues, MISSING_ENTRY_ID } from '../core/entry-tree.ts'
import { reconcileBundleLayers, type BundlePatchLayer, type BundleReconciliation } from '../core/bundle-reconciliation.ts'
import { alignOverrideNames, patchChainIndex, type PatchChainRead, type PatchWriteOutcome } from '../core/patch-chain.ts'
import { PatchChainCache, downgradeProvidedInserts, readPatchChainFromProfile } from './patch-chain-read.ts'
import { isPatchLayerRel, profilePatchRel, USER_PATCH_FILE } from '../core/patch-layers.ts'
import { describePatchYamlError, dumpPatchDocument, loadPatchDocument } from './patch-yaml.ts'
import { atomicWriteFile } from './atomic-write.ts'
import { isENOENT } from './guards.ts'
import { isSameOrChild } from './paths.ts'

export interface PatchStartupView {
  bundleLayers?: BundlePatchLayer[]
  bundleFailures?: PatchChainRead['failures']
  entries: { id: string; name?: unknown }[]
  compose: (layers: unknown[][], warn: (message: string) => void) => { id: string; name?: unknown }[]
  available: (name: string) => boolean
}

export class DshPatchFileFacade implements PatchFileFacade {
  private readonly homeDir: string
  private readonly profile: string
  private readonly msg: MsgFunc
  private readonly readStartup?: () => Promise<PatchStartupView>

  constructor(homeDir: string, profile: string, msg: MsgFunc = zhMsg, readStartup?: () => Promise<PatchStartupView>) {
    this.homeDir = homeDir
    this.profile = profile
    this.msg = msg
    this.readStartup = readStartup
  }

  /**
   * 层路径 → 绝对路径。
   *
   * 只接受**已知的层路径**（用户层 / 本 profile 的 profile 层），且解析结果必须落在 home 根内：
   * 调用方传进来的是快照里存的字符串，跨机器恢复时不能让它变成任意路径写。
   * 本 profile 之外的 profile 层同样拒绝 —— 一个档案的备份不该写另一个档案的 patch。
   */
  private patchPath(file: string): string {
    const rel = file.replace(/\\/g, '/')
    const allowed = rel === USER_PATCH_FILE || (isPatchLayerRel(rel) && rel === profilePatchRel(this.profile))
    if (!allowed) {
      throw new Error(this.msg('host.patchUnsupported', {
        user: USER_PATCH_FILE,
        profile: profilePatchRel(this.profile),
        file,
      }))
    }
    const abs = resolve(this.homeDir, rel)
    if (!isSameOrChild(abs, this.homeDir)) {
      throw new Error(this.msg('host.patchUnsupported', {
        user: USER_PATCH_FILE,
        profile: profilePatchRel(this.profile),
        file,
      }))
    }
    return abs
  }

  async readPatchLines(file: string): ReturnType<PatchFileFacade['readPatchLines']> {
    const p = this.patchPath(file)
    let text: string
    try {
      text = await fs.readFile(p, 'utf8')
    } catch (err) {
      // 真不存在 = 「按需创建、本来就没有」→ 空层（既有语义）。
      // 其余 errno（EACCES / EBUSY / …）**必须上抛**：读不到 ≠ 没有；静默返回空会让这一层的
      // patch 行在导出/同步里无声消失（t23 口径；readEffectivePatchLines 的 failures 通道会转成
      // 可见告警，三个适配器都会展示）。
      if (isENOENT(err)) return []
      throw new Error(this.msg('host.patchUnreadable', { file, reason: describePatchYamlError(err) }), { cause: err })
    }
    let doc: unknown
    try {
      doc = loadPatchDocument(text)
    } catch (err) {
      // 解析失败同样上抛（issue #75）：`!!js` 这类 DSH 方言一旦读不出来，返回 [] 就等于把用户
      // 手写的整层配置从导出/同步里抹掉（比「报错」糟得多）。
      throw new Error(this.msg('host.patchUnreadable', { file, reason: describePatchYamlError(err) }), { cause: err })
    }
    if (!Array.isArray(doc)) return []
    const lines: Awaited<ReturnType<PatchFileFacade['readPatchLines']>> = []
    for (const item of doc) {
      if (item === null || typeof item !== 'object') continue
      const obj = item as Record<string, unknown>
      const insert = obj['insert']
      if (Array.isArray(insert)) {
        for (const entry of insert) {
          if (entry === null || typeof entry !== 'object') continue
          const id = (entry as Record<string, unknown>)['id']
          if (typeof id === 'string' && id !== '') lines.push({ lineId: id, raw: entry, operation: 'insert' })
        }
        continue
      }
      const id = obj['id']
      if (typeof id === 'string' && id !== '') lines.push({ lineId: id, raw: obj, operation: 'update' })
    }
    return lines
  }

  async applyPatchChanges(
    file: string,
    changes: { lineId: string; raw: unknown; action: 'insert' | 'update' | 'remove' }[],
  ): Promise<PatchWriteOutcome> {
    const p = this.patchPath(file)
    const startup = await this.readStartup?.()
    const readChain = await this.readPatchChainQuietly()
    // Built-in bundles can live in the host installation rather than the profile.
    // Keep the installed host's authoritative base in the chain used for writes.
    const chain = readChain === null || startup === undefined ? readChain : {
      ...readChain,
      sources: [{ file: 'bundles:installed-host', doc: [{ insert: startup.entries }] }, ...readChain.sources],
    }
    const { effective, downgraded } = downgradeProvidedInserts(chain, file, changes)

    // 1. Load the current document (the ordered table itself is built by planPatchDocument).
    //
    // 读不出来的既有内容**绝不能当作空文档**（issue #75 的数据丢失点）：重建后的文件只包含
    // 本次写入的行，等于把用户手写的其余行整段删掉。三种情况分开处理：
    //   - 真不存在（ENOENT）→ 空文档（首次创建，既有语义）；
    //   - 存在但读不到（EACCES/EBUSY/…）→ 抛错，不改写；
    //   - 存在但解析不了（含未知方言 / YAML 本身有错）→ 抛错，不改写。
    let existing: string | null = null
    try {
      existing = await fs.readFile(p, 'utf8')
    } catch (err) {
      if (!isENOENT(err)) {
        throw new Error(this.msg('host.patchRefuseClobber', { file, reason: describePatchYamlError(err) }), { cause: err })
      }
    }
    let doc: unknown
    if (existing !== null && existing.trim() !== '') {
      try {
        doc = loadPatchDocument(existing)
      } catch (err) {
        throw new Error(this.msg('host.patchRefuseClobber', { file, reason: describePatchYamlError(err) }), { cause: err })
      }
    }

    // 2. Rebuild through core/patch-document.ts (issue #133): the two shapes are **not**
    //    equivalent on the host side. A top-level `- id: X` row *overrides* entry X and is
    //    dropped with `patch: entry "X" not found` when X does not exist; only an
    //    `- insert:` block member *adds* entries. Emitting every row top-level therefore
    //    turned one update into "every insert-only entry (MCP servers, most notably) is
    //    gone after restart".
    const other = file === USER_PATCH_FILE ? profilePatchRel(this.profile) : USER_PATCH_FILE
    const otherDoc = await this.readPatchDocQuietly(other, startup !== undefined)
    const inheritedIds = new Set(entryTreeRows(startup?.entries ?? []).flatMap((entry) => typeof entry.id === 'string' ? [entry.id] : []))
    // A home-layer override may legitimately target a profile-layer insert.
    if (file === USER_PATCH_FILE) {
      for (const entry of patchDocumentEntries(otherDoc)) if (entry.inInsert) inheritedIds.add(entry.id)
    }
    const plan = planPatchDocument(doc, effective, inheritedIds)
    const items = chain === null ? plan.items : alignOverrideNames(plan.items, patchChainIndex(chain))
    const text = '# rewritten by dsh-config-manager import (original comments not preserved)\n'
      + dumpPatchDocument(items)

    // 3. Post-write structure self-check, before anything touches the disk: re-parse the
    //    text we just serialized and require both id sets to match the plan item by item.
    //    A serializer or dialect change that flattens or swallows insert blocks stops here
    //    (zero write) instead of silently degrading every patch row to an override.
    const drift = describePatchLayoutDrift(plan, describePatchDocument(loadPatchDocument(text)))
    if (drift !== null) {
      throw new Error(this.msg('host.patchSemanticDrift', { file, detail: drift }))
    }

    if (chain !== null && chain.failures.length === 0) {
      const orphans = unprovidedTopLevelIds([...chain.sources.map(source => source.doc), doc], plan.topLevelIds)
      if (orphans.length > 0) throw new PatchStartupInvalidError(this.msg('host.patchRefuseUnknownId', { file, ids: orphans.join(', ') }))
    }

    // Compose the complete startup configuration using the installed host's own merger.
    // Validation runs before atomicWriteFile: a rejected candidate leaves the original intact.
    const preexistingInvalid: string[] = []
    if (startup !== undefined) {
      const otherItems = Array.isArray(otherDoc) ? otherDoc : []
      const layers = file === USER_PATCH_FILE ? [otherItems, items] : [items, otherItems]
      const composed = startup.compose([[{ insert: startup.entries }], ...layers], () => {})
      const entries = entryTreeRows(composed)
      const seen = new Set(entries.flatMap((entry) => typeof entry.id === 'string' ? [entry.id] : []))
      const invalid: string[] = []
      const changed = new Set(changes.filter((change) => change.action !== 'remove').map((change) => change.lineId))
      for (const change of changes) {
        if (change.action === 'remove') continue
        for (const entry of entryTreeRows([change.raw])) changed.add(typeof entry.id === 'string' && entry.id !== '' ? entry.id : MISSING_ENTRY_ID)
      }
      const originalItems = Array.isArray(doc) ? doc : []
      const beforeLayers = file === USER_PATCH_FILE ? [otherItems, originalItems] : [originalItems, otherItems]
      const beforeIssues = entryTreeIssues(startup.compose([[{ insert: startup.entries }], ...beforeLayers], () => {}))
      for (const [id, count] of entryTreeIssues(composed)) {
        if (changed.has(id) || count > (beforeIssues.get(id) ?? 0)) invalid.push(id)
        else preexistingInvalid.push(id)
      }
      for (const entry of entries) {
        if (typeof entry.id === 'string' && changed.has(entry.id) && typeof entry.name === 'string' && !startup.available(entry.name)) invalid.push(entry.id)
      }
      for (const id of changed) if (!seen.has(id)) invalid.push(id)
      if (invalid.length > 0) {
        throw new PatchStartupInvalidError(this.msg('host.patchStartupInvalid', { file, ids: [...new Set(invalid)].join(', ') }))
      }
    }

    await atomicWriteFile(p, text)
    this.chainCache.invalidate()
    return { downgraded, ...(preexistingInvalid.length > 0 ? { preexistingInvalid } : {}) }
  }

  private readonly chainCache = new PatchChainCache(2000)

  async readPatchChain(): Promise<PatchChainRead> {
    return this.chainCache.get(async () => {
      const startup = await this.readStartup?.()
      const bundles = startup?.bundleLayers === undefined ? undefined : {
        sources: startup.bundleLayers.map((layer) => ({ file: `bundles:${layer.name}`, doc: layer.patches })),
        failures: startup.bundleFailures ?? [],
      }
      return readPatchChainFromProfile(this.homeDir, this.profile, bundles)
    })
  }

  async reconcileBundles(apply: boolean): Promise<BundleReconciliation> {
    const startup = await this.readStartup?.()
    if (startup?.bundleLayers === undefined) return { removed: [] }
    const p = resolve(this.homeDir, 'profiles', this.profile, 'package.json')
    let text: string
    try { text = await fs.readFile(p, 'utf8') } catch (err) {
      if (isENOENT(err)) return { removed: [] }
      throw err
    }
    const manifest = JSON.parse(text)
    const names: unknown = manifest?.dsh?.profile?.bundles
    if (!Array.isArray(names) || !names.every((name) => typeof name === 'string')) return { removed: [] }
    // Never remove default/inbox layers that were not explicitly declared in this profile.
    const outcome = reconcileBundleLayers(startup.bundleLayers.filter((layer) => names.includes(layer.name)))
    if (apply && outcome.removed.length > 0) {
      const removed = new Set(outcome.removed.map((row) => row.name))
      manifest.dsh.profile.bundles = names.filter((name) => !removed.has(name))
      await atomicWriteFile(p, JSON.stringify(manifest, null, 2) + '\n')
      this.chainCache.invalidate()
    }
    return outcome
  }

  private async readPatchChainQuietly(): Promise<PatchChainRead | null> {
    try { return await this.readPatchChain() } catch { return null }
  }

  /** Missing sibling layers are empty; a required startup audit refuses unreadable layers. */
  private async readPatchDocQuietly(file: string, required = false): Promise<unknown> {
    try {
      return loadPatchDocument(await fs.readFile(resolve(this.homeDir, file), 'utf8'))
    } catch (err) {
      if (required && !isENOENT(err)) throw new Error(this.msg('host.patchRefuseClobber', { file, reason: describePatchYamlError(err) }), { cause: err })
      return undefined
    }
  }
}

