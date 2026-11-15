/** boot-state 所在目录名（相对插件数据目录 dataDir）。与任何快照库无关。 */
export declare const BOOT_STATE_DIR_NAME = "boot-state";
/** 历史位置：boot-state 曾寄存在灾备快照库目录里（老用户升级时的搬迁来源）。 */
export declare const LEGACY_BOOT_STATE_DIR_NAME = "config-snapshots";
/** 上次启动结果（持久化到 <dir>/boot-state.json）。 */
export interface BootState {
    /** 本次启动开始时刻（ISO 字符串）。 */
    startedAt: string;
    /** 启动进程 pid。 */
    pid: number;
    /** 本次启动是否已判定成功。 */
    ok: boolean;
    /** 判定成功的时刻；未成功为 null。 */
    okAt: string | null;
    /** 最近一次「确认正常」的时刻（成功启动时推进）。 */
    lastGoodAt: string | null;
    /** 崩溃原因归因；无归因为 null。 */
    crashReason: CrashKind | null;
}
/** 崩溃原因分类（日志尾部签名 → 枚举；无匹配为 unknown）。 */
export type CrashKind = 'session-corrupt' | 'bundle-check' | 'patch-tree' | 'unknown';
/** 本次启动的 boot alert（结构化判定结果，无用户文案）。 */
export interface BootAlert {
    /** 是否判定为「上次启动崩溃」。 */
    crashed: boolean;
    /** 最近一次确认正常的时刻（供「恢复最后正常快照」使用）。 */
    lastGoodAt: string | null;
    /** 崩溃原因；未崩溃或无证据为 null。 */
    crashReason: CrashKind | null;
    /** 建议用户采取的动作，枚举而非文案。 */
    advice: CrashAdvice;
}
/** 建议动作（枚举码；文案由宿主 i18n 决定）。 */
export type CrashAdvice = 'none' | 'restore-last-good' | 'repair-session' | 'check-bundles' | 'check-patch-tree';
/** 按日志尾部签名分类崩溃原因；无匹配返回 'unknown'。 */
export declare function classifyCrashLog(text: string): CrashKind;
/**
 * advice 由 crashReason 决定：session-corrupt→repair-session, bundle-check→check-bundles,
 * patch-tree→check-patch-tree, unknown→restore-last-good（crashReason 为 null 时同样
 * 回退 restore-last-good：崩溃但无归因证据，只有「回到最后正常」这一条稳妥动作）。
 * crashed=false 时 advice='none'。
 */
export declare function adviceFor(kind: CrashKind | null, crashed: boolean): CrashAdvice;
/** 只读读取 boot-state；缺失/损坏/非法一律返回 null（绝不抛）。 */
export declare function readBootState(dir: string): Promise<BootState | null>;
/**
 * 原子写入 boot-state（用 ../utils/atomic-write.ts 的 atomicWriteFile）。失败不抛。
 * 只落盘 BootState 的六个已知字段（避免调用方对象上的额外字段进入持久化文件）。
 */
export declare function writeBootState(dir: string, state: BootState): Promise<void>;
/**
 * 把旧位置的 boot-state 搬到新目录（一次性、幂等、best-effort）。
 *
 * 背景：boot-state 曾寄生在 <dataDir>/config-snapshots/（灾备快照库目录）。灾备线收敛
 * 下线后 boot-state 搬到独立目录，老用户那份可用状态若直接不读，会表现为「丢失上次是否
 * 正常」的记录（首次判定退化为无记录）。因此启动时补一次搬迁：
 *  新目录已有 → 不动；旧目录有可用状态且新目录没有 → 原样搬过去。
 *
 * 纪律：只读旧、只写新；任何失败都不抛（返回 false），绝不影响启动。
 */
export declare function adoptLegacyBootState(legacyDir: string, dir: string): Promise<boolean>;
/**
 * 计算本次启动的 boot alert。
 * - prev 为 null（首次启动）→ crashed=false，lastGoodAt=null，crashReason=null，advice='none'；
 * - prev.ok !== true → crashed=true（上次没走到「确认成功」）；
 * - crashReason 优先沿用 prev.crashReason（上次已算过），否则若给了 logTail 就用 classifyCrashLog；
 * - crashed=false 时 crashReason 恒为 null（健康启动不做归因，见文件头「语义决策」）。
 */
export declare function computeBootAlert(prev: BootState | null, logTail: string | null): BootAlert;
/**
 * 从候选日志文件里读尾部（最多 maxBytes，默认 262144），返回第一个非空日志的文本；
 * 无则 null。单个候选不可读（不存在/无权限/是目录）不抛，直接跳到下一个。
 */
export declare function readCrashLogTail(candidates: readonly string[], maxBytes?: number): Promise<string | null>;
/**
 * 列出候选日志路径：`<homeDir>/logs/*.log`（按文件名字典序，稳定可测）与
 * `<homeDir>/dsh.log`（存在才纳入）。`logs` 目录不存在/不可读时返回空数组
 * —— 与「无候选日志」同义（不抛）。
 */
export declare function listCandidateLogs(homeDir: string): Promise<string[]>;
/** 启动生命周期辅助：apply 时调用一次，写「正在启动」（ok:false）。 */
export declare function beginBoot(pid: number, prev: BootState | null, now?: () => Date): BootState;
/**
 * 30 秒后 / dispose 时调用：标记成功并推进 lastGoodAt（ok:true、okAt=lastGoodAt=now）。
 * 同时清空 crashReason：本次启动已确认正常，陈旧归因不得延续到下一次崩溃判定。
 */
export declare function markBootOk(state: BootState, now?: () => Date): BootState;
