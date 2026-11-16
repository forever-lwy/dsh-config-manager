/**
 * 适配器测试基础设施（仿 src/core/smoke.test.ts 的内存 mock 门面）。
 * 仅供 src/adapters/*.test.ts 使用，不参与生产构建语义。
 */
import { normalizePath } from '../utils/paths.js';
import { createLogger } from '../utils/logger.js';
import { sha256Hex } from '../utils/hashing.js';
import { zhMsg } from '../core/messages.js';
import { USER_PATCH_FILE } from '../core/patch-layers.js';
export class MemFs {
    files = new Map();
    /** 可选（issue #37）：详细的链接遍历。测试按需注入；缺省走 listRecursive 回退路径。 */
    listRecursiveDetailed;
    /** 可选（issue #45）：建缺失目录能力。测试按需注入；缺省维持「宿主不支持该能力」的旧行为。 */
    ensureDir;
    /** 可选（issue #45）：绝对路径 realpath。测试按需注入；缺省维持「宿主不支持」的旧行为。 */
    realpathDir;
    /** 可选（只读预览）：目录体积上界。测试按需注入；缺省维持「宿主不支持」的旧行为（`link:` 体积按 0）。 */
    dirSizeBytes;
    homeDir;
    constructor(homeDir) {
        this.homeDir = homeDir;
    }
    key(p) {
        return normalizePath(p.startsWith(this.homeDir) ? p : `${this.homeDir}/${p}`);
    }
    async readFile(relPath) {
        const v = this.files.get(this.key(relPath));
        if (v === undefined)
            throw new Error(`ENOENT: ${relPath}`);
        return v;
    }
    async writeFile(relPath, data) {
        this.files.set(this.key(relPath), data);
    }
    async exists(relPath) {
        return this.files.has(this.key(relPath));
    }
    async copy(from, to) {
        const v = this.files.get(this.key(from));
        if (v === undefined)
            throw new Error(`ENOENT: ${from}`);
        this.files.set(this.key(to), v);
    }
    async remove(relPath) {
        this.files.delete(this.key(relPath));
    }
    /**
     * 测试用 mtime 表（key 与 files 同一规则）。**未登记的文件返回 null**，
     * 与真实门面「读不到时间」同语义 —— 让「把未知当最旧」这类缺陷在测试里必然暴露。
     */
    mtimes = new Map();
    /** 测试助手：登记某文件的 mtime（null = 恢复为「读不到」） */
    setMtime(relPath, ms) {
        if (ms === null)
            this.mtimes.delete(this.key(relPath));
        else
            this.mtimes.set(this.key(relPath), ms);
    }
    async mtimeMs(relPath) {
        return this.mtimes.get(this.key(relPath)) ?? null;
    }
    /**
     * 文件字节数（只读预览用）。
     *
     * 语义与真实门面一致：**读不到 → null**（不返回 0）—— 0 会让字节闸门少算，
     * 让预览把本该剔除的单元也列出来，与真实导出分叉。
     */
    async statSize(relPath) {
        const v = this.files.get(this.key(relPath));
        return v === undefined ? null : v.byteLength;
    }
    async listRecursive(dir) {
        const base = normalizePath(this.homeDir);
        const prefix = normalizePath(dir) === '' ? base : `${base}/${normalizePath(dir)}`;
        const out = [];
        for (const k of this.files.keys()) {
            if (k === prefix || k.startsWith(prefix + '/')) {
                out.push(k.slice(base.length).replace(/^[\\/]+/, ''));
            }
        }
        return out.sort();
    }
    async mkdir() { }
}
/** ns.set 时自动注册（有值即视为对应插件已激活；对齐真实 dsh-settings 的注册语义） */
class AutoRegisterMap extends Map {
    registered;
    constructor(registered) {
        super();
        this.registered = registered;
    }
    set(key, value) {
        this.registered.add(key);
        return super.set(key, value);
    }
}
export class MemSettings {
    /** 已注册命名空间（对齐真实 dsh-settings：插件激活时注册；未注册的 describe/replace 抛错） */
    registered = new Set();
    /**
     * 可选（宿主能力探测）：**默认不提供** ⇒ 既有测试继续覆盖「逐名 describe」回退路径；
     * 需要验证快路径的测试自行挂上（真实宿主 DshSettingsFacade 始终提供）。
     */
    describeAll;
    /** 有值的命名空间自动视为已注册 */
    ns = new AutoRegisterMap(this.registered);
    async describe(namespace, _opts) {
        if (!this.registered.has(namespace))
            throw new Error(`settings namespace "${namespace}" is not registered`);
        const rec = this.ns.get(namespace);
        return {
            value: rec?.value,
            base: rec?.base,
            revision: rec?.revision ?? 0,
            applies: rec?.applies,
            secrets: rec?.secrets ?? [],
        };
    }
    async replace(namespace, value, expectedRevision) {
        if (!this.registered.has(namespace))
            throw new Error(`settings namespace "${namespace}" is not registered`);
        const rec = this.ns.get(namespace);
        if (expectedRevision !== undefined && rec && rec.revision !== expectedRevision) {
            throw new Error(`SETTINGS_CONFLICT: ${namespace} revision ${rec.revision} !== ${expectedRevision}`);
        }
        this.ns.set(namespace, {
            value, revision: (rec?.revision ?? 0) + 1, secrets: rec?.secrets ?? [], base: rec?.base, applies: rec?.applies,
        });
    }
    async update(namespace, patch, expectedRevision) {
        if (!this.registered.has(namespace))
            throw new Error(`settings namespace "${namespace}" is not registered`);
        const rec = this.ns.get(namespace);
        if (expectedRevision !== undefined && rec && rec.revision !== expectedRevision) {
            throw new Error(`SETTINGS_CONFLICT: ${namespace} revision ${rec.revision} !== ${expectedRevision}`);
        }
        const merged = { ...rec?.value, ...patch };
        this.ns.set(namespace, { value: merged, revision: (rec?.revision ?? 0) + 1, secrets: rec?.secrets ?? [] });
    }
}
export class MemCredentials {
    values = new Map();
    async describe(ref) {
        const v = this.values.get(ref);
        return { configured: v !== undefined, source: v !== undefined ? 'file' : 'env', writable: true };
    }
    async set(ref, value) { this.values.set(ref, value); }
    async unset(ref) { this.values.delete(ref); }
}
export class MemPlugins {
    installed = new Map();
    /** 测试钩子：install 抛错（模拟 npm ERESOLVE / 网络失败） */
    failInstall = false;
    /** 测试钩子：记录最近一次 install 收到的 spec（验证非 registry spec 透传） */
    lastSpec;
    async listInstalled() {
        return [...this.installed.values()];
    }
    async install(pkg, spec) {
        if (this.failInstall)
            throw new Error(`npm error code ERESOLVE: could not resolve ${pkg}`);
        if (this.installed.has(pkg))
            return { needsRestart: false };
        this.lastSpec = spec;
        this.installed.set(pkg, { name: pkg, version: '1.0.0', enabled: true, spec });
        return { needsRestart: true };
    }
    /** 测试钩子：卸载失败（模拟 desktop 保留档案被 CLI 拒绝） */
    failUninstall = false;
    /** 最近一次 uninstall 收到的包名（验证只删该删的那个） */
    lastUninstalled;
    async uninstall(pkg) {
        if (this.failUninstall)
            throw new Error(`profile "desktop" is managed exclusively by the Electron application`);
        this.lastUninstalled = pkg;
        this.installed.delete(pkg);
        return { needsRestart: true };
    }
}
export class MemWorkspace {
    records = new Map();
    /** 可选（issue #45）：测试按需注入的会话登记钩子；缺省维持「宿主不支持该能力」的旧行为。 */
    attachSession;
    async listRecords() { return [...this.records.values()]; }
    async writeRecord(r) { this.records.set(r.id, r); }
    async removeRecord(id) { this.records.delete(id); }
}
/**
 * 内存 patch 门面，**按层分桶**（issue #71）。
 *
 * `lines` 仍是**用户（home）层**的桶 —— 绝大多数既有测试只关心「一行进、一行出」，
 * 直接操作 `lines` 即可，语义与改造前完全一致。其它层（profile 层）走 `byFile`：
 * 缺省空桶，因此「读两层」的调用方在旧测试里读到的 profile 层就是空的，不会污染断言。
 *
 * 分层用 `byFile(rel)` 显式取桶，避免测试里手写路径字符串。
 */
export class MemPatch {
    /** 用户（home）层桶：`cordis.patch.yml`。 */
    lines = new Map();
    /** 其它层桶：层路径 → 行表（profile 层等）。 */
    byFile = new Map();
    /** 取（必要时建）某一层的桶；用户层恒为 `lines`（与旧测试兼容）。 */
    bucket(file) {
        if (file === USER_PATCH_FILE)
            return this.lines;
        let bucket = this.byFile.get(file);
        if (bucket === undefined) {
            bucket = new Map();
            this.byFile.set(file, bucket);
        }
        return bucket;
    }
    async readPatchLines(file) {
        if (file === USER_PATCH_FILE)
            return [...this.lines.values()];
        const bucket = this.byFile.get(file);
        return bucket === undefined ? [] : [...bucket.values()];
    }
    /** issue #144：生效 patch 链（bundle 层 + profile 层 + home 层）。默认空链 = 判据不加强。 */
    chain = null;
    /** 记录每次写入的动作，供「已存在的 id 必须走 update」这类断言使用。 */
    actions = [];
    /** 注入「门面把 insert 降级成覆盖行」的结果（issue #144 兜底路径），默认不降级。 */
    downgrade = [];
    async readPatchChain() {
        return this.chain ?? { sources: [], failures: [] };
    }
    async applyPatchChanges(file, changes) {
        const bucket = this.bucket(file);
        for (const c of changes) {
            this.actions.push({ file, lineId: c.lineId, action: c.action });
            if (c.action === 'remove')
                bucket.delete(c.lineId);
            else
                bucket.set(c.lineId, { lineId: c.lineId, raw: c.raw });
        }
        return { downgraded: this.downgrade };
    }
}
export class MemSnapshotStore {
    snapshots = new Map();
    blobs = new Map();
    async save(snapshot, blobs = new Map()) {
        this.snapshots.set(snapshot.id, snapshot);
        for (const [k, v] of blobs)
            this.blobs.set(`${snapshot.id}/${k}`, v);
        return snapshot.id;
    }
    async load(id) {
        const s = this.snapshots.get(id);
        if (!s)
            throw new Error(`snapshot not found: ${id}`);
        return s;
    }
    async readBlob(id, blobPath) {
        const v = this.blobs.get(`${id}/${blobPath}`);
        if (!v)
            throw new Error(`blob not found: ${id}/${blobPath}`);
        return v;
    }
    async updateStatus(id, status) {
        const s = this.snapshots.get(id);
        if (!s)
            throw new Error(`snapshot not found: ${id}`);
        s.status = status;
    }
}
export class MockHostContext {
    platform;
    arch = 'x64';
    homeDir;
    dshVersion = '0.1.0-rc.6';
    log;
    profile;
    settings = new MemSettings();
    credentials = new MemCredentials();
    plugins = new MemPlugins();
    workspace = new MemWorkspace();
    patchFile = new MemPatch();
    fs;
    /** 可选（issue #45）：会话存储端口；测试按需注入（缺省 = 宿主未提供该能力）。 */
    sessions;
    /** 可选（issue #71）：技能服务端口；测试按需注入（缺省 = 退回纯目录扫描）。 */
    skills;
    /**
     * 可选（第三方插件数据）：系统 home 与它的文件门面。缺省 undefined = **旧宿主形态**
     * （pluginData / pluginAssets 不收集也不写入，如实报码）；需要它们的测试自行注入，
     * 或用 withOsHome() 把系统 home 指向本夹具自己的根。
     */
    osHomeDir;
    homeFs;
    /** 测试助手：把「系统 home」指向本上下文的根（两分区在本夹具里即可直接用） */
    withOsHome() {
        this.osHomeDir = this.homeDir;
        this.homeFs = this.fs;
        return this;
    }
    constructor(platform, homeDir, profile) {
        this.platform = platform;
        this.homeDir = homeDir;
        this.profile = profile;
        this.fs = new MemFs(homeDir);
        this.log = createLogger({ level: 'error', sink: () => { } });
    }
}
export function makeContext(platform, homeDir, profile) {
    return new MockHostContext(platform, homeDir, profile);
}
/** 构造最小合法 manifest（adapter 单测用；真实 manifest 由 exporter 生成） */
export function makeManifest(platform = 'win32') {
    return {
        schemaVersion: 1,
        exporter: { name: 'dsh-config-manager-test', version: '0.0.0' },
        source: { dshVersion: '0.1.0-rc.6', platform: platform, arch: 'x64' },
        exportedAt: new Date('2026-08-14T12:00:00.000Z').toISOString(),
        sections: {
            settings: false, ui: false, providers: false, plugins: false, mcp: false, prompts: false,
            skills: false, agentPresets: false, agentInstructions: false, workspaces: false, pluginFiles: false,
            credentialsStatus: false, secrets: false, sessions: false, self: false,
            pluginData: false, pluginAssets: false,
        },
        security: { containsSecrets: false, encrypted: false, encryption: null },
    };
}
/** 构造 ImportContext（adapter 单测用；sections 键运行时即 SectionId 字符串） */
export function makeImportContext(target, sections, overrides = {}) {
    return {
        manifest: makeManifest(target.platform),
        targetPlatform: target.platform,
        target,
        sections: sections,
        pathMappings: [],
        resolutions: {},
        secretInputs: {},
        log: target.log,
        msg: zhMsg,
        ...overrides,
    };
}
export { sha256Hex };
//# sourceMappingURL=test-helpers.js.map