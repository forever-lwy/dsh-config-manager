import { type Logger } from '../utils/logger.ts';
import { sha256Hex } from '../utils/hashing.ts';
import type { CredentialsFacade, FileSystemFacade, HostContext, ImportContext, NamespaceInfo, PatchFileFacade, PluginInfo, PluginsFacade, SettingsFacade, Snapshot, SnapshotStore, WorkspaceFacade } from '../core/types.ts';
import type { Manifest, WorkspaceRecord } from '../schema/types.ts';
export declare class MemFs implements FileSystemFacade {
    files: Map<string, Uint8Array<ArrayBufferLike>>;
    /** 可选（issue #37）：详细的链接遍历。测试按需注入；缺省走 listRecursive 回退路径。 */
    listRecursiveDetailed?: FileSystemFacade['listRecursiveDetailed'];
    /** 可选（issue #45）：建缺失目录能力。测试按需注入；缺省维持「宿主不支持该能力」的旧行为。 */
    ensureDir?: FileSystemFacade['ensureDir'];
    /** 可选（issue #45）：绝对路径 realpath。测试按需注入；缺省维持「宿主不支持」的旧行为。 */
    realpathDir?: FileSystemFacade['realpathDir'];
    /** 可选（只读预览）：目录体积上界。测试按需注入；缺省维持「宿主不支持」的旧行为（`link:` 体积按 0）。 */
    dirSizeBytes?: FileSystemFacade['dirSizeBytes'];
    private readonly homeDir;
    constructor(homeDir: string);
    private key;
    readFile(relPath: string): Promise<Uint8Array>;
    writeFile(relPath: string, data: Uint8Array): Promise<void>;
    exists(relPath: string): Promise<boolean>;
    copy(from: string, to: string): Promise<void>;
    remove(relPath: string): Promise<void>;
    /**
     * 测试用 mtime 表（key 与 files 同一规则）。**未登记的文件返回 null**，
     * 与真实门面「读不到时间」同语义 —— 让「把未知当最旧」这类缺陷在测试里必然暴露。
     */
    mtimes: Map<string, number>;
    /** 测试助手：登记某文件的 mtime（null = 恢复为「读不到」） */
    setMtime(relPath: string, ms: number | null): void;
    mtimeMs(relPath: string): Promise<number | null>;
    /**
     * 文件字节数（只读预览用）。
     *
     * 语义与真实门面一致：**读不到 → null**（不返回 0）—— 0 会让字节闸门少算，
     * 让预览把本该剔除的单元也列出来，与真实导出分叉。
     */
    statSize(relPath: string): Promise<number | null>;
    listRecursive(dir: string): Promise<string[]>;
    mkdir(): Promise<void>;
}
/** ns.set 时自动注册（有值即视为对应插件已激活；对齐真实 dsh-settings 的注册语义） */
declare class AutoRegisterMap extends Map<string, {
    value: unknown;
    base?: unknown;
    revision: number;
    applies?: string[];
    secrets: {
        path: string[];
        set: boolean;
    }[];
}> {
    private readonly registered;
    constructor(registered: Set<string>);
    set(key: string, value: {
        value: unknown;
        base?: unknown;
        revision: number;
        applies?: string[];
        secrets: {
            path: string[];
            set: boolean;
        }[];
    }): this;
}
export declare class MemSettings implements SettingsFacade {
    /** 已注册命名空间（对齐真实 dsh-settings：插件激活时注册；未注册的 describe/replace 抛错） */
    registered: Set<string>;
    /**
     * 可选（宿主能力探测）：**默认不提供** ⇒ 既有测试继续覆盖「逐名 describe」回退路径；
     * 需要验证快路径的测试自行挂上（真实宿主 DshSettingsFacade 始终提供）。
     */
    describeAll?: SettingsFacade['describeAll'];
    /** 有值的命名空间自动视为已注册 */
    ns: AutoRegisterMap;
    describe(namespace: string, _opts?: {
        redactSecrets?: boolean;
    }): Promise<NamespaceInfo>;
    replace(namespace: string, value: unknown, expectedRevision?: number): Promise<void>;
    update?(namespace: string, patch: unknown, expectedRevision?: number): Promise<void>;
}
export declare class MemCredentials implements CredentialsFacade {
    values: Map<string, string>;
    describe(ref: string): Promise<{
        configured: boolean;
        source?: string;
        writable?: boolean;
    }>;
    set(ref: string, value: string): Promise<void>;
    unset(ref: string): Promise<void>;
}
export declare class MemPlugins implements PluginsFacade {
    installed: Map<string, PluginInfo>;
    /** 测试钩子：install 抛错（模拟 npm ERESOLVE / 网络失败） */
    failInstall: boolean;
    /** 测试钩子：记录最近一次 install 收到的 spec（验证非 registry spec 透传） */
    lastSpec: string | undefined;
    listInstalled(): Promise<PluginInfo[]>;
    install(pkg: string, spec?: string): Promise<{
        needsRestart: boolean;
    }>;
    /** 测试钩子：卸载失败（模拟 desktop 保留档案被 CLI 拒绝） */
    failUninstall: boolean;
    /** 最近一次 uninstall 收到的包名（验证只删该删的那个） */
    lastUninstalled: string | undefined;
    uninstall(pkg: string): Promise<{
        needsRestart: boolean;
    }>;
}
export declare class MemWorkspace implements WorkspaceFacade {
    records: Map<string, WorkspaceRecord>;
    /** 可选（issue #45）：测试按需注入的会话登记钩子；缺省维持「宿主不支持该能力」的旧行为。 */
    attachSession?: WorkspaceFacade['attachSession'];
    listRecords(): Promise<WorkspaceRecord[]>;
    writeRecord(r: WorkspaceRecord): Promise<void>;
    removeRecord(id: string): Promise<void>;
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
export declare class MemPatch implements PatchFileFacade {
    /** 用户（home）层桶：`cordis.patch.yml`。 */
    lines: Map<string, {
        lineId: string;
        raw: unknown;
    }>;
    /** 其它层桶：层路径 → 行表（profile 层等）。 */
    byFile: Map<string, Map<string, {
        lineId: string;
        raw: unknown;
    }>>;
    /** 取（必要时建）某一层的桶；用户层恒为 `lines`（与旧测试兼容）。 */
    bucket(file: string): Map<string, {
        lineId: string;
        raw: unknown;
    }>;
    readPatchLines(file: string): Promise<{
        lineId: string;
        raw: unknown;
    }[]>;
    applyPatchChanges(file: string, changes: {
        lineId: string;
        raw: unknown;
        action: 'insert' | 'update' | 'remove';
    }[]): Promise<void>;
}
export declare class MemSnapshotStore implements SnapshotStore {
    snapshots: Map<string, Snapshot>;
    blobs: Map<string, Uint8Array<ArrayBufferLike>>;
    save(snapshot: Snapshot, blobs?: Map<string, Uint8Array>): Promise<string>;
    load(id: string): Promise<Snapshot>;
    readBlob(id: string, blobPath: string): Promise<Uint8Array>;
    updateStatus(id: string, status: Snapshot['status']): Promise<void>;
}
export declare class MockHostContext implements HostContext {
    platform: string;
    arch: string;
    homeDir: string;
    dshVersion: string;
    log: Logger;
    profile?: string;
    settings: MemSettings;
    credentials: MemCredentials;
    plugins: MemPlugins;
    workspace: MemWorkspace;
    patchFile: MemPatch;
    fs: MemFs;
    /** 可选（issue #45）：会话存储端口；测试按需注入（缺省 = 宿主未提供该能力）。 */
    sessions?: HostContext['sessions'];
    /** 可选（issue #71）：技能服务端口；测试按需注入（缺省 = 退回纯目录扫描）。 */
    skills?: HostContext['skills'];
    /**
     * 可选（第三方插件数据）：系统 home 与它的文件门面。缺省 undefined = **旧宿主形态**
     * （pluginData / pluginAssets 不收集也不写入，如实报码）；需要它们的测试自行注入，
     * 或用 withOsHome() 把系统 home 指向本夹具自己的根。
     */
    osHomeDir?: string;
    homeFs?: HostContext['homeFs'];
    /** 测试助手：把「系统 home」指向本上下文的根（两分区在本夹具里即可直接用） */
    withOsHome(): this;
    constructor(platform: string, homeDir: string, profile?: string);
}
export declare function makeContext(platform: string, homeDir: string, profile?: string): MockHostContext;
/** 构造最小合法 manifest（adapter 单测用；真实 manifest 由 exporter 生成） */
export declare function makeManifest(platform?: string): Manifest;
/** 构造 ImportContext（adapter 单测用；sections 键运行时即 SectionId 字符串） */
export declare function makeImportContext(target: HostContext, sections: ReadonlyMap<string, unknown>, overrides?: Partial<ImportContext>): ImportContext;
export { sha256Hex };
