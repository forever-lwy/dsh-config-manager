/**
 * m-sync-flow：三方合并引擎（纯函数）。
 *
 * 输入：local / remote / ancestor 各分区的 SectionData + 分区 hash。
 * 输出：MergePlan（纯数据，不含副作用），由上层（SyncEngine.merge / previewMerge）交给 UI 决策。
 *
 * 每分区的决策链（顺序即优先级，与 git 的三方合并口径一致）：
 *   1. localHash == remoteHash    → skip（无变化，绝不产生多余写入）
 *   2. 仅一侧存在该分区           → 单边存在：不构成删除语义（见 §边界），按变化与否取舍
 *   3. ancestor 缺失              → conflict(reason='no-ancestor')：拒绝猜测共同祖先
 *   4. localHash == ancestorHash  → useRemote（仅远端改）
 *   5. remoteHash == ancestorHash → keepLocal（仅本地改）
 *   6. 双侧相对祖先都改           → 精细合并：
 *        - JSON 分区：递归对象合并（mergeJsonValues），冲突路径精确到叶子（'namespaces.general.value.theme'）
 *        - 分区专属钩子（GRANULAR_MERGES，当前 = workspaces）：按记录 id 做并集（sessionIds 取并集、
 *          其它字段逐键三方取舍），见 workspace-merge.ts —— 通用 JSON 合并对数组只会判冲突
 *        - FilesSection：逐 relativePath 合并，两侧都改的文本文件再走行级三方合并（mergeBytesThreeWay）
 *        - 无残留冲突 → decision='merge'（merged + autoMerged 计数）
 *        - 有残留冲突 → decision='conflict'（merged 为 undefined：绝不把半成品当结果）
 *
 * 安全约束（改这里前先读）：
 *  - 数组**绝不**按索引合并：双侧都改且不逐字相等 → 冲突（reason='array'）。语义不明的合并比冲突更危险。
 *  - 二进制 / 超大文件不做文本合并（mergeBytesThreeWay 会如实拒绝）→ 保留冲突交用户裁决。
 *  - 绝不静默丢弃任一侧的未知字段 / 插件配置 / 用户数据：递归合并只对「双侧都改同一处」报冲突，
 *    单侧新增/修改的键一律保留。
 *  - ancestor 缺失时退化为两方：差异一律整分区 conflict（拒绝猜测共同祖先）。
 *
 * 边界（有意如此，勿“修复”）：分区在某侧**缺失**不等于「该侧删了这个分区」—— 同步只搬本轮
 * 勾选的分区，可选分区（sessions/mcp）未勾选时为缺失。因此分区级缺失不判删除冲突；
 * 文件级（FilesSection 内的 relativePath）才是真正的删除语义，那里按 modify/delete 判冲突。
 */
import type { SectionData, SectionId } from '../schema/types.ts';
import type { GranularMergeHooks } from './workspace-merge.ts';
/**
 * 分区级决胜结果（三方合并，2026-10 收口）：
 *  - 'skip'      ：双侧相对祖先都未改（或本就无变化）—— 不产生任何写入；
 *  - 'useRemote' ：仅远端相对祖先改了（本地未改）→ 远端整分区原值胜出；
 *  - 'keepLocal' ：仅本地相对祖先改了（远端未改）→ 本地整分区原值胜出；
 *  - 'merge'     ：双侧都改，但**精细合并成功**（无残留冲突）→ merged 为合并结果。
 *    'merge' 绝不等于 'useRemote'：把自动合并读成「用了远端」会让 UI/日志谎报数据来源。
 *  - 'conflict'  ：双侧都改且无法安全自动合并 → merged 为 undefined，仅 conflicts 有值。
 */
export type MergeDecision = 'useRemote' | 'keepLocal' | 'merge' | 'skip';
/** 冲突成因（可选字段：旧调用方/旧数据没有它，UI 缺省按 'both-modified' 措辞）。 */
export type MergeConflictReason = 'both-modified' | 'modify-delete' | 'delete-modify' | 'no-ancestor' | 'binary' | 'too-large' | 'overlap' | 'array' | 'format' | 'section';
/** 分区内精细合并产生的单条冲突（JSON 叶子 / FilesSection 单文件）。 */
export interface MergeConflict {
    /** 冲突位置：JSON 分区是**点号路径**（'a.b.c'，整分区为 '$'）；FilesSection 是 relativePath。 */
    path: string;
    kind: 'key' | 'file';
    /** 冲突成因（可选：旧数据没有该字段；UI 缺省按 'both-modified' 措辞） */
    reason?: MergeConflictReason;
    /** 是否已尝试自动合并（true + reason='binary'/'too-large'/'array' = 试过但不安全，故留冲突） */
    autoMergeAttempted?: boolean;
    local?: unknown;
    remote?: unknown;
    ancestor?: unknown;
}
export interface MergeSectionResult {
    id: SectionId;
    /** 分区级决策；'skip' 时无 merged/conflicts；'conflict' 时 merged 为 undefined（仅 conflicts）。 */
    decision: MergeDecision | 'conflict';
    /** decision 为 'useRemote' / 'keepLocal' / 'merge' 时为整分区数据（原值或合并结果）。 */
    merged?: SectionData;
    /** 仅 decision === 'conflict' 时非空：分区级冲突或精细合并后剩余冲突。 */
    conflicts: MergeConflict[];
    /**
     * 自动合并并入的变更点数量（仅 decision === 'merge' 时有意义；缺省 undefined = 未统计）。
     * UI 用它区分「远端整分区覆盖」与「双方改动都保住了」。
     */
    autoMerged?: number;
}
export interface MergePlan {
    /** 每分区的合并结果；仅含 local/remote/ancestor 三者任一出现的分区。 */
    sections: MergeSectionResult[];
}
/** 主入口：三方合并。纯函数，无副作用。 */
export declare function merge(local: Partial<Record<SectionId, SectionData>>, remote: Partial<Record<SectionId, SectionData>>, ancestor?: Partial<Record<SectionId, SectionData>>, hooks?: GranularMergeHooks): MergePlan;
