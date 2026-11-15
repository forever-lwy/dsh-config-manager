/** 与 analyzer.createImportPlan 的 needsRestart 判定同一事实源（避免两处规则漂移）。
 *  plan.needsRestart 由「存在 Install 项 或 mcp 非 skip/warning 变更」推出；这里
 *  把实际需要重启的**项**列出来，供 UI 逐项展示（而不只是布尔）。 */
export function restartRequiredItems(plan) {
    return plan.items
        .filter((i) => i.kind === 'Install' || (i.adapter === 'mcp' && i.kind !== 'Skip' && i.kind !== 'Warning'))
        .map((i) => ({ id: i.id, adapter: i.adapter, description: i.description }));
}
/** 失败 / 用户跳过的项（结果页「重试失败/跳过的子集」的对象；引擎跳过 Skip 不算）。
 *  skippedByUser=true 或 status='failed' 才进 unresolved —— 与 ImportWizard.retryableCount
 *  的语义一致（failed || skippedByUser），避免 UI 与控制器口径漂移。 */
export function unresolvedItems(result) {
    return result.executed
        .filter((e) => e.status === 'failed' || e.skippedByUser === true)
        .map((e) => ({ id: e.itemId, status: e.status === 'failed' ? 'failed' : 'skipped', message: e.message }));
}
/**
 * 本次导入是否写入了会话文件（T2）。
 *
 * 判据 = 执行结果里**成功**的 sessions 计划项（item id 形如 `sessions:<projectPath>/<file>`）。
 * 刻意的形状判据而不是再回读盘：结果对象本身就是「这次到底做了什么」的唯一事实，
 * 回读盘会把「其它来源的会话」也算进来。`:finalize` / `:finalizeImport` 是分区收尾的
 * 合成行（不表示写入任何文件），必须排除 —— 否则「用户取消了全部会话」也会提示重启。
 */
export function sessionsRestartOf(result) {
    const count = result.executed.filter((e) => e.status === 'ok'
        && e.itemId.startsWith('sessions:')
        && !e.itemId.endsWith(':finalize')
        && !e.itemId.endsWith(':finalizeImport')).length;
    return count > 0 ? { count } : null;
}
/** 聚合收尾清单：plan（待重启项）+ result（补录凭据 / 失败跳过项 / 会话重启）。 */
export function importNextSteps(plan, result) {
    const restartItems = restartRequiredItems(plan);
    const missingSecrets = [...result.missingSecrets];
    const unresolved = unresolvedItems(result);
    const sessionsRestart = sessionsRestartOf(result);
    return {
        restartItems,
        sessionsRestart,
        missingSecrets,
        unresolved,
        hasNextSteps: restartItems.length > 0 || sessionsRestart !== null || missingSecrets.length > 0 || unresolved.length > 0,
    };
}
//# sourceMappingURL=next-steps.js.map