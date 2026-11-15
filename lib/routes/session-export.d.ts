/**
 * 路由组：**官方 session.export 通道**（只读：探测 + 流式代理，两形态同一路径）。
 *
 * 背景（F-2）：DSH 自带插件 `@deepseek-ai/dsh-session-log-export` 提供
 * `GET|HEAD /api/session.export?sessionId=<非空>&includeDescendants=<true|false 字面>`：
 * 由 DSH 自己 flush 内存会话、解码多帧 zstd、按「会话 + 子会话 + 附件」打**有界流式 ZIP**。
 * 本仓库此前 `session.export` / `includeDescendants` **0 命中**（从未接入）。
 *
 * 为什么不照抄竞品的「前端一个裸 `<a download>`」（见调研 §5.1）——两条都要命的理由：
 *  1. 该端点是 DSH 自己的 exact Fetch 路由，挂在**带浏览器认证**的 `/api` 前缀下，只能由页面里
 *     的同源请求带 cookie 访问；「连不上 / 没 cookie / 路由没注册」在浏览器里**分不开**
 *     （401 / 404 / 网络失败都会被 `fetch().catch` 压成同一类噪音）；
 *  2. 更硬的一条：`/api/session.export` **不是** `api/session.export` 的前缀祖先 ——
 *     `/api/session.export/x` 并不以 `/api/` 开头，所以拼错路径**不会**落到 DSH 的 401，
 *     而是落到 webserver 的默认 404 HTML，在页面上表现为「点了没反应」。
 * 因此宿主侧探测一次、把**机器可读的原因**下发给界面，由界面决定显示/禁用并说明原因
 * （**绝不静默、绝不恒显示**）。
 *
 * 三条硬边界：
 *  1. **绝不照抄竞品的 `res.status !== 501` 判据**（已过时）：本机 DSH 0.2.0-rc.2 的 app.asar
 *     全量搜 `status: 501` **零命中**，服务缺失实际返 **500**；照抄会让入口**几乎恒显示**。
 *  2. 「服务缺失」（500 + `unavailable: missing`）必须与「会话不存在」（404）分开：前者是环境
 *     问题（隐藏入口 + 说明原因），后者是正常业务结果（界面照实呈现）。
 *  3. 拿不到状态码（连不上 / 超时 / 401 / 403 / 读日志失败的 500）**绝不猜成不可用** ——
 *     一律 `unknown`，界面保守显示。
 *
 * 取证（本机 `D:/Apps/DSH/resources/app.asar` 逐字摘录，与调研 §5.2 一致）：
 *  - `if (deps.sessionQuery === void 0 || deps.sessionPersistence === void 0 || deps.attachments === void 0) return new Response("session log export is unavailable: missing session-query, session-persistence, or attachments service", { status: 500 });`
 *  - `if (sessionIdValue === void 0 || sessionIdValue.length === 0 || descendantsValue !== void 0 && descendantsValue !== "true" && descendantsValue !== "false") return new Response("missing or invalid sessionId query parameter", { status: 400 });`
 *  - `return new Response("session log export failed to read the stored log", { status: 500 });`
 *  - HEAD 与 GET 走同一条处理链、状态一致，只是取消 body：`if (request.method === "GET") return response; await response.body?.cancel(); …`
 *
 * W1：路由只在这里声明一次 —— `endpoint({ path, methods }, handler)` 的 path/methods 就是唯一
 * 声明处；围栏、方法判定与顶层异常处理由 `src/routes/kit.ts` 在注册点统一提供。
 */
import type { WebRoute } from './kit.ts';
import type { RoutesEnv } from './context.ts';
/** 拼接 DSH 端点的查询串（`sessionId` 必填 + includeDescendants 字面量）。 */
export declare function sessionExportTargetUrl(sessionId: string, includeDescendants: boolean): string;
/** 解析 `?includeDescendants=`：只认字面 'false'；缺省 true（与 DSH 的默认语义一致，绝不猜其它值）。 */
export declare function readIncludeDescendants(raw: string | null): boolean;
/** 宿主可用的 fetch 能力（`ctx.fetch` / 全局 fetch；宿主注入，测试注入替身）。 */
export type SessionExportFetch = (input: string, init: RequestInit) => Promise<Response>;
/** DSH 官方端点（exact Fetch 路由；与宿主同源 → 同 cookie）。 */
export declare const SESSION_EXPORT_PATH = "/api/session.export";
/** 探测用的「不存在」会话 id（只读、无副作用；DSH 对不存在的会话回 404 `session not found`）。 */
export declare const SESSION_EXPORT_PROBE_ID = "__dcm_probe__";
/** 探测单程超时（本机自请求；超时按「拿不到状态码」处理，绝不猜成不可用）。 */
export declare const SESSION_EXPORT_PROBE_TIMEOUT_MS = 3000;
/**
 * 可用性三态（**界面据此显隐，绝不二值化**）：
 *  - `available`：200/400/404 —— 路由活着且读会话所需的服务齐备（400/404 是业务结果）；
 *  - `unavailable`：500 + `unavailable: missing` —— 后端缺服务（隐藏入口并说明原因）；
 *  - `unknown`：其它一切（401/403、连不上、超时、读日志失败的 500…）—— **保守显示**。
 */
export type SessionExportAvailability = 'available' | 'unavailable' | 'unknown';
/** 机器可读原因（界面映射成文案；**不渲染裸码**）。 */
export type SessionExportReason = 'service-missing' | 'auth-required' | 'read-failed' | 'network-error' | 'unexpected-status';
/** 探测结果（结构化；界面只消费这些字段，绝不解析 HTTP 状态码）。 */
export interface SessionExportProbe {
    availability: SessionExportAvailability;
    /** unknown / unavailable 时为原因；available 时缺省 */
    reason?: SessionExportReason;
    /** DSH 实际返回的状态码（0 = 没拿到响应） */
    status: number;
    /** 实际探测的路径（诊断用） */
    path: string;
    /** 探测时刻（ISO） */
    checkedAt: string;
}
/**
 * 状态码 + 响应体 → 三态。**纯函数、单一事实源**：宿主路由与单测共用同一份判定。
 *
 * 为什么把「读日志失败的 500」单独分出来：它不是「服务缺失」（隐藏入口会让用户以为这台机器
 * 整体不支持原始日志导出），而是「这一个会话读不出来」—— 保守显示，让 DSH 自己报错。
 * 为什么保留 501：本机 0.2.0-rc.2 已无该分支（asar 全量搜 `status: 501` 零命中），但旧版 DSH
 * 可能用它表达「持久化后端不支持 raw artifacts」，保留以免在老版本上恒显示。
 */
export declare function classifySessionExportStatus(status: number, body: string): {
    availability: SessionExportAvailability;
    reason?: SessionExportReason;
};
/**
 * 探测：用 `sessionId = 一个合法但不存在的 id` 向 DSH 自己的 `/api/session.export` 发一次请求。
 *
 * 为什么在 **host 侧**发起：与 DSH 的 /api 路由天然同源、来源地址回环，且「连不上 / 超时」
 * 这类**拿不到状态码**的情形能被如实归到 `unknown`（而不是在浏览器里被压成同一类噪音）。
 *
 * 为什么**必须先有端口**：自请求要带 `Host: 127.0.0.1:<port>`，端口写错会被 DSH 的围栏判成
 * 不允许的来源（403）；而 403 在本模块里代表「被认证挡在门外」—— 拿一个注定 403 的请求当真话，
 * 正是「恒隐藏」的另一种写法。端口未知 → 直接回保守的 `unknown`，**不发请求**。
 *
 * 为什么**用 GET 而不是 HEAD**（T9-F1 修复）：见函数体内那段说明 —— HEAD 没有正文，
 * 而 500 的两种成因只能靠正文区分，「缺服务」分支曾因此永不触发。
 */
export declare function probeSessionExport(fetchImpl: SessionExportFetch | undefined, port: number | undefined): Promise<SessionExportProbe>;
/**
 * session export 路由组（F-2）：只有一条，但**同一条路径上两种用途**（都只读）：
 *  - 缺 `sessionId` → **探测**：宿主 GET DSH 自己的 /api/session.export 读到判定所需的最小正文后
 *    立刻取消，回结构化可用性；
 *  - 带 `sessionId` → **代理**：把请求转给 DSH（GET 原样流式回传 ZIP）。
 *
 * 为什么不新增第二条 `/session-export/probe`：一条路由两种形态少一道围栏面，且界面只需要一个
 * 常量；代理与探测共用同一条 loopback 围栏与同一个错误出口（不要为「探测」单开一条路由）。
 *
 * 为什么代理**一次都不缓冲**：DSH 生成的是有界流式 ZIP（可达数百 MB），整本驻留内存会把宿主
 * 事件循环与 RSS 一起拖垮 —— 这里逐 chunk 转发，客户端断开即中止上游。
 *
 * **方法白名单 = `['GET']`，且 handler 只实现 GET 代理**（T9-F2）。此前文档提到过「HEAD 只回
 * 状态码」的代理形态，但声明里从来没有 HEAD —— 那是一处**声明与描述不一致**：kit 的方法白名单
 * 在到达 handler 之前就会把 HEAD 判成 405，所以那段描述描述的是**不可达**的行为。现在两者对齐：
 * 只有 GET（探测形态也不需要 HEAD 了，见 `probeSessionExport` 的说明）。
 * 这么收的另一个理由：本路由在 HEAD 形态下不写 body，而 kit 把 `res` 当作 `ServerResponse`
 * （HEAD 时它在运行期是 ServerResponse 的近似物）—— 既然该形态不可达，就不保留这种「类型与
 * 运行期形状有偏差」的路径。
 */
export declare function sessionExportRoutes(env: RoutesEnv): WebRoute[];
