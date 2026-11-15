import type { RestorePlan } from './restore.ts';
export declare function restorePlanFingerprint(plan: Pick<RestorePlan, 'actions'>): string;
