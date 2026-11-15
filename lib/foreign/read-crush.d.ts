import type { SqliteDeps, SqliteReadPart, SqliteSessionFile } from './read-opencode.ts';
import type { SqliteHandle } from './sqlite.ts';
import type { SessionReadOutcome } from './session-source.ts';
export interface CrushPathInput {
    readonly homeDir: string;
    readonly platform: string;
    readonly env: Readonly<Record<string, string | undefined>>;
}
/** 用户级目录（**只放注册表**）：`$CRUSH_GLOBAL_DATA`（绝对）> `<xdgdata>/crush` */
export declare function crushUserDataDir(opts: CrushPathInput): string;
/** 用户级注册表：`<crushUserDataDir>/projects.json` */
export declare function crushRegistryPath(opts: CrushPathInput): string;
/** 项目库：`<项目>/.crush/crush.db`（去掉项目路径尾部的分隔符，避免出现 `//` 段） */
export declare function crushProjectDbPath(platform: string, projectDir: string): string;
/**
 * 注册表 → 项目路径清单（容错四种形态，去重）：
 *  ① `["/p/a", "/p/b"]`（字符串数组）
 *  ② `[{path|project_path|directory|dir|root: "/p/a"}, ...]`（对象数组）
 *  ③ `{projects: [...]}` / `{projects: {"<路径>": {...}}}`
 *  ④ 顶层就是「路径 → 元数据」的映射
 * 认不出来的形态返回空数组（**不猜**；上层只会在「0 个项目」上如实计数）。
 */
/** 一条注册表项目：路径 + 可选 data_dir（**自定义数据目录**，库在 <data_dir>/crush.db） */
export interface CrushProjectEntry {
    readonly path: string;
    readonly dataDir?: string | undefined;
}
/** 同 crushProjectPathsOf 的四种容错形态，但额外带回 data_dir（缺省 = 库在 <项目>/.crush/crush.db） */
export declare function crushProjectEntriesOf(value: unknown): CrushProjectEntry[];
/** 项目路径清单（`crushProjectEntriesOf` 的兼容投影；公开签名保持不变） */
export declare function crushProjectPathsOf(value: unknown): string[];
/**
 * 打开着的项目库 → 该项目下每个会话一个归一文件；**返回 null ⇔ 读不到 / 不是 crush 库**。
 *
 * cwd 取会话行（若该版本有 cwd 列）→ 否则**取项目目录本身**（库就在 `<项目>/.crush/` 下，
 * 这是有证据的归属，不是猜）。
 */
export declare function readCrushDatabase(db: SqliteHandle, projectDir: string, label: string): SqliteReadPart | null;
export interface CrushReadOptions extends CrushPathInput {
    /** 显式项目目录（真值表：库在项目里，注册表查不到的项目只能由用户点名） */
    readonly projectDir?: string | undefined;
    /** 仅测试注入 */
    readonly sqliteDeps?: SqliteDeps | undefined;
}
/**
 * 读盘入口（wiring 的 `read`）：注册表 → 逐项目探测 `<项目>/.crush/crush.db` → 合并。
 *
 * 三条语义：
 *  ① 注册表不存在且没有显式 projectDir = 未安装 → 0 文件、不报码；
 *  ② 注册表存在但读不出来（0 字节/超限/畸形）→ 一条 `source-unreadable`（否则用户无法区分
 *     「Crush 没装」与「注册表坏了」）；
 *  ③ **每个项目独立报码**：一个项目的库缺失/读不到不影响其它项目（单点失败不牵连）。
 */
export declare function readCrush(opts: CrushReadOptions): Promise<SessionReadOutcome<SqliteSessionFile>>;
