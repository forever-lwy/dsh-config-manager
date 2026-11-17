/** Messages for sync application and baseline handling. */
import { registerMessageCatalog } from '../core/engine-locale.js';
const zh = {
    'sync.pushRemoteAdvanced': '远端最新快照 {remote} 与本地基线 {base} 不一致：本次推送未执行（远端未写入、基线未改动）。请先同步远端改动；确认要用本机覆盖远端时，再显式选择强制推送。',
    'sync.pushAdvanceCheckFailed': '无法确认远端是否已被其它设备推进（{reason}）：本次推送按原样继续',
    'sync.sessionTombstonesInherited': '已从远端快照继承 {count} 条会话删除墓碑：删除继续跨设备传播（本机数据不动）',
    'sync.applyMergeResolutionsNoImporter': 'applyMergeResolutions: SyncEngine 缺少 importer（需在 options 中注入）',
    'sync.mergePendingConflicts': '仍有 {count} 个分区未裁决（{sections}）：已裁决的部分已写入本机，但基线不推进，冲突下一轮会重新出现',
    'sync.mergeHeldConflicts': '有 {count} 个叶级冲突未裁决（分区：{sections}）：这些项保持本机原值、未写入，其余内容已应用；确认后下一轮再合并',
    'sync.baselineRexportFailed': '写回成功但重新导出本机分区失败（{sections}）：无法证明基线与本机一致，本次**不记基线**（远端指针保持原值，下一轮重新合并收敛）',
    'sync.baselineIncomplete': '有 {count} 项未生效：本次不推进同步基线，保留远端快照与祖先记录以供重试。',
    'sync.pushBaselineAdopted': '远端最新快照 {remote} 是本机上次推送的（本机基线停在 {base}，上次推送在记录基线前被打断）：已把它收养为基线并继续本次推送',
    'sync.pushBaselineAdoptedNoAncestor': '远端最新快照 {remote} 是本机上次推送的，但本机没有它的本地祖先副本：已收养基线（下次合并退化为两方合并，结果仍安全）',
};
const en = {
    'sync.pushRemoteAdvanced': 'The newest remote snapshot {remote} differs from the local baseline {base}: this push did not run (nothing written remotely, baseline untouched). Sync the remote changes first, or explicitly force the push if this machine should overwrite the remote.',
    'sync.pushAdvanceCheckFailed': 'Cannot tell whether another device advanced the remote ({reason}): this push continues as-is',
    'sync.sessionTombstonesInherited': 'Inherited {count} session deletion tombstone(s) from the remote snapshot: deletions keep propagating across devices (local data untouched)',
    'sync.applyMergeResolutionsNoImporter': 'applyMergeResolutions: SyncEngine is missing the importer (must be injected via options)',
    'sync.mergePendingConflicts': '{count} section(s) still have no decision ({sections}): the decided parts were written locally, but the baseline is not advanced, so the conflicts will reappear next round',
    'sync.mergeHeldConflicts': '{count} leaf-level conflict(s) remain undecided (sections: {sections}): those items keep the local value and were not written, while the rest was applied; they merge again next round once decided',
    'sync.baselineRexportFailed': 'The write succeeded but re-exporting the local section(s) failed ({sections}): the baseline cannot be proven to match this machine, so no baseline was recorded (the remote pointer keeps its old value and the next merge converges again)',
    'sync.baselineIncomplete': '{count} item(s) did not take effect. The sync baseline was not advanced; the remote snapshot and ancestor records remain available for retry.',
    'sync.pushBaselineAdopted': 'The newest remote snapshot {remote} was pushed by this device (its baseline stopped at {base}: that push was interrupted before recording the baseline): the baseline has been adopted and this push continues',
    'sync.pushBaselineAdoptedNoAncestor': 'The newest remote snapshot {remote} was pushed by this device, but no local ancestor copy exists for it: the baseline has been adopted (the next merge degrades to a two-way merge, which is still safe)',
};
registerMessageCatalog({ id: 'sync-engine-merge', zh, en });
//# sourceMappingURL=sync-engine-messages.js.map