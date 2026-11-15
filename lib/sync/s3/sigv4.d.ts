/** 签名方言：AWS SigV4 与阿里云 OSS4 共用一套流程，差异全部收敛在这里。 */
export type SigV4DialectId = 'aws4' | 'oss4';
/** 「不校验载荷」的载荷哈希字面量（OSS4 目前只支持该取值）。 */
export declare const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
/** 规范化头集合的选择口径。 */
export type SigV4HeaderSelection = 
/** 全部将发送的头都参与规范化（AWS SigV4） */
'all'
/** 只有 content-type/content-md5 与 x-oss-* 前缀头（+ 显式附加头）参与（阿里云 OSS4） */
 | 'oss-default';
export interface SigV4Dialect {
    id: SigV4DialectId;
    /** 待签字符串第一行 / 授权头前缀，如 AWS4-HMAC-SHA256 */
    algorithm: string;
    /** 携带签名时刻的头名（x-amz-date / x-oss-date） */
    dateHeader: string;
    /** 携带载荷哈希的头名（x-amz-content-sha256 / x-oss-content-sha256） */
    contentShaHeader: string;
    /** 派生密钥第一层的密钥前缀（AWS4 / aliyun_v4） */
    secretKeyPrefix: string;
    /** scope 末段与派生密钥最后一层的字面量（aws4_request / aliyun_v4_request） */
    terminator: string;
    headerSelection: SigV4HeaderSelection;
    /** 载荷哈希形态：sha256 = 真实 SHA-256 十六进制；unsigned = UNSIGNED-PAYLOAD */
    payloadHash: 'sha256' | 'unsigned';
    /** 授权头里头清单的字段名（SignedHeaders / AdditionalHeaders） */
    headerListLabel: 'SignedHeaders' | 'AdditionalHeaders';
    /**
     * 规范化查询串里「有键无值」的写法：
     *  - `equals`（AWS SigV4）：`?acl` 写成 `acl=`；
     *  - `bare`（OSS4）：只写键名 `acl`（官方 Go SDK `getSubResource` 对 nil/空值只拼键）。
     */
    emptyQueryValue: 'equals' | 'bare';
}
/** AWS SigV4（S3 / MinIO / COS / Kodo 共用）。 */
export declare const AWS_SIG_V4: SigV4Dialect;
/** 阿里云 OSS4（OSS 原生 V4；与 AWS 同构但头名/前缀/终止符/载荷形态不同）。 */
export declare const OSS_SIG_V4: SigV4Dialect;
/** 方言查表（非法 id 抛错：绝不静默回落成 AWS，否则 OSS 会以「签名不对」的形式失败）。 */
export declare function sigV4Dialect(id: SigV4DialectId): SigV4Dialect;
/** SHA-256 十六进制小写。 */
export declare function sha256Hex(data: string | Uint8Array): string;
/** HMAC-SHA256（返回 Buffer，供逐层派生密钥）。 */
export declare function hmacSha256(key: string | Uint8Array, data: string): Buffer;
/**
 * 逐层派生签名密钥：prefix+secret → date → region → service → terminator（RFC/厂商文档同构）。
 * AWS：AWS4+SK → dateStamp → region → service → aws4_request；
 * OSS：aliyun_v4+SK → dateStamp → region → oss → aliyun_v4_request。
 */
export declare function deriveSigningKey(params: {
    secretAccessKey: string;
    dateStamp: string;
    region: string;
    service: string;
    dialect: SigV4Dialect;
}): Buffer;
/** 签名时刻格式 \`YYYYMMDDTHHMMSSZ\`（UTC）。 */
export declare function formatAmzDate(date: Date): string;
/** 签名日期段 \`YYYYMMDD\`（UTC）。 */
export declare function formatDateStamp(amzDate: string): string;
/**
 * URI 编码（RFC 3986 未保留字符集 A-Za-z0-9-_.~ 之外一律 %XX 大写）。
 * \`encodeSlash=false\` 时保留路径分隔符（规范化 URI 用），其余场景（查询串）编码它。
 */
export declare function uriEncode(value: string, encodeSlash: boolean): string;
/** 规范化 URI：先解码再逐段编码（避免 URL 归一化后的二次编码），保留分隔符。 */
export declare function canonicalUri(pathname: string): string;
/**
 * 规范化查询串：按「编码后的键、编码后的值」字典序排序。
 *
 * 空值写法按方言分派（`emptyQueryValue`）：AWS 写 `key=`，OSS4 只写 `key` —— 官方 Go SDK
 * 的 `getSubResource` 对 nil/空值确实只拼键名（金标向量 `TestAuthV4Header` 的
 * `%2Bparam2&%7Cparam2&param2` 可验），写成 `param2=` 会让规范请求哈希不同。
 */
export declare function canonicalQueryString(searchParams: URLSearchParams, emptyQueryValue?: 'equals' | 'bare'): string;
export interface SigV4RequestInput {
    method: string;
    /** 完整请求 URL（含 query；不带凭据） */
    url: string;
    /** 除 host/date/content-sha/authorization 之外要发送的头（键大小写不敏感） */
    headers?: Record<string, string>;
    /** 请求体（缺省 = 空体） */
    body?: string | Uint8Array;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    service: string;
    dialect: SigV4Dialect;
    /** 签名时刻（缺省 = 当前时间；测试注入固定值即可得到确定性签名） */
    now?: Date;
    /** 额外声明参与签名的头名（小写；OSS4 用于把 host/content-length 等显式拉进签名） */
    additionalSignedHeaders?: readonly string[];
    /**
     * 覆盖规范化 URI 的路径（缺省 = \`url.pathname\`）。
     *
     * 为什么需要：阿里云 OSS 的 CanonicalURI **恒为 \`/<bucket>/<key>\`**，而虚拟主机风格下请求
     * 路径里只有 key（bucket 在 Host 头里）。不接这个口子，签名用的路径就比服务端少一段
     * \`/<bucket>\` ⇒ 规范请求哈希不同 ⇒ \`SignatureDoesNotMatch\`（issue #109 真机现象）。
     * 通道层用 \`canonicalObjectPath(target, key)\` 构造并传入。
     */
    canonicalPath?: string;
    /**
     * 是否注入并签名 \`<contentShaHeader>\`（缺省 true = S3 系必需）。
     *
     * 为什么留一个开关：SigV4 规范里该头对**非** S3 的 AWS 服务并非必需（AWS 官方
     * sig-v4-test-suite 的 get-vanilla 请求就只带 host + x-amz-date），而少数自建 S3 网关/前置
     * 代理会对不认识的 x-amz-* 头直接 400 —— 关掉它即可用同一份实现对接这类端点。
     */
    includeContentShaHeader?: boolean;
}
export interface SigV4RequestOutput {
    /** 需要注入请求的全部头（含 host / date / content-sha / authorization） */
    headers: Record<string, string>;
    authorization: string;
    canonicalRequest: string;
    stringToSign: string;
    credentialScope: string;
    signature: string;
    /** 参与签名的头名（小写、字典序、分号分隔） */
    signedHeaders: string;
    /** 载荷哈希头取值（sha256 十六进制 或 UNSIGNED-PAYLOAD） */
    payloadHash: string;
}
/**
 * 计算一次请求的 SigV4 签名并返回待注入的头。
 * 幂等且无副作用：同一输入（含同一 now）两次调用逐字相同。
 */
export declare function signRequest(input: SigV4RequestInput): SigV4RequestOutput;
