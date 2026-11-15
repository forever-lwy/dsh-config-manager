import type { MsgFunc } from '../core/messages.ts';
import type { SnapshotFs } from './fs.ts';
import type { SyncSnapshotMeta } from './transport.ts';
export interface AdoptOwnRemoteHeadOptions {
    /** sync-state.json 所在目录。 */
    stateDir: string;
    fsx: SnapshotFs;
    /** 本地快照副本目录（祖先来源）；缺省 = 本机没有副本可指。 */
    localSnapshotsDir?: string;
    /** 远端快照列表（已按 createdAt 升序）。 */
    metas: readonly SyncSnapshotMeta[];
    /** 判定为「比基线新」的那份远端快照 id。 */
    remoteId: string;
    /** 本机当前基线（仅用于告警文案）。 */
    base: string;
    /** 本次通道身份（写回 sync-state.transport）。 */
    transport: {
        type: string;
        ref: string;
    };
    hostname: string;
    msg: MsgFunc;
    /** 出参：收养说明追加到这里（调用方原样带给用户）。 */
    warnings: string[];
}
/**
 * 把「本机自己推上去、但基线没跟上」的远端最新快照收养为基线。
 *
 * 只写 sync-state：lastSnapshotId / 每分区 hash（取**被收养快照自己**的 sectionHashes，
 * 不是本次导出结果）/ 祖先目录名（本机真有该副本才指过去，没有就保持原祖先 —— 三方合并仍成立，
 * 也不会被写成一个不存在的目录名）。
 *
 * @returns 被收养的快照 id；null = 不满足收养条件（调用方按冲突返回）
 */
export declare function adoptOwnRemoteHead(opts: AdoptOwnRemoteHeadOptions): Promise<string | null>;
