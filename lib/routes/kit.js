import { LOOPBACK_ONLY_CODE } from '../core/access-mode.js';
import { invalidateEngineLocale } from '../core/engine-locale.js';
import { TransactionRecoveryRequiredError } from '../core/phase3-host.js';
import { EnvironmentLockUnavailableError } from '../utils/env-lock.js';
import { engineMsg } from './messages.js';
/** kit 产出的路由上挂的声明信息（供注册点兜底断言与 route-parity 测试读取）。 */
export const ROUTE_SPEC = Symbol('dsh-config-manager.routeSpec');
/* ------------------------------------------------------------------ 错误 */
/**
 * 路由可预期的请求级错误（唯一机制）。
 *
 * 为什么取代原先 4 套语义：profile 用 code→404/409/400、sync 用 status、mutation gate 用 423、
 * 其余按路由内联 500 —— 同一个「请求非法」在不同路由落成不同状态码，客户端只能各自适配。
 * 现在 handler 抛 RouteError（或其子类）即可，映射只有这一份。
 */
export class RouteError extends Error {
    status;
    code;
    constructor(message, status = 500, code) {
        super(message);
        this.name = 'RouteError';
        this.status = status;
        this.code = code;
    }
}
/** 错误 → 文本的一口径（原先 65 处 `error instanceof Error ? error.message : String(error)` 的内联三元）。 */
export function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
/* --------------------------------------------------------- 响应与请求体 */
/** JSON 响应（唯一写出点：content-type + no-referrer 头只在这一处维护）。 */
export function writeJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'referrer-policy': 'no-referrer',
    });
    res.end(payload);
}
/** JSON 错误响应（唯一形状：{error, code?}）。 */
export function writeJsonError(res, status, message, code) {
    writeJson(res, status, code === undefined ? { error: message } : { error: message, code });
}
/** 统一错误出口：RouteError（含子类）用其 status/code，其余 500 + 消息（已由调用方脱敏）。 */
export function writeRouteError(res, error) {
    if (error instanceof RouteError) {
        writeJsonError(res, error.status, error.message, error.code);
        return;
    }
    writeJsonError(res, 500, errorMessage(error));
}
/**
 * mutation gate 的 423 家族**唯一映射点**（tech-debt #9）。
 *
 * 为什么收在这里：改造前这段「两行日志 + 两行 423 写回」被抄了 12 处
 * （组合根 withMutationGate 自己的 catch、snapshots /restore 的自拼包壳、prefs、sync、
 * recovery 的 8 个写路由），新增 gate 行为时必然漏改一处 —— 与 kit 头注释里 F-02/F-03 同因。
 *
 * 命中 → 写 `423 {error, code}`（字段顺序与旧 writeJson 逐字一致）并返回 true；
 * 未命中 → 返回 false，**调用方按自己路由既有的兜底口径写**（sync 走 SyncRouteError、
 * snapshots 的 /restore 兜 400、组合根 gate 必须 rethrow 给 endpoint 的 errorRenderer …）。
 * 用返回布尔而不是「内置兜底」正是为了不改这些既有语义。
 *
 * 内部诊断（op/reason/detail）只进日志；用户看到的是 error.message（友好文案，无技术细节）。
 */
export function writeMutationError(res, host, error) {
    if (error instanceof EnvironmentLockUnavailableError) {
        host.log.warn(`mutation lock blocked: op=${error.op} reason=${error.reason}${error.detail !== undefined ? ` detail=${error.detail}` : ''}`);
        writeJsonError(res, 423, error.message, 'mutation-locked');
        return true;
    }
    if (error instanceof TransactionRecoveryRequiredError) {
        host.log.warn(`transaction recovery required: ${error.message}`);
        writeJsonError(res, 423, error.message, 'transaction-recovery-required');
        return true;
    }
    return false;
}
/** Cap on raw JSON bodies (4 MiB) —— 文件上传走 MAX_UPLOAD_BYTES 的另一条路径。 */
export const MAX_JSON_BODY_BYTES = 4 * 1024 * 1024;
/** 读取 JSON 请求体：非法 JSON / 超限 / 非对象 → undefined（调用方决定语义）。 */
export async function readJsonBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = chunk;
        size += buffer.length;
        if (size > MAX_JSON_BODY_BYTES)
            return undefined;
        chunks.push(buffer);
    }
    try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        return typeof parsed === 'object' && parsed !== null ? parsed : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * 读取 JSON 请求体，非法即抛 400（原先 25 处「readJsonBody + if (body === undefined) writeJson(400…)」
 * 的三行样板，响应体逐字相同）。
 */
export async function requireJsonObject(req) {
    const body = await readJsonBody(req);
    if (body === undefined)
        throw new RouteError('invalid JSON body', 400);
    return body;
}
/** URL query 取值（首个值，已解码）。 */
export function queryParam(url, name) {
    const value = url.searchParams.get(name);
    return value === null ? undefined : value;
}
/* ------------------------------------------------------------ loopback 围栏 */
/** Loopback literal check plus browser same-origin markers (dsh-ssh's fence). */
export function isLoopbackRequest(request) {
    const address = request.socket.remoteAddress;
    if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1')
        return false;
    const host = request.headers.host;
    if (typeof host !== 'string')
        return false;
    let hostUrl;
    try {
        hostUrl = new URL(`http://${host}`);
    }
    catch {
        return false;
    }
    if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]')
        return false;
    if (request.headers['sec-fetch-site'] === 'cross-site')
        return false;
    const origin = request.headers.origin;
    if (origin === undefined)
        return true;
    try {
        return new URL(origin).host === hostUrl.host;
    }
    catch {
        return false;
    }
}
/** 兜底拒绝（无委托）：与改造前的响应逐字一致，只多一个机器码。 */
const LOOPBACK_REJECTION = Object.freeze({
    status: 403,
    message: 'forbidden: loopback-only',
    code: LOOPBACK_ONLY_CODE,
});
let delegatedTrust;
/**
 * 安装宿主信任面委托（issue #126）。
 *
 * 背景：宿主以 --host 10.0.0.10 起 dsh web 后，内嵌面板的每条路由都被 loopback 围栏
 * 拒掉（403 forbidden: loopback-only），而同一份宿主的 /api 对局域网浏览器是放行的
 * （Host 属于 trustedHosts + 带 dsh-auth 会话 cookie）。
 *
 * 规则：**回环永远先放行**（本机行为不变），回环之外的请求才交给宿主判定。
 * 拿不到委托（老宿主 / 独立 CLI 救急台）就退回严格回环 —— 失败方向是「更严」，不是更松。
 *
 * 传 undefined = 卸回严格回环（插件卸载/重载不残留上一实例的信任面）。
 */
export function setRequestTrustResolver(resolver) {
    delegatedTrust = resolver;
}
/**
 * 卸回严格回环，但**只在当前委托仍是这一个时**生效。
 *
 * 为什么带身份比对：插件重载或两个实例（bundle 包 + 隔离 profile）共存时，后装的委托会覆盖
 * 前者 —— 无条件清空会把还活着的那个也抹掉，局域网访问突然退回 403，且现场没有任何报错。
 */
export function clearRequestTrustResolver(resolver) {
    if (delegatedTrust === resolver)
        delegatedTrust = undefined;
}
/** 请求级信任判定（endpoint 的唯一围栏口径）。 */
function requestRejection(request) {
    if (isLoopbackRequest(request))
        return undefined;
    return delegatedTrust === undefined ? LOOPBACK_REJECTION : delegatedTrust(request);
}
/* ---------------------------------------------------------------- 唯一入口 */
/**
 * 声明一条端点。这是全部路由的**唯一构造入口**：
 * ① 访问面围栏（回环放行；其余交宿主信任面，见 requestRejection）；② 方法白名单（不在白名单 → 405）；
 * ③ 顶层 try/catch → writeRouteError（异常绝不再落到 webserver 的空体 400 兜底）。
 */
export function endpoint(spec, handler) {
    const route = {
        kind: spec.kind ?? 'exact',
        path: spec.path,
        handler: async (req, res) => {
            // 「英文界面零中文」（t6）：请求入口强制失效语言缓存 —— 用户切语言后**下一次请求**就必须拿到新语言。
            // 不接也有 LANGUAGE_TTL_MS=1000 的兜底上界；TTL 只给调度器/后台任务这类非请求路径用。
            invalidateEngineLocale();
            const rejection = requestRejection(req);
            if (rejection !== undefined) {
                writeJsonError(res, rejection.status, rejection.message, rejection.code);
                return;
            }
            if (!spec.methods.includes(req.method)) {
                writeJsonError(res, 405, `method not allowed: ${req.method}`);
                return;
            }
            try {
                await handler(req, res);
            }
            catch (error) {
                // 预期错误走 RouteError（带 status/code），其余 500 —— 与旧路由的内联出口逐条对齐。
                if (spec.errorRenderer !== undefined) {
                    if (res.headersSent) {
                        res.end();
                        return;
                    }
                    spec.errorRenderer(res, error instanceof RouteError ? error.status : 500, errorMessage(error));
                    return;
                }
                writeRouteError(res, error);
            }
        },
    };
    Object.defineProperty(route, ROUTE_SPEC, { value: Object.freeze({ kind: route.kind, path: route.path, methods: [...spec.methods] }), enumerable: false });
    return route;
}
/** 读回 endpoint() 写下的声明（未经过 kit 的路由 → undefined）。 */
export function routeSpecOf(route) {
    return route[ROUTE_SPEC];
}
/**
 * 注册点唯一包装：逐条断言路由出自 kit（漏用 endpoint() 直接抛错 → 插件启动失败而非静默少一道围栏），
 * 然后交给 webServer 注册，返回 disposers。
 */
export function registerRoutes(registry, routes) {
    return routes.map((route) => {
        const spec = routeSpecOf(route);
        if (spec === undefined) {
            throw new Error(engineMsg('route.kitUnregistered', { path: route.path }));
        }
        return registry.register(route);
    });
}
//# sourceMappingURL=kit.js.map