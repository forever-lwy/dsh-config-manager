/**
 * 合并预览的**可渲染视图**（分区结果 → 界面结构），与「预览产物能否与基线比对」的判定。
 *
 * 为什么独立成文件：sync-engine 已顶到文件体量棘轮（tests/file-size-ratchet.test.ts），
 * 而这两件事都只依赖 merge.ts 的结果类型与预览文本工具，不碰引擎实例状态；放这里可单测，
 * 也让引擎只管编排。类型经 sync-engine 再导出，既有导入方（model-tools 等）无需改动。
 */
import { isLocalPluginSpec } from '../core/local-plugin-pack.js';
import { previewTextOf } from './merge-preview-text.js';
/** plan 的单个分区结果 → 预览视图（三侧都只回传可读文本，绝不回传原始值）。 */
export function mergePreviewSectionView(result) {
    const conflicts = result.conflicts.map((c) => ({
        path: c.path,
        kind: c.kind,
        ...(c.reason !== undefined ? { reason: c.reason } : {}),
        localPreview: previewTextOf(c.local),
        remotePreview: previewTextOf(c.remote),
        ancestorPreview: previewTextOf(c.ancestor),
    }));
    return {
        id: result.id,
        decision: result.decision,
        ...(result.autoMerged !== undefined ? { autoMerged: result.autoMerged } : {}),
        conflictCount: result.conflicts.length,
        conflicts,
    };
}
/**
 * issue #91：走只读 `preview()` 拿到的产物，能否直接与该分区**基线 hash**（push 时按 export() 产物记录）比对。
 *
 * 为什么需要这个判定：`plugins` 适配器的 `preview()` 走 `collect(…, pack=false)` —— 刻意**不做**
 * 本地源（`link:` / `file:`）插件的 `npm pack`。于是当 profile 里存在本地源插件时，预览产物既没有
 * `localTarballs`、插件 spec 也保持原样（export() 会改写成 `file:<tarball>`），与基线**不同口径**：
 * 此时既不能断言「无变化」（本地插件源码改了体积/内容，预览看不见），也不该为了比对去打包
 * （那正是本 issue 的缺陷本身）。
 *
 * 返回 true = 该分区本趟**不可比** ⇒ 调用方只能保守报「有变化」并如实说明原因。
 * 其余分区的 preview() 产物与 export() 逐字节相同（文件类分区不走 preview()，见 previewPush）。
 */
export function previewCaliberDiffersFromExport(sectionId, data) {
    if (sectionId !== 'plugins')
        return false;
    const plugins = data.plugins;
    return Array.isArray(plugins) && plugins.some((p) => isLocalPluginSpec(p?.spec));
}
//# sourceMappingURL=merge-preview-view.js.map