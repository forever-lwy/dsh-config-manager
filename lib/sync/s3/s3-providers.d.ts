import type { SigV4Dialect, SigV4DialectId } from './sigv4.ts';
import type { CloudConfigIssueCode, S3CompatProvider } from '../sync-config.ts';
/** 对象键默认前缀（所有通道共用；与 WebDAV 通道的集合名保持一致，便于跨通道迁移）。 */
export declare const S3_DEFAULT_PREFIX = "dsh-config-manager";
/** S3 通道内的固定对象名。 */
export declare const S3_INDEX_FILE = "index.json";
export declare const S3_BLOBS_SEG = "blobs";
export declare const S3_BLOBS_INDEX_FILE = "blobs-index.json";
/**
 * 条件写能力（决定「防两台设备同时写」怎么落地）：
 *  - `etag`：AWS 风格 If-Match / If-None-Match（s3 / minio / cos / kodo）；
 *  - `forbid-overwrite`：阿里云 OSS —— PutObject **不支持 If-\***（真机会回 400
 *    InvalidArgument「A header you provided implies functionality that is not implemented.」，
 *    错误码 0017-00000245；issue #109 第二层），只有 `x-oss-forbid-overwrite: true`
 *    「对象已存在即拒」这一种禁止覆盖语义。
 */
export type S3ConditionalWrite = 'etag' | 'forbid-overwrite';
export interface S3ProviderVariant {
    id: S3CompatProvider;
    /** 默认签名方言（可被 \`dialectId\` 覆盖） */
    dialectId: SigV4DialectId;
    /** SigV4 credential scope 里的服务名（s3 / oss） */
    service: string;
    /** 默认 region；缺省 = region 必填 */
    defaultRegion?: string;
    /** 端点模板（\`{region}\` 插值）；缺省 = endpoint 必填 */
    endpointTemplate?: string;
    /** 默认寻址风格：true = path-style（<endpoint>/<bucket>/<key>），false = virtual-host（<bucket>.<endpoint>/<key>） */
    defaultPathStyle: boolean;
    /** 条件写能力（见 S3ConditionalWrite；与签名方言解耦，跟着服务商走而不是跟着 dialectId 走） */
    conditionalWrite: S3ConditionalWrite;
    /**
     * 变体说明的**目录键**（自 t6 起字段是键而不是文案 —— 中文只存在于 `sync/s3/messages.ts` 的本地目录，
     * 经 `s3Msg` / `composeMsg(host, s3Msg)` 解析成当前语言；本字段本身不渲染）。
     */
    note: string;
}
/**
 * 五家变体表（\`Record<S3CompatProvider, …>\`：新增/漏写变体 typecheck 直接报错）。
 * 端点模板只是「填得省事」，任何一家都可以被 \`endpoint\` 覆盖（含端点带子路径的网关）。
 */
export declare const S3_PROVIDER_VARIANTS: Record<S3CompatProvider, S3ProviderVariant>;
/** 变体查表：非法通道 → undefined（调用方给 \`cloud.providerUnknown\` 码）。 */
export declare function s3ProviderVariant(provider: unknown): S3ProviderVariant | undefined;
/** 变体清单（顺序 = 枚举顺序；供 UI 下拉/文档生成，避免再抄一遍五家名字）。 */
export declare function s3ProviderList(): readonly S3ProviderVariant[];
/** 对象键前缀归一：去首尾斜杠；空/缺省 → 默认前缀。 */
export declare function normalizeObjectPrefix(prefix?: string): string;
/** 解析后的 S3 目标（签名与对象 URL 所需的全部事实）。 */
export interface S3Target {
    provider: S3CompatProvider;
    /** 端点（无尾斜杠；可能带子路径，如 https://gateway.example.com/s3） */
    endpoint: URL;
    region: string;
    service: string;
    bucket: string;
    prefix: string;
    pathStyle: boolean;
    dialect: SigV4Dialect;
    /** 条件写能力（来自变体表；dialectId 覆盖不影响它） */
    conditionalWrite: S3ConditionalWrite;
}
export interface S3TargetInput {
    provider: S3CompatProvider;
    bucket: string;
    endpoint?: string;
    region?: string;
    prefix?: string;
    pathStyle?: boolean;
    /** 覆盖变体默认方言（自建网关用 AWS SigV4 对接阿里云兼容层时有用） */
    dialectId?: SigV4DialectId;
}
export type S3TargetResult = {
    ok: true;
    target: S3Target;
} | {
    ok: false;
    code: CloudConfigIssueCode;
};
/**
 * 解析 S3 目标：校验 + 变体默认填充 + 端点归一。
 * 校验失败返回**稳定错误码**（无用户文案），由通道层/路由层映射成字典键。
 */
export declare function resolveS3Target(input: S3TargetInput): S3TargetResult;
/** 某 key 的对象访问地址（path-style 或 virtual-host）。 */
export declare function objectUrl(target: S3Target, key: string): string;
/**
 * 规范化 URI 路径（**恒含 bucket**）：`<basePath>/<bucket>/<key>`。
 *
 * 为什么与 `objectUrl` 分开：阿里云 OSS4 的 CanonicalURI 恒为 `/<bucket>/<key>`，与寻址风格无关
 * （官方 Go SDK `conn.go` 的 `getResourceV4` 只接 bucket + object，不看 URL 主机形态）。
 * 虚拟主机风格下请求路径里没有 bucket，若直接把 pathname 当规范路径，签出来的哈希就与服务端
 * 不一致 ⇒ `SignatureDoesNotMatch`（issue #109）。path-style 下两者相等，仍统一走这里，
 * 保证两条分支逐字同源。
 */
export declare function canonicalObjectPath(target: S3Target, key: string): string;
/** 快照对象键。 */
export declare function snapshotKey(prefix: string, id: string): string;
/** 索引对象键。 */
export declare function indexKey(prefix: string): string;
/** blob 对象键（内容寻址）。 */
export declare function blobKey(prefix: string, hash: string): string;
/** blob 索引对象键。 */
export declare function blobIndexKey(prefix: string): string;
