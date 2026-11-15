import { joinFs } from './fs.js';
import { loadSyncState, resolveDeviceIdentity, saveSyncState } from './sync-state.js';
/**
 * 把「本机自己推上去、但基线没跟上」的远端最新快照收养为基线。
 *
 * 只写 sync-state：lastSnapshotId / 每分区 hash（取**被收养快照自己**的 sectionHashes，
 * 不是本次导出结果）/ 祖先目录名（本机真有该副本才指过去，没有就保持原祖先 —— 三方合并仍成立，
 * 也不会被写成一个不存在的目录名）。
 *
 * @returns 被收养的快照 id；null = 不满足收养条件（调用方按冲突返回）
 */
export async function adoptOwnRemoteHead(opts) {
    const meta = opts.metas.find((m) => m.id === opts.remoteId);
    if (meta === undefined)
        return null;
    const device = await resolveDeviceIdentity(opts.stateDir, opts.hostname, opts.fsx, opts.msg);
    const remoteDevice = meta.manifest.deviceId;
    if (typeof remoteDevice !== 'string' || remoteDevice === '' || remoteDevice !== device.id)
        return null;
    const ancestorKnown = opts.localSnapshotsDir !== undefined
        && await opts.fsx.isDir(joinFs(opts.localSnapshotsDir, opts.remoteId));
    const state = await loadSyncState(opts.stateDir, opts.fsx, opts.msg);
    state.lastSnapshotId = opts.remoteId;
    if (ancestorKnown)
        state.ancestorId = opts.remoteId;
    for (const [sid, hash] of Object.entries(meta.sections)) {
        if (typeof hash !== 'string' || hash === '')
            continue;
        state.sections[sid] = { hash, updatedAt: meta.createdAt };
    }
    // issue #140（G-44）：被收养的快照自己就是「远端当前观测」——它的 sections 记进独立字段。
    // 空对象（加密快照）⇒ 删除观测：判定层因此回落 id 比较，绝不拿 state.sections 顶上。
    const remoteHashes = { ...meta.sections };
    if (Object.keys(remoteHashes).length > 0)
        state.lastRemoteSections = remoteHashes;
    else
        delete state.lastRemoteSections;
    state.transport = opts.transport;
    await saveSyncState(opts.stateDir, state, opts.fsx);
    opts.warnings.push(opts.msg(ancestorKnown ? 'sync.pushBaselineAdopted' : 'sync.pushBaselineAdoptedNoAncestor', {
        remote: opts.remoteId,
        base: opts.base,
    }));
    return opts.remoteId;
}
//# sourceMappingURL=baseline-heal.js.map