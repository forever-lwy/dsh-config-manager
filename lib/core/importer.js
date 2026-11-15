import { Analyzer } from './analyzer.js';
import { DEFAULT_ROLLBACK_ON_ERROR } from './import-defaults.js';
/**
 * 缺省值的规范定义在 `./import-defaults.ts`（零依赖，UI 向导与浏览器 bundle 也引入它）；
 * 这里再导出一份，宿主侧调用方（路由、同步通道、CLI）可以从引擎门面拿，不必记两个路径。
 */
export { DEFAULT_ROLLBACK_ON_ERROR };
export class Importer {
    analyzer;
    constructor(opts) {
        this.analyzer = new Analyzer(opts);
    }
    /**
     * 步骤 1-8 + 分析：只读，返回 ImportAnalysis（含兼容性/路径/依赖/秘密摘要）。
     * `opts.decryptedCredentials`（仅内存）= 宿主已用备份密码解开的凭据，用于填充
     * `analysis.credentials`（issue #39 Feature 2）；不传 = refs 为空数组。
     */
    analyzeImport(zipPath, opts = {}) {
        return this.analyzer.analyzeImport(zipPath, opts);
    }
    /**
     * 步骤 9：Dry Run / Preview —— 合并用户冲突决策与路径映射，输出最终可执行计划（零写入）。
     * `opts.decryptedCredentials`（仅内存）= 宿主已用备份密码解开的凭据：**参与计划生成**，
     * 让「归档里有值」的凭据都进计划（否则它们永远不会被写回，见 Analyzer.createImportPlan）。
     */
    createImportPlan(zipPath, decisions, opts = {}) {
        return this.analyzer.createImportPlan(zipPath, decisions, opts);
    }
    /** 步骤 10-14：确认 → 快照 → 执行 → 校验 → 结果；失败可整体回滚并如实报告 */
    executeImportPlan(zipPath, plan, opts) {
        return this.analyzer.executeImportPlan(zipPath, plan, {
            confirm: opts.confirm,
            secretInputs: opts.secretInputs,
            decryptedCredentials: opts.decryptedCredentials,
            rollbackOnError: opts.rollbackOnError ?? DEFAULT_ROLLBACK_ON_ERROR,
            onItem: opts.onItem,
            onItemStart: opts.onItemStart,
            onLog: opts.onLog,
            snapshotBinding: opts.snapshotBinding,
            cancelSignal: opts.cancelSignal,
            onCancelDecision: opts.onCancelDecision,
            bootSafetyAudit: opts.bootSafetyAudit,
        });
    }
}
//# sourceMappingURL=importer.js.map