/** 阶段有序表（顺序即向导前进方向）。 */
export const IMPORT_STAGES = [
    'select', 'analyze', 'decide', 'confirm', 'execute', 'done',
];
/** 向导步骤/流程阶段 → 用户视角阶段。 */
export function stageOf(step) {
    switch (step) {
        case 'select':
        case 'decrypt-archive':
            return 'select';
        case 'analyzing':
        case 'compatibility':
            return 'analyze';
        case 'preview':
        case 'conflicts':
        case 'path-mapping':
        case 'secrets':
            return 'decide';
        case 'confirm':
            return 'confirm';
        case 'importing':
            return 'execute';
        case 'result':
            return 'done';
        default:
            return 'select';
    }
}
/**
 * 步骤条的**输入选择**（2026-09 bugfix）：向导内部 step 一旦推进到「执行 / 完成」，
 * 它就是当前阶段的唯一真相 —— phase 会**停留在最后一道闸门**（confirm），因为向导流程
 * 不回退、也没有「执行/完成」这两个 FlowPhase。
 *
 * 现场：用户在确认页点「确认导入」→ step 变 importing、result 时 phase 仍是 confirm，
 * 于是步骤条一直卡在「4 确认」，执行中与导入完成后都不前进（用户报告：执行停在确认、
 * 完成后没有完成态）。
 *
 * - step ∈ {importing, result} → 用 step（执行 / 完成）；
 * - 其余：phase === 'preview' 时用 step（select/analyzing/compatibility/preview 四种真实阶段），
 *   否则 phase 本身就是流程阶段（decrypt-archive / conflicts / path-mapping / secrets / confirm）。
 */
export function importStepperSource(step, phase) {
    if (step === 'importing' || step === 'result')
        return step;
    return phase === 'preview' ? step : phase;
}
/** 构建步骤条模型（线性向导：index 之前 done，当前 current，之后 todo）。 */
export function importStepperModel(step) {
    const current = stageOf(step);
    const index = IMPORT_STAGES.indexOf(current);
    return {
        index,
        steps: IMPORT_STAGES.map((key, i) => ({
            key,
            labelKey: `import.stage.${key}`,
            state: i < index ? 'done' : i === index ? 'current' : 'todo',
        })),
    };
}
//# sourceMappingURL=import-stepper.js.map