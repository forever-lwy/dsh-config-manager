import type { GcSkipCode } from '../gc-skip.ts';
import '../messages.ts';
import type { MsgFunc } from '../../core/messages.ts';
import { SyncTransportError } from '../transport.ts';
import type { SyncProbeResult, SyncRetryOptions, SyncSnapshot, SyncSnapshotMeta, SyncTransport, SyncTransportErrorOptions } from '../transport.ts';
/** 请求选项：headers / body / 覆盖默认超时（ms；0 = 不超时） */
export interface WebDavRequestOptions {
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
}
/** 请求响应最小形状（兼容 fetch Response 的 status/ok/text()；headers 供重定向读 Location） */
export interface WebDavResponse {
    readonly status: number;
    readonly ok: boolean;
    /** 响应头（可选：注入的 mock 可省略，默认 request 总会带上，重定向跟随需要 location） */
    readonly headers?: Record<string, string>;
    text(): Promise<string>;
}
/** 可注入的请求函数（测试 mock 用）；method/url/options */
export type WebDavRequestFn = (method: string, url: string, options?: WebDavRequestOptions) => Promise<WebDavResponse>;
/** 凭据提供者：password 只从这里读取，绝不落盘/进日志 */
export interface WebDavCredentialProvider {
    getPassword(): Promise<string>;
}
export interface WebDavTransportOptions {
    /** WebDAV 远端根 URL（http/https），如 https://dav.example.com/dav/config */
    baseUrl: string;
    /** HTTP Basic 认证用户名 */
    username: string;
    /** 密码提供者（HTTP Basic 密码） */
    credentials: WebDavCredentialProvider;
    /** 可注入 request（测试 mock 用）；缺省 = 全局 fetch + AbortController 超时 */
    request?: WebDavRequestFn;
    /** 单请求超时 ms；缺省 = 两条通道共用的 DEFAULT_SYNC_TIMEOUT_MS（120000）；0 = 不超时 */
    timeoutMs?: number;
    /** 幂等读操作（list/download）的网络重试参数；缺省 attempts=3、250ms 起指数退避。
     *  写操作（upload/delete）**不使用**该参数（PUT 快照与 PUT index 之间失败会留孤儿文件）。 */
    retry?: SyncRetryOptions;
    /** 消息翻译器（缺省 zh） */
    msg?: MsgFunc;
}
/**
 * WebDAV 通道错误：继承统一错误基类（kind / retryable / status 分类对上层可见）。
 * 分类口径：HTTP 状态走 classifyHttpStatus，请求层异常走 classifyNetworkErrorText。
 */
export declare class WebDavTransportError extends SyncTransportError {
    constructor(message: string, opts?: SyncTransportErrorOptions);
}
/** 实现 SyncTransport 的 WebDAV 通道。所有网络操作经 request 注入（缺省 defaultRequest，自动跟随重定向）。 */
export declare class WebDavTransport implements SyncTransport {
    readonly type = "webdav";
    private readonly o;
    /** 最近一轮 blob GC 的放弃码（`null` = 跑完或未触发；SYN-04）。 */
    private gcSkip;
    /** 最近一轮 blob GC 是否因「无法证明引用集完整」而整体放弃（`null` = 正常跑完），供上层给用户提示。 */
    get lastGcSkip(): GcSkipCode | null;
    constructor(options: WebDavTransportOptions);
    /**
     * 最近一次 list() 里读不出来的远端快照（issue #59；index.json 损坏时带上原因）。
     *
     * WebDAV 是「index.json 单点描述所有快照」的形态，坏一条就是坏整份索引 —— 这里如实
     * 暴露原因，让「列表为空/不完整」与「远端确实没有」能被区分开。
     */
    private readErrors;
    /** 最近一次列表里读不出来的远端快照（含原因）；供上层如实呈现，绝不静默 */
    get unreadableSnapshots(): readonly {
        file: string;
        reason: string;
    }[];
    /** 列出远端已有快照（按 createdAt 升序）。index.json 缺失视为空。 */
    list(): Promise<SyncSnapshotMeta[]>;
    /** 上传快照：幂等 MKCOL → 快照级跳过判定（同 id 且内容全等则免上传）→ PUT <id>.json
     *  → 合并写回 index.json；返回远端 meta（跳过时）或 computeSnapshotMeta。
     *  序列化经 snapshot-json：文件类分区字节以 base64 传输（JSON 无法直传 Uint8Array）。
     *
     * **写路径三态（audit-sync sync-N1 / t66）**：索引 404 只是「缺信息」—— 远端已有历史内容时
     * 一律**中止本次上传（零写入）**，绝不按空集合做读改写（见下方实现处注释）。 */
    upload(snapshot: SyncSnapshot): Promise<SyncSnapshotMeta>;
    /** 下载快照完整载荷。不存在的 id 必须抛错（契约）。 */
    download(id: string): Promise<SyncSnapshot>;
    /** 删除远端快照并从 index 摘除（写回合并后的 index）；文件不存在视为成功。 */
    delete(id: string): Promise<void>;
    private blobsColUrl;
    private blobUrl;
    private blobsIndexUrl;
    /** 幂等创建 blobs 集合（405/301 等「已存在」语义一律视为成功，与 ensureCollection 同口径）。 */
    private ensureBlobsCollection;
    /**
     * 把本次新写入的 blob 合并进远端索引（写失败 → 抛错，调用方看到的是上传失败而非静默漏记）。
     * audit-sync sync-P6-4（P3）：这里的读失败必须上抛 —— 整体 PUT 会覆盖远端已登记条目。
     */
    private appendBlobIndex;
    /**
     * 远端是否已存在历史内容（t66）。判据 = **blob 仓索引文件存在**：它是本通道在远端唯一的、
     * 无需目录列举就能读到的「这里以前写过」证据（WebDAV 的 PROPFIND 在本客户端未实现，见 BLOBS_SEG 注释）。
     *
     * 失败安全：读不出来（网络 / 5xx / 非法 JSON）一律当作**有内容** —— 宁可让这次上传显式失败，
     * 也不冒「把权威索引写成只有本条目」的风险（与「宁可留垃圾，不可删在用的」同口径）。
     *
     * 已知残余（如实登记）：远端只有**未外置**的历史快照、索引又缺失时，本判据看不出内容（无列举
     * 能力 ⇒ 无法自证），此时仍走读改写路径。C7 的伤害面（blob 被回收）恰由本判据覆盖。
     */
    private remoteHasPriorContent;
    /** 读取 blob 索引（哈希 → 写入时间 ms）；只读失败即抛，绝不回落成空索引，见 readBlobIndexDetailed。 */
    private readBlobIndex;
    /**
     * audit-sync sync-P6-4（P3）：读 blob 索引的**带缺失标志**版本 —— 「读失败」与「确实没有索引」必须分开。
     *
     * 旧实现把 5xx / 坏 JSON / 非法结构一律当成空索引返回，紧接着 appendBlobIndex 读→合并→**整体 PUT**，
     * 于是「一次读抖动」= 远端索引被覆盖成本次新增的那几条，已登记条目全丢（GC 从此看不见这些 blob，
     * 等于远端漏账；再叠加 delete 的 GC 就可能删掉它们）。语义因此必须三态：
     *  - 404 / 405 / 501 → missing = true：**缺资源**。405/501 是部分 WebDAV 服务端表达「没有这个资源」
     *    的方言（与 remoteHasPriorContent 同口径），此时确实没有索引可丢，按空处理是安全的；
     *  - 其它非 2xx（5xx / 403 / …）→ 抛错（可重试）：读不出来就**不许**整体覆盖，让上传显式失败；
     *  - 200 但坏 JSON / 非对象 → 抛 protocol（不可重试）：索引损坏是远端状态问题，覆盖写会抹掉残存记录。
     *
     * 最坏情况（可重试失败）：本可跳过的 blob 被重传一遍，或本次 blob 漏登记（只占空间，不误删）。
     */
    private readBlobIndexDetailed;
    private writeBlobIndex;
    /**
     * blob 仓端口。`index` 是「仓里有哪些 blob」的权威视图（GC 与跳过判定同源）：
     * 命中索引 = 零传输；失败安全的取舍见 BLOBS_SEG 注释。
     */
    private blobSink;
    /** 上传前把外置分区换成引用形态（加密快照整体密文，永不外置）。 */
    private externalize;
    /** 下载后把引用形态还原成文件分区（缺 blob → 硬失败）。 */
    private rehydrate;
    /**
     * blob 仓 GC（P1-4）：逐份读取**仍存在**的快照 JSON，收集被引用的哈希，删除无人引用且
     * 超过保护窗口的 blob。读不坏任何一份快照 → 正常回收；否则本轮整体放弃（宁可留垃圾，不可删在用的）。
     *
     * SYN-04（P1）：**404 也放弃本轮**。旧实现把「索引有条目但快照文件 404」当作「文件不存在 ⇒ 不可能
     * 引用任何 blob」直接 continue，于是引用集只剩「读得出来的那几份」，仍被该快照（假 404 / 孤儿条目）
     * 使用的 blob 就被判成无人引用而删除 —— 不可恢复。拿不到内容就无法证明「没人引用」，与「读不出来」
     * 是同一件事 ⇒ 一律放弃并记码（sync-N1 同族口径）。
     */
    private gcBlobStore;
    private validateOptions;
    private assertSafeId;
    private snapshotsBase;
    private snapshotsColUrl;
    private snapshotUrl;
    private indexUrl;
    /** 读取一次 password（错误脱敏用） */
    private passwordOnce;
    /** 幂等创建 snapshots 集合：MKCOL；已存在（2xx/3xx/405/409）视为成功。
     *
     * cloud-sync 借鉴项 ③（首连自建）：目标目录的**上级**不存在时（新账号，或用户填了一个还没建的
     * 目录），按 WebDAV 规范 MKCOL 缺父目录回 409 —— 此前用户必须先去网盘里手工建好目录，否则
     * 首次同步必然失败。现在：直连 409 时逐级补齐 baseUrl 路径上的每一层，再重试一次。
     * 返回**本次真正新建**的层级 URL（已存在的层级不进结果，探针据此如实回报，普通上传忽略返回值）。 */
    private ensureCollection;
    /** 逐级 MKCOL 补齐 baseUrl 的每一层目录（只有缺父目录时才会走到这里）。 */
    private ensureAncestors;
    /** 条件写失败（HTTP 412）：远端在本次读取之后被别人改过 —— 中止写入，让用户重跑（cloud-sync 借鉴项 ①）。 */
    private concurrentWrite;
    /**
     * 连通性探针（cloud-sync 借鉴项 ②）：补齐目标目录 → 证明这真的是一个可读的 WebDAV 集合
     * → 读一次索引回报快照数。只读；唯一写副作用是幂等 MKCOL 补目录（那正是它要修的故障）。
     */
    probe(): Promise<SyncProbeResult>;
    /**
     * 读 index。**三态语义**（audit-sync sync-N1 / t66）：
     *  - 200 + 合法数组 → 返回条目（list 用）；
     *  - 404 → 缺索引：`missing = true`（**缺信息**，不是「集合为空」）；
     *    写路径（**upload / delete**）一律不得据此做读改写 —— upload 在「远端已有内容」时显式中止，
     *    delete 直接返回（不写索引、不触发 GC）；list 仍保留「404 = 空集合」语义；
     *  - 其它非 2xx / 非法 JSON / 逐条非法 → 抛错（F1/F2 语义，绝不回落成空）。
     */
    /**
     * 读 index 的**带缺失标志**版本（audit-sync sync-N1）：
     *  - 404 → `missing = true`（**缺信息**，不是事实）；
     *  - 其它非 2xx / 非法 JSON / 逐条非法 → 抛错（F1/F2 语义，绝不回落成空）。
     * 写路径（**upload / delete**）必须用本方法：`missing` 时既不写回索引、也不触发 GC
     * （upload 另加「远端已有内容 ⇒ 显式中止」的判据，见 upload() 注释）。
     */
    private readIndexDetailed;
    private parseIndex;
    private parseSnapshot;
    /** 发送请求：注入 Basic 认证头 + 调用 request；网络错误/超时归一 */
    private send;
    /** 构造 HTTP 非 2xx 失败消息：附上脱敏后的响应体片段（截断） */
    private failText;
    /** 识别超时错误（AbortController 抛出的 AbortError / DOMException timeout / TimeoutError） */
    private isTimeout;
    /** 错误消息脱敏：password（原文与 URL 编码形态）一律替换 */
    private mask;
}
