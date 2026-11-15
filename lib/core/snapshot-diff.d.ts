import { type DiffHunk } from '../utils/line-diff.ts';
import { type RestoreActionKind, type RestorePlan } from './restore.ts';
import type { MsgFunc } from './messages.ts';
/** 读取 / 统计上限（常量导出供测试与 UI 文案引用同一口径）。 */
export declare const SNAPSHOT_DIFF_LIMITS: {
    /** 完整 diff：单侧参与逐行对比的字节上限（超出 → 只报体积，不逐行对比） */
    readonly maxSideBytes: number;
    /** 列表统计：单侧参与行数统计的字节上限 */
    readonly maxStatSideBytes: number;
    /** 列表统计：所有文件两侧读取的总字节预算 */
    readonly maxStatTotalBytes: number;
    /** 列表统计：最多统计多少个文件（其余标记为未统计） */
    readonly maxStatFiles: 80;
    /** Myers 输入行数上限（超出 → 整块替换降级） */
    readonly maxLines: 6000;
    /** Myers 最大编辑距离 */
    readonly maxD: 400;
    /** 上下文行数 */
    readonly context: 3;
};
/** 变更状态（用户视角的 git status 语义）。 */
export type SnapshotChangeStatus = 'modified' | 'added' | 'deleted' | 'plugin' | 'hint' | 'skip';
/** 行数统计未能产出的原因。 */
export type ChangeStatSkipReason = 'too-large' | 'binary' | 'unreadable' | 'budget';
/** 列表阶段：单个恢复动作的改动摘要（与 plan.actions 下标一一对应）。 */
export interface SnapshotChangeEntry {
    /** plan.actions 下标（前端按此关联） */
    index: number;
    kind: RestoreActionKind;
    status: SnapshotChangeStatus;
    /** homeDir 相对路径（plugin 项 = 插件名；无目标时为 undefined） */
    target?: string;
    description: string;
    detail?: string;
    /** 磁盘现状是否存在 */
    beforeExists: boolean;
    /** 快照内容是否存在 */
    afterExists: boolean;
    beforeBytes?: number;
    afterBytes?: number;
    added?: number;
    removed?: number;
    statSkipped?: ChangeStatSkipReason;
}
export interface RestoreChangeSummary {
    entries: SnapshotChangeEntry[];
    /** 成功统计行数的文件数 */
    computed: number;
    /** 因体积 / 预算未统计行数的文件数 */
    skipped: number;
    /** 两侧读取的总字节数（预算口径） */
    totalBytes: number;
    /** 因总预算触顶而提前停止统计 */
    budgetExhausted: boolean;
    /** 统计口径上限（UI 提示用） */
    limits: typeof SNAPSHOT_DIFF_LIMITS;
}
/** 单侧读取结果（缺文件 = exists:false 且 text 为空串）。 */
interface SideRead {
    exists: boolean;
    bytes: number;
    /** 文本内容；null = 未读取（二进制 / 超限 / 不可读） */
    text: string | null;
    binary: boolean;
    oversized: boolean;
    unreadable: boolean;
}
/** readSide 依赖的最小 fs 能力（默认 = 真 fs）。 */
export interface SideReadIo {
    stat(abs: string): Promise<{
        isFile(): boolean;
        size: number;
    }>;
    readFile(abs: string): Promise<Buffer>;
}
/**
 * 读单侧内容。
 *
 * 三种结果必须分开：真的没有（ABSENT）/ 存在但读不出（unreadable）/ 正常读到。
 * 原先整段包一个 try + 末尾 `catch { return ABSENT }`，把「stat 成功、readFile 抛 EACCES」
 * 判成了不存在 —— 预览因此把只读文件显示成「新增」（审计 P2-6）。
 *
 * `io` 参数只为单测注入：Windows 上造不出 EACCES 夹具，而这条分支必须被真正覆盖；
 * 生产调用方一律不传（走 REAL_SIDE_IO）。
 */
export declare function readSide(abs: string, maxBytes: number, io?: SideReadIo): Promise<SideRead>;
/**
 * 列表阶段：逐动作产出变更状态 + 行数统计（零写入；不抛错）。
 * plan 为空或 action 不可分析时返回对应 entry（status='skip'），绝不抛错给路由。
 */
export declare function summarizeRestoreChanges(opts: {
    plan: RestorePlan;
    snapshotDir: string;
    homeDir: string;
    msg?: MsgFunc;
}): Promise<RestoreChangeSummary>;
/** 单侧展示信息（供 UI 显示体积 / 行数 / 二进制标记）。 */
export interface SnapshotFileDiffSide {
    exists: boolean;
    bytes: number;
    /** 行数；null = 未读取（二进制 / 超限 / 不可读） */
    lines: number | null;
    binary: boolean;
    oversized: boolean;
    unreadable: boolean;
}
export type SnapshotFileDiffReason = 'path-escape' | 'missing-blob' | 'binary' | 'too-large' | 'unreadable' | 'no-target' | 'not-diffable';
export interface SnapshotFileDiff {
    kind: RestoreActionKind;
    status: SnapshotChangeStatus;
    target?: string;
    before: SnapshotFileDiffSide;
    after: SnapshotFileDiffSide;
    hunks: DiffHunk[];
    added: number;
    removed: number;
    identical: boolean;
    /** 规模超限 → 结果仍是完整替换，只是不是最小编辑脚本 */
    degraded: boolean;
    /** 无法逐行对比的原因（有值时 hunks 为空） */
    reason?: SnapshotFileDiffReason;
    limits: typeof SNAPSHOT_DIFF_LIMITS;
}
/**
 * 单个文件的完整 diff（零写入；不抛错）。
 * 越界 / blob 缺失 / 二进制 / 超限都返回结构化 reason 而不是异常。
 */
export declare function snapshotFileDiff(opts: {
    snapshotDir: string;
    homeDir: string;
    kind: RestoreActionKind;
    target?: string;
    blobPath?: string;
    msg?: MsgFunc;
}): Promise<SnapshotFileDiff>;
export {};
