import type { MsgFunc } from '../core/messages.ts';
import { SYNC_CHANNELS } from '../utils/shared-constants.ts';
import { S3_COMPAT_PROVIDERS, GIST_PROVIDER, CLOUD_SYNC_PROVIDERS } from '../utils/shared-constants.ts';
import type { S3CompatProvider, GistProvider, CloudSyncProvider } from '../utils/shared-constants.ts';
import type { SigV4DialectId } from './s3/sigv4.ts';
export declare const SYNC_CONFIG_FILE = "sync-config.json";
/**
 * 同步通道枚举（**唯一事实源**，t32）：所有「有哪些通道 / 通道列表 / 通道判定」的唯一来源。
 *
 * 声明处 = `src/utils/shared-constants.ts`（**零依赖**：client 半可运行时 import 而不带进
 * node 模块）；本文件 re-export，宿主侧沿用既有 import 路径即可。
 *
 * 为什么要单一来源：此前 SyncTransportType 在 sync-config / ui-prefs / client sync-api /
 * client sync-view 各自声明一遍，通道数组也在 autosync-scheduler 里写了两遍 ——「改一处漏一处」
 * 的表现是某个通道**静默**不再排期 / 不再落盘，而不是报错。新增通道只改声明处：typecheck 会在
 * 所有 Record<SyncTransportType, X> 的构造处与穷尽检查处报错。
 */
export { SYNC_CHANNELS };
/** 同步通道类型（由 SYNC_CHANNELS 派生；host 侧与 client 半统一引用）。 */
export type SyncTransportType = (typeof SYNC_CHANNELS)[number];
/** 通道值守卫（用于请求体 / localStorage / 磁盘 JSON 的原始输入校验）。 */
export declare function isSyncTransportType(value: unknown): value is SyncTransportType;
/** 严格解析通道值：非法/缺失 → undefined（缺省由调用方决定，**不在此静默兜底成 git**）。 */
export declare function parseSyncChannel(value: unknown): SyncTransportType | undefined;
/**
 * 配置 → 通道：**唯一判定口径**（替代散落的 `isWebDavConfig(cfg) ? 'webdav' : 'git'`）。
 * SyncConfig 是可辨识联合，transport 字段本身就是通道，无需先过守卫再分支。
 */
export declare function channelOf(cfg: SyncConfig): SyncTransportType;
/**
 * `Record<SyncTransportType, T>` 的统一构造器：遍历 SYNC_CHANNELS 生成。新增通道时无需
 * 在每处穷举字面量（漏写的表现曾是「该通道的配置永远读不到 / 写不回」，静默且难查）。
 */
export declare function channelMap<T>(make: (channel: SyncTransportType) => T): Record<SyncTransportType, T>;
/**
 * 当前 sync-config.json schema 版本号（v4：git 通道新增可选 `subdir` 子目录前缀，issue #131）。
 *
 * 为什么必须升版而不是只加一个可选字段：老版本插件读到带 `subdir` 的配置会**丢掉这个字段**
 * 然后照旧往仓库根写快照 —— 在「多工具共用一个备份仓库」的现场，那等于把快照撒进别人的目录布局。
 * 升版后老版本读到 v4 直接判为不支持（显示未配置），宁可让用户看见「要升级」，也不静默写错位置。
 */
export declare const SYNC_CONFIG_SCHEMA_VERSION = 4;
/** 历史可读取版本：v1、v2、v3、v4。 */
export declare const SYNC_CONFIG_SUPPORTED_VERSIONS: readonly number[];
/** git 通道配置（不含任何凭据；git 可执行文件固定使用系统 PATH 中的 git） */
export interface GitConfig {
    repoUrl: string;
    /**
     * 仓库内子目录前缀（issue #131，可缺省）：快照布局落在 `<subdir>/snapshots`、
     * `<subdir>/snapshots-encrypted`、`<subdir>/blobs`。缺省 = 仓库根（历史行为逐字不变）。
     * 多工具共用同一个私有备份仓库时，每个工具各占一个子目录。
     */
    subdir?: string;
}
/** webdav 通道配置（不含 password；password 走 DSH credentials） */
export interface WebDavConfig {
    /** WebDAV 端点地址（不含凭据；拒绝 userinfo） */
    url: string;
    /** 可选用户名（可回显） */
    username?: string;
}
/**
 * 完整双命名空间配置视图（v3 文件直接读取，供 status 路由回填另一通道的 repoUrl/url）。
 * 与可辨识联合 SyncConfig 不同：git 和 webdav 命名空间同时存在，可能缺失。
 */
export interface FullSyncConfig {
    transport: SyncTransportType;
    git?: GitConfig;
    webdav?: WebDavConfig;
    /** 云端点通道 s3（活动兼容商；只有非密字段 + 密钥标记，绝无密钥值） */
    s3?: S3ChannelConfig;
    /** 云端点通道 gist（只有非密字段 + 密钥标记，绝无 token 值） */
    gist?: GistChannelConfig;
}
/** 持久化的同步通道配置：可辨识联合（schemaVersion 恒 2） */
export type SyncConfig = {
    schemaVersion: 2;
    transport: 'git';
    git: GitConfig;
} | {
    schemaVersion: 2;
    transport: 'webdav';
    webdav: WebDavConfig;
} | {
    schemaVersion: 2;
    transport: 's3';
    s3: S3ChannelConfig;
} | {
    schemaVersion: 2;
    transport: 'gist';
    gist: GistChannelConfig;
};
/** git 通道守卫 */
export declare function isGitConfig(cfg: SyncConfig): cfg is Extract<SyncConfig, {
    transport: 'git';
}>;
/** webdav 通道守卫 */
export declare function isWebDavConfig(cfg: SyncConfig): cfg is Extract<SyncConfig, {
    transport: 'webdav';
}>;
/** s3 通道守卫（provider 在 cfg.s3.provider：s3 / oss / cos / minio / kodo） */
export declare function isS3Config(cfg: SyncConfig): cfg is Extract<SyncConfig, {
    transport: 's3';
}>;
/** gist 通道守卫 */
export declare function isGistConfig(cfg: SyncConfig): cfg is Extract<SyncConfig, {
    transport: 'gist';
}>;
/**
 * 读取同步通道配置；文件不存在/损坏/不支持 schema → null（视为未配置，UI 显示空表单）。
 * 兼容旧文件：缺 schemaVersion 字段视为 v1（git 通道）。
 * 恒返回 schemaVersion=2 的规范形态（v1 读取时归一为 git）。
 *
 * `issues` 可选：传数组时，被丢弃的 git repoUrl（白名单校验不通过）以结构化成因追加进去，
 * 供 UI/日志如实呈现（不静默吞掉）。
 */
export declare function readSyncConfig(dir: string, issues?: SyncConfigIssue[]): Promise<SyncConfig | null>;
/**
 * 读取完整的双命名空间配置（供 status 路由回填另一通道的 repoUrl/url）。
 * 文件不存在/损坏/无任何通道配置 → null（视为未配置）。
 */
export declare function readFullSyncConfig(dir: string, issues?: SyncConfigIssue[]): Promise<FullSyncConfig | null>;
/**
 * 读取指定通道的同步通道配置（供自动同步调度器按通道运行）。
 * 从完整双命名空间配置取对应通道构造可辨识联合 SyncConfig；该通道未配置 → null。
 */
export declare function readSyncConfigFor(dir: string, channel: SyncTransportType, issues?: SyncConfigIssue[]): Promise<SyncConfig | null>;
/**
 * 保存同步通道配置（自动创建目录；恒写 schemaVersion=3 双命名空间）。
 * - 写入当前通道的命名空间（git/webdav）；
 * - 另一通道之前配置过 → 一并保留（切换通道不丢失另一通道的 repoUrl/url）；
 * - 覆盖旧值；未配置过的字段不写入。
 */
export declare function writeSyncConfig(dir: string, cfg: SyncConfig, secrets?: CloudSecretWriter): Promise<void>;
/** 断开单条通道配置的结果（供路由层决定凭据/自动同步/UI 偏好怎么收尾）。 */
export interface ClearSyncChannelResult {
    /** 该通道之前是否有配置；false = 本来就没配（幂等成功，不算失败） */
    removed: boolean;
    /** 是否仍有另一条通道的配置（false = 已无任何通道，configured 应回落为 false） */
    hasRemaining: boolean;
    /** 清除后的活动通道（无剩余时为被清除的通道，仅作占位） */
    transport: SyncTransportType;
}
/**
 * 从 sync-config.json 删除指定通道的命名空间（另一通道的配置原样保留）。
 *
 * 为什么必须有（用户实测）：通道一旦配置过就没有出口 —— 一条打不通的 WebDAV 通道会永久占位，
 * 产物库的远端源与自动同步只能一直报读取失败，用户无从自救。
 *
 * 三条语义：
 *  - 该通道本来没配置 → 幂等成功（removed=false），**不写文件**；
 *  - 删完还剩另一条 → 重写文件；活动 transport 若指向被删通道则自动切到剩下的那条
 *    （否则 readSyncConfig 会返回 null，那条**配置过**的通道反而被显示成「未配置」）；
 *  - 删完一条不剩 → **删除整个文件**（configured 如实回落 false），而不是留一份空配置。
 *
 * 凭据（token / WebDAV 口令 / 该通道的加密解密密码）与自动同步开关**不在本函数职责内** ——
 * 它们分别住在 DSH credentials 与 autosync.json，由路由层显式清除（本模块只碰 sync-config.json）。
 */
export declare function clearSyncChannel(dir: string, channel: SyncTransportType): Promise<ClearSyncChannelResult>;
/** repoUrl 形态：网络地址（http/https/ssh，含 scp 式）或本机路径 */
export type RepoUrlKind = 'http' | 'https' | 'ssh' | 'local';
/**
 * 已落盘 repoUrl 校验失败的**结构化**结果（SEC-01 读侧）。
 * 读取侧不能只是返回 null：调用方要能如实告诉用户「你的配置被丢弃了，原因是地址不合法」。
 */
export interface SyncConfigIssue {
    code: 'repo-url-invalid';
    channel: SyncTransportType;
    message: string;
}
/**
 * repoUrl 形态分类；null = 不认识的形态。
 *
 * 为什么要分类而不是只做正则：git 对同一个「地址」支持 http(s)、ssh、scp 式与本机路径，
 * 而这三类的安全含义完全不同（网络地址要防 SSRF，本机路径要防 argv 注入）。先判形态，
 * 再按形态分别收紧，比一堆互相打架的正则清楚。
 */
export declare function classifyRepoUrl(repoUrl: string): {
    kind: RepoUrlKind;
    host: string;
} | null;
/**
 * 环回 / 私网 / 链路本地 / 未指定地址（含云元数据 169.254.169.254）判定。
 * SEC-03：这类地址让「客户端」去访问内网或本机端口，等于给 SSRF 开一扇门。
 *
 * **已知行为变更（有意，非副作用）**：SEC-02/03 之前 `https://192.168.1.10/…`、`http://127.0.0.1:3000/…`、
 * `http://nas.local/…` 这类地址可以被接受。收紧后一律拒绝 —— 代价是「拿家里 NAS / 局域网 git 服务器
 * 当同步目标」这条路走不通，收益是「包里的 repoUrl 无法把家目录配置推给内网监听者或云元数据端点」。
 * 取舍判据：本插件的同步目标是「用户自己的远端仓库」，公网 http(s)/ssh 已覆盖该用途；本机目录仓库
 * 仍走 `local` 分支（不由本函数判定）。真要支持内网目标，应做成显式开关 + 用户逐目标确认，
 * 不能靠「地址字符串看起来像内网就放行」——那正是攻击者可控的判据。
 */
export declare function isPrivateRepoHost(host: string): boolean;
/**
 * 文案里回显地址用：剥掉 userinfo（token 可能就藏在这一段），host/path 原样保留。
 *
 * 为什么不整串换成 `[REPO_URL]` 占位符：这里拒绝的是**用户自己刚填的**地址，他需要认出
 * 「被拒的是哪一个」才能改；剥掉 `user:pass@` 之后剩下的部分正是修复所需的定位信息。
 * 为什么解析失败也要剥：`https://user:tok@` 这类半截地址 `new URL` 会抛，但前缀照样是凭据。
 */
export declare function sanitizeRepoUrlForMessage(url: string): string;
/**
 * 仓库地址合法性校验（返回错误消息；null = 合法）。
 *
 * 白名单口径（SEC-02/03/12，写入侧与读取侧共用同一份实现）：
 * - 只认 http(s)/ssh/scp 式网络地址与本机路径；file://、ext::、ftp://、git:// 一律拒绝；
 * - 整串以 '-' 开头拒绝（git argv 位置参数以 '-' 开头会被当选项，可执行任意命令）；
 * - 网络地址拒绝环回/私网/链路本地主机（SSRF）—— 文案单独一条（sync.configPrivateHost），
 *   不能复用「无法解析」：用户看到「解析不了」只会反复改写法，实际原因是地址指向内网；
 * - 带 scheme 的地址一律拒绝 userinfo（username[:password]@）—— token 只许放凭据字段。
 */
export declare function validateRepoUrl(repoUrl: string, msg?: MsgFunc): string | null;
/**
 * WebDAV 端点地址合法性校验（返回错误消息；null = 合法）。
 * 安全约束：口令/密码永不拼入 url —— 仅接受 http(s)，且拒绝带 userinfo
 * （username[:password]@）的地址，引导用户把口令放 DSH credentials，避免凭据经 URL 泄漏进出入口/日志。
 */
export declare function validateWebDavUrl(url: string, msg?: MsgFunc): string | null;
/** 云端点通道配置文件名（与 sync-config.json 并列，互不影响）。 */
export declare const CLOUD_SYNC_CONFIG_FILE = "sync-cloud-config.json";
/** 云端点配置 schema 版本。 */
export declare const CLOUD_SYNC_CONFIG_SCHEMA_VERSION = 1;
/**
 * S3 兼容系通道枚举（**唯一声明处已迁到零依赖的 `utils/shared-constants.ts` 的 S3_COMPAT_PROVIDERS**，t88）：
 * 五家共用同一份 SigV4 实现，差异只有 endpoint / region / 寻址风格 / 签名方言
 * （见 src/sync/s3/s3-providers.ts 的变体表）。
 */
export { S3_COMPAT_PROVIDERS, GIST_PROVIDER, CLOUD_SYNC_PROVIDERS };
export type { S3CompatProvider, GistProvider, CloudSyncProvider };
/** 通道值守卫（请求体 / 磁盘 JSON 的原始输入校验）。 */
export declare function isCloudSyncProvider(value: unknown): value is CloudSyncProvider;
/** 是否 S3 兼容系通道。 */
export declare function isS3CompatProvider(value: unknown): value is S3CompatProvider;
/** 是否 Gist 通道。 */
export declare function isGistProvider(value: unknown): value is GistProvider;
/**
/**
 * 取某云端点通道的密钥槽位引用（不涉及任何值）。
 *
 * 表本身在零依赖的 utils/shared-constants.ts（**唯一声明处**，t88）：客户端要显示同一个名字
 * （cloudSecretRefName()），两侧各写一份时「宿主改名、界面还提示旧名」不会红。
 * 命名与既有 syncPasswordRef 同族：DSH_CONFIG_MANAGER_SYNC_<CHANNEL>_<KIND>。
 */
export declare function cloudSecretRef(provider: CloudSyncProvider): string;
/**
 * 密钥**只写**端口：故意不提供 get()——宿主只能写、只能问「有没有」，
 * 通道实现与 UI 都不可能把值回读出来（这是「只写不回读」的结构性保证，不靠纪律）。
 */
export interface CloudSecretWriter {
    /** 写入密钥值（仅内存传递；不落盘、不进日志、不回传） */
    set(ref: string, value: string): Promise<void>;
    /** 只问「该槽位有没有值」（绝不返回值本身） */
    has(ref: string): Promise<boolean>;
}
/** S3 兼容系通道的非密配置（值里绝不含 AccessKey Secret）。 */
export interface CloudS3ChannelConfig {
    /** 对象存储端点（http(s)，不含凭据、不含桶名；如 https://s3.us-east-1.amazonaws.com） */
    endpoint: string;
    /** V4 签名作用域里的 region（如 us-east-1 / cn-hangzhou / ap-guangzhou） */
    region: string;
    /** 桶名 */
    bucket: string;
    /** 对象键前缀（缺省 dsh-config-manager） */
    prefix?: string;
    /** AccessKey ID（标识符，可回显；**不是**密钥） */
    accessKeyId: string;
    /** path-style 寻址开关（缺省取变体默认：MinIO true，其余 false） */
    pathStyle?: boolean;
    /**
     * 显式覆盖变体默认签名方言（缺省 = provider 变体默认；'aws4' = AWS SigV4，'oss4' = 阿里云 OSS4）。
     * 非法的值在解析期被忽略（回落变体默认）—— 该字段是高级覆盖，不是配置错误来源。
     */
    dialectId?: SigV4DialectId;
    /** 密钥是否已在 DSH credentials 里（**只回标记，不回值**） */
    secretStored?: boolean;
}
/** Gist 通道的非密配置（值里绝不含 token）。 */
export interface CloudGistChannelConfig {
    /** 目标 gist id（十六进制串） */
    gistId: string;
    /** GitHub API 根（缺省 https://api.github.com；GitHub Enterprise 可改） */
    apiBaseUrl?: string;
    /** gist 内文件名前缀（缺省 dsh-sync） */
    filePrefix?: string;
    /** token 是否已在 DSH credentials 里（**只回标记，不回值**） */
    secretStored?: boolean;
}
/**
 * s3 通道（SYNC_CHANNELS 的 's3'）的配置 = 具体兼容商的非密配置 + provider 身份。
 * 密钥值绝不在此（只在 DSH credentials 的 cloudSecretRef(provider) 槽位）。
 */
export interface S3ChannelConfig extends CloudS3ChannelConfig {
    /** 具体 S3 兼容商（s3 / oss / cos / minio / kodo） */
    provider: S3CompatProvider;
}
/** gist 通道（SYNC_CHANNELS 的 'gist'）的配置：非密字段；token 只在 DSH credentials。 */
export type GistChannelConfig = CloudGistChannelConfig;
/**
 * 每个云端点**通道**当前选用的 provider（保存即选定；断开即移除）。
 * s3 通道 → 五家兼容商之一；gist 通道 → 恒 'gist'。
 * 与 savedProviders 的分工：savedProviders 是「切换 provider 时能自动回填」的记忆，
 * 本字段回答「这条通道现在用哪一个」。
 */
export interface CloudActiveProviders {
    s3?: S3CompatProvider;
    gist?: GistProvider;
}
/** 按通道分别保存的非密配置（照 cloud-sync 的 savedProviders 模式）。 */
export interface CloudSavedProviders {
    s3?: CloudS3ChannelConfig;
    oss?: CloudS3ChannelConfig;
    cos?: CloudS3ChannelConfig;
    minio?: CloudS3ChannelConfig;
    kodo?: CloudS3ChannelConfig;
    gist?: CloudGistChannelConfig;
}
/** 磁盘上的云端点配置（读侧恒归一为该形态；损坏/不支持的版本 → null）。 */
export interface CloudSyncConfig {
    schemaVersion: number;
    savedProviders: CloudSavedProviders;
    /** 每条云端点通道当前选用的 provider（缺省 = 旧文件，读侧按「唯一已保存者」推断） */
    active?: CloudActiveProviders;
}
/** 某通道读出来的配置（按 provider 收窄的联合）。 */
export type CloudChannelConfig = {
    provider: S3CompatProvider;
    config: CloudS3ChannelConfig;
} | {
    provider: GistProvider;
    config: CloudGistChannelConfig;
};
/** S3 兼容系通道的回传视图：**只带 secretStored 标记，绝不带密钥值**。 */
export interface CloudS3ChannelView {
    provider: S3CompatProvider;
    endpoint: string;
    region: string;
    bucket: string;
    prefix: string;
    accessKeyId: string;
    pathStyle: boolean;
    /** 密钥已在 credentials 里（只回布尔） */
    secretStored: boolean;
}
/** Gist 通道的回传视图：**只带 secretStored 标记，绝不带 token 值**。 */
export interface CloudGistChannelView {
    provider: GistProvider;
    gistId: string;
    apiBaseUrl: string;
    filePrefix: string;
    secretStored: boolean;
}
/** 回传 UI 的通道视图（按 provider 收窄的联合） */
export type CloudChannelView = CloudS3ChannelView | CloudGistChannelView;
/** 写入入参（表单原样；字段按 provider 各自校验）。 */
export interface CloudChannelWriteInput {
    endpoint?: string;
    region?: string;
    bucket?: string;
    prefix?: string;
    accessKeyId?: string;
    pathStyle?: boolean;
    /** 显式覆盖签名方言（可缺省；仅 'aws4' | 'oss4' 被接受） */
    dialectId?: SigV4DialectId;
    gistId?: string;
    apiBaseUrl?: string;
    filePrefix?: string;
    /** 明文密钥：**只写**（提供即写入 credentials）；缺省 = 只更新非密字段，已有密钥不动 */
    secret?: string;
}
/**
 * 云端点配置的**稳定错误码**（不是用户文案）。
 * 与 \`validateRepoUrl\` 返回 \`'repoUrl is required'\` 同口径：码由路由/UI 层映射进字典，
 * 因此本模块不产生任何用户可见字符串。
 */
export type CloudConfigIssueCode = 'cloud.providerUnknown' | 'cloud.endpointRequired' | 'cloud.endpointInvalid' | 'cloud.endpointUserinfo' | 'cloud.regionRequired' | 'cloud.bucketRequired' | 'cloud.bucketInvalid' | 'cloud.prefixInvalid' | 'cloud.accessKeyIdRequired' | 'cloud.gistIdRequired' | 'cloud.gistIdInvalid' | 'cloud.apiBaseUrlInvalid' | 'cloud.secretWriterRequired';
/** 配置校验失败：携带稳定错误码（无用户文案），由上层映射成字典键。 */
export declare class CloudConfigError extends Error {
    readonly code: CloudConfigIssueCode;
    constructor(code: CloudConfigIssueCode, detail?: string);
}
/** 端点校验（http(s)、无 userinfo、无 query/hash）；返回错误码或 null。 */
export declare function validateCloudEndpoint(endpoint: string): CloudConfigIssueCode | null;
/** region 校验：非空、无空白。 */
export declare function validateCloudRegion(region: string): CloudConfigIssueCode | null;
/** 桶名校验。 */
export declare function validateCloudBucket(bucket: string): CloudConfigIssueCode | null;
/**
 * git 通道子目录前缀的归一化与校验（issue #131）。
 *
 * 为什么单独一个函数而不是复用 validateCloudPrefix：对象键前缀与仓库内目录名不是同一套约束 ——
 * 目录名要允许 UTF-8（报告者现场就是 `DSH备份/` 这种中文目录）与多级嵌套，而对象键前缀按
 * 存储桶语义只关心「不是绝对路径、没有 ..」。
 *
 * 接受：空串（= 仓库根，历史行为）、UTF-8 段、多级嵌套（`a/b`）。
 * 拒绝：绝对路径（首部 /）、尾部 /、反斜杠、空段（含 `a//b`）、`.` / `..` 段、控制字符、
 * `.git` 段（写进去会撞 git 自己的元数据目录名，任何大小写都算）。
 */
export type GitSubdirCheck = {
    ok: true;
    value: string;
} | {
    ok: false;
    reason: 'gitSubdirInvalid';
};
export declare function normalizeGitSubdir(raw: unknown): GitSubdirCheck;
/** 对象键前缀校验（可缺省 = 根前缀；不得以 / 开头、不得含 .. / 反斜杠 / 空段）。 */
export declare function validateCloudPrefix(prefix: string): CloudConfigIssueCode | null;
/** gist id 校验。 */
export declare function validateGistId(gistId: string): CloudConfigIssueCode | null;
/** GitHub API 根校验（http(s)、无 userinfo）。 */
export declare function validateCloudApiBaseUrl(url: string): CloudConfigIssueCode | null;
/** 按通道校验写入入参；返回首个错误码或 null。 */
export declare function validateCloudChannelInput(provider: CloudSyncProvider, input: CloudChannelWriteInput): CloudConfigIssueCode | null;
/**
 * 读取云端点配置；文件不存在/损坏/schema 不支持 → null（视为未配置）。
 * **绝不回读密钥值**：只认非密白名单字段 + \`secretStored\` 标记。
 */
export declare function readCloudSyncConfig(dir: string): Promise<CloudSyncConfig | null>;
/** 读取单条云端点通道的配置；该通道未配置/非法 → null。 */
export declare function readCloudChannelConfig(dir: string, provider: CloudSyncProvider): Promise<CloudChannelConfig | null>;
/** 已配置的云端点通道清单（供 UI 回填 / 断开时判断是否还剩别的通道）。 */
export declare function listCloudConfiguredProviders(dir: string): Promise<CloudSyncProvider[]>;
/** 组装 S3 兼容系回传视图（**只带标记、不带值**）。 */
export declare function s3ChannelView(provider: S3CompatProvider, config: CloudS3ChannelConfig, secretStored: boolean): CloudS3ChannelView;
/** 组装 Gist 回传视图（**只带标记、不带值**）。 */
export declare function gistChannelView(config: CloudGistChannelConfig, secretStored: boolean): CloudGistChannelView;
/** 组装回传视图（按 provider 分派到具名视图构造器）。 */
export declare function cloudChannelView(channel: CloudChannelConfig, secretStored: boolean): CloudChannelView;
/**
 * 保存某云端点通道的配置（自动创建目录；恒写 schemaVersion=1 的 savedProviders）。
 * - 只写当前通道的条目，其它通道原样保留（切换通道不丢失已填的 endpoint/bucket）；
 * - 密钥**只写**：提供 input.secret 时经注入的 \`CloudSecretWriter\` 写进 credentials 槽位，
 *   文件里只留 \`secretStored: true\`（值绝不落文件、绝不回传）；
 * - 未提供 secret 时只更新非密字段（已有密钥不动，标记按 \`has()\` 现算）。
 */
export declare function writeCloudChannelConfig(dir: string, provider: CloudSyncProvider, input: CloudChannelWriteInput, secrets?: CloudSecretWriter): Promise<CloudChannelView>;
/**
 * 断开某云端点通道：删掉该通道的配置条目；一条不剩则删除整个文件。
 * 幂等：本来没配置 → removed=false 且**不写文件**。
 * 密钥槽位不在这里清除（凭据归凭据层），与 \`clearSyncChannel\` 同口径。
 */
export declare function clearCloudChannelConfig(dir: string, provider: CloudSyncProvider): Promise<{
    removed: boolean;
    hasRemaining: boolean;
}>;
/**
 * s3 通道当前选用的兼容商：
 *  - 有 active.s3 → 用它（且必须仍有已保存配置）；
 *  - 旧文件（无 active）→ 只有**唯一一家**已保存时据此推断，多家并存时为 null（不猜）。
 */
export declare function readActiveS3Provider(dir: string): Promise<S3CompatProvider | null>;
/**
 * 当前仍配置的通道清单（git/webdav 命名空间 ∪ 云端点已保存的 provider），顺序 = SYNC_CHANNELS。
 * 供路由层判断「还有没有其他通道可用」与断开后回落活动通道。
 */
export declare function listConfiguredChannels(dir: string): Promise<SyncTransportType[]>;
