/**
 * #136 B：合并落地的「两趟计划 + 待裁决面」，以及执行前的兜底快照。
 *
 * **旧实现的坑**：`strategy: 'replace'` + 空 `resolutions` 规划。冲突只在外部分流到
 * 分区级，而被放行分区里的叶级差异项在计划里是 `Conflict`；`replace` 把它们**不分来源**
 * 统一翻成 `Update` → 落盘，等于「未裁决也按远端覆盖」，且报告 review 恒空 ——
 * 用户既没同意，事后也无从知道。
 *
 * **现口径**：
 * - **分区级裁决 → 逐项 resolutions**：本次要应用的分区（`appliedIds`：autoApply + 会话
 *   伴随的 workspaces）其叶级差异已由分区裁决（useRemote/useMerged/keepLocal）决定，于是
 *   显式给这些项 `useImported`（合并路径的 ZIP 载荷本身就是裁决结果 —— merge 分区的
 *   merged 已含双方改动，keepLocal 分区的 merged 就是本机值）。
 * - **没有分区裁决覆盖的项保持 `Conflict`**：不写盘（`planItemWritesTarget()`，
 *   `src/core/backup.ts` 拦下），并列进报告的待裁决面 —— 绝不由全局策略暗中落盘。
 * - **两趟计划的理由**：resolutions 要按 **item id** 给，而 id 只有计划才知道（各适配器
 *   自己算）。第一趟用 `merge` + 空 resolutions 只做「探测」，零写入；只有探测出
 *   「可裁决的 Conflict」时才补一遍 resolutions 重算 —— 无差异的常规合并仍然只有一趟。
 */
import { createSnapshot, FileSnapshotStore } from '../core/backup.js';
export async function planMergeApply(input) {
    const probePlan = await input.createImportPlan(input.zipPath, {
        strategy: 'merge',
        resolutions: {},
        pathMappings: input.pathMappings,
    });
    const decidedSections = new Set(input.appliedIds);
    const decidable = probePlan.items.filter((i) => i.kind === 'Conflict' && decidedSections.has(i.adapter));
    let plan = probePlan;
    if (decidable.length > 0) {
        const injected = new Set(decidable.map((i) => i.id));
        const decidedPlan = await input.createImportPlan(input.zipPath, {
            strategy: 'merge',
            resolutions: Object.fromEntries([...injected].map((id) => [id, 'useImported'])),
            pathMappings: input.pathMappings,
        });
        // #136 A：这些 `useImported` 是**分区级**裁决换来的，不是人对这一行的确认 ——
        // 标成 `decidedBy: 'section'`，写回守卫据此只保留被剥空叶子（其余照常落地）。
        // 漏标就会让自动同步（零 UI）把脱敏剥离的空值当用户主动清空写下去。
        plan = {
            ...decidedPlan,
            items: decidedPlan.items.map((i) => (i.conflict && injected.has(i.id)
                ? { ...i, conflict: { ...i.conflict, decidedBy: 'section' } }
                : i)),
        };
    }
    const held = plan.items.filter((i) => i.kind === 'Conflict');
    const heldReview = held.map((i) => ({
        id: i.id,
        sectionId: i.adapter,
        kind: 'key',
        description: i.description,
    }));
    const heldWarnings = held.length === 0
        ? []
        : [input.heldConflictMessage(held.length, [...new Set(held.map((i) => i.adapter))])];
    return { plan, heldReview, heldWarnings };
}
/** 执行前兜底快照（拿到 restoreId 给 UI 一键回滚）；失败时把原始错误交回调用方决定文案。 */
export async function createMergeApplySnapshot(input) {
    const store = new FileSnapshotStore({ dir: input.storeDir });
    try {
        const snapshot = await createSnapshot({
            ctx: input.ctx,
            plan: input.plan,
            sourceZip: input.zipPath,
            store,
            adapters: input.adapters,
        });
        return { ok: true, store, snapshot };
    }
    catch (error) {
        return { ok: false, error };
    }
}
//# sourceMappingURL=merge-apply-plan.js.map