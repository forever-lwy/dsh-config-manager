/**
 * 离线 CLI 恢复的**自动续跑**薄封装（判定与执行都在 core，这里只做「CLI 口子」的三件事）。
 *
 * 为什么单独一层：
 *  1. `src/cli/index.ts` 卡在 1461 行棘轮上限，装配代码必须外提；
 *  2. 续跑有三处必须与宿主/GUI 保持同一口径 —— 锁前探测（决定能否放过 SAFE MODE 门）、
 *     锁内再判一次（决定 runJournaled 还是 resumeJournaled）、成功后按**同一个**
 *     resolveSafeModeMarker 解除 SAFE MODE。口径写在这里就不必在两处各写一遍。
 *
 * 注意：CLI 只续跑 `cli-restore` 自己创建的 journal。别的入口（GUI restore / model-restore）
 * 崩掉的记录在这里仍是「需要恢复面板处理」的事故 —— 三者的执行器与参数来源不同，
 * 跨入口续跑没有证据支撑（详见 docs/adr/0004）。
 */
import { resolveSafeModeMarker } from '../core/recovery-orchestrator.js';
import { probeRestoreResume, runRestoreWithResume } from '../core/restore-resume.js';
/** 锁前探测：只读，不写 journal、不碰目标文件。 */
export async function probeCliRestoreResume(recovery, restoreOpts) {
    const judged = await probeRestoreResume({
        store: recovery.store,
        restoreOpts,
        allowedOperationTypes: ['cli-restore'],
    });
    if (judged.ok) {
        return { resumable: true, reason: null, done: judged.resume.done, todo: judged.resume.todo };
    }
    // no-active-journal = 本来就没有事故，不算「拒绝」
    return {
        resumable: false,
        reason: judged.code === 'no-active-journal' ? null : judged.detail,
        done: 0,
        todo: 0,
    };
}
export async function runCliRestore(recovery, restoreOpts, lockCtx) {
    const out = await runRestoreWithResume({
        store: recovery.store,
        restoreOpts,
        operationType: 'cli-restore',
        allowedOperationTypes: ['cli-restore'],
        lockCtx,
        phase3: recovery,
    });
    if (out.resumed === null)
        return { report: out.report, resumed: null, safeModeCleared: null };
    // 续跑成功：按**同一个**判据解除 SAFE MODE（还有别的未解决 incident 时保持，返回 false）
    const cleared = await resolveSafeModeMarker(recovery.store, () => recovery.clearSafeMode(), false);
    return { report: out.report, resumed: out.resumed, safeModeCleared: cleared };
}
//# sourceMappingURL=restore-resume.js.map