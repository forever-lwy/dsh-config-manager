import type { SessionLogHeader } from '../utils/session-log.ts';
import type { RootProbeOptions, SessionReadOutcome } from './session-source.ts';
export declare const DSH_HOME_ENV = "DSH_HOME";
export declare const DSH_DEFAULT_DIR = ".dsh";
export declare const DSH_SESSIONS_SUBDIR = "sessions";
/** 代次族：v3 = V3 族（v0–v3），v4 = V4 */
export type DshGeneration = 'v3' | 'v4';
export interface DshResolvedHome {
    readonly home: string;
    readonly overridden: boolean;
}
/** DSH_HOME（非空即替换；只报键名）→ 默认 ~/.dsh */
export declare function resolveDshHome(opts: RootProbeOptions): DshResolvedHome;
/** 单根：<DSH_HOME>/sessions（桌面端 %APPDATA%/dsh-desktop/harness 是**另一个域**，不在自动根里） */
export declare function dshSessionsRoot(opts: RootProbeOptions): string;
export declare function dshProbePaths(opts: RootProbeOptions): string[];
/** 文件名里的版本（无后缀 = v0）；不是会话日志 → undefined */
export declare function dshVersionOfLogName(name: string): number | undefined;
/** 版本 → 代次族（0..3 → v3；4 → v4；其余/未知 → undefined，**绝不猜**） */
export declare function dshGenerationOfVersion(version: number | undefined): DshGeneration | undefined;
/** 一条待直通的会话日志（**原始字节 + 首帧 header 自证的 id/cwd/version**） */
export interface DshSessionLogFile {
    readonly id: string;
    readonly cwd: string;
    readonly version: number;
    /** 源文件名（relativePath 的末段原样保留：代次后缀必须与版本一致） */
    readonly name: string;
    readonly data: Uint8Array;
}
/** 首帧 header：zstd 容器走 session-log 的解码器；明文 JSONL（无 .zstd）取首行 */
export declare function dshHeaderOfLogBytes(bytes: Uint8Array): SessionLogHeader | undefined;
export interface DshReadOptions extends RootProbeOptions {
    /** 只要这一代次族（dsh = v3，dsh4 = v4） */
    readonly generation: DshGeneration;
    readonly maxLogs?: number | undefined;
    readonly maxFileBytes?: number | undefined;
    readonly maxTotalBytes?: number | undefined;
}
/**
 * 扫描 <DSH_HOME>/sessions（两层目录 + 一层文件），按**首帧版本**做代次过滤。
 * 别的代次的日志**不是错误**（那是另一个来源的域）：只计数（extraCounts），不进 skipped。
 */
export declare function readDshLogs(opts: DshReadOptions): Promise<SessionReadOutcome<DshSessionLogFile>>;
