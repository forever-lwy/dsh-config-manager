/** 默认档案名：只有它使用历史根 `<dataDir>/sync`（零迁移） */
export declare const SYNC_DEFAULT_PROFILE = "web";
/** 非默认档案的作用域父目录（在 dataDir 下与历史 `sync/` 平级） */
export declare const SYNC_SCOPES_DIR_NAME = "sync-profiles";
/**
 * 同步 token 的 DSH credentials 引用名（POSIX env-var 形态，满足 CredentialRef 品牌要求）。
 * token 只经 credentialRef 读写（写入由请求体触发，读取在每次 git 网络操作时 resolve），
 * 永不进 repoUrl / argv / commit / 同步文件 / 日志。
 */
export declare const SYNC_CREDENTIAL_REF = "DSH_CONFIG_MANAGER_SYNC_TOKEN";
/**
 * WebDAV 通道口令的独立 DSH credentials 引用（与 git token 槽位分离）。
 * 口令只经 credentialRef 读写，永不进 URL / 请求头 / 日志。
 */
export declare const SYNC_WEBDAV_CREDENTIAL_REF = "DSH_CONFIG_MANAGER_SYNC_WEBDAV_PASSWORD";
/**
 * 同步快照「加密密码 / 解密密码」的 DSH credentials 引用名前缀（按通道各自独立）。
 *
 * 为什么放 DSH credentials：加密/解密密码跨会话必须可用（否则每次推送都要重新输入），
 * 但**绝不允许**写进 sync-selection.json 一类同步文件（那等于把密码推上远端）。
 * 引用名形如 DSH_CONFIG_MANAGER_SYNC_ENCRYPT_PASSWORD_GIT。
 */
export declare const SYNC_ENCRYPT_PASSWORD_REF_PREFIX = "DSH_CONFIG_MANAGER_SYNC_ENCRYPT_PASSWORD";
export declare const SYNC_DECRYPT_PASSWORD_REF_PREFIX = "DSH_CONFIG_MANAGER_SYNC_DECRYPT_PASSWORD";
/**
 * 归一档案名：非法 / 缺省一律回落默认档案。
 *
 * 为什么回落而不是抛错：档案名来自宿主（`host.profile`）；一个坏名字不该让插件在
 * 启动期炸掉，写出历史根（默认作用域）也仍是一致的状态，最多是「没分档」。
 */
export declare function normalizeSyncProfile(raw: unknown): string;
/** 档案名 → 凭据后缀（`Test1` → `__TEST1`；默认档案 → 空串，保持历史槽位名） */
export declare function syncScopeSuffix(profile: unknown): string;
/**
 * 把「历史（不带后缀）」凭据槽位名映射到某档案。
 *
 * 只接受已经算好的历史名（调用点仍是 `SYNC_CREDENTIAL_REF` / `cloudSecretRef(x)` 那些常量），
 * 因此全仓槽位名仍然一处声明，不会出现第二套命名规则。
 */
export declare function scopedSyncRef(ref: string, profile: unknown): string;
/** ('ENCRYPT'|'DECRYPT', 'git'|'webdav'|...) → 该通道的凭据引用名（可按档案加后缀）。 */
export declare function syncPasswordRef(kind: 'ENCRYPT' | 'DECRYPT', channel: string, profile?: unknown): string;
/** 一个档案的同步作用域（由 `syncScopeFor` 产出，纯数据 + 派生槽位名）。 */
export interface SyncScope {
    /** 归一后的档案名（非法名回落默认档案） */
    profile: string;
    /** 是否默认档案（= 历史根，路径零迁移） */
    isDefault: boolean;
    /** 全机一份的同步根：只用来读 `backup-schedule.json`，**不要**用它读同步配置 */
    rootDir: string;
    /** 本档案的同步作用域目录：同步引擎的全部状态都在这里 */
    dir: string;
    /** 本档案的 git / GitHub token 槽位 */
    tokenRef: string;
    /** 本档案的 WebDAV 口令槽位 */
    webdavPasswordRef: string;
    /** 历史槽位名 → 本档案槽位名（云端点密钥等按需映射） */
    scopeRef(ref: string): string;
    /** 本档案的加密 / 解密密码槽位 */
    passwordRef(kind: 'ENCRYPT' | 'DECRYPT', channel: string): string;
}
/**
 * 由插件数据根与档案名算出同步作用域。
 *
 * @param dataDir 插件数据根（`$DSH_HOME/dsh-config-manager` 或 `config.dataDir`）
 * @param profile 宿主给的档案名（`host.profile`）；缺省 / 非法 = 默认档案
 */
export declare function syncScopeFor(dataDir: string, profile?: unknown): SyncScope;
/**
 * 只有作用域目录、没有档案作用域的装配面（测试夹具 / 手工装配）→ 历史单作用域语义。
 *
 * 语义是**等价**而非猜测：历史布局里「作用域目录」就是默认档案的作用域（rootDir === dir），
 * 槽位名也就是历史槽位名。因此这里给出的是「默认档案」这一确定的解释，不碰档案判定。
 * 生产路径一律走 `syncScopeFor(dataDir, profile)`；类型上 `RoutesEnv.syncScope` 是必填的，
 * 漏传只可能出现在 `as never` 之类的未类型化夹具里。
 */
export declare function syncScopeOrDefault(syncDir: string, scope?: SyncScope): SyncScope;
/**
 * 首次启用某档案的作用域时，从历史根继承的文件。
 *
 * 继承哪些：同步目标与「怎么同步」的配置（sync-config / cloud / selection / autosync / ui-prefs）
 * —— 这些档案在此前就是共用历史根的配置，不继承 = 升级后同步「凭空未配置」。
 *
 * **不继承**：`work/`（git 工作副本，按新目标重克隆即可；复制一份反而会指向旧 origin）、
 * `incoming/`、`snapshots/`（远端内容缓存）、`sync-state.json` 与 `sync-history.json`
 * （那是本机同步流水；复制等于伪造「我在另一档案里同步过」）。
 */
export declare const SYNC_SCOPE_ADOPT_FILES: readonly ['sync-config.json', 'sync-cloud-config.json', 'sync-selection.json', 'sync-autosync.json', 'ui-prefs.json'];
/** 历史槽位名 → 新档案槽位名（采纳时按「值只在进程内搬一次」复制，绝不落盘）。 */
export declare function syncScopeLegacyCredentialRefs(scope: SyncScope): Array<{
    from: string;
    to: string;
}>;
/**
 * 采纳历史根：非默认档案首次启动、自己的作用域目录还不存在时，把历史配置复制一份过来。
 *
 * 幂等：目录一存在就跳过（采纳前先 `mkdir`，因此「空目录」也是已采纳的标记，
 * 不需要额外的 marker 文件）。任何单个文件复制失败都只记日志、不影响其它文件 ——
 * 采纳是尽力而为的兼容动作，绝不能让插件启动失败。
 *
 * @returns 实际复制过来的文件名（未采纳 / 已采纳时为空数组）
 */
export declare function adoptLegacySyncScope(scope: SyncScope, log?: (message: string) => void): Promise<string[]>;
