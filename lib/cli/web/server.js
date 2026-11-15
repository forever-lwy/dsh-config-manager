/**
 * 离线救急台的 HTTP 服务端（阶段 1，只读）。
 *
 * 安全模型（三条缺一不可）：
 *  ① **只绑 127.0.0.1**，并逐条复用 kit 的 loopback + 同源围栏（每个 endpoint 都会过那道检查）；
 *  ② 启动时生成**一次性 token**，只打印到当前终端；用 `/?token=...` 换一个 HttpOnly + SameSite=Strict
 *     的会话 cookie，token 用过即废。为什么非要有 token：kit 的围栏对「没有 Origin 头的请求」是放行的
 *     （本机任何进程都满足这个条件），所以那道围栏挡不住本机其它进程 —— token 才是这一层的边界；
 *  ③ 页面零脚本、零外链（CSP `default-src 'none'`），且本阶段**只读**：没有任何写动作。
 *
 * 生命周期：Ctrl+C / SIGTERM / 空闲超时即退出；进程退出后 token 与 cookie 立即失效。
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import { isLoopbackRequest, registerRoutes, routeSpecOf, RouteError } from '../../routes/kit.js';
import { openInBrowser } from './browser.js';
import { writeHtml } from './http.js';
import { consolePagesHint, renderMessagePage } from './page.js';
import { buildConsoleRoutes } from './routes.js';
/** 会话 cookie 名（HttpOnly + SameSite=Strict，仅本机回环使用）。 */
export const CONSOLE_SESSION_COOKIE = 'dcm_rescue_session';
function readCookie(req, name) {
    const raw = req.headers.cookie;
    if (typeof raw !== 'string' || raw === '')
        return undefined;
    for (const part of raw.split(';')) {
        const trimmed = part.trim();
        const at = trimmed.indexOf('=');
        if (at <= 0)
            continue;
        if (trimmed.slice(0, at) === name)
            return trimmed.slice(at + 1);
    }
    return undefined;
}
/**
 * 把请求目标解析成救急台自己的 URL（**唯一**入口）。
 *
 * 为什么不能直接 new URL(req.url, 'http://127.0.0.1')：以 `//` 开头的目标是**协议相对 URL**，
 * 会被解析成 authority=x / pathname='/' —— 于是 `GET //evil` 悄悄落到首页（cli-F7），
 * absolute-form（`http://host/x`）同理。这里先折叠成 origin-form 再解析：任何非
 * `/path?query` 形态都落到「未知路径」（404），而不是被当成首页。
 */
function consoleRequestUrl(raw) {
    const target = raw ?? '/';
    const pathOnly = target.startsWith('/') && !target.startsWith('//') ? target : '/' + target.replace(/^\/+/, '');
    return new URL(pathOnly, 'http://127.0.0.1');
}
function constantTimeEquals(a, b) {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    if (left.length !== right.length || left.length === 0)
        return false;
    return timingSafeEqual(left, right);
}
/** 启动救急台并返回句柄（测试可直接用 port: 0）。 */
export async function startConsoleServer(options) {
    const { io, paths, version } = options;
    const token = randomBytes(32).toString('hex');
    const sessionId = randomBytes(32).toString('hex');
    let tokenUsed = false;
    /**
     * 高危确认短语：**只在终端打印**，页面里看不到。
     *
     * 为什么需要：重装会卸载全局 DSH 并可能清空 ~/.dsh —— 浏览器里的一次误点代价太大。
     * 短语把「能打开页面」（本机 + token）与「人在终端前」区分开：只有看着终端的人才能执行重装。
     */
    const dangerPhrase = randomBytes(3).toString('hex').toUpperCase();
    const context = {
        paths,
        version,
        startedAt: new Date().toISOString(),
        // 一次性动作 token：每次渲染写表单时签发，POST 时消费（用过即废）
        actionTokens: new Set(),
        // 高危动作短语（重装用；只在终端打印，绝不渲染进页面）
        dangerPhrase,
    };
    const table = new Map();
    // 经 registerRoutes 注册 = 逐条断言路由出自 kit（未用 endpoint() 的裸 handler 会在这里直接抛错）
    registerRoutes({ register: (route) => { table.set(route.path, route); return () => undefined; } }, buildConsoleRoutes(context));
    let idleTimer = null;
    let closedFlag = false;
    let resolveClosed;
    const closed = new Promise((resolve) => { resolveClosed = resolve; });
    const touchIdle = () => {
        if (options.idleTimeoutMs <= 0)
            return;
        if (idleTimer !== null)
            clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            io.log('空闲超时，救急台已退出（重新启动：dsh-config-manager web）。');
            if (options.shouldSelfExit === false) {
                // 进程内使用（测试）：父进程还要活着，只关服务
                void close();
                return;
            }
            void close().finally(() => process.exit(0));
        }, options.idleTimeoutMs);
    };
    const handle = async (req, res) => {
        const url = consoleRequestUrl(req.url);
        touchIdle();
        // 第一道：与宿主路由同一套 loopback + 同源围栏（连 bootstrap 也过）
        if (!isLoopbackRequest(req)) {
            writeHtml(res, 403, renderMessagePage('拒绝访问', '仅允许来自本机回环地址的请求。'));
            return;
        }
        // 第二道：一次性 token → 会话 cookie
        if (req.method === 'GET' && url.pathname === '/' && url.searchParams.has('token')) {
            const provided = url.searchParams.get('token') ?? '';
            if (tokenUsed || !constantTimeEquals(provided, token)) {
                writeHtml(res, 403, renderMessagePage('启动链接无效', 'token 不正确，或这个链接已经使用过一次。', '回到终端重新运行 dsh-config-manager web（终端里会打印新的链接）。'));
                return;
            }
            tokenUsed = true;
            res.writeHead(302, {
                location: '/',
                'set-cookie': CONSOLE_SESSION_COOKIE + '=' + sessionId + '; HttpOnly; SameSite=Strict; Path=/',
                'referrer-policy': 'no-referrer',
                'cache-control': 'no-store',
            });
            res.end();
            return;
        }
        // 第三道：会话 cookie（token 只用于换 cookie，之后不再出现在 URL 里）
        if (!constantTimeEquals(readCookie(req, CONSOLE_SESSION_COOKIE) ?? '', sessionId)) {
            writeHtml(res, 403, renderMessagePage('需要从终端打印的链接进入', '这个救急台只接受带一次性 token 的启动链接。', '回到终端重新运行 dsh-config-manager web，用打印出来的链接打开。'));
            return;
        }
        const route = table.get(url.pathname);
        if (route === undefined) {
            writeHtml(res, 404, renderMessagePage('页面不存在', '没有这个路径：' + url.pathname, consolePagesHint()));
            return;
        }
        // 方法白名单（cli-F4）：kit 的 405 出口写的是 **JSON**（给插件 API 客户端用），而救急台是
        // 人看的页面。这里按**同一条声明**（routeSpecOf 读回的方法白名单）先判一次，让 405 也走 HTML；
        // kit handler 内那道判定仍在（纵深防御，不依赖本处）。
        const spec = routeSpecOf(route);
        if (spec !== undefined && !spec.methods.includes(req.method)) {
            writeHtml(res, 405, renderMessagePage('方法不被允许', '这个地址只接受 ' + spec.methods.join(' / ') + ' 请求（收到 ' + String(req.method ?? '') + '）。', consolePagesHint()));
            return;
        }
        // kit 的 handler 自带方法白名单 + 顶层错误映射。
        // 但 kit 的错误出口写的是 **JSON**（那是给 API 客户端用的形状）——救急台是人看的页面，
        // 因此这里把 RouteError 的语义包成 HTML 错误页（验收 F3：页面不该吐裸 JSON）。
        try {
            await route.handler(req, res);
        }
        catch (error) {
            if (res.headersSent) {
                res.end();
                return;
            }
            const status = error instanceof RouteError ? error.status : 500;
            const message = error instanceof Error ? error.message : String(error);
            writeHtml(res, status, renderMessagePage(status === 404 ? '页面 / 目标不存在' : '操作未完成', message, status === 404 ? consolePagesHint() : ''));
        }
    };
    const server = http.createServer((req, res) => {
        void handle(req, res).catch((error) => {
            if (!res.headersSent)
                writeHtml(res, 500, renderMessagePage('内部错误', error instanceof Error ? error.message : String(error)));
            else
                res.end();
        });
    });
    const close = async () => {
        if (closedFlag)
            return;
        closedFlag = true;
        if (idleTimer !== null)
            clearTimeout(idleTimer);
        if (options.handleSignals !== false) {
            process.removeListener('SIGINT', onSignal);
            process.removeListener('SIGTERM', onSignal);
        }
        await new Promise((resolve) => { server.close(() => resolve()); });
        server.closeAllConnections?.();
        resolveClosed?.();
    };
    const onSignal = () => {
        io.log('收到中断信号，救急台已退出。');
        // 显式退出：close() 之后事件循环本应自然排空，但进程仍持有 stdin/stdout 等句柄时不会 ——
        // 而「Ctrl+C 之后进程还在」对救急台是不可接受的（用户以为已经关掉了，端口却还在监听）。
        void close().finally(() => process.exit(0));
    };
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : options.port;
    const url = 'http://127.0.0.1:' + String(port) + '/';
    const bootstrapUrl = url + '?token=' + token;
    if (options.handleSignals !== false) {
        process.once('SIGINT', onSignal);
        process.once('SIGTERM', onSignal);
    }
    touchIdle();
    io.log('');
    io.log('DCM 离线救急台已启动（默认只读；写动作只在页面上显式确认后才执行）');
    io.log('  ' + bootstrapUrl);
    io.log(options.openBrowser ? '  正在打开浏览器……（Ctrl+C 退出）' : '  请在本机浏览器打开上面的链接（Ctrl+C 退出）');
    io.log('');
    io.log('  重装 DSH 需要输入这串终端确认码（页面里看不到它）：' + dangerPhrase);
    if (options.openBrowser)
        openInBrowser(bootstrapUrl);
    return { url, port, bootstrapUrl, closed, close };
}
//# sourceMappingURL=server.js.map