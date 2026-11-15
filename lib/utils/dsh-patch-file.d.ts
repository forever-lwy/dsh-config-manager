import type { PatchFileFacade } from '../core/types.ts';
import { type MsgFunc } from '../core/messages.ts';
export interface PatchStartupView {
    entries: {
        id: string;
        name?: unknown;
    }[];
    compose: (layers: unknown[][], warn: (message: string) => void) => {
        id: string;
        name?: unknown;
    }[];
    available: (name: string) => boolean;
}
export declare class DshPatchFileFacade implements PatchFileFacade {
    private readonly homeDir;
    private readonly profile;
    private readonly msg;
    private readonly readStartup?;
    constructor(homeDir: string, profile: string, msg?: MsgFunc, readStartup?: () => Promise<PatchStartupView>);
    /**
     * 层路径 → 绝对路径。
     *
     * 只接受**已知的层路径**（用户层 / 本 profile 的 profile 层），且解析结果必须落在 home 根内：
     * 调用方传进来的是快照里存的字符串，跨机器恢复时不能让它变成任意路径写。
     * 本 profile 之外的 profile 层同样拒绝 —— 一个档案的备份不该写另一个档案的 patch。
     */
    private patchPath;
    readPatchLines(file: string): ReturnType<PatchFileFacade['readPatchLines']>;
    applyPatchChanges(file: string, changes: {
        lineId: string;
        raw: unknown;
        action: 'insert' | 'update' | 'remove';
    }[]): Promise<void>;
    /** Missing sibling layers are empty; a required startup audit refuses unreadable layers. */
    private readPatchDocQuietly;
}
