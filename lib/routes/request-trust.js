import { BROWSER_SESSION_CODE, LOOPBACK_ONLY_CODE, UNTRUSTED_AUTHORITY_CODE } from '../core/access-mode.js';
import { clearRequestTrustResolver, setRequestTrustResolver } from './kit.js';
/** 无委托可用时的兜底（与改造前逐字一致）。 */
const LOOPBACK_ONLY = Object.freeze({
    status: 403,
    message: 'forbidden: loopback-only',
    code: LOOPBACK_ONLY_CODE,
});
function describe(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * 构造「非回环请求」的信任判定。
 *
 * @param readConnection 惰取 connection 服务（调用期读取：本插件 apply 时宿主服务可能还没组合）
 * @param log 诊断出口（判定抛错时留一行，随后 fail-closed）
 */
export function createHostRequestTrust(readConnection, log) {
    return (request) => {
        let service;
        try {
            // ctx.get 在插件已卸载 / 服务组合中会抛（不是返回 undefined）—— 围栏抛错会绕过
            // endpoint 的 try/catch 落到 webserver 的空体 400，所以这里自己接住。
            service = readConnection();
        }
        catch (error) {
            log?.warn('reading the connection service threw; falling back to loopback-only: ' + describe(error));
            return LOOPBACK_ONLY;
        }
        if (service === null || typeof service !== 'object')
            return LOOPBACK_ONLY;
        const candidate = service;
        if (typeof candidate.requestRejection !== 'function')
            return LOOPBACK_ONLY;
        let verdict;
        try {
            // 成员调用：宿主的方法依赖 this（browserAuth / trustedHosts），抽出来单独调会丢绑定。
            verdict = candidate.requestRejection(request);
        }
        catch (error) {
            log?.warn('connection.requestRejection threw; falling back to loopback-only: ' + describe(error));
            return LOOPBACK_ONLY;
        }
        if (verdict === undefined)
            return undefined;
        return verdict === 401
            ? { status: 401, message: 'unauthorized: browser-session', code: BROWSER_SESSION_CODE }
            : { status: 403, message: 'forbidden: untrusted-authority', code: UNTRUSTED_AUTHORITY_CODE };
    };
}
/**
 * 把宿主信任面装进 kit 围栏（组合根只需一行）。
 *
 * 用 ctx.effect 安装 = 卸载/重载插件时自动卸回严格回环，不残留上一实例的判定闭包
 * （闭包捕获的是旧 ctx：旧实例卸载后它读到的 connection 服务可能是失效引用）。
 */
export function installHostRequestTrust(ctx, log) {
    ctx.effect(() => {
        const resolver = createHostRequestTrust(() => ctx.get('connection'), log);
        setRequestTrustResolver(resolver);
        // 只撤自己装的那一个：另一实例（bundle + 隔离 profile）可能已经覆盖了委托。
        return () => clearRequestTrustResolver(resolver);
    }, 'config-manager: request trust');
}
//# sourceMappingURL=request-trust.js.map