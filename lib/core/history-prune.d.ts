/**
 * 迁移历史自动清理的调度器（宿主只做接线，逻辑留在这里）。
 *
 * 为什么单独成文件：src/index.ts 有体量棘轮（tests/file-size-ratchet.test.ts），
 * 而这段调度与 HTTP 路由无关 —— 只依赖「历史 store + ui-prefs 策略 + 日志」三件事。
 *
 * 语义：保留上限 = ui-prefs.json 的 historyRetentionMaxEntries（缺省 1000；0 = 不限制，绝不批量删）。
 * 触发：启动后一次 + 每次历史写入成功后（写入触发按 intervalMs 节流；同时只跑一个）。
 * **不写审计条目**：清理本身若进历史，则「保留最近 N 条」永远差一条，每次写入都会再删再写
 * （自反馈 churn）；因此清理只删最旧文件，结果只进宿主日志。
 */
import { type MigrationStore } from './migration-history.ts';
/** 只用到 retention；收窄依赖便于单测替身。 */
export type HistoryPruneStore = Pick<MigrationStore, 'retention'>;
export interface HistoryPruneLogger {
    info(message: string, meta?: Record<string, unknown>): void;
    warn(message: string, meta?: Record<string, unknown>): void;
}
export interface HistoryPrunerOptions {
    history: HistoryPruneStore;
    /**
     * 读取用户配置的保留上限（原值，非法由 resolveHistoryRetention 归一）。
     * 由宿主注入：core 层不得 import ../sync/*（tests/architecture-boundaries.test.ts）。
     */
    readRetentionLimit: () => Promise<unknown>;
    log: HistoryPruneLogger;
    /** 写入触发的节流窗口（缺省 60 s）；启动触发不受它影响。 */
    intervalMs?: number;
    /** 注入时钟（测试用）。 */
    now?: () => number;
}
export type HistoryPruneTrigger = 'startup' | 'append';
/** 返回 pruneHistory(trigger)：fire-and-forget 调用，永不抛错（失败只进日志）。 */
export declare function createHistoryPruner(options: HistoryPrunerOptions): (trigger: HistoryPruneTrigger) => Promise<void>;
