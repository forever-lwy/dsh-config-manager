export type NativePickReason = 'canceled' | 'unsupported' | 'failed';
export type NativePickResult = {
    ok: true;
    path: string;
} | {
    ok: false;
    reason: NativePickReason;
    detail?: string;
};
/** 一次子进程调用的完整描述（便于单测注入假实现）。 */
export interface NativePickRun {
    file: string;
    args: string[];
    env: Record<string, string>;
    timeoutMs: number;
}
/** 子进程结果：`missing` 表示解释器/程序本身不存在（能力缺失，不是失败）。 */
export interface NativePickExec {
    code: number | null;
    stdout: string;
    stderr: string;
    missing: boolean;
}
export type NativePickSpawner = (run: NativePickRun) => Promise<NativePickExec>;
export interface NativePickOptions {
    platform?: NodeJS.Platform;
    startPath?: string | undefined;
    title?: string | undefined;
    timeoutMs?: number;
    spawner?: NativePickSpawner;
}
/** 起始路径 / 标题的环境变量名（不进 argv，见文件头）。 */
export declare const PICK_ENV_START = "DCM_PICK_START";
export declare const PICK_ENV_TITLE = "DCM_PICK_TITLE";
/**
 * 子进程执行器：不经过 shell，纯 argv。
 *
 * `ENOENT` 必须和「退出码非 0」分开 —— 前者是**这台机器没有这个程序**（能力缺失 ⇒ 回落内置
 * 浏览器），后者是对话框自身出错（如实报告但仍回落）。两者混起来会让「Linux 没装 zenity」
 * 被当成失败弹红条。
 */
export declare function defaultSpawner(run: NativePickRun): Promise<NativePickExec>;
/**
 * 弹原生目录选择器。
 *
 * 返回三态：`ok`（用户选了）/ `canceled`（用户关了窗口）/ `unsupported`、`failed`（回落内置浏览器）。
 * 绝不让「对话框不可用」变成用户的操作死路。
 */
export declare function pickNativeDirectory(options?: NativePickOptions): Promise<NativePickResult>;
