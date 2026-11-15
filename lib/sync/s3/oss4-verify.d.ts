import type { S3RequestFn } from './s3-transport.ts';
export interface Oss4VerifyConfig {
    bucket: string;
    region: string;
    /** AccessKeyId（非密钥；服务端要核对 Credential 里的这一串） */
    accessKeyId: string;
    /** AccessKey Secret（仅用于重算签名，绝不回显/入日志） */
    secretAccessKey: string;
}
export interface Oss4VerifyResult {
    ok: boolean;
    /** 失败原因（人类可读；成功时为空串） */
    reason: string;
    /** 服务端重建的规范请求（失败时回给客户端，模拟 OSS 回显 StringToSign） */
    canonicalRequest: string;
    stringToSign: string;
    /** 服务端算出的签名 */
    signature: string;
    /** 解码后的对象键（不含前导斜杠；桶级请求为空串） */
    objectKey: string;
    /** 是否桶级请求（无对象键） */
    bucketLevel: boolean;
}
/** 服务端口径的百分号编码：与 Go `url.QueryEscape` 对齐（只留 A-Za-z0-9-_.~），空格 %20。 */
export declare function ossEncode(segment: string): string;
/** 服务端验签：重建规范请求 → 重算签名 → 与 Authorization 里的 Signature 逐字比较。 */
export declare function verifyOssV4(init: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
}, cfg: Oss4VerifyConfig): Oss4VerifyResult;
interface StoredObject {
    body: string;
    etag: string;
}
/**
 * 内存 OSS（验签通过才落盘/回读）：返回可直接注入 S3Transport 的 `request`，
 * 以及验签成功/失败流水，供测试与联调脚本断言。
 */
export declare function makeOssVerifyServer(cfg: Oss4VerifyConfig): {
    request: S3RequestFn;
    objects: Map<string, StoredObject>;
    verified: string[];
    failed: string[];
};
export {};
