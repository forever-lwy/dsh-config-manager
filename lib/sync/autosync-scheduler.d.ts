import type { Logger } from '../utils/logger.ts';
import type { MsgFunc } from '../core/messages.ts';
import type { SectionId } from '../schema/types.ts';
import type { RunRegistry } from '../core/run-registry.ts';
import type { JournalRunContext } from '../core/phase3-host.ts';
import type { SyncEngine } from './sync-engine.ts';
import type { SyncSnapshotMeta } from './transport.ts';
import type { MutationLockPort, MutationLockContext } from '../utils/env-lock.ts';
import type { AutosyncConfig, AutosyncInterval } from './autosync-config.ts';
import type { SyncConfig, SyncConfigIssue, SyncTransportType } from './sync-config.ts';
import { readSyncHistory } from './sync-history.ts';
import type { AutosyncHistoryEntry } from './sync-history.ts';
import type { AutosyncConflictPolicy } from './autosync-config.ts';
import type { MergePlan } from './merge.ts';
import type { SyncApplyPlan } from './risk.ts';
import { SyncWatcher } from './sync-watcher.ts';
/** 间隔 → ms 换算（§4.3） */
export declare function intervalToMs(interval: AutosyncInterval): number;
/**
 * 启动触发下载合并且满足阈值（now - lastRunAt >= startupMinIntervalMs）？
 * lastRunAt 为 undefined（从未运行）→ true。
 */
export declare function shouldTriggerStartupRun(lastRunAt: string | undefined, startupMinIntervalMs: number, nowMs?: number): boolean;
/** runOnce 执行结果 */
export interface AutosyncRunResult {
    status: 'success' | 'skipped' | 'failed' | 'partial';
    direction: 'pull' | 'push' | 'both' | 'none';
    skipReason?: string;
    conflictedSections?: SectionId[];
    appliedSections?: SectionId[];
    pushedSnapshotId?: string;
    pulledSnapshotId?: string;
    error?: string;
    historyId: string;
    consecutiveFailures: number;
    /**
     * SYN-05：本轮 ask 是**被强制**的（首轮或远端有新快照），不是用户选的 ask。
     * 界面据此说清「这次没让你选」，避免用户以为自己的 local 设置失效了。
     */
    forced?: boolean;
    /**
     * SEC-03：本轮 skipReason='unconfigured' 时，已落盘配置为何被读侧丢弃（地址被白名单拒绝）。
     * 缺省 undefined = 真的没配。有值就必须让用户看见 —— 否则「保存过却被拒」和
     * 「从来没配」在界面上长得一模一样，用户会反复重填同一个被拒地址。
     */
    configIssue?: string;
    /**
     * issue #136：本轮下行**实际产生的告警**（例：patch 行里被脱敏剥空的叶子已保留本机值、
     * 叶级未裁决冲突被扣下）。非空 = 有内容没落地，终态不得再报成「成功且零告警」。
     */
    warnings?: string[];
    /** issue #136：本轮被保留待裁决的叶级冲突所在分区（与 warnings 同源，供界面定位）。 */
    heldSections?: SectionId[];
}
/**
 * SYN-05：本轮冲突（下行冲突）该不该 force push —— 唯一判定点。
 *
 * 规则（缺省 ask 之上再加两道高危闸）：
 *  - 用户没选过策略 → 用缺省（ask）；
 *  - **首轮**（从未跑过）或**远端有新快照**：即使显式选了 'local' 也强制降级 ask（forcedAsk）——
 *    这两个时刻正是「远端最新改动只在历史快照里」的事故现场，静默覆盖等于替用户丢数据；
 *    降级记 forced，界面才能说清「这次没按你的 local 走」；
 *  - 只有「显式 local + 非高危时刻 + 真有冲突」才 force。
 *
 * 纯函数（无状态、无 I/O）：调度层与单测共用同一份判定，避免两处各写一遍阈值。
 */
export declare function resolveConflictPushPolicy(args: {
    configuredPolicy?: AutosyncConflictPolicy;
    firstRun: boolean;
    remoteNew: boolean;
    conflicted: number;
}): {
    policy: AutosyncConflictPolicy;
    force: boolean;
    forcedAsk: boolean;
};
/**
 * runOnce 的触发语义（只影响「做什么」的两个分支，不改变同步流程本身）。
 * reason 只进日志，用来说明这一轮是被谁叫醒的（排障时能区分「定时兜底」与「真有事发生」）。
 */
export interface AutosyncRunOptions {
    /** true = 启动触发变体：只做下行合并，不上传。 */
    startup?: boolean;
    /** 触发来源：interval / remote-poll / local-change / manual / startup / enable-toggle。 */
    reason?: string;
}
/** watcher 工厂入参（缺省实现 = 真实 SyncWatcher；测试注入内存实现）。 */
export interface WatcherFactoryOptions {
    homeDir: string;
    profile: string | undefined;
    log: Logger;
    /** 一批本地改动落地（已去抖）→ 交给调度器触发一轮同步。 */
    onFlush: (changed: readonly string[]) => void;
}
export interface AutoSyncSchedulerOptions {
    syncDir: string;
    host: {
        log: Logger;
    };
    /** 注入 SyncEngine 构造器：按 SyncConfig 构造对应通道的引擎（git/webdav）。 */
    makeSyncEngine: (cfg: SyncConfig) => SyncEngine;
    /** 消息翻译器 */
    msg: MsgFunc;
    runs: RunRegistry;
    /** 时间源（测试注入） */
    now?: () => Date;
    /** 注入 autosync-config 读写（按通道；测试可内存实现） */
    readConfig?: (channel: SyncTransportType) => Promise<AutosyncConfig>;
    writeConfig?: (channel: SyncTransportType, cfg: AutosyncConfig) => Promise<void>;
    /** 注入 sync-config 读取（按通道） */
    /**
     * SEC-03：可选第二参收集「读侧被丢弃的配置成因」。既有注入实现（单参闭包）依然合法 ——
     * 少一个参数不是类型错误，缺省接线才负责真正回填。
     */
    readSyncConfigFn?: (channel: SyncTransportType, issues?: SyncConfigIssue[]) => Promise<SyncConfig | null>;
    /** 注入 sync-history 读写 */
    readHistoryFn?: () => Promise<Awaited<ReturnType<typeof readSyncHistory>>>;
    appendHistoryFn?: (entry: AutosyncHistoryEntry) => Promise<void>;
    /** 注入计时器（测试用；缺省 setInterval/clearInterval） */
    setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
    clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
    /**
     * 远端新快照检测（§3.2「下载=检测到远端新快照才拉取」）。
     * 缺省：若 engine 实现了 hasNewRemoteSnapshot() 则调用；否则视为 true（保持旧行为=每次拉取）。
     * `listed` = 本轮已取到的远端列表（查加密快照时顺手拿到）—— 传下去就不必再 list 一次。
     */
    detectRemoteNew?: (engine: SyncEngine, listed?: readonly SyncSnapshotMeta[]) => Promise<boolean>;
    /**
     * 本地配置变化检测（§3.1「上传=本地改动才推」）。
     * 缺省：若 engine 实现了 hasLocalChanges() 则调用；否则视为 true（保持旧行为=每次都推）。
     */
    detectLocalChange?: (engine: SyncEngine) => Promise<boolean>;
    /** Phase 2 跨进程环境锁端口（可选注入；缺省无锁环境——自动同步 apply（写本地配置）属 GLOBAL mutation） */
    mutationLock?: MutationLockPort;
    /** Phase 3 SAFE MODE：注入同步谓词（被挡 → autosync skip），供 withMutationLock isBlocked 用。 */
    isBlocked?: () => boolean;
    /** Phase 3 recovery（可选注入）：apply/push 包 intent journal（P0-A 接线）。 */
    phase3Recovery?: {
        runExternalIntent(opts: {
            operationType: string;
            lockCtx: MutationLockContext;
            intent: {
                adapter: string;
                ref: string;
                kind: string;
            };
            /**
             * 审计 P0-23：上下文与 runJournaled **共用同一份绑定面**（含 recordRollback）。
             * 自动同步 apply 必须把它透传给 applyMergePlan，否则引擎内部完成的整体回滚
             * 会被 executeImportPlan 正常返回，最终被记成 COMMITTED（已回滚却报成功）。
             */
            fn: (ctx?: JournalRunContext) => Promise<unknown>;
        }): Promise<{
            operationId: string;
            result: unknown;
        }>;
    };
    /**
     * 家目录（= DSH 的 $DSH_HOME）。提供时才启用「本地改动即时上行」的文件监听；
     * 缺省（测试/未接线）→ 只靠定时器与远端轮询，行为退化为改造前。
     */
    homeDir?: string;
    /** 当前 profile（决定监听 profiles/<profile>/ 下的组合 patch 与插件清单）。 */
    profile?: string;
    /** 注入 watcher 工厂（缺省 = 真实 SyncWatcher；测试可传内存实现）。 */
    makeWatcher?: (opts: WatcherFactoryOptions) => SyncWatcher;
    /** 触发合并窗口（ms）：连续保存/连续远端探测只跑一轮。缺省 3000。 */
    minTriggerGapMs?: number;
}
export declare class AutoSyncScheduler {
    private readonly syncDir;
    private readonly host;
    private readonly makeSyncEngine;
    private readonly runs;
    private readonly now;
    private readonly readConfig;
    private readonly writeConfig;
    private readonly readSyncConfigFn;
    private readonly readHistoryFn;
    private readonly appendHistoryFn;
    private readonly setTimer;
    private readonly clearTimer;
    private readonly detectRemoteNew;
    private readonly detectLocalChange;
    private readonly mutationLock;
    private readonly isBlocked;
    private readonly phase3Recovery;
    /** 本次 runOnce 由 withMutationLock 取得的下游锁上下文（供 apply/push journal-wrap），非线程级。 */
    private lockCtxForJournal;
    /** 每通道一个定时器（git/webdav 各自 enabled 时独立排期）。 */
    private readonly timers;
    /** realtime 通道的远端轮询定时器：与 interval 定时器**分开**，否则每次轮询都会重置兜底间隔。 */
    private readonly remoteTimers;
    /** 本地改动监听（只有 enabled && realtime 的通道才挂；全关 → null）。 */
    private watcher;
    /** 当前需要监听的通道（setupWatchers 计算）。 */
    private realtimeChannels;
    /**
     * 运行期到达的触发：本轮收尾后立刻补跑（绝不并发写本地配置，也绝不丢）。
     * **每通道各存一个**：单槽字段会让后到的通道覆盖先到的（审计实测：git 运行期间 webdav 的
     * remote-poll 被 git 的 local-change 覆盖 ⇒ 该通道这一轮触发永久丢失，违反上面那句「绝不丢」）。
     */
    private readonly pendingTriggers;
    /** 上次开始运行的时刻（trigger 的最小间隔合并用）。 */
    private readonly lastRunAtMs;
    /** 因最小间隔被推迟的触发（每通道至多一个）。 */
    private readonly gapTimers;
    private readonly homeDir;
    private readonly profile;
    private readonly makeWatcher;
    private readonly minTriggerGapMs;
    /** SEC-03：已 warn 过的「地址被拒」成因（键 = 通道 + 成因文本），进程内去重。 */
    private readonly reportedConfigIssues;
    private stopped;
    private running;
    /**
     * P1（2026-11-14 真机事故）：上一轮真正落盘的历史签名，见 autosync-repeat.ts。
     * 与本轮签名相同 → 这一轮不追加历史（同一结论连续播报把 200 条历史刷满、首页变成
     * 每 1 分钟一条的噪音）；但 lastRunAt / lastRunStatus / 跳过计数仍逐轮刷新。
     */
    private repeatSignature;
    /** 本轮历史是否被压掉 —— writeFinalConfig 据此保留上一条真记录的 lastRunHistoryId。 */
    private historyDeduped;
    constructor(opts: AutoSyncSchedulerOptions);
    /**
     * 追加一条自动同步历史（自动带上触发通道；0x 安全：绝不覆盖调用方显式 transport）。
     *
     * SYN-05：额外允许 forced（本轮 ask 是被强制的）。该字段不在 sync-history.ts 的
     * AutosyncHistoryEntry 里（那是另一个模块的公开契约，本轮不扩），但读写两侧都按普通对象
     * 原样透传（readSyncHistory 逐条 cast），所以运行时可稳定往返；界面按「字段有无」渲染。
     */
    private appendHistory;
    /**
     * SEC-03：「地址被拒」是持久状态，而自动同步每 interval（缺省 60s）就转一圈 ——
     * 每轮打一条日志等于把日志刷成噪音。同一 (通道 + 成因) 只 warn 一次。
     * 用户改了配置后成因文本会变（message 带真实地址/原因），自然再报一次。
     */
    private reportConfigIssue;
    /** 启动：读两个通道配置 → enabled 通道各自排定时器 → 对每个 enabled 通道执行一次启动触发。 */
    start(): void;
    /** 停止：清全部定时器、拆掉文件监听、标记不再调度；正在执行的任务允许自然结束。 */
    stop(): void;
    /** 重新加载配置（路由 POST /sync/autosync 后调用；重排所有通道定时器）。 */
    reload(): Promise<void>;
    private refreshTimers;
    /**
     * 外部触发一次运行（本地改动 / 远端探测 / 另一通道让位）。
     *
     * - 正在跑 → 记进 pendingTriggers（按通道去重，同通道后来的 reason 覆盖先前的），本轮收尾后**逐通道立刻补跑**
     *   （不并发写本地配置，也绝不丢 —— 单槽时代后到的通道会吃掉先到的 → 该通道这轮触发永久丢失）；
     * - 距上次开始不足 minTriggerGapMs → 合并成一次（连续保存只跑一轮，每通道至多一个定时器）。
     */
    trigger(channel: SyncTransportType, reason?: string): void;
    /**
     * 兜底间隔定时器：每个 enabled 通道按各自 interval 排一次性定时器，触发后**只重排自己**。
     *
     * 早期实现是「清掉全部通道再统一重排」：webdav 5m 每跑一轮就把 git 30m 的定时器清掉重排，
     * 30m 永远等不到 → 纯定时器模式下慢通道永久饥饿（审计 P5-1，虚拟时钟 180min 实测 git 只跑 1 次）。
     */
    private scheduleIntervalTimers;
    /** 单个通道的一次性 interval 排期（触发后只重排这一个通道）。 */
    private scheduleChannelTimer;
    /**
     * realtime 通道的远端轮询：按 remoteCheckMs（缺省 60s）排一次性定时器。
     * 轮询只是「叫醒一轮 runOnce」—— 是否真的下载仍由 detectRemoteNew 判定，
     * 所以哪怕每 60s 叫醒一次，无变化时也只会记一条 upToDate 而不会反复传输。
     */
    private scheduleRemoteTimers;
    /** 按「enabled && realtime」重算监听集合：需要就挂、全关就拆（绝不留下空转句柄）。 */
    private setupWatchers;
    /** watcher 回调：任一批改动 → 让所有 realtime 通道各跑一轮（各自有变化检测，不会空转传输）。 */
    private onLocalChange;
    /** 启动触发下载合并（每个 enabled 通道；受各自 startupMinIntervalMs 阈值约束）。 */
    private startupRuns;
    /**
     * 执行一次指定通道的自动同步（§6.1）。
     * @param channel - 同步通道（git / webdav；各自独立的配置与运行状态）
     * @param opts.startup - true 表示启动触发变体（只做 Phase A+B，不做 Phase C push）
     */
    runOnce(channel: SyncTransportType, opts?: AutosyncRunOptions): Promise<AutosyncRunResult>;
    private runOnceInternal;
    /**
     * 收尾：写该通道 autosync-config（lastRunAt / lastRunStatus / consecutiveFailures /
     * lastRunHistoryId / 本轮消息与跳过原因）。
     *
     * issue #79：**每一轮都必须覆盖上一轮的 lastRunMessage 与 lastRunSkipReason**。
     * 此前只在 `result.error !== undefined` 时写 lastRunMessage → 真机现场连续 16 次 skipped 期间，
     * 面板一直挂着几天前「旧地址连接超时」，用户据此去查网络；跳过原因则只进了 info 级日志
     * （默认日志级别 warn），所以「为什么没同步」在界面与日志里都看不见。
     * 现在：失败写错误原文；跳过写**结构化原因码**（界面按码取字典，语言在渲染那刻解析）；
     * 成功清空两者（空串/undefined 不进文件，见 autosync-config.toChannelPayload）。
     */
    /**
     * Phase 1：只读预检 —— 读该通道配置、列远端快照、判断「远端有新 / 本地有改动」。
     *
     * 为什么不持锁：这些步骤全是只读，但 plugins 分区的导出会为本机源（link: / file:）插件跑 npm pack
     * （真机实测 210MB 插件 44.7s/次、每轮重算）。放进 GLOBAL mutation 锁内，60s 一轮的轮询就让锁几乎
     * 全程被占，用户任何 destructive 操作都撞 423（2026-11-07 真机事故的根因）。
     * 结论**不具权威性**：调用方取到锁之后必须重跑一次（见 runOnceInternal 的 Phase 2）。
     */
    private detectPhase;
    /**
     * P2（2026-11-14 真机事故）：把「本轮被冲突挡下的分区」写进 sync-state.pendingMerge。
     *
     * 过去自动同步只在历史里留一句「冲突」，sync-state 里没有可挂入口的持久对象 ——
     * 首页「待裁决」徽章于是只有颜色没有去处，用户点不动、也不知道该去哪裁决。
     * 这里由引擎按**本轮实际合并过的远端快照 id** 落 pendingMerge（同远端快照连续冲突保留首次 since），
     * 界面据 /sync/status 的 pendingMerge 显示待裁决分区，首页那一行据此跳到同步页。
     *
     * 尽力而为：写待裁决失败绝不能把「远端有冲突」这一事实变成 failed（那会累加连续失败计数）。
     */
    private recordPendingMerge;
    private writeFinalConfig;
    /**
     * 连续失败 ≥ 3 → 通知（host.log.warn）。
     *
     * issue #105：通知的持久痕迹只留历史 entry 的 notifiedAt。
     * 此前这里把通知文案写进 autosync-config.lastRunMessage —— 那是「本轮错误原文」的字段，
     * 一个字段两种语义，界面就无法判断该显示什么；而且 entry.notifiedAt 只在内存对象上改、
     * 从未落盘（sync-history 当时只有 append），通知事实其实没留下。现在两者都走一处：
     * 通知文案只进日志，notifiedAt 落盘到历史记录。
     */
    private maybeNotify;
}
/**
 * 从 MergePlan 构造 SyncApplyPlan —— **单一决策源 = risk.ts 的 classifyMergePlan**
 * （audit-sync sync-F5）。
 *
 * 此前本函数自己写了一套「非 skip 非 conflict 一律 autoApply」的分流，绕过了风险分级：
 * medium/high 分区（plugins/mcp/workspaces…）会在无人确认时被自动写进本地，与
 * `classifyMergePlan`（低风险自动应用；medium/high → 待审）分叉；`merged === undefined`
 * 的项还会被静默丢进 skipped。
 *
 * 现在委托 classifyMergePlan（firstSync=false：真正的首次同步没有祖先基线，merge 已把
 * 两侧差异判成 conflict → 走人工确认），并把「决策明确但缺 merged 数据」的项保守改判为
 * review —— 绝不静默应用空载荷。
 */
export declare function buildAutoApplyPlan(plan: MergePlan): SyncApplyPlan;
/**
 * 同步通道是否「已配置」：git 看 git.repoUrl 非空；webdav 看 webdav.url 非空；
 * 未配置（null / 缺字段）→ false。作为 autosync 未配置跳过的判定依据。
 */
export declare function syncIsConfigured(cfg: SyncConfig | null): boolean;
/**
 * SEC-03：从读侧收集到的 issue 里挑出本通道的成因（`code(channel): message`），
 * 没有就返回 undefined —— 「真的没配」绝不伪造原因（无幻影告警）。
 * 多通道并存时只取本通道，git 的拒因不该挂在 webdav 的历史里。
 */
export declare function describeConfigIssue(issues: readonly SyncConfigIssue[], channel: SyncTransportType): string | undefined;
