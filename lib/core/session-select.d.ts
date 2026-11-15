/**
 * 会话子集筛选（issue #39 Feature 1）：把 sessions 分区按「最新 N 个会话」挑出来。
 *
 * 三条硬规则（来自真机恢复现场）：
 *  - **单位是会话目录**：一个会话可能同时存在 `session.jsonl.zstd` 与 `session.v3.jsonl.zstd`
 *    （DSH 升级格式时留下的），只挑一份会让恢复出来的会话缺一半历史 → 选中目录即整目录带走；
 *  - **文件名判据不写死**：`session.lock` 之类运行时文件不算会话，新格式会话也不能被整批漏掉；
 *  - **按会话日志的最新 mtime 倒序**：不用目录 mtime（增量写入时不可靠）。
 *
 * 纯函数 + 注入式 mtime：不碰 fs，宿主/适配器负责提供时间，便于单测与对拍。
 */
/**
 * 会话日志文件名判据：`session` + 任意版本段 + `.jsonl`，可再带 `.zstd`。
 *
 * 刻意不写死 `session.jsonl.zstd`：DSH 换存储格式时会留下 `session.v3.jsonl.zstd` 之类的
 * 新形态，写死会让「最新 N 个」整批漏掉新格式会话。
 * 反向也刻意排除 `session.lock`：那是运行时锁文件，不是会话内容。
 */
export declare const SESSION_LOG_NAME_RE: RegExp;
/** 文件名（不含目录）是否为一个会话日志。 */
export declare function isSessionLogFileName(name: string): boolean;
/** `sessions.limit` 归一化：非整数（含 undefined / NaN / 字符串）→ undefined = 不施加数量限制。 */
/**
 * 会话 id 归一化键（去掉 `session-` 前缀）。
 *
 * 为什么必须归一化：同一台机器上**两种会话目录名形态并存**（真机实测：806 个会话目录里 158 个是
 * `session-<uuid>`、648 个是裸 `<uuid>`；日志文件名一律是 `session.jsonl.zstd`），而 DSH 工作区注册表
 * `workspace.sessionIds` **一律**写全量 `session-<uuid>`。会话单元 id（`sessions:<项目键>/<目录名>`）的末段
 * 是**目录名**，所以「勾了对话 ↔ 它的工作区」要配对就必须先归一化 —— 否则绝大多数会话的联动会静默失效
 * （真机复现：勾一个裸 uuid 的对话，7 个工作区一个都不动）。与 `core/session-meta.ts` 的索引键同一口径。
 */
/**
 * 项目目录键（与 DSH `dsh-session-persistence-jsonl` 的 `projectKey()` 同算法）：
 * 分隔符（`/` `\\` `:`）折叠成一个 `-`，非 `[A-Za-z0-9._-]` 的字符转 `~XXXX`，截断到 251，
 * 最后包成 `--…--`。用于把工作区路径映射到 `~/.dsh/sessions/<项目键>/` 目录。
 *
 * 为什么放在这个**零依赖**模块里（原在 `core/session-meta.ts`）：客户端也要用它 —— 勾选联动按
 * 「会话 cwd 目录键 == 工作区 path 目录键」认领工作区，而 `session-meta.ts` 会用 Buffer 读 DSH 存储缓存，
 * 不能进浏览器 bundle。`session-meta.ts` 继续 re-export，既有导入路径不受影响。
 */
export declare function projectKeyOf(cwd: string): string;
export declare function sessionIdKey(raw: string): string;
export declare function normalizeSessionLimit(raw: unknown): number | undefined;
/**
 * 会话最小可拆单元 = `<projectKey>/<sessionId>` 目录（与 `SessionsAdapter.unitIdOf` 同一口径）。
 * 相对 `sessions` 根目录的路径，斜杠分隔。
 */
export interface SessionUnit {
    unitId: string;
    /** 该单元的会话日志（相对 `sessions` 根目录；至少一条，否则不构成会话） */
    logs: string[];
    /** 最新一份会话日志的 mtime（毫秒）；时间不可用 → null（排序时置后，绝不当成 0） */
    latestMtimeMs: number | null;
}
/** 路径 → 会话单元 id（深度不足 2 段 = 不是会话目录 → null）。 */
export declare function sessionUnitIdOf(relPath: string): string | null;
/**
 * 相对路径清单 → 会话单元清单。
 *
 * 只保留**含至少一个会话日志**的单元：`session.lock` 之类运行文件、以及深度不足两段的
 * 散落文件都不算会话（否则「最新 N 个」会被噪声文件挤占名额）。
 * `mtimeOf` 对每个日志文件调用一次（只有日志需要时间，避免为了排序 stat 整棵树）。
 */
export declare function groupSessionUnits(rels: readonly string[], mtimeOf: (rel: string) => number | null): SessionUnit[];
/**
 * 取最新的 `limit` 个会话单元，返回保留的 unitId 集合。
 *
 *  - `limit < 0` → 全带；
 *  - `limit === 0` → 空集；
 *  - 时间不可用的单元排在**最后**（并列按 unitId 字典序，结果稳定可复现）。
 */
export declare function pickLatestSessionUnits(units: readonly SessionUnit[], limit: number): Set<string>;
/**
 * sessions 分区数据（`{ files: [{ relativePath }] }`）→ 项目键 → **本次包里真正带着数据**的会话。
 *
 * 值 = `Map<会话裸键, 日志侧目录名>`。目录名就是 DSH 会话日志首帧 header 里的 `id`（真机实测：目录名与
 * header id 逐字相同，形态有 `session-<uuid>` 与裸 `<uuid>` 两种并存），而工作区注册表**只认 header id**
 * —— 所以这里保留原名，由调用方决定先试哪种形态；`sessionIdKey` 只用来判「是不是同一条会话」。
 *
 * 为什么需要（真机事故）：DSH 工作区注册表的 `sessionIds` 覆盖率极低（真机实测 570 条会话里只有 23 条
 * 在里面），所以「这一次到底带了哪几次对话」只能从 sessions 分区自己的文件清单反推：
 *  - **导出侧**靠它把包补自洽 —— 否则用户勾选的对话不在任何工作区记录的 sessionIds 里，目标机上
 *    「数据恢复了却显示不出来」；
 *  - **导入侧**靠它登记工作区归属（旧构建导出的包同样受益，属于向后兼容的兜底）。
 *
 * 判据与 `groupSessionUnits` 同一口径：目录深度 ≥ 2 段、且**至少一份会话日志**（只有 `session.lock`
 * 之类运行文件的目录不算会话）。输入是备份数据（不可信）：形状不符一律忽略，绝不抛错。
 */
export declare function bundledSessionDirs(data: unknown): Map<string, Map<string, string>>;
/**
 * 把「本次导出的会话」声明进所属工作区记录（issue #45 ③：让包自洽）。
 *
 * 归属判据与选择器/连带逻辑同口径：会话 cwd 的目录键 == 工作区 path 的目录键
 * （`projectKeyOf`；DSH 就是按它把会话显示在工作区下的）。**只增不减**：注册表里原有的 id 一律保留，
 * 它们对「目标机本来就有这些会话」的场景仍然有用。原地修改 `workspacesData` 里的记录。
 *
 * @returns declared = 新增声明了几条会话；workspaces = 涉及几个工作区
 */
export declare function declareBundledSessionsInWorkspaces(sessionsData: unknown, workspacesData: unknown): {
    declared: number;
    workspaces: number;
};
