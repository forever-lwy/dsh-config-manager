import { PROJECT_KEY_RE } from './session-log.ts';
import type { SessionHealthSummary, SessionHealthRow } from '../core/session-health.ts';
export { PROJECT_KEY_RE };
/** 行档默认限额（条）：超过的会话只做结构档（设计稿 §10.4 的深度解码限额）。 */
export declare const DEFAULT_DEEP_LIMIT = 200;
/** 会话单元扫描上限（防止异常大的会话库把一次体检拖成分钟级）；超出的如实计入 untested。 */
export declare const DEFAULT_MAX_UNITS = 2000;
export interface SessionHealthScanOptions {
    /** DSH home（会话根 = <home>/sessions） */
    homeDir: string;
    /** 本机 DSH 支持的会话格式版本（读不到 = undefined → 不做「超前」判定） */
    targetFormatVersion?: number;
    /** 本机工作区记录的 cwd 目录键（`projectKeyOf(path)`） */
    workspaceKeys?: ReadonlySet<string>;
    /**
     * 本机全部已知会话 id 的归一化键（父对话存在性判定）。
     *
     * **不传 = 未知**（调用方没有本机会话全量清单）→ 采集器**自证**：用本次遍历到的全部单元 id
     * 作为已知集合（见 `scanSessionHealth`），绝不伪造成「确知为空集」；传了就用调用方的
     * （UI 侧 `parentRelations` 更权威：它连注册表里的会话一起算）。
     */
    knownSessionIds?: ReadonlySet<string>;
    /** 出现在多个 projectKey 的会话 id（归一化键） */
    duplicateSessionIds?: ReadonlySet<string>;
    /** 行档条数上限（0 = 只做结构档；缺省 DEFAULT_DEEP_LIMIT）——覆盖的是**最新**的那些会话，见下 */
    deepLimit?: number;
    /** 单元数上限（缺省 DEFAULT_MAX_UNITS） */
    maxUnits?: number;
}
export interface SessionHealthScanResult {
    rows: SessionHealthRow[];
    summary: SessionHealthSummary;
    /** 因单元数上限**未体检**的会话数（>0 时界面必须写明「另有 N 条未检查」） */
    untested: number;
    /** 目录/文件读取失败次数（如实计数，绝不静默） */
    unreadableEntries: number;
    /** 会话根绝对路径（界面/诊断用） */
    sessionsDir: string;
    /** 会话根是否存在（false = 这台机器没有会话数据，不是错误） */
    sessionsDirExists: boolean;
}
/**
 * 扫描本机会话库（只读；**绝不写任何字节**，绝不抛错）。
 *
 * 任何目录/文件读不出来只计入 unreadableEntries，不中断整次体检 —— 体检本身不能成为
 * 新的故障点。
 */
export declare function scanSessionHealth(options: SessionHealthScanOptions): Promise<SessionHealthScanResult>;
