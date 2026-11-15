import type { KernelTranscodeResult } from './kernel.ts';
import type { DshGeneration, DshSessionLogFile } from './read-dsh.ts';
import type { ForeignSource } from './registry.ts';
import type { ForeignSkip, ForeignSourceId } from './types.ts';
/**
 * 一条 DSH 日志 → sessions 分区里的一个文件（**逐字节直通**）。
 *
 * 判定顺序与 session-source.ts 的 transcodeSessionDraft 逐条对齐（版本 → id → 内容 → cwd），
 * 但「版本」这一关不是「我们会不会写」，而是**目标机读不读得了**：DSH 拒收非本 build 的
 * version（会话列表静默跳过 → 用户看到「对话消失」），所以只有 header.version == 目标版本才直通。
 */
export declare function transcodeDshLog(file: DshSessionLogFile, targetVersion: number | undefined): KernelTranscodeResult;
/**
 * 造一个 dsh 族的来源：`read` 由调用方给（dsh 用 readDshLogs，dsh4 用 readDsh4），
 * 其余装配（detect/build/evidence/labelKey）**只有这一份实现**。
 */
export declare function createDshLikeSource(id: ForeignSourceId, generation: DshGeneration, read: (opts: {
    homeDir: string;
    env: Readonly<Record<string, string | undefined>>;
    platform: string;
    projectDir?: string | undefined;
}) => Promise<{
    files: readonly DshSessionLogFile[];
    readFindings?: readonly ForeignSkip[] | undefined;
    extraSkips?: readonly ForeignSkip[] | undefined;
    extraCounts?: Readonly<Record<string, number>> | undefined;
}>): ForeignSource;
/** dsh = V3 族（v0–v3），读盘走 read-dsh.ts 的扫描器 */
export declare function createDshSource(): ForeignSource;
export declare const dshSource: ForeignSource;
