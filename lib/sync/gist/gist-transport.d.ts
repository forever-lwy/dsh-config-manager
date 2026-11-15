import type { MsgFunc } from '../../core/msg-types.ts';
import { SyncTransportError } from '../transport.ts';
import type { SyncProbeResult, SyncRetryOptions, SyncSnapshot, SyncSnapshotMeta, SyncTransport, SyncTransportErrorOptions } from '../transport.ts';
/** 缺省 GitHub API 根 */
export declare const GIST_DEFAULT_API_BASE_URL = "https://api.github.com";
/** 缺省文件前缀 */
export declare const GIST_DEFAULT_FILE_PREFIX = "dsh-sync";
/**
 * **gist 通道不做条件写**（issue #110，2026-10 实测）：`PATCH /gists/{id}` 对**任何**条件请求头
 * 都直接回 400 —— `Conditional request headers are not allowed in unsafe requests unless supported
 * by the endpoint`，与 ETag 强弱无关（同一请求去掉 If-Match 即 200）。故本通道的 PATCH 一律不带
 * `If-Match`，也**没有**写前并发保护；要并发保护请用 git / webdav / s3 通道（那里的索引写是条件写）。
 *
 * 没有条件头不等于放任覆盖：upload 在 PATCH 之后**重新 GET 索引复核**（见 upload 注释）。
 * 复核能抓住「我们写完之后又被别人整体覆盖」，抓不住「别人在我们读取与 PATCH 之间写入」
 * —— 那些条目我们压根没读到，任何无条件写都不可能发现；这条残余限制是通道本身决定的。
 */
/** 请求选项：headers / body / 覆盖默认超时（ms；0 = 不超时） */
export interface GistRequestOptions {
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
}
/** 请求响应最小形状（兼容 fetch Response 的 status/ok/text()；headers 供重定向读 location） */
export interface GistResponse {
    readonly status: number;
    readonly ok: boolean;
    readonly headers?: Record<string, string>;
    text(): Promise<string>;
}
/** 可注入的请求函数（测试 mock 用）；method/url/options */
export type GistRequestFn = (method: string, url: string, options?: GistRequestOptions) => Promise<GistResponse>;
/** 凭据提供者：token 只从这里读取，绝不落盘/进日志/回传 */
export interface GistCredentialProvider {
    getToken(): Promise<string>;
}
export interface GistTransportOptions {
    /** 目标 gist id（十六进制串；由用户在 GitHub 上新建一个（私密）gist 后填入） */
    gistId: string;
    /** token 提供者（GitHub PAT / OAuth token，需 gist scope） */
    credentials: GistCredentialProvider;
    /** GitHub API 根；缺省 https://api.github.com（GitHub Enterprise 可改） */
    apiBaseUrl?: string;
    /** gist 内文件名前缀；缺省 dsh-sync */
    filePrefix?: string;
    /** 可注入请求（测试 mock 用）；缺省 = 经 utils/proxy 的出站请求（代理感知） */
    request?: GistRequestFn;
    /** 单请求超时 ms；缺省 = 两条既有通道共用的 DEFAULT_SYNC_TIMEOUT_MS（120000）；0 = 不超时 */
    timeoutMs?: number;
    /** 幂等读操作（list/download）的网络重试参数；写操作（upload/delete）不使用 */
    retry?: SyncRetryOptions;
    /**
     * 写后复核发现「索引被并发改动」时的重做间隔 ms；缺省 200，0 = 不等待（测试用）。
     * 只影响 upload 的重做节奏，不改变任何条件的请求头（gist 端点拒绝条件头）。
     */
    indexConflictRetryDelayMs?: number;
    /** 消息翻译器（缺省 zh；见 ./messages.ts） */
    msg?: MsgFunc;
}
/** Gist 通道错误：继承统一错误基类（kind / retryable / status 对上层可见）。 */
export declare class GistTransportError extends SyncTransportError {
    constructor(message: string, opts?: SyncTransportErrorOptions);
}
/** 实现 SyncTransport 的 GitHub Gist 通道。 */
export declare class GistTransport implements SyncTransport {
    readonly type = "gist";
    private readonly o;
    constructor(options: GistTransportOptions);
    /** gist 里的文件名（非密；供 UI/排障显示） */
    get indexFileName(): string;
    /** 列出远端已有快照（按 createdAt 升序）；索引文件缺失视为空 gist。 */
    list(): Promise<SyncSnapshotMeta[]>;
    /**
     * 上传快照（同 id 覆盖，幂等友好）；内容未变时零 PATCH 直接返回远端 meta。
     *
     * 本通道没有条件写（文首 issue #110），所以用**写后复核**顶住最危险的一类覆盖：
     * PATCH 之后重新 GET 索引并核对 ① 本次条目在且分区 hash 全等；② 读前已有的条目
     * （除本次 id 外）一个都没消失。任一条不成立 = 索引在写入窗口里被别人改过 ⇒ 重新读
     * 最新索引、重新合并、再写，最多 3 轮；仍不成立则抛 `sync.gist.indexConflict`，
     * **绝不静默把别人的条目吞掉**。
     *
     * 残余限制（通道物理决定，不是疏忽）：别人在「我们读取」与「我们 PATCH」之间写入的
     * 条目我们没读到，无条件写无法发现，只能被我们这次整体覆盖 —— 要堵这个窗口请用
     * git / webdav / s3（索引写是条件写）。
     */
    upload(snapshot: SyncSnapshot): Promise<SyncSnapshotMeta>;
    /**
     * 写后复核（upload / delete 共用的唯一实现）：重新读索引，确认本次写入按预期落盘。
     * - 上传（`mineMeta`）：(a) 本次 id 的条目在场；非加密快照还要求 sections hash 全等
     *   （加密快照 sections 为空，密文无法与明文 hash 比较 ⇒ 只认「在场」，与 `sectionsEqual`
     *   的既有口径一致）；
     * - 删除（`expectedAbsent`）：(a) 本次 id 既不在索引里、载荷文件也已不存在；
     * - 两者共同：(b) 传入的读前既有条目（除本次 id 外）一个都不能少 —— 少一个就是被别人整体覆盖了。
     */
    private verifyIndexLanded;
    /** 索引冲突重试间隔（0 = 不等待；测试注入 0 以避免真实 sleep 拖慢用例）。 */
    private waitIndexConflictRetry;
    /** 下载快照完整载荷；不存在的 id 必须抛错（契约）。 */
    download(id: string): Promise<SyncSnapshot>;
    /**
     * 删除远端快照（不存在视为成功）：PATCH 置 null + 写回摘除后的索引。
     *
     * 与 upload 同源的防护：本通道没有条件写（文首 issue #110），所以写后同样复核 ——
     * ① 目标 id 已从索引消失且载荷文件已删除；② 读前见过的其它条目一个都没少。
     * 任一条不成立 ⇒ 重新读最新索引、重新合并、再写，最多 `MAX_INDEX_WRITE_ATTEMPTS` 轮；
     * 仍不成立抛 `sync.gist.indexConflict`，**绝不静默把别人的条目吞掉**。
     *
     * 与 upload 的差异只有一处：「本来就没这条」时零 PATCH 幂等成功；但如果本轮已经复核失败过，
     * 就不再走幂等早退 —— 否则目标恰好已被覆盖删掉时，会用「无事可做」掩盖上一轮丢条目的问题。
     */
    delete(id: string): Promise<void>;
    /**
     * 连通性探针（cloud-sync 借鉴项 ②③）：令牌有效性（GET /user）→ gist 可读 → 快照数 →
     * 归属提示（gist 里已有不属于本前缀的文件时给出 warning 级 hint，绝不自动删别人的文件）。
     * 只读：不打任何 PATCH。
     */
    probe(): Promise<SyncProbeResult>;
    private assertSafeId;
    private gistUrl;
    private snapshotFileName;
    /** 读取一次 token（失败 → 空串：请求按未认证失败，原因如实带回） */
    private tokenOnce;
    /** 发送一次请求（注入 GitHub 认证头）；网络错误/超时归一 */
    private send;
    /** 读 gist（含全部文件条目）；404 → 明确「gist 不存在或无权访问」 */
    private readGistFiles;
    /**
     * 读 gist 全量文件。响应 ETag **不用**：gist 的 PATCH 端点不接受任何条件请求头（issue #110 实测），
     * 读到强/弱 ETag 都无处可用，故这里不再解析。
     */
    private readGist;
    /**
     * 取某个文件的内容：gist 载荷里直接有就用它；被 GitHub 截断（\`truncated\`）或内容缺失时
     * 回落 \`raw_url\` 重新下载（跨源跳转剥离 Authorization —— gh 的 raw 地址本身不可猜）。
     * 文件不存在 → null（调用方按各自语义处理）。
     */
    private readFileText;
    /** 下载 raw 内容（最多跟随 MAX_REDIRECTS 跳；raw 请求不带 token） */
    private fetchRaw;
    private parseIndex;
    private parseSnapshot;
    /** HTTP 状态 + 响应体 → 错误分类（GitHub 的限流是 403 + rate limit 文案 → 当可重试的 server 故障） */
    private classify;
    /** 读响应体（失败 → 空串；不因读体失败而丢掉真正的 HTTP 状态原因） */
    private safeText;
    private failText;
    private isTimeout;
    /** 错误消息脱敏：token（原文与 URL 编码形态）一律替换 */
    private mask;
}
