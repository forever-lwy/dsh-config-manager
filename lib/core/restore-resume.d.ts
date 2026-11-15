/**
 * 恢复的**自动续跑**判定（崩溃后再点一次「恢复」= 接着做，而不是整笔重来）。
 *
 * 为什么需要单独一层：恢复是多动作破坏性操作，崩在中途时 journal 里已经记了逐动作 WAL
 * （见 restore-wal.ts）。但「有 WAL」不等于「可以续跑」—— 必须能逐项**证明**：
 *   · 这条 journal 就是**同一个恢复**（操作类型 + 被恢复的快照 id 都对得上）；
 *   · 计划与 journal 登记的步骤**一一对应**（计划漂移 = 无从证明哪条 step 属于哪个动作）；
 *   · 每个动作的磁盘现状**只能**是「执行前」（beforeFp）或「执行后」（afterFp）二者之一；
 *   · 不允许有回滚痕迹 / 失败项 / 无法自证的外部副作用（插件卸载）。
 *
 * 只有全部成立才允许续跑；其中任何一条不成立都**拒绝续跑**并给出机器码 + 人话原因 ——
 * 拒绝时调用方必须**零写入**地退回原有路径（或 423 让人显式处理），绝不「估计着接着做」。
 *
 * 语义边界（刻意保守）：
 *  - 状态必须是 CREATED / SNAPSHOT_CREATED / APPLYING。CREATED/SNAPSHOT_CREATED 且**没有**
 *    任何 step ⇒ 上次连第一个写都没发生（WAL 预登记在首个写之前）⇒ 可以整笔重跑；
 *    一旦出现 step 却处在这两个状态，说明 journal 被外部改过（不可信）⇒ 拒绝。
 *  - NEEDS_ATTENTION / ROLLING_BACK / RECOVERING 一律拒绝：那些是「需要人决策」的态，
 *    自动续跑会绕过恢复面板的判定（见 docs/adr/0004）。
 *  - pluginRemove 是外部副作用（可能只改了 package.json 还没 prune node_modules），
 *    无指纹可证 ⇒ 含它的恢复**永不自动续跑**，仍交由恢复面板处理。
 */
import { JournalStore } from './journal.ts';
import type { JournalState, OperationJournal } from './journal.ts';
import type { RestoreAction, RestoreOptions, RestorePlan } from './restore.ts';
import type { MutationLockContext } from '../utils/env-lock.ts';
import type { RestoreJournalPort } from './restore-wal.ts';
/** 允许续跑的操作类型（宿主 GUI / 离线 CLI）。 */
export declare const RESTORE_RESUME_OPERATION_TYPES: readonly string[];
/** 拒绝原因码（机器码；人话在 detail，界面/CLI 直接展示 detail）。 */
export type RestoreResumeRejectCode = 'no-active-journal' | 'terminal' | 'wrong-operation' | 'rollback-in-flight' | 'no-snapshot' | 'plan-unavailable' | 'plan-drift' | 'untrusted-step' | 'external-unproven' | 'step-attention' | 'fingerprint-drift';
/** 续跑提示：交给 restore()/executeRestorePlan 的两件事（别的都不许自己推断）。 */
export interface RestoreResumeHint {
    /** 已证明「磁盘就是执行后状态」的 step id —— 本轮不重做、也不重新预登记。 */
    skipStepIds: ReadonlySet<string>;
    /** 崩溃那次 journal 里已有的 step（续跑时用来复原句柄：执行完的动作仍要 settle 成 done/attention）。 */
    steps: Readonly<Record<string, {
        beforeFp: string | null;
    }>>;
}
/** 判定通过后的续跑计划。 */
export interface RestoreResumePlan {
    operationId: string;
    operationType: string;
    state: JournalState;
    /** 已证明完成的动盘动作数 */
    done: number;
    /** 仍需执行的动盘动作数 */
    todo: number;
    hint: RestoreResumeHint;
}
export type RestoreResumeJudgement = {
    ok: true;
    resume: RestoreResumePlan;
} | {
    ok: false;
    code: RestoreResumeRejectCode;
    detail: string;
};
/** 判定输入。 */
export interface RestoreResumeInput {
    journal: OperationJournal;
    /** **本次重新规划**出来的动作（判定以现在的盘面为准，绝不拿 journal 里的旧计划当真相）。 */
    actions: readonly RestoreAction[];
    /** 被恢复的快照 id（必须等于 journal.snapshotId）。 */
    snapshotId: string;
    /** $DSH_HOME（把 home 相对目标解析成绝对路径）。 */
    homeDir: string;
    /** 允许续跑的操作类型（缺省 RESTORE_RESUME_OPERATION_TYPES）。 */
    allowedOperationTypes?: readonly string[];
    /** 目标文件指纹注入（缺省读盘 sha256；测试用于构造 drive 态）。 */
    fingerprintOf?: (abs: string | null) => Promise<string | null>;
    /** home 相对路径 → 绝对路径（缺省用 restore.ts 的同一份护栏）。 */
    absOfTarget?: (homeDir: string, target: string) => string | null;
}
/**
 * 严格判定「这条 journal 能否续跑」。纯读：只读 journal 与磁盘，绝不写任何东西。
 */
export declare function judgeRestoreResume(input: RestoreResumeInput): Promise<RestoreResumeJudgement>;
/** probe 的输入。 */
export interface RestoreResumeProbeOptions {
    /** journal 存储（宿主传 Phase3Recovery 已在用的那份；给了它就忽略 transactionsDir） */
    store?: JournalStore;
    /** <dataDir>/transactions */
    transactionsDir?: string;
    /** 恢复选项（含 snapshotDir/snapshotsRoot/homeDir —— 用来重新规划并判定快照可信） */
    restoreOpts: RestoreOptions;
    /** 只认这几个操作类型（缺省 RESTORE_RESUME_OPERATION_TYPES） */
    allowedOperationTypes?: readonly string[];
    /** 只判定这条 journal（恢复面板按 opId 指定时用）；不传 = 扫描 active 里匹配快照的那条 */
    operationId?: string;
    /** 已有计划（调用方刚规划过时复用，避免重复读盘/重复校验） */
    plan?: RestorePlan;
    fingerprintOf?: (abs: string | null) => Promise<string | null>;
}
/**
 * 读取 active journal → 重新规划 → 严格判定。**只读**：不写 journal、不碰目标文件。
 * 没有 active journal / 没有匹配快照的 journal → `no-active-journal`（调用方照常走原路径）。
 */
export declare function probeRestoreResume(opts: RestoreResumeProbeOptions): Promise<RestoreResumeJudgement>;
/** journal 宿主端口（Phase3Recovery 结构兼容；CLI / model-tools 用）。 */
export interface RestoreResumeJournalHost {
    runJournaled<T>(opts: {
        operationType: string;
        lockCtx: MutationLockContext;
        fn: (ctx?: RestoreJournalPort) => Promise<T>;
    }): Promise<{
        operationId: string;
        result: T;
    }>;
    resumeJournaled<T>(opts: {
        operationId: string;
        operationType: string;
        lockCtx: MutationLockContext;
        fn: (ctx?: RestoreJournalPort) => Promise<T>;
    }): Promise<{
        operationId: string;
        result: T;
    }>;
}
export interface RestoreWithResumeOptions {
    /** journal 存储（宿主传 Phase3Recovery 已在用的那份；给了它就忽略 transactionsDir） */
    store?: JournalStore;
    transactionsDir?: string;
    restoreOpts: RestoreOptions;
    /** journal 操作类型（'cli-restore' / 'restore' / 'model-tools-restore'） */
    operationType: string;
    lockCtx: MutationLockContext | null;
    phase3: RestoreResumeJournalHost | null;
    /** 允许续跑的操作类型（缺省 RESTORE_RESUME_OPERATION_TYPES） */
    allowedOperationTypes?: readonly string[];
    /** 已有计划（复用调用方刚规划的结果） */
    plan?: RestorePlan;
    /**
     * 该跑哪个执行器（缺省 core 的 restore()；宿主 GUI 有自己的执行器，故由调用方提供）。
     * 第三个参数只在**续跑**时为非 null（operationId / 已完成数 / 待做数），供调用方如实回传「这是续跑」。
     */
    execute?: (journal: RestoreJournalPort | undefined, resume: RestoreResumeHint | undefined, meta: {
        operationId: string;
        done: number;
        todo: number;
    } | null) => Promise<unknown>;
    fingerprintOf?: (abs: string | null) => Promise<string | null>;
}
export interface RestoreWithResumeResult<T> {
    report: T;
    /** 续跑信息（null = 这是一次全新恢复，不是续跑） */
    resumed: {
        operationId: string;
        done: number;
        todo: number;
    } | null;
}
/**
 * 「有未完成就续跑，否则照常执行」的统一入口（CLI / model-tools 共用）。
 *
 * 判定在**已持锁之后**再跑一次（此处即持锁内），因为锁前的判定只用于「能否放过 SAFE MODE 门」；
 * 真正决定要不要写盘的是这一次 —— 判定不过就退回 runJournaled 的正常路径（会因 active≤1 抛出
 * TransactionRecoveryRequiredError，交给恢复面板处理，绝不硬来）。
 */
export declare function runRestoreWithResume<T = unknown>(opts: RestoreWithResumeOptions): Promise<RestoreWithResumeResult<T>>;
