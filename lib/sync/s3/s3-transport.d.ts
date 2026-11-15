import type { MsgFunc } from '../../core/msg-types.ts';
import type { GcSkipCode } from '../gc-skip.ts';
import { SyncTransportError } from '../transport.ts';
import type { SyncProbeResult, SyncRetryOptions, SyncSnapshot, SyncSnapshotMeta, SyncTransport, SyncTransportErrorOptions } from '../transport.ts';
import type { SigV4DialectId } from './sigv4.ts';
import type { S3Target } from './s3-providers.ts';
import type { S3CompatProvider } from '../sync-config.ts';
/** 请求选项：headers / body / 覆盖默认超时（ms；0 = 不超时） */
export interface S3RequestOptions {
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
}
/** 请求响应最小形状（兼容 fetch Response 的 status/ok/text()） */
export interface S3Response {
    readonly status: number;
    readonly ok: boolean;
    readonly headers?: Record<string, string>;
    text(): Promise<string>;
}
/** 可注入的请求函数（测试 mock 用）；method/url/options */
export type S3RequestFn = (method: string, url: string, options?: S3RequestOptions) => Promise<S3Response>;
/** 凭据提供者：AccessKey Secret 只从这里读取，绝不落盘/进日志/回传 */
export interface S3CredentialProvider {
    getSecretAccessKey(): Promise<string>;
}
export interface S3TransportOptions {
    /** 变体通道（s3 / oss / cos / minio / kodo） */
    provider: S3CompatProvider;
    /** 桶名 */
    bucket: string;
    /** AccessKey ID（非密钥，可回显） */
    accessKeyId: string;
    /** AccessKey Secret 提供者 */
    credentials: S3CredentialProvider;
    /** 端点（缺省取变体模板；自建网关必填） */
    endpoint?: string;
    /** region（缺省取变体默认；oss/cos/kodo 必填） */
    region?: string;
    /** 对象键前缀（缺省 dsh-config-manager） */
    prefix?: string;
    /** 寻址风格（缺省取变体默认：MinIO path-style，其余 virtual-host） */
    pathStyle?: boolean;
    /** 覆盖变体默认签名方言 */
    dialectId?: SigV4DialectId;
    /** 可注入请求（测试 mock 用）；缺省 = 经 utils/proxy 的出站请求（代理感知） */
    request?: S3RequestFn;
    /** 单请求超时 ms；缺省 = 两条既有通道共用的 DEFAULT_SYNC_TIMEOUT_MS（120000）；0 = 不超时 */
    timeoutMs?: number;
    /** 幂等读操作（list/download）的网络重试参数；写操作（upload/delete）不使用 */
    retry?: SyncRetryOptions;
    /** 签名时刻（测试注入固定值以得到确定性签名）；缺省 = 当前时间 */
    now?: () => Date;
    /** 消息翻译器（缺省 zh；见 ./messages.ts） */
    msg?: MsgFunc;
}
/** S3 通道错误：继承统一错误基类（kind / retryable / status 对上层可见）。 */
export declare class S3TransportError extends SyncTransportError {
    constructor(message: string, opts?: SyncTransportErrorOptions);
}
/** 实现 SyncTransport 的 S3 兼容系通道（五家共用同一实现，差异见 s3-providers 的变体表）。 */
export declare class S3Transport implements SyncTransport {
    /** 通道类型 = 变体 id（s3 / oss / cos / minio / kodo），供同步历史与状态如实标注来源 */
    readonly type: string;
    private readonly target;
    private readonly o;
    /** 最近一轮 blob GC 的放弃码（`null` = 跑完或未触发；SYN-04）。 */
    private gcSkip;
    /** 最近一轮 blob GC 是否因「无法证明引用集完整」而整体放弃（`null` = 正常跑完），供上层给用户提示。 */
    get lastGcSkip(): GcSkipCode | null;
    constructor(options: S3TransportOptions);
    /** 解析后的目标（只读；端点/region/寻址风格/方言；**不含任何密钥**）。 */
    get resolvedTarget(): S3Target;
    /** 列出远端已有快照（按 createdAt 升序）；index.json 缺失视为空。 */
    list(): Promise<SyncSnapshotMeta[]>;
    /** 上传快照（同 id 覆盖，幂等友好）；内容未变时零传输直接返回远端 meta。
     *
     * **写路径三态（audit-sync sync-N1 / t66）**：索引 404 只是「缺信息」—— 远端已有历史内容时
     * 一律**中止本次上传（零写入）**，绝不按空集合做读改写（与 delete() 同口径）。 */
    upload(snapshot: SyncSnapshot): Promise<SyncSnapshotMeta>;
    /** 下载快照完整载荷；不存在的 id 必须抛错（契约）。 */
    download(id: string): Promise<SyncSnapshot>;
    /** 删除远端快照（不存在视为成功）；一并摘除索引条目并回收无人引用的 blob。 */
    delete(id: string): Promise<void>;
    /** 条件写失败：远端索引在本次读取之后被别人改过 —— 中止写入让用户重跑（cloud-sync 借鉴项 ①）。 */
    private concurrentWrite;
    /**
     * OSS 方言的「ETag 条件写」替身（issue #109 第二层）：PutObject 既无 If-Match 也无
     * If-None-Match，`x-oss-forbid-overwrite` 只能表达「别覆盖已存在的对象」，表达不了
     * 「远端必须还是我读到的那一版」。所以索引进已存在时改成**写前 HEAD 复核 ETag**：
     * 变了 / 对象没了 → 按并发写中止（零写入）。
     *
     * **不是原子的**：复核与 PUT 之间仍有窗口（服务端不支持条件写就没有真正的解），
     * 比无保护强、比 If-Match 弱 —— 如实登记在 docs/adr/0003。
     * 其它方言（etag）与「服务端不给 ETag」两种情况一律直接放行，不改既有行为。
     */
    private reassertIndexEtag;
    /**
     * 条件写失败分类（issue #109 第二层复核）：`isPreconditionFailedStatus` 只看「状态码像不像」，
     * 这里再问报文一句确认「对象确实已存在」。OSS 的 **409 不止 FileAlreadyExists** ——
     * FileImmutable（Bucket 数据处于保护状态，删改都会被拒）同为 409，一律按并发写报
     * 「别的设备改过索引」就是假话。报文读不出时仍按并发写处理（宁可让用户重跑一次，
     * 不吞掉真冲突）。412 是 If-Match 语义，恒为并发写。
     */
    private conditionalFailure;
    /**
     * 连通性探针（cloud-sync 借鉴项 ②）：HEAD 桶证明端点/凭据/桶可达，再读一次索引回报快照数。
     * 重定向（301/307/308）时读 x-amz-bucket-region 直接把「region 该填什么」告诉用户 ——
     * 这是 S3 兼容端点最常见的失败原因（AWS/OSS/COS/Kodo 各自的 region 值不同）。
     */
    probe(): Promise<SyncProbeResult>;
    private assertSafeId;
    /** 读取一次 AccessKey Secret（失败 → 空串，让请求按「无凭据」失败并把原因如实带回） */
    private secretOnce;
    /** 发送一次已签名请求；网络错误/超时归一为带分类的通道错误 */
    private send;
    /** 读错误响应体（未脱敏原文，截断到 ERR_BODY_MAX；读不出按空串） */
    private errorBody;
    /** 构造 HTTP 非 2xx 失败消息：附上脱敏后的响应体片段（截断） */
    private failMessage;
    private failText;
    /** 识别超时错误（AbortError / TimeoutError） */
    private isTimeout;
    /** 错误消息脱敏：AccessKey Secret（原文与 URL 编码形态）一律替换 */
    private mask;
    /**
     * 读索引。**三态语义**（audit-sync sync-N1 / t66，与 WebDAV 同型）：
     *  - 200 + 合法数组 → 条目；404 → 缺索引（**缺信息**，不是「集合为空」）；
     *    写路径（**upload / delete**）不得据此做读改写 —— upload 在「远端已有内容」时显式中止，
     *    delete 直接返回；其它非 2xx / 非法 → 抛错（F2 语义）。
     */
    /**
     * 读索引的**带缺失标志**版本（audit-sync sync-N1，与 WebDAV 同型）：
     * 404 → `missing = true`（缺信息，不是事实）；其它非 2xx / 非法 → 抛错（F2 语义）。
     */
    private readIndexDetailed;
    private parseIndex;
    private parseSnapshot;
    /**
     * 远端是否已存在历史内容（t66）。判据 = **blob 仓索引对象存在**：它是本通道唯一的、
     * 无需列举整个桶就能读到的「这里以前写过」证据（本实现未用 ListObjects）。
     *
     * 失败安全：读不出来（网络 / 5xx）一律当作**有内容** —— 宁可让这次上传显式失败，也不冒
     * 「把权威索引写成只有本条目」的风险（与「宁可留垃圾，不可删在用的」同口径）。
     * 已知残余（如实登记）：远端只有**未外置**的历史快照、索引又缺失时本判据看不出内容（无列举能力）。
     */
    private remoteHasPriorContent;
    /** 读取 blob 索引（哈希 → 写入时间 ms）；只读失败即抛，绝不回落成空索引，见 readBlobIndexDetailed。 */
    private readBlobIndex;
    /**
     * audit-sync sync-P6-4（P3）：与 WebDAV 同型 —— 「读失败」与「确实没有索引」必须分开。
     *
     * 旧实现把非 404 与坏 JSON 一律当成空索引，紧接着 appendBlobIndex 读→合并→整体 PUT 覆盖，
     * 一次 5xx 抖动就把远端已登记条目全丢掉（GC 从此看不见这些 blob，等于远端漏账）。三态语义：
     *  - 404 → missing = true：桶里确实没有 blob 索引，按空处理是安全的（不会被覆盖成假集合）；
     *  - 其它非 2xx（5xx / 403 / …）→ 抛错（可重试）：读不出来就**不许**整体覆盖；
     *  - 200 但坏 JSON / 非对象 → 抛 protocol（不可重试）：索引损坏是远端状态问题，覆盖写会抹掉残存记录。
     *
     * 最坏情况（可重试失败）：本可跳过的 blob 被重传一遍，或本次 blob 漏登记（只占空间，不误删）。
     */
    private readBlobIndexDetailed;
    private writeBlobIndex;
    private appendBlobIndex;
    /** blob 仓端口：命中索引 = 零传输；失败安全取舍与 WebDAV 通道一致 */
    private blobSink;
    /** 上传前把外置分区换成引用形态（加密快照整体密文，永不外置） */
    private externalize;
    /** 下载后把引用形态还原成文件分区（缺 blob → 硬失败，绝不降级为空分区） */
    private rehydrate;
    /** blob 仓 GC：逐份读仍存在的快照收集引用，删除无人引用且超保护窗的 blob；
     *  读不坏任何一份快照 → 正常回收，否则本轮整体放弃（宁可留垃圾，不可删在用的）。
     *  SYN-04（P1）：**404 也放弃本轮** —— 条目在但文件 404 = 拿不到内容 = 无法证明「没人引用」，
     *  按残集回收会删掉仍在用的 blob（与 WebDAV 同型，口径一致）。 */
    private gcBlobStore;
}
