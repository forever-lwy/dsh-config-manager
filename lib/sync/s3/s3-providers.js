/**
 * S3 兼容系**变体表 + 目标解析 + 对象 URL**（一份实现覆盖五家）。
 *
 * 关键事实（竞品 \`@dickpy/dsh-cloud-sync\` v0.20.9 读码确证）：S3 / OSS / COS / MinIO / Kodo
 * 五家的差异**只有** endpoint、region、寻址风格（path-style vs virtual-host）与签名方言，
 * 协议与对象操作完全同构。于是「一份实现 + 变体表」而不是五份复制：
 *  - 变体表 → 变体默认值（\`S3_PROVIDER_VARIANTS\`）；
 *  - 每个变体可被用户显式覆盖（endpoint / region / pathStyle / dialectId）——
 *    自建网关（MinIO、Ceph、RGW、Akamai 等）都靠覆盖落到同一实现上。
 *
 * 方言依据：
 *  - AWS S3 / MinIO / COS / Kodo：AWS SigV4（\`AWS4-HMAC-SHA256\`，头名 x-amz-*）；
 *  - 阿里云 OSS：OSS4（\`OSS4-HMAC-SHA256\`，头名 x-oss-*、载荷 UNSIGNED-PAYLOAD，
 *    见阿里云《在 Header 中包含 V4 签名》+ 官方 \`OSSV4Signer\`）。
 * 说明：变体默认值是**按各方官方文档定的**，本批次未对真机端点做联网验证（写作用域与
 * 环境都不允许），因此每个默认都可被覆盖，且验证期报错会指向具体可改的配置项。
 */
import { sigV4Dialect, uriEncode } from './sigv4.js';
import { S3_COMPAT_PROVIDERS, isS3CompatProvider, validateCloudBucket, validateCloudEndpoint, validateCloudPrefix, validateCloudRegion, } from '../sync-config.js';
/** 对象键默认前缀（所有通道共用；与 WebDAV 通道的集合名保持一致，便于跨通道迁移）。 */
export const S3_DEFAULT_PREFIX = 'dsh-config-manager';
/** S3 通道内的固定对象名。 */
export const S3_INDEX_FILE = 'index.json';
export const S3_BLOBS_SEG = 'blobs';
export const S3_BLOBS_INDEX_FILE = 'blobs-index.json';
/**
 * 五家变体表（\`Record<S3CompatProvider, …>\`：新增/漏写变体 typecheck 直接报错）。
 * 端点模板只是「填得省事」，任何一家都可以被 \`endpoint\` 覆盖（含端点带子路径的网关）。
 */
export const S3_PROVIDER_VARIANTS = {
    s3: {
        id: 's3', dialectId: 'aws4', service: 's3', defaultRegion: 'us-east-1',
        endpointTemplate: 'https://s3.{region}.amazonaws.com', defaultPathStyle: false,
        conditionalWrite: 'etag',
        note: 'sync.s3.providerNoteS3',
    },
    oss: {
        id: 'oss', dialectId: 'oss4', service: 'oss',
        endpointTemplate: 'https://oss-{region}.aliyuncs.com', defaultPathStyle: false,
        conditionalWrite: 'forbid-overwrite',
        note: 'sync.s3.providerNoteOss',
    },
    cos: {
        id: 'cos', dialectId: 'aws4', service: 's3',
        endpointTemplate: 'https://cos.{region}.myqcloud.com', defaultPathStyle: false,
        conditionalWrite: 'etag',
        note: 'sync.s3.providerNoteCos',
    },
    minio: {
        id: 'minio', dialectId: 'aws4', service: 's3', defaultRegion: 'us-east-1', defaultPathStyle: true,
        conditionalWrite: 'etag',
        note: 'sync.s3.providerNoteMinio',
    },
    kodo: {
        id: 'kodo', dialectId: 'aws4', service: 's3',
        endpointTemplate: 'https://s3-{region}.qiniucs.com', defaultPathStyle: false,
        conditionalWrite: 'etag',
        note: 'sync.s3.providerNoteKodo',
    },
};
/** 变体查表：非法通道 → undefined（调用方给 \`cloud.providerUnknown\` 码）。 */
export function s3ProviderVariant(provider) {
    if (!isS3CompatProvider(provider))
        return undefined;
    return S3_PROVIDER_VARIANTS[provider];
}
/** 变体清单（顺序 = 枚举顺序；供 UI 下拉/文档生成，避免再抄一遍五家名字）。 */
export function s3ProviderList() {
    return S3_COMPAT_PROVIDERS.map((p) => S3_PROVIDER_VARIANTS[p]);
}
/** 对象键前缀归一：去首尾斜杠；空/缺省 → 默认前缀。 */
export function normalizeObjectPrefix(prefix) {
    if (prefix === undefined)
        return S3_DEFAULT_PREFIX;
    const cleaned = prefix.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    return cleaned === '' ? S3_DEFAULT_PREFIX : cleaned;
}
/** 用 region 填端点模板（\`{region}\`）；模板缺失 → undefined。 */
function fillEndpointTemplate(template, region) {
    if (template === undefined)
        return undefined;
    return template.replace('{region}', region);
}
/**
 * 解析 S3 目标：校验 + 变体默认填充 + 端点归一。
 * 校验失败返回**稳定错误码**（无用户文案），由通道层/路由层映射成字典键。
 */
export function resolveS3Target(input) {
    const variant = s3ProviderVariant(input.provider);
    if (variant === undefined)
        return { ok: false, code: 'cloud.providerUnknown' };
    const region = (input.region ?? variant.defaultRegion ?? '').trim();
    const endpointRaw = (input.endpoint ?? '').trim();
    const endpointCandidate = endpointRaw !== ''
        ? endpointRaw
        : (fillEndpointTemplate(variant.endpointTemplate, region) ?? '');
    if (endpointCandidate === '')
        return { ok: false, code: 'cloud.endpointRequired' };
    const endpointIssue = validateCloudEndpoint(endpointCandidate);
    if (endpointIssue !== null)
        return { ok: false, code: endpointIssue };
    const regionIssue = validateCloudRegion(region);
    if (regionIssue !== null)
        return { ok: false, code: regionIssue };
    const bucketIssue = validateCloudBucket(input.bucket);
    if (bucketIssue !== null)
        return { ok: false, code: bucketIssue };
    const prefix = normalizeObjectPrefix(input.prefix);
    const prefixIssue = validateCloudPrefix(prefix);
    if (prefixIssue !== null)
        return { ok: false, code: prefixIssue };
    const parsed = new URL(endpointCandidate);
    // 端点路径去尾斜杠（保留子路径），query/hash 已在 validateCloudEndpoint 拒绝
    const normalizedPath = parsed.pathname.replace(/\/+$/, '');
    const endpoint = new URL(parsed.origin + normalizedPath);
    return {
        ok: true,
        target: {
            provider: input.provider,
            endpoint,
            region,
            service: variant.service,
            bucket: input.bucket.trim(),
            prefix,
            pathStyle: input.pathStyle ?? variant.defaultPathStyle,
            dialect: sigV4Dialect(input.dialectId ?? variant.dialectId),
            conditionalWrite: variant.conditionalWrite,
        },
    };
}
/**
 * 对象 key 的路径编码（逐段 uriEncode，保留分隔符）。
 *
 * audit-sync sync-F7：编码口径必须与 SigV4 的规范化口径（sigv4.uriEncode：RFC 3986
 * 未保留字符集 A-Za-z0-9-_.~ 之外一律 %XX）**逐字一致**，否则 ! ' ( ) * 这类
 * encodeURIComponent 不编码的字符会让「实际发出的 path」与「签名的 canonicalURI」分叉
 * （签名被服务端判为不匹配），也会让同一 key 在不同实现下指向不同对象。
 */
function encodeObjectKey(key) {
    return key.split('/').map((seg) => uriEncode(seg, true)).join('/');
}
/** 端点自带的基础路径（如反向代理子路径），已去尾斜杠。 */
function endpointBasePath(target) {
    return target.endpoint.pathname.replace(/\/+$/, '');
}
/** 某 key 的对象访问地址（path-style 或 virtual-host）。 */
export function objectUrl(target, key) {
    const encodedKey = encodeObjectKey(key);
    const basePath = endpointBasePath(target);
    const origin = target.endpoint.origin;
    if (target.pathStyle)
        return origin + basePath + '/' + target.bucket + '/' + encodedKey;
    // virtual-host：桶名做主机名首段（桶名已校验为合法 DNS 标签组合）
    const host = target.bucket + '.' + target.endpoint.host;
    return target.endpoint.protocol + '//' + host + basePath + '/' + encodedKey;
}
/**
 * 规范化 URI 路径（**恒含 bucket**）：`<basePath>/<bucket>/<key>`。
 *
 * 为什么与 `objectUrl` 分开：阿里云 OSS4 的 CanonicalURI 恒为 `/<bucket>/<key>`，与寻址风格无关
 * （官方 Go SDK `conn.go` 的 `getResourceV4` 只接 bucket + object，不看 URL 主机形态）。
 * 虚拟主机风格下请求路径里没有 bucket，若直接把 pathname 当规范路径，签出来的哈希就与服务端
 * 不一致 ⇒ `SignatureDoesNotMatch`（issue #109）。path-style 下两者相等，仍统一走这里，
 * 保证两条分支逐字同源。
 */
export function canonicalObjectPath(target, key) {
    return endpointBasePath(target) + '/' + target.bucket + '/' + encodeObjectKey(key);
}
/** 快照对象键。 */
export function snapshotKey(prefix, id) {
    return prefix + '/' + id + '.json';
}
/** 索引对象键。 */
export function indexKey(prefix) {
    return prefix + '/' + S3_INDEX_FILE;
}
/** blob 对象键（内容寻址）。 */
export function blobKey(prefix, hash) {
    return prefix + '/' + S3_BLOBS_SEG + '/' + hash;
}
/** blob 索引对象键。 */
export function blobIndexKey(prefix) {
    return prefix + '/' + S3_BLOBS_INDEX_FILE;
}
//# sourceMappingURL=s3-providers.js.map