import type { MsgFunc } from '../core/messages.ts';
import type { SectionData, SectionId } from '../schema/types.ts';
import type { SnapshotFs } from './fs.ts';
import './messages.ts';
export declare const SYNC_STATE_SCHEMA_VERSION = 3;
/**
 * 历史可读取版本（均在内存中迁移到当前版本，不就地改写磁盘）：
 * - v1：缺 lastSnapshotId → lastSnapshotId=''（无祖先指针）；
 * - v2：lastSnapshotId **混用**了「远端快照 id」与「本地祖先副本目录名」两种语义（P0-7）→
 *   原值同时补进 ancestorId，两边都不丢（v2 无法事后区分该值来自 push 还是 merge/apply）；
 * - v3：lastSnapshotId 只表示远端快照 id，ancestorId 只表示本地祖先副本目录名。
 */
export declare const SYNC_STATE_SUPPORTED_VERSIONS: readonly number[];
export declare const SYNC_STATE_FILE = "sync-state.json";
/** 单个分区的同步状态：内容 hash + 最近变更时间 */
export interface SyncSectionState {
    hash: string;
    updatedAt: string;
}
/**
 * 分区 id → 内容哈希（= hashSection 的结果）。
 *
 * 同一个形状服务两种**完全不同**的观测，调用方必须分清（G-44：
 * docs/known-issues/known-gaps.md 的「祖先副本与 state.sections 一参两用」）：
 * - `SyncState.sections`：**本机**文件最近一次基线的内容哈希（含本机尚未推送的改动）；
 * - `SyncState.lastRemoteSections`：上一次**远端快照实际携带**的分区哈希（远端观测）；
 * - 推送前刚导出的本地哈希（content-diff.hashSections）。
 * 内容判定（src/sync/content-diff.ts）只接受后两者，绝不拿 state.sections 冒充远端观测。
 */
export type SectionHashes = Partial<Record<SectionId, string>>;
/**
 * 待裁决的合并状态（基线纪律，2026-10）。
 *
 * 非空 = 上一次三方合并**仍有未裁决的冲突**，因此 lastSnapshotId 刻意**不推进**：
 * 远端的最新快照下一轮仍会被当作「比基线新」而重新合并，冲突因此重新出现，直到用户裁决完。
 * 若在冲突未裁决时就推进基线，冲突内容会在下一轮静默消失（远端那一版改动永远不再被讨论）。
 *
 * 纯可选字段：**不提升 SYNC_STATE_SCHEMA_VERSION**（旧文件缺该字段 → 读取形状逐键不变；
 * 旧版本代码读到新文件也只是忽略它）。
 */
export interface PendingMerge {
    /** 冲突所针对的**远端**快照 id（基线指针此刻仍停在更早的那一个）。 */
    remoteSnapshotId: string;
    /** 仍未裁决的分区 id（非空；空 = 没有待裁决内容，调用方应清除该字段）。 */
    sections: SectionId[];
    /** 该待裁决状态**首次**出现的时刻（ISO-8601 UTC；跨轮保留首次时间，便于界面讲「挂了多久」）。 */
    since: string;
}
/** sync-state.json 结构 */
export interface SyncState {
    schemaVersion: number;
    lastSyncAt: string;
    sections: Partial<Record<SectionId, SyncSectionState>>;
    /** 当前绑定的传输通道（type = SyncTransport.type，ref = 通道内引用，如 git 分支） */
    transport?: {
        type: string;
        ref: string;
    };
    /** 最近一次同步对应的**远端**快照 id（= 共同祖先在远端的指针）；'' = 从未同步 / 远端 id 未知 */
    lastSnapshotId: string;
    /**
     * 本地祖先副本目录名（localSnapshotsDir 下的目录名）；'' = 无本地祖先副本。
     *
     * 与 lastSnapshotId 是**两种不同语义**（P0-7），不可混用：混用会让三方合并去 load 一个并不
     * 存在的目录（加密快照 push 不落明文副本、副本还会被 pruneAncestors 裁剪），从而把整轮自动
     * 同步打成 failed 并每轮复现。可选字段：旧调用点/旧文件缺省视为 ''（loadSyncState 恒填充）。
     */
    ancestorId?: string;
    /**
     * P1-5：上一次成功推送**实际带走**的会话单元 id。
     *
     * 与「本机现存集合」相减 = 用户删掉的对话（详见 sync/session-tombstones.ts）。
     * 缺省/空数组 = 无记录 → 本轮不做删除检测（**绝不**把「没记录」当成「全删了」）。
     */
    sessionUnits?: string[];
    /**
     * P1-5：累积的会话删除墓碑（随每次 push 的 manifest 传播；上限见 MAX_SESSION_TOMBSTONES）。
     * 本机若又出现该会话的实体，对应墓碑会被撤销（有实体 = 没删）。
     */
    deletedSessions?: string[];
    /**
     * cloud-sync 借鉴项 ⑥：本设备的**稳定**同步身份（首次推送时生成并持久化）。
     *
     * deviceId = 随机 UUID（换主机名/改机器名都不变，历史列表据此认出「同一台设备」）；
     * deviceName = 人类可读名（缺省取主机名）。缺省 = 旧文件 / 从未推送（不猜）。
     */
    deviceId?: string;
    deviceName?: string;
    /**
     * 基线纪律（2026-10）：未裁决冲突记录。非空 = 基线指针**刻意停在旧值**，
     * 让冲突在下一轮重新出现（详见 PendingMerge）。
     */
    pendingMerge?: PendingMerge;
    /**
     * issue #140：上一次**远端快照实际携带**的分区哈希（远端观测，不是本机观测）。
     *
     * 用途：拉取侧判定「远端最新快照的内容是否真的变了」——只比 id 时，任何一次新推送
     * （哪怕分区逐字相同）都会判成「有新生」，白跑 download + 三方合并。
     *
     * 纪律（G-44）：
     * - 只许由「真的看到了远端快照 sections」的路径写入（推送成功 / 推送跳过收养 / 收养孤儿头 /
     *   合并应用到某个远端快照之后）；
     * - 指针变化但本轮没有远端观测 ⇒ 必须**删除**该字段（未知 ⇒ 调用方回落 id 比较），
     *   绝不保留上一份观测冒充「远端现在也是这样」；
     * - 加密快照的 sections 恒为空（transport.ts）⇒ 该字段保持缺席，判定恒为 unknown。
     *
     * 纯可选字段：**不提升 SYNC_STATE_SCHEMA_VERSION**（旧文件缺它 → 读回形状逐键不变；
     * 旧版本代码读到新文件只是忽略它）。
     */
    lastRemoteSections?: SectionHashes;
}
/**
 * 分区内容 hash：
 * - JSON 分区：键序规范化的 JSON 序列化 → SHA-256（同一内容不同键序 → 相同 hash）
 * - 文件类分区：文件相对路径 + 文件字节 SHA-256 的有序清单 → SHA-256
 *   （文件数组顺序无关；contentHash 字段不参与，以字节为准）
 */
export declare function hashSection(data: SectionData): string;
/** 读取同步状态；文件不存在 → 返回缺省空状态（从未同步）。
 * 旧版本文件（v1/v2）→ 在内存中迁移到当前版本（见 SYNC_STATE_SUPPORTED_VERSIONS），
 * 不在磁盘上就地升级（首次 saveSyncState 时才写回新版本）。 */
export declare function loadSyncState(dir: string, fsx?: SnapshotFs, msg?: MsgFunc): Promise<SyncState>;
/**
 * 解析（必要时生成并持久化）本设备的同步身份（cloud-sync 借鉴项 ⑥）。
 *
 * - deviceId 一旦生成就持久化在 sync-state.json → 历史列表能认出「同一台设备」；
 * - deviceName 缺省取主机名，取不到（容器/无主机名）时用字典里的兜底文案，绝不写空串；
 * - **只在首次生成时写盘**（已有 id → 纯读，不产生额外写）。
 */
export declare function resolveDeviceIdentity(dir: string, hostName: string, fsx?: SnapshotFs, msg?: MsgFunc): Promise<{
    id: string;
    name: string;
}>;
/** 保存同步状态（自动创建目录） */
export declare function saveSyncState(dir: string, state: SyncState, fsx?: SnapshotFs): Promise<void>;
