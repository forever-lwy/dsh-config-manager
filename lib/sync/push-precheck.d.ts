import type { SnapshotFs } from './fs.ts';
import type { RemoteSnapshotIndex } from './session-tombstones.ts';
import type { SyncTransport } from './transport.ts';
import type { MsgFunc } from '../core/messages.ts';
export interface PushBaseOptions {
    stateDir: string;
    fsx: SnapshotFs;
    localSnapshotsDir?: string;
    /** SYN-02：本轮已列过的远端 index（推进检测与墓碑继承共用同一份）。 */
    index: RemoteSnapshotIndex;
    transport: Pick<SyncTransport, 'type'> & {
        ref: string;
    };
    hostname?: string;
    msg: MsgFunc;
    warnings: string[];
}
export type PushBaseOutcome = {
    ok: true;
    base: string;
    adopted?: string;
} | {
    ok: false;
    message: string;
};
/**
 * 判定本机能否继续推送，返回可用的基线。
 *
 * - 首次同步（没有基线）→ 放行；远端为空 → 放行（没有可比对的快照）。
 * - 读不到远端列表 → **告警放行**（上传本身会再暴露通道问题），绝不把「读不到」当「没变」。
 * - 远端最新快照就是当前基线 → 放行。
 * - 远端最新快照是本机自己推的 → 收养为基线后放行（`adopted` 回传，调用方写进报告）。
 * - 其余（别的设备的改动 / 没有 deviceId 的旧快照）→ 冲突拒绝，给 force 出口。
 */
export declare function resolvePushBase(opts: PushBaseOptions): Promise<PushBaseOutcome>;
