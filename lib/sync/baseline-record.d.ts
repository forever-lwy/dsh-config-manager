/**
 * m-sync-flow：写基线的唯一实现（本地祖先副本 + sync-state）。
 *
 * 为什么单独成模块：这段逻辑是「祖先副本布局 + 远端指针 + 每分区 hash + 裁剪」的完整落盘决策，
 * 不需要引擎的任何其他状态（只吃快照目录、通道身份与时间）；留在 SyncEngine 里会顶穿体量棘轮。
 *
 * **两个 id 语义严格分开（P0-7），不要再混用同一个字段**：
 * - `snapshotId`：本次基线的**本地**快照对象 id，同时是本地祖先副本的目录名（写入 `ancestorId`）；
 * - `opts.remoteSnapshotId`：该基线在**远端**对应的快照 id（写入 `lastSnapshotId`）。缺省 = snapshotId
 *   （push 路径两者天然相同）；合并/应用路径**必须显式传**，否则 lastSnapshotId 会退化成「一个远端
 *   并不存在的本地 id」→ hasNewRemoteSnapshot() 恒判「远端有新生」，每轮白跑 list + download + merge。
 *   传入 `''` 表示「远端 id 未知」——宁可留空，也不要把本地 id 冒充成远端 id。
 *
 * **issue #140 / G-44**：`opts.remoteSections` 是**远端观测**（远端快照自己携带的分区哈希），
 * 与传入的 `sections`（本机观测，用来算 hasLocalChanges 的基线）是两个不同来源。
 * 早先的事故正是「一参两用」：拿本机 hash 当远端现状，判定就永远自洽、永远看不出远端真的变了。
 */
import type { Platform, SectionData, SectionId } from '../schema/types.ts';
import type { MsgFunc } from '../core/messages.ts';
import type { SnapshotFs } from './fs.ts';
import type { PendingMerge, SectionHashes } from './sync-state.ts';
export interface RecordBaselineOptions {
    writeAncestor?: boolean;
    /** 提供即把祖先副本写成**密文**（密码仅本次内存使用；issue #107） */
    ancestorPassword?: string;
    remoteSnapshotId?: string;
    /** 保留当前祖先副本与 ancestorId（缺省 false = 既有行为逐字不变） */
    preserveAncestor?: boolean;
    /** 待裁决冲突记录：null = 清除；缺省 = 不动该字段 */
    pendingMerge?: PendingMerge | null;
    /** P1-5：本轮**实际带走**的会话单元（提供即覆盖；缺省 = 保留原记录） */
    sessionUnits?: string[];
    /** P1-5：本轮累积的删除墓碑（提供即覆盖；缺省 = 保留原记录） */
    deletedSessions?: string[];
    /**
     * issue #140：本次基线对应的**远端观测**（远端快照实际携带的分区哈希，G-44）。
     *
     * - 提供且非空 ⇒ 原样记录（只允许来自「真的看到了远端 sections」的调用点）；
     * - 提供但为空（加密快照）或未提供 ⇒ 指针若发生变化则**删除**既有观测（未知 ⇒ 判定回落 id）；
     * - 指针未变（preserveAncestor 的待裁决冲突）⇒ 保留既有观测（远端没动，观测仍成立）。
     * 绝不允许由传入的 `sections`（本机观测）推导。
     */
    remoteSections?: SectionHashes;
}
/** 落盘所需的环境（引擎逐字段透传；此处不持有引擎实例）。 */
export interface RecordBaselineEnv {
    fsx: SnapshotFs;
    stateDir: string;
    localSnapshotsDir?: string;
    dshVersion: string;
    platform: Platform;
    transport: {
        type: string;
        ref: string;
    };
    now: () => Date;
    msg: MsgFunc;
}
export interface RecordBaselineInput {
    snapshotId: string;
    /** 基线**恒为明文**（加密快照的基线 hash 也用明文算，供 hasLocalChanges 比较）。 */
    sections: Partial<Record<SectionId, SectionData>>;
    nowIso?: string;
    opts?: RecordBaselineOptions;
    env: RecordBaselineEnv;
}
export declare function recordBaseline(input: RecordBaselineInput): Promise<void>;
