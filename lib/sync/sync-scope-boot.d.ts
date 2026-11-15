import type { SyncTransportType } from './sync-config.ts';
import { type SyncScope } from './sync-scope.ts';
/** 只用到三个方法的凭据端口（与 DSH CredentialProvider 同形）。 */
export interface SyncScopeCredentialPort {
    describe(ref: string): Promise<{
        configured: boolean;
    }>;
    resolve(ref: string): Promise<{
        value?: unknown;
    } | undefined>;
    set(ref: string, value: string): Promise<void>;
}
/** 同步密码「是否已保存」视图（只回布尔；密码值永不进任何响应）。 */
export interface SyncPasswordViews {
    syncPasswordConfigured: (ref: string) => Promise<boolean>;
    syncCredentialsByChannelView: () => Promise<Record<SyncTransportType, {
        encryptPasswordConfigured: boolean;
        decryptPasswordConfigured: boolean;
    }>>;
}
/**
 * 启动期继承（**异步 + best-effort**）：失败只记日志，绝不影响插件挂载 ——
 * 最坏结果只是该档案「同步未配置」，用户重填一次即恢复。
 *
 * 幂等由作用域目录本身决定（见 `adoptLegacySyncScope`）：目录已存在就不再继承。
 */
export declare function bootSyncScope(scope: SyncScope, credentials: SyncScopeCredentialPort, warn: (line: string) => void): void;
/**
 * 密码槽位视图工厂。
 *
 * @param credentials 凭据端口（只用来 describe，永不 resolve 出值）
 * @param profile 本档案名（槽位名按档案加后缀）
 */
export declare function makeSyncCredentialViews(credentials: SyncScopeCredentialPort, profile: string): SyncPasswordViews;
