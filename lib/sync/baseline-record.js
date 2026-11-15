import { CURRENT_SCHEMA_VERSION } from '../schema/versions.js';
import { DEFAULT_ANCESTOR_KEEP, pruneAncestors, writeAncestor, writeEncryptedAncestor } from './ancestor.js';
import { encryptSectionsPayload } from './snapshot-crypto.js';
import { hashSection, loadSyncState, saveSyncState } from './sync-state.js';
export async function recordBaseline(input) {
    const { snapshotId, sections, env } = input;
    const opts = input.opts ?? {};
    const ts = input.nowIso ?? env.now().toISOString();
    const preserveAncestor = opts.preserveAncestor === true;
    const ancestorPassword = opts.ancestorPassword;
    const encryptedAncestor = ancestorPassword !== undefined && ancestorPassword !== '';
    const writesAncestorCopy = !preserveAncestor && env.localSnapshotsDir !== undefined && opts.writeAncestor !== false;
    // 1) 写本地祖先副本（如有 localSnapshotsDir）。
    //    ancestorPassword 提供 → 落**密文**祖先副本（issue #107：加密通道也能做三方合并）；
    //    否则落明文散文件布局（既有行为逐字不变）。
    if (writesAncestorCopy && env.localSnapshotsDir !== undefined) {
        const manifest = {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            dshVersion: env.dshVersion,
            platform: env.platform,
            sectionIds: Object.keys(sections),
            containsSecrets: false,
            // 记录触发通道（git/webdav），供同步历史展示「由哪个通道触发」
            transport: env.transport.type,
            ...(encryptedAncestor ? { encrypted: true } : {}),
        };
        if (encryptedAncestor) {
            const encryptedSections = await encryptSectionsPayload(sections, ancestorPassword);
            await writeEncryptedAncestor(env.localSnapshotsDir, { id: snapshotId, createdAt: ts, manifest, sections: encryptedSections }, env.fsx);
        }
        else {
            await writeAncestor(env.localSnapshotsDir, { id: snapshotId, createdAt: ts, manifest, sections }, env.fsx);
        }
    }
    // 2) 更新 sync-state：远端指针 + 本地祖先目录名 + 每分区 hash/updatedAt + lastSyncAt + transport
    const state = await loadSyncState(env.stateDir, env.fsx, env.msg);
    const previousPointer = state.lastSnapshotId;
    state.lastSnapshotId = opts.remoteSnapshotId ?? snapshotId;
    // issue #140（G-44）：远端观测只认调用方显式给出的「远端快照 sections」。
    // 指针变了却拿不到观测 ⇒ 删除（下一轮判定回落 id 比较），绝不沿用上一份观测冒充现状。
    if (opts.remoteSections !== undefined) {
        if (Object.keys(opts.remoteSections).length > 0)
            state.lastRemoteSections = { ...opts.remoteSections };
        else
            delete state.lastRemoteSections;
    }
    else if (state.lastSnapshotId !== previousPointer) {
        delete state.lastRemoteSections;
    }
    // preserveAncestor：祖先目录名一并保持不动（既不是 snapshotId，也不是 ''）
    if (!preserveAncestor)
        state.ancestorId = writesAncestorCopy ? snapshotId : '';
    state.lastSyncAt = ts;
    state.transport = { type: env.transport.type, ref: env.transport.ref };
    // 基线纪律：null = 清除（全部裁决完）；undefined = 不动该字段（既有调用方零感知）
    if (opts.pendingMerge === null)
        delete state.pendingMerge;
    else if (opts.pendingMerge !== undefined)
        state.pendingMerge = opts.pendingMerge;
    // P1-5：只在调用方明确提供时覆盖（否则保留既有记录，绝不因某条路径不跟踪而清空）
    if (opts.sessionUnits !== undefined)
        state.sessionUnits = [...opts.sessionUnits];
    if (opts.deletedSessions !== undefined)
        state.deletedSessions = [...opts.deletedSessions];
    for (const [sid, data] of Object.entries(sections)) {
        state.sections[sid] = { hash: hashSection(data), updatedAt: ts };
    }
    await saveSyncState(env.stateDir, state, env.fsx);
    // 3) 裁剪祖先副本（最近 N 个）；preserveAncestor 时本轮没有新副本，不参与裁剪
    if (!preserveAncestor && env.localSnapshotsDir !== undefined) {
        await pruneAncestors(env.localSnapshotsDir, DEFAULT_ANCESTOR_KEEP, env.fsx);
    }
}
//# sourceMappingURL=baseline-record.js.map