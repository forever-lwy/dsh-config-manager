import type { ForeignPlatform } from './platform-paths.ts';
import type { ParsedTranscript, RootProbeOptions, SessionReadOutcome } from './session-source.ts';
import type { SqliteHandle } from './sqlite.ts';
export declare const CLINE_EXTENSION_DIR = "saoudrizwan.claude-dev";
export declare const CLINE_DEFAULT_DIR = ".cline";
/** 遗留 VS Code globalStorage 的三个编辑器名（chat-import discovery.mjs:61-78 逐字） */
export declare const CLINE_LEGACY_EDITORS: readonly string[];
export interface ClineRoots {
    readonly modern: string;
    /** 权威元数据索引：`<dataDir>/db/sessions.db`（modern 的兄弟目录；不存消息） */
    readonly db: string | undefined;
    readonly legacy: readonly string[];
    readonly clineDir: string;
    readonly modernFrom: 'CLINE_SESSION_DATA_DIR' | 'CLINE_DATA_DIR' | 'CLINE_DIR' | 'default';
    readonly legacyFrom: 'CLINE_LEGACY_GLOBAL_STORAGE_DIR' | 'CLINE_VSCODE_GLOBAL_STORAGE_DIR' | 'default';
}
/**
 * 三级 dataDir 解析（CLINE_SESSION_DATA_DIR > CLINE_DATA_DIR > CLINE_DIR > 默认 ~/.cline）
 * + legacy VS Code globalStorage 根（两个 override 命中即**只返回那一个**，与竞品逐字同义）。
 */
export declare function resolveClineRoots(opts: RootProbeOptions): ClineRoots;
/** 静态探测位置 = 现代根 + legacy 根（顺序即优先级；probePaths 与读盘层共用本函数） */
export declare function clineProbePaths(opts: RootProbeOptions): string[];
/** 一条已归一的会话文件（`ParsedTranscript` + 源侧 id + 存储代次） */
export interface ClineSessionFile extends ParsedTranscript {
    readonly id: string;
    readonly flavor: 'modern' | 'legacy';
}
/**
 * cwd 只认**显式权威字段**（manifest 的 cwd/workspace_root、legacy 索引的 cwdOnTaskInitialization +
 * 目标平台绝对路径校验）。旧实现对整条记录做 5 层递归深搜（cwd/path/directory/workspace 泛键）
 * → 会把工具入参里的 `path` 当会话 cwd；这里只读顶层权威字段，绝不深搜。
 */
export declare function clineCwdOf(value: unknown, platform: ForeignPlatform): string | undefined;
/** 一条 DB 索引（`<dataDir>/db/sessions.db` 的 sessions 表）：cwd/标题/创建时间/子代理判定 */
interface ClineDbEntry {
    readonly cwd?: string | undefined;
    readonly title: string;
    readonly createdAt?: number | undefined;
    readonly isSubagent: boolean;
}
/**
 * 打开着的 cline 索引库 → session_id → 元数据。
 *
 * `<dataDir>/db/sessions.db` **只存元数据索引、不存消息**（消息在 <id>.messages.json），
 * 但它是 cwd/标题/started_at 的**权威来源**；缺表/缺列/读不出来 → 空索引（回退 manifest）。
 */
export declare function readClineDbIndex(db: SqliteHandle): Map<string, ClineDbEntry>;
/** 读全部 Cline 会话（现代根 + 最多三个 legacy 根；同 id 先到先得） */
export declare function readCline(opts: RootProbeOptions & {
    readonly maxFiles?: number;
}): Promise<SessionReadOutcome<ClineSessionFile>>;
export {};
