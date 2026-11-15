import type { PathMappingRule } from './path-mapping.ts';
/** 单条会话的修复原因（机器可读；文案由 CLI 输出层决定）。 */
export type SessionRepairReason = 
/** header 里没有 cwd（DSH 的 _no-cwd 会话）：无法判定目标目录 */
'no-cwd'
/** 同一会话的多份 generation 的 cwd 不一致：不猜哪份为准 */
 | 'inconsistent-generations'
/** 目录内有 session.lock：可能正被使用 */
 | 'locked'
/** 位置已经正确 */
 | 'already-placed'
/** 需要搬家（header 未变） */
 | 'needs-move'
/** 需要先改写首帧 cwd（路径映射命中）再搬家 */
 | 'needs-rewrite-move'
/** 同一 id 出现在多个 projectKey 目录 */
 | 'duplicate-id';
/** 一条动作的类别（决定 CLI 做什么）。 */
export type SessionRepairActionKind = 
/** 无需动作 */
'ok'
/** 搬目录到正确 projectKey 段 */
 | 'move'
/** 改写首帧 cwd 后再搬目录 */
 | 'rewrite-move'
/** 只报告，不动（缺 cwd / 加锁 / 多 generation 不一致） */
 | 'skip'
/** 重复 id 里按 --keep 保留的那一份 */
 | 'keep'
/** 重复 id 里被移到隔离目录的那一份 */
 | 'quarantine';
/** 扫描到的一条会话（由 CLI 读盘得出；规划本身不碰文件系统）。 */
export interface RepairSessionInput {
    /** 会话目录名（DSH 用 session-<uuid> 或裸 <uuid>） */
    sessionId: string;
    /** 会话目录当前所在的 projectKey 段（= 父目录名） */
    fromProjectKey: string;
    /** 会话目录绝对路径 */
    dir: string;
    /** 首帧 header 的 cwd（读不出或缺省 = 无法判定） */
    cwd?: string;
    /** 目录内有 session.lock（POSIX） */
    locked?: boolean;
    /** 该会话的多份 generation cwd 是否一致（false = 不猜） */
    consistent?: boolean;
}
export interface SessionRepairOptions {
    /** 可选路径映射（--map old=new，按顺序应用） */
    mappings?: readonly PathMappingRule[];
    /** 重复 id 时保留哪一份（绝对目录路径，或它的规范化形式） */
    keep?: string;
}
export interface SessionRepairAction {
    kind: SessionRepairActionKind;
    sessionId: string;
    dir: string;
    fromProjectKey: string;
    /** 目标 projectKey 段（move / rewrite-move 时给出） */
    toProjectKey?: string;
    /** 需要改写的首帧 cwd（rewrite-move 时给出） */
    rewrite?: {
        from: string;
        to: string;
    };
    reason: SessionRepairReason;
    /** 是否真的落盘（false = 只报告：缺 cwd / 加锁 / 未点名 keep 的重复项） */
    applies: boolean;
}
export interface SessionRepairSummary {
    scanned: number;
    ok: number;
    move: number;
    rewriteMove: number;
    skip: number;
    keep: number;
    quarantine: number;
    /** 受影响的重复 id 条数（同一 id 的多份只算一次） */
    duplicates: number;
}
export interface SessionRepairPlan {
    actions: SessionRepairAction[];
    summary: SessionRepairSummary;
}
/**
 * 规划离线修复（纯函数；顺序稳定 = 输入顺序）。
 */
export declare function planSessionRepair(sessions: readonly RepairSessionInput[], options?: SessionRepairOptions): SessionRepairPlan;
/** 报告里是否需要用户介入（重复项 / 跳过项 / 待搬迁项）。 */
export declare function sessionRepairNeedsAttention(plan: SessionRepairPlan): boolean;
