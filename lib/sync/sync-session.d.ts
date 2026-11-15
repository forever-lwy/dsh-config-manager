import type { ImportAnalysis, ImportPlan } from '../core/types.ts';
import type { SyncConfig } from './sync-config.ts';
/** 默认会话 TTL（30 分钟） */
export declare const DEFAULT_SESSION_TTL_MS: number;
/** 一次差异确认会话的完整数据 */
export interface SyncSession {
    id: string;
    /** 临时标准 ZIP（apply-items 执行 executeImportPlan 需要） */
    zipPath: string;
    plan: ImportPlan;
    analysis: ImportAnalysis;
    /** 被拉取的远端快照 id */
    snapshotId: string;
    /**
     * 被拉取的远端快照本身是否加密（issue #107 补漏；只存布尔，**绝不存密码**）。
     * apply-items 据此决定祖先副本落密文还是不落 —— 加密通道绝不写明文祖先副本。
     */
    encrypted?: boolean;
    /** 该次同步使用的通道配置（git/webdav 通用；apply-items 据此重建引擎） */
    config: SyncConfig;
    /**
     * issue #38：快照凭据载荷解密出的 `Map<ref, value>`（仅内存，随会话存活）。
     * 存在这里的理由：apply-items 是**另一次请求**，届时已无解密密码；存值比存密码
     * 能力更窄（值只能写回本机凭据，密码可解开整份快照）。
     * 生命周期与会话一致（TTL 30 分钟 / apply-items 消费 / cancel 即随会话消失），
     * 绝不落盘、绝不进响应体/日志。
     */
    credentials?: Map<string, string>;
    /** 创建时间（epoch ms） */
    createdAt: number;
    /** 过期时间（epoch ms；过期条目惰性清理） */
    expiresAt: number;
}
/** 内存会话存储；同 id 覆盖；过期条目视为不存在。 */
export declare class SyncSessionStore {
    private readonly sessions;
    private readonly ttlMs;
    private readonly now;
    constructor(opts?: {
        ttlMs?: number;
        now?: () => number;
    });
    /** 登记（或覆盖）会话；id 缺省时自动生成。createdAt/expiresAt 缺省自动填充。返回会话 id。 */
    set(session: Omit<SyncSession, 'id' | 'createdAt' | 'expiresAt'> & {
        id?: string;
        createdAt?: number;
        expiresAt?: number;
    }): string;
    /** 读取会话；过期条目返回 undefined（惰性清理）。 */
    get(id: string): SyncSession | undefined;
    /** 删除会话（cancel / apply-items 消费后调用）。 */
    delete(id: string): void;
}
