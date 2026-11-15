import { type RequestTrustResolver } from './kit.ts';
/** 宿主 connection 服务的结构化窄化（只取围栏判定这一个方法）。 */
export interface HostConnectionLike {
    requestRejection?: (request: unknown) => unknown;
}
/** 诊断日志最小形状（只取 warn，避免依赖整个 host）。 */
export interface TrustLog {
    warn(message: string): void;
}
/**
 * 构造「非回环请求」的信任判定。
 *
 * @param readConnection 惰取 connection 服务（调用期读取：本插件 apply 时宿主服务可能还没组合）
 * @param log 诊断出口（判定抛错时留一行，随后 fail-closed）
 */
export declare function createHostRequestTrust(readConnection: () => unknown, log?: TrustLog): RequestTrustResolver;
/** 安装所需的宿主上下文最小形状（只取 effect 与 get，避免依赖 Cordis 类型）。 */
export interface TrustInstallContext {
    effect(callback: () => () => void, label: string): unknown;
    get(name: string): unknown;
}
/**
 * 把宿主信任面装进 kit 围栏（组合根只需一行）。
 *
 * 用 ctx.effect 安装 = 卸载/重载插件时自动卸回严格回环，不残留上一实例的判定闭包
 * （闭包捕获的是旧 ctx：旧实例卸载后它读到的 connection 服务可能是失效引用）。
 */
export declare function installHostRequestTrust(ctx: TrustInstallContext, log?: TrustLog): void;
