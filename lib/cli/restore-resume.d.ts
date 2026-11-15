import type { RestoreOptions, RestoreReport } from '../core/restore.ts';
import type { Phase3Recovery } from '../core/phase3-host.ts';
import type { MutationLockContext } from '../utils/env-lock.ts';
/** 锁前探测结果（只用于「能否放过 SAFE MODE 门」与给用户的提示）。 */
export interface CliRestoreResumeProbe {
    resumable: boolean;
    /** 不可续跑时的人话原因（resumable=false 且没有可续记录时也为 null 之外的短句） */
    reason: string | null;
    done: number;
    todo: number;
}
/** 锁前探测：只读，不写 journal、不碰目标文件。 */
export declare function probeCliRestoreResume(recovery: Phase3Recovery, restoreOpts: RestoreOptions): Promise<CliRestoreResumeProbe>;
/** 锁内执行：能续跑就接着做，否则照常新建 journal。 */
export interface CliRestoreRunOutcome {
    report: RestoreReport;
    resumed: {
        operationId: string;
        done: number;
        todo: number;
    } | null;
    /** 续跑成功且 SAFE MODE 已按判据解除（null = 本次不是续跑，未尝试） */
    safeModeCleared: boolean | null;
}
export declare function runCliRestore(recovery: Phase3Recovery, restoreOpts: RestoreOptions, lockCtx: MutationLockContext | null): Promise<CliRestoreRunOutcome>;
