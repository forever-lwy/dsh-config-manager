import { hashSection } from './sync-state.js';
/**
 * 写出/删除路径的**条件写**失败判定（两条通道共用的唯一实现处）：
 *  - 412 Precondition Failed 恒算（If-Match / If-None-Match 的语义）；
 *  - 409 只在**本次确实带了条件写头**时才算 —— S3 兼容端点用 409 表达「对象已存在 / 冲突」，
 *    而 WebDAV 的 409（如 MKCOL 缺父目录）与无条件的 409 另有含义，绝不能吞成并发冲突。
 *
 * 判定通过后仍须按通道报文细分：OSS 的 409 还可能表示 FileImmutable（桶被保护），
 * 那必须如实报错而不是谎称「别的设备改过索引」（见 s3-transport 的 conditionalFailure）。
 */
export function isPreconditionFailedStatus(status, opts = {}) {
    if (status === 412)
        return true;
    return status === 409 && opts.guarded === true;
}
/** 默认可重试分类 = 瞬时网络故障；其余一律不重试（语义不明不冒险）。 */
const RETRYABLE_KINDS = ['network', 'timeout', 'server'];
/**
 * 同步通道**统一错误基类**。GitTransportError / WebDavTransportError 都继承它，
 * 于是上层可以 `err instanceof SyncTransportError` 拿到 kind / retryable / status，
 * 而不是只能 `err instanceof Error ? err.message : String(err)` 读字符串。
 */
export class SyncTransportError extends Error {
    kind;
    retryable;
    status;
    code;
    constructor(message, opts = {}) {
        super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
        this.name = 'SyncTransportError';
        this.kind = opts.kind ?? 'unknown';
        this.retryable = opts.retryable ?? RETRYABLE_KINDS.includes(this.kind);
        this.status = opts.status;
        this.code = opts.code;
    }
}
/** 是否为同步传输层错误（跨通道统一判定） */
export function isSyncTransportError(err) {
    return err instanceof SyncTransportError;
}
/** 该通道**不提供**连通性自检（能力边界，不是故障）：路由/UI 据此改用中性提示。 */
export const PROBE_UNSUPPORTED_CODE = 'probe-unsupported';
export function isProbeUnsupported(err) {
    return err instanceof SyncTransportError && err.code === PROBE_UNSUPPORTED_CODE;
}
/** 是否值得重试：只有带可重试分类的传输层错误才重试；未知错误一律不重试。 */
export function isRetryableTransportError(err) {
    return err instanceof SyncTransportError && err.retryable;
}
/** 重试缺省值 */
export const DEFAULT_SYNC_RETRY = {
    attempts: 3,
    baseDelayMs: 250,
    maxDelayMs: 2000,
};
function defaultSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * 有限次指数退避重试。**调用约定：只包在幂等操作上**（读：list / download / GET）。
 *  - 只对 isRetryableTransportError 判定为可重试的错误重试；其它错误（含任何非传输层错误）立即上抛；
 *  - 重试耗尽 → 上抛**最后一次**的错误对象，kind / retryable 分类原样保留，供上层分流；
 *  - 写操作（upload / delete）**禁止**使用：webdav 的「PUT 快照 + PUT index」之间失败会留孤儿文件，
 *    git 的 push 有远端副作用。
 */
export async function withSyncRetry(fn, opts = {}) {
    const attempts = Math.max(1, Math.floor(opts.attempts ?? DEFAULT_SYNC_RETRY.attempts));
    const baseDelayMs = Math.max(0, opts.baseDelayMs ?? DEFAULT_SYNC_RETRY.baseDelayMs);
    const maxDelayMs = Math.max(baseDelayMs, opts.maxDelayMs ?? DEFAULT_SYNC_RETRY.maxDelayMs);
    const sleep = opts.sleep ?? defaultSleep;
    for (let attempt = 1;; attempt += 1) {
        try {
            return await fn();
        }
        catch (err) {
            if (attempt >= attempts || !isRetryableTransportError(err))
                throw err;
            const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
            try {
                opts.onRetry?.({ attempt, delayMs, error: err });
            }
            catch {
                /* 观测回调不得影响主流程 */
            }
            await sleep(delayMs);
        }
    }
}
/**
 * 两条同步通道**共用的默认超时**（不再各自硬编码 60s / 120s）。
 * 取原两条通道中的较大者（webdav 120s）：统一只能放宽不能收紧，否则原本 120s 够大的快照上传会被判超时。
 * 需要不同值时由宿主经 transport 的 options.timeoutMs 注入。
 */
export const DEFAULT_SYNC_TIMEOUT_MS = 120_000;
/** HTTP 状态码 → 错误分类：429 / 5xx 可重试，401/403/404/409/423 与其它 4xx 不重试。 */
export function classifyHttpStatus(status) {
    if (status === 429)
        return { kind: 'server', retryable: true, status };
    if (status >= 500)
        return { kind: 'server', retryable: true, status };
    if (status === 401 || status === 403)
        return { kind: 'auth', retryable: false, status };
    if (status === 404)
        return { kind: 'notfound', retryable: false, status };
    if (status === 409 || status === 423)
        return { kind: 'conflict', retryable: false, status };
    return { kind: 'client', retryable: false, status };
}
/**
 * 网络层错误**文本** → 错误分类（git 的 stderr 与 webdav 的 request 异常共用同一口径）。
 * 判定顺序有讲究：git 会把真实原因包进 `unable to access ... :` 这类宽泛措辞，因此先判具体原因
 * （超时 / 连接层 / 5xx / 鉴权 / 404 / 冲突），最后才把宽泛包装词当作网络故障。
 */
export function classifyNetworkErrorText(text) {
    const t = text.toLowerCase();
    const has = (...needles) => needles.some((n) => t.includes(n));
    // 状态码边界判定（不用转义序列，避免 \b 与数字粘连；等价于「前后非数字」）
    const status = (code) => new RegExp('(^|[^0-9])' + String(code) + '([^0-9]|$)').test(t);
    if (has('etimedout', 'timed out', 'timeout', 'time out', 'socket hang up', 'operation was aborted')) {
        return { kind: 'timeout', retryable: true };
    }
    if (has('econnreset', 'econnrefused', 'eai_again', 'enotfound', 'enotreach', 'network is unreachable', 'connection reset', 'connection refused', 'connection closed', 'broken pipe', 'epipe', 'resolve host', 'name or service not known', 'failed to connect', 'could not connect', 'remote end hung up', 'early eof')) {
        return { kind: 'network', retryable: true };
    }
    if (status(429) || has('too many requests') || status(500) || status(502) || status(503) || status(504)
        || has('internal server error', 'bad gateway', 'service unavailable', 'gateway timeout')) {
        return { kind: 'server', retryable: true };
    }
    if (status(401) || status(403) || has('authentication failed', 'permission denied', 'access denied', 'unauthorized', 'invalid credentials', 'could not read username', 'invalid username or password', 
    // git/GitHub：口令不是有效令牌 —— 含「本机没配令牌、git 却提交了空口令」这条最常见的真机形态。
    // 远端文案分不清「令牌缺失」与「令牌失效」，两者都必须归 auth，上层才能给出可操作提示。
    'invalid username or token', 'password authentication is not supported', 'support for password authentication was removed')) {
        return { kind: 'auth', retryable: false };
    }
    // 本机 git 身份缺失（真机 issue：commit exit 128 ⇒ 交易 NEEDS_ATTENTION ⇒ 误升 SAFE MODE）。
    // 放在 auth/notfound 之前：这类 stderr 里也可能带 'permission denied' 之外的宽泛词，
    // 但它与远端鉴权无关 —— 远端根本没被访问到，唯一修法是本机 git config。
    if (has('unable to auto-detect email address', 'empty ident name', 'tell me who you are', 'author identity unknown', 'committer identity unknown', 'please configure your identity', 'no name was given and auto-detection is disabled')) {
        return { kind: 'config', retryable: false };
    }
    if (status(404) || has('not found', 'does not exist', 'no such file')) {
        return { kind: 'notfound', retryable: false };
    }
    if (has('non-fast-forward', 'would be overwritten', 'already exists', 'rejected', 'conflict', 'locked')) {
        return { kind: 'conflict', retryable: false };
    }
    if (has('unable to access', 'could not read from remote')) {
        return { kind: 'network', retryable: true };
    }
    return { kind: 'unknown', retryable: false };
}
/** 由快照计算元信息：sections hash 记录 + manifest 摘要透传。
 *  加密快照（sections 为密文载荷）→ sections hash 记录为空（密文无法与本地明文比较）。 */
export function computeSnapshotMeta(snapshot) {
    const sections = {};
    if (!isEncryptedSections(snapshot.sections)) {
        for (const [id, data] of Object.entries(snapshot.sections)) {
            sections[id] = hashSection(data);
        }
    }
    return { id: snapshot.id, createdAt: snapshot.createdAt, sections, manifest: snapshot.manifest };
}
/** 判定远端索引条目与本地快照「内容相同」（快照级跳过判定，供 webdav 通道增量上传用）：
 *  仅比较各分区内容 hash（sections 全等），不比较 createdAt / manifest 摘要
 *  （同 id 重复上传但内容未变 → 视为幂等覆盖，无需重新 PUT 载荷）。
 *  - 本地 sections 为空对象（加密快照：密文无法与远端明文 hash 比较）→ 返回 false，
 *    「无法比较」必须照常上传，绝不跳过；
 *  - 键集合与每个键的 hash 值全部相等 → true；否则 false。
 */
export function sectionsEqual(remote, local) {
    const r = remote.sections;
    const l = local.sections;
    if (Object.keys(l).length === 0)
        return false; // 本地为空（加密快照）→ 无法比较
    if (Object.keys(r).length !== Object.keys(l).length)
        return false;
    for (const key of Object.keys(r)) {
        if (r[key] !== l[key])
            return false;
    }
    return true;
}
/** 判定是否为加密凭据载荷（duck-typing：含 info 对象 + 非空 data 字符串）。 */
export function isEncryptedCredentials(v) {
    if (v === null || typeof v !== 'object')
        return false;
    const c = v;
    return typeof c.data === 'string' && c.data !== '' && c.info !== null && typeof c.info === 'object';
}
/** 判定 sections 是否为加密密文载荷（duck-typing：含 encrypted.info + encrypted.data 字符串）。 */
export function isEncryptedSections(sections) {
    if (sections === null || typeof sections !== 'object')
        return false;
    const enc = sections.encrypted;
    if (enc === null || typeof enc !== 'object')
        return false;
    const e = enc;
    return typeof e.data === 'string' && e.data !== '' && e.info !== null && typeof e.info === 'object';
}
/** 从导出 Manifest 提取摘要 */
export function manifestSummaryFrom(manifest) {
    return {
        schemaVersion: manifest.schemaVersion,
        dshVersion: manifest.source.dshVersion,
        platform: manifest.source.platform,
        sectionIds: Object.entries(manifest.sections)
            .filter(([, included]) => included)
            .map(([id]) => id),
        containsSecrets: manifest.security.containsSecrets,
        ...(manifest.sourceHome !== undefined && manifest.sourceHome !== '' ? { sourceHome: manifest.sourceHome } : {}),
    };
}
//# sourceMappingURL=transport.js.map