import { type SessionRepairAction, type SessionRepairFailure } from './session-log-repair.ts';
import { type SessionVerifyOptions, type SessionVerifyResult } from './session-verify.ts';
/** 服务层失败原因 = 执行器原因 ∪ 编排原因（机器可读；文案由界面映射）。 */
export type SessionRepairReason = SessionRepairFailure
/** unitId 不合法 / 解析不到会话目录或日志 */
 | 'unknown-unit'
/** 目标日志读不到（可能刚被移走） */
 | 'not-found'
/** 会话目录内有 session.lock：可能正被使用 */
 | 'locked'
/** 日志在静止期内被写过：可能在活跃使用中 */
 | 'busy'
/** 预览之后文件被改过（指纹不一致）—— 拒绝按旧计划写入 */
 | 'changed'
/** 台账里没有这个 repairId */
 | 'repair-not-found'
/** 这次修复已经回滚过 */
 | 'already-rolled-back'
/** 写后真 codec 复验**确定性失败**：已用本次备份自动还原（rolledBack 如实回传），这次修复没有留下来 */
 | 'verify-failed'
/** 回滚前置：目标当前 sha256 与台账记录不一致（字节被改过 —— 绝不覆盖别人的内容） */
 | 'target-changed';
/** 写入门：日志最近多久被写过就视为「仍在活跃使用」（毫秒）。 */
export declare const SESSION_REPAIR_QUIESCENT_MS = 30000;
/** 修复台账文件名（挂在插件数据目录下）。 */
export declare const SESSION_REPAIR_LEDGER_FILE = "session-repairs.json";
/** 台账最多保留的修复条数（超出丢最旧；只影响「能不能一键回滚」，备份文件本身不动）。 */
export declare const SESSION_REPAIR_LEDGER_MAX = 100;
/** 一次修复的台账记录（**绝对路径不进这里**：目录可由 unitId 重新解析）。 */
export interface SessionRepairRecord {
    repairId: string;
    unitId: string;
    sessionId: string;
    projectKey: string;
    /** 被修复的日志文件名（不含目录） */
    logName: string;
    /** 时间戳备份文件名（与日志同目录） */
    backupName: string;
    /** 修复时刻（epoch ms） */
    at: number;
    droppedRows: number;
    bytesBefore: number;
    bytesAfter: number;
    /** 修复后目标的指纹（回滚前必须仍然一致） */
    repairedSize: number;
    repairedMtimeMs: number;
    /** 已回滚时刻（epoch ms；缺省 = 未回滚） */
    rolledBackAt?: number;
    /** 这次修复含**有损**动作（截断）—— 审计用；缺省 = 零损失 */
    lossy?: boolean;
    /**
     * 备份文件的 sha256（回滚前置校验用）。
     * **可选**：旧台账记录没有它 —— 读旧记录必须兼容缺失字段（否则本机历史修复会整条被丢弃、再也回滚不了）。
     */
    backupSha256?: string;
    /** 修复后目标文件的 sha256（回滚前置：目标被改过就拒绝覆盖）。可选，同上。 */
    targetSha256After?: string;
    /** 写后真 codec 复验结论（可选，旧记录缺失 = 未记录过复验）。 */
    verify?: SessionVerifyResult;
}
/** 目标解析结果。 */
export interface SessionRepairTarget {
    unitId: string;
    projectKey: string;
    sessionId: string;
    unitDir: string;
    logName: string;
    file: string;
}
/** 预览 / 应用的结果（ok=false 时 reason 为机器可读原因）。 */
export interface SessionRepairPlanResult {
    ok: boolean;
    reason?: SessionRepairReason;
    unitId: string;
    sessionId?: string;
    logName?: string;
    /** 将丢弃（或已丢弃）的重复行数 */
    droppedRows?: number;
    bytesBefore?: number;
    bytesAfter?: number;
    /** 应用时必须回传的指纹（预览时给出） */
    expect?: {
        size: number;
        mtimeMs: number;
    };
    /** 写入门判定用到的最近写入时间（busy 时给出，界面据此说明「多久前被写过」） */
    mtimeMs?: number;
    /** 本次修复的 id 与备份名（应用成功才有） */
    repairId?: string;
    backupName?: string;
    /** 修复发生了但台账没记上（回滚入口不可用；备份文件仍在） */
    ledgerRecorded?: boolean;
    /** 计划里的动作清单（预览也回传：界面据此逐条说明「将要做什么」） */
    actions?: SessionRepairAction[];
    /** 计划含有损动作（截断）：应用时必须显式 allowLossy */
    lossy?: boolean;
    /** 保留的行数 */
    keptRows?: number;
    /** 写后真 codec 复验结论（应用期才有）—— **调用方必须据它区分「已验证可加载」与「未验证」** */
    verify?: SessionVerifyResult;
    /** 确定性失败时：是否已用本次备份自动还原（false = 目标仍是修复后字节，属危险态，必须可见） */
    rolledBack?: boolean;
}
/** 回滚结果。 */
export interface SessionRepairRollbackResult {
    ok: boolean;
    reason?: SessionRepairReason;
    repairId: string;
    unitId?: string;
    sessionId?: string;
}
/**
 * unitId（projectKey/会话目录）→ 会话根内的真实日志文件。
 *
 * 与体检同一口径：同一会话目录有多份 generation 时，取**字典序最后一份**（体检「以最新一份为准」）。
 * 路径安全：段数与形状先校验，再用 realpath + relative 确认目录确实落在会话根之内。
 */
export declare function resolveSessionUnit(sessionsDir: string, unitId: string): Promise<SessionRepairTarget | undefined>;
export declare function sessionRepairLedgerPath(dataDir: string): string;
/**
 * 读台账（只读；**绝不抛错**）。
 *
 * 读不出来 / 形状不对 → repairs=[] 且带 error 原因：调用方据此**不谎报**「没有可回滚的修复」，
 * 而是在应用期降级为「本次修复没记上账（备份仍在，可手工还原）」。
 */
export declare function readSessionRepairLedger(dataDir: string): Promise<{
    repairs: SessionRepairRecord[];
    error?: string;
    exists: boolean;
}>;
/** 写台账（原子：临时文件 + rename）。返回是否成功；失败绝不抛出。 */
export declare function writeSessionRepairLedger(dataDir: string, repairs: readonly SessionRepairRecord[]): Promise<boolean>;
/** 台账里的修复记录（界面展示用；台账文件损坏时带 error，界面据此如实提示）。 */
export declare function listSessionRepairs(dataDir: string): Promise<{
    repairs: SessionRepairRecord[];
    error?: string;
}>;
export interface SessionRepairCallOptions {
    homeDir: string;
    unitId: string;
    /** 注入当前时间（测试固定静止期判定） */
    now?: () => Date;
}
/** 预览（**只读**）：解析目标 → 过写入门 → 跑一次 apply=false 的执行器。 */
export declare function previewSessionRepair(options: SessionRepairCallOptions): Promise<SessionRepairPlanResult>;
export interface SessionRepairApplyOptions extends SessionRepairCallOptions {
    dataDir: string;
    /** 预览给出的指纹；给了就必须一致（拒绝「拿旧计划写已变的文件」） */
    expect?: {
        size: number;
        mtimeMs: number;
    };
    /** 显式放行**有损**动作（截断）；缺省 false = 有损计划一律拒绝（reason='lossy-required'） */
    allowLossy?: boolean;
    /** 真 codec 复验门的注入点（候选 / children / catalog）；缺省按本次 homeDir 走 install anchor 解析。 */
    verify?: SessionVerifyOptions;
}
/** 应用（**写**）：重跑全部前置判定 → 执行器完整安全序列 → **真 codec 复验门** → 记台账。 */
export declare function applySessionRepair(options: SessionRepairApplyOptions): Promise<SessionRepairPlanResult>;
export interface SessionRepairRollbackOptions {
    homeDir: string;
    dataDir: string;
    repairId: string;
}
/**
 * 回滚：**只接受台账里的 repairId**（客户端不能传路径）。
 *
 * 回滚是一条「用旧内容覆盖新内容」的路径，所以前置校验按 sha256 从严（台账里没有 sha256 的**旧记录**
 * 退回原来的 size+mtime 指纹，保证历史修复仍可回滚）：
 *  ① 备份文件 sha256 必须与台账一致 → 不一致 / 读不到 = reason 'backup-invalid'（备份已被换过就绝不用它覆盖任何东西）；
 *  ② 目标当前 sha256 必须与 targetSha256After 一致 → 不一致 = reason 'target-changed'（目标又被改过，绝不覆盖别人的内容）。
 * 注意①**只做 sha256 + 执行器里的结构层 sessionLogSelfCheck**：备份的职责是保真而不是合法，
 * 它可能本来就是一份修不好的日志 —— 绝不拿真 codec 门去卡它。
 */
export declare function rollbackSessionRepair(options: SessionRepairRollbackOptions): Promise<SessionRepairRollbackResult>;
