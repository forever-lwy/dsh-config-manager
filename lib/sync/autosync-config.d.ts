import type { SyncTransportType } from './sync-config.ts';
export declare const AUTOSYNC_CONFIG_FILE = "sync-autosync.json";
export declare const AUTOSYNC_CONFIG_SCHEMA_VERSION = 2;
/** 统一间隔类型 */
export type AutosyncInterval = '5m' | '15m' | '30m' | '60m' | '6h' | '12h' | '24h';
/** 缺省间隔 */
export declare const DEFAULT_AUTOSYNC_INTERVAL: AutosyncInterval;
/** 缺省启动触发最小间隔阈值（5 分钟，防频繁重启反复同步） */
export declare const DEFAULT_STARTUP_MIN_INTERVAL_MS: number;
/** 缺省开启「本地改动即时触发」（真·自动同步；关闭后退回纯定时器） */
export declare const DEFAULT_AUTOSYNC_REALTIME = true;
/**
 * 缺省远端轮询间隔（realtime 开启时与本地监听并行：本地改动即时上行，远端改动最迟 5 分钟内下行）。
 *
 * 2026-11-09 由 60s 改为 5 分钟（用户拍板）：远端探测本身很便宜，但过去每轮还会顺带做一次本地
 * 全量导出判定，plugins 分区要为每个本机源插件跑 npm pack（真机 12 个 ≈12 s、单个 210MB 44.7 s）
 * ⇒ 60 s 一轮等于长期占用一个核。本地改动的即时性由文件监听负责（local-change 触发），
 * 兜底由 interval 负责，远端「有没有新快照」不需要 1 分钟一问。旧配置里已写死的值不在此处迁移
 * （用户显式选过的值优先），需要改的走 POST /sync/autosync 的 remoteCheckMs。
 */
export declare const DEFAULT_AUTOSYNC_REMOTE_CHECK_MS: number;
/** 远端轮询间隔下限（15 s）：再短只是空转 fetch，收益为零 */
export declare const MIN_AUTOSYNC_REMOTE_CHECK_MS: number;
/** 远端轮询间隔上限（60 min）：比这更慢就不该叫「实时」了 */
export declare const MAX_AUTOSYNC_REMOTE_CHECK_MS: number;
/** 自动应用的最高风险等级（low = 只有低风险分区自动落盘；medium = 中风险 plugins/mcp 也自动落盘） */
export type AutosyncAutoApplyTier = 'low' | 'medium';
/** 缺省自动应用等级：medium（用户拍板：plugins/mcp 的中风险改动也要真自动，否则「同步所有改动」是假的） */
export declare const DEFAULT_AUTOSYNC_AUTO_APPLY_TIER: AutosyncAutoApplyTier;
/**
 * 双侧都改（真冲突）时的自动裁决策略：
 *  - 'ask'   ：缺省 —— 保留冲突待人工裁决，冲突期间**零写入**（下行不动、上行不 force）；
 *  - 'local' ：用户显式选中才生效 —— **保留本机并推上去**（VS Code 风格）：本机版本成为新的
 *              远端最新，被覆盖的远端版本仍留在远端历史快照里，随时可回滚。
 *
 * SYN-05 为什么把缺省从 'local' 改成 'ask'：'local' 缺省会在「首轮」与「远端刚出现新快照」
 * 这两个高危时刻静默用本机覆盖远端最新（用户根本没看见那段远端改动就被盖掉）。缺省必须选
 * **安全且可逆**的一侧 = ask；想覆盖必须自己选，且首轮 / 远端有新快照时仍降级为 ask（forced）。
 *
 * 刻意**不提供** 'remote'：采用远端需要走 applyMergeResolutions，那条路径会整体应用所有
 * 可决断分区、绕过 risk.ts 的风险分级（audit-sync sync-F5），与「分区逐档放行」冲突。
 */
export type AutosyncConflictPolicy = 'ask' | 'local';
/** 缺省冲突策略：ask（冲突待人工裁决；显式写过 local 的旧配置仍按 local 生效） */
export declare const DEFAULT_AUTOSYNC_CONFLICT_POLICY: AutosyncConflictPolicy;
/** 最近一次自动同步执行状态 */
export type AutosyncRunStatus = 'success' | 'skipped' | 'failed' | 'partial';
/** 自动同步配置（持久化面；单通道） */
export interface AutosyncConfig {
    /** 总开关（同时控制上传 + 下载） */
    enabled: boolean;
    /** 统一间隔 */
    interval: AutosyncInterval;
    /** 重启触发的「自动下载合并」最小间隔阈值（ms） */
    startupMinIntervalMs: number;
    /**
     * 真·自动同步：本地文件改动后即时触发一次（缺省 true）。
     *
     * false = 退回改造前的纯定时器语义（等 interval 到点）；保留这个开关是因为
     * 「监听整棵配置目录」在某些环境（网络盘、超大 skills 树）可能带来额外 I/O。
     *
     * 可选：**读取层（parseV1Channel）恒补缺省值**，旧文件/旧夹具不需要带这个字段。
     */
    realtime?: boolean;
    /** realtime 开启时的远端轮询间隔（ms；下限 15 s、上限 60 min，缺省 60 s） */
    remoteCheckMs?: number;
    /** 自动应用的最高风险等级（缺省 medium） */
    autoApplyTier?: AutosyncAutoApplyTier;
    /** 双侧都改时的自动裁决策略（缺省 local：保留本机并推上去） */
    conflictPolicy?: AutosyncConflictPolicy;
    /** 连续失败计数（用于通知判定） */
    consecutiveFailures: number;
    /** 最近一次自动同步执行时间（ISO-8601 UTC）；''/undefined = 从未执行 */
    lastRunAt?: string;
    /** 最近一次自动同步执行状态 */
    lastRunStatus?: AutosyncRunStatus;
    lastRunMessage?: string;
    /**
     * 最近一次**跳过**的结构化原因码（issue #79）。
     *
     * 为什么是码而不是文案：语言在「取文案那一刻」解析（AGENTS.md i18n 铁律），状态行由界面
     * 按码取自己的字典；存一句当时语言的中文，用户切到英文界面后会看到中英混排。
     * 已知值见 `svc.autosyncSkip.*` 的字典键（'conflict'/'mutation-locked'/'upToDate'…），
     * **未知码一律渲染兜底文案，绝不渲染裸枚举**。
     */
    lastRunSkipReason?: string;
    /** 最近一次跳过涉及的分区数（当前仅 conflict：远端另有 N 个分区待确认） */
    lastRunSkipCount?: number;
    /** 最近一次自动同步触发的同步历史条目 id */
    lastRunHistoryId?: string;
}
/** 全通道配置视图（v2 文件直接读取；status 路由一次返回两个通道的状态）。 */
export type AutosyncConfigByChannel = Record<SyncTransportType, AutosyncConfig>;
/** 缺省配置（首次无文件 / 损坏 / 不支持 schema 时回退） */
export declare function defaultAutosyncConfig(): AutosyncConfig;
/** 远端轮询间隔夹取（非数字 / 越界一律回落到边界值，绝不写入 NaN）。 */
export declare function clampRemoteCheckMs(value: number): number;
/** 读取全部通道的自动同步配置（v2 文件；v1 迁移为 git；webdav 缺省）。 */
export declare function readAllAutosyncConfigs(dir: string): Promise<AutosyncConfigByChannel>;
/** 读取指定通道的自动同步配置；文件不存在 / 损坏 / 不支持 schema → 缺省值（不抛错）。 */
export declare function readAutosyncConfig(dir: string, channel: SyncTransportType): Promise<AutosyncConfig>;
/** 写入指定通道的自动同步配置（原子写：临时文件 + rename；保留另一通道；自动创建目录）。 */
export declare function writeAutosyncConfig(dir: string, channel: SyncTransportType, cfg: AutosyncConfig): Promise<void>;
/**
 * 可展示的「本轮失败原因」（issue #105）。
 *
 * 判据只有一条：**本轮状态真的是 failed**，才允许把 lastRunMessage 当成错误文案回传。
 * 此前状态路由无条件回传 lastRunMessage，而 POST /sync/autosync 又会把读到的旧配置原样
 * 写回 —— 于是「十天前那次失败的错误原文」会被一次纯粹改间隔的保存坐实，卡片上继续挂着
 * 早已不成立的错误，用户据此去查一个不存在的故障（真机现场：认证已修好，界面仍报认证失败）。
 *
 * 返回 undefined = 界面不得渲染任何 lastRunMessage 单元格。
 */
export declare function lastRunFailureMessage(cfg: Pick<AutosyncConfig, 'lastRunStatus' | 'lastRunMessage'>): string | undefined;
/**
 * 清空「上一轮运行结果」三字段（issue #105：配置变更 ≠ 一轮运行结果）。
 *
 * POST /sync/autosync 是**配置**写入而不是运行，写完必须把上一轮的结论清掉，否则旧结论
 * 会被当成当前结论继续展示。保留 lastRunAt/lastRunStatus 与连续失败计数：它们描述的是
 * 「上一次真的跑过什么」，不会因为改了间隔就变成假话。
 */
export declare function clearLastRunResult(cfg: AutosyncConfig): AutosyncConfig;
/**
 * 勾选「自动同步」后是否该立刻跑一轮（issue #105 建议 4）。
 *
 * 三种情况返回 false：
 *  - 本来就已经开着：这次 POST 只是改间隔 / 调阈值，不是「打开」动作；
 *  - 打开后仍在 startupMinIntervalMs 冷却窗口内：刚跑过，别连点把通道打爆；
 *  - 这次是把开关关掉：关掉当然不跑。
 * `lastRunAt` 缺失或读不出（NaN）→ 当作「很久没跑过」，该跑。
 *
 * 判据与 `autosync-scheduler.ts` 的 `shouldTriggerStartupRun` 一致；这里不能直接 import 它
 * —— 调度器依赖本模块，反向引用会成环。
 */
export declare function shouldRunOnEnable(prev: Pick<AutosyncConfig, 'enabled'>, next: Pick<AutosyncConfig, 'enabled' | 'lastRunAt' | 'startupMinIntervalMs'>, nowMs?: number): boolean;
