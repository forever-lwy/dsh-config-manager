#!/usr/bin/env node
import { type SnapshotMeta } from '../core/restore.ts';
import { type ReinstallItemId } from '../core/reinstall.ts';
export type CliCommand = 'snapshots' | 'restore' | 'reinstall' | 'recover-stale-lock' | 'verify' | 'backup' | 'import' | 'sessions' | 'web' | 'help';
export interface CliOptions {
    command: CliCommand;
    /**
     * 详情页主题（`dcm help <命令>` / `dcm <命令> --help`）。
     * 只在 command === 'help' 时有意义；认不认识由运行层判定（解析器不重复维护一份命令表）。
     */
    helpTopic?: string;
    /** --data-dir：快照数据目录（verify/backup 下为导出目录）覆盖 */
    dataDir?: string;
    /**
     * --data-root：插件数据根 dataDir（宿主 config.dataDir；SAFE MODE / 环境锁 / journal 都在它之下）。
     * 插件配置了自定义 dataDir 时必须显式给出——CLI 无法从 --data-dir 唯一反推该根。
     */
    dataRoot?: string;
    /** --id：目标快照 id（restore 缺省取最近非 rolled-back） */
    id?: string;
    /** --dry-run：只打印计划（restore / reinstall） */
    dryRun: boolean;
    /** --profile：管理的 DSH profile（缺省 web） */
    profile: string;
    /** --settings：覆盖 settings 文件路径 */
    settings?: string;
    /** --version：reinstall 要安装的 DSH 版本（缺省 latest） */
    version?: string;
    /** --yes：reinstall 非交互（全选 + 跳过确认） */
    yes: boolean;
    /** --list：reinstall 列出可选清理项后退出 */
    list: boolean;
    /** --wipe-config：reinstall 等价勾选全部数据类（settings/plugins/data） */
    wipeConfig: boolean;
    /** --json：verify 输出机器可读结果（便于 CI / 定时任务断言） */
    json: boolean;
    /** --sections <a,b,c>：backup 要打包的离线分区白名单（缺省取默认分区） */
    sections?: string;
    /** --out <path>：backup / import 输出 ZIP 路径（缺省写入导出目录，自动去重不覆盖） */
    out?: string;
    /** --from <source>：import 的外部来源 id（30 个之一） */
    from?: string;
    /** --cwd <dir>：import 的项目目录（契约 §8.2 的项目级路径；缺省 = 进程 cwd） */
    cwd?: string;
    /** --home <dir>：sessions repair 要修复的 DSH home（缺省 $DSH_HOME） */
    home?: string;
    /** --fix：sessions repair 真的落盘（缺省只报告） */
    fix?: boolean;
    /** --keep <dir>：sessions repair 的重复 id 保留哪一份（其余移入隔离目录，不删除） */
    keep?: string;
    /** --map old=new：sessions repair 的路径映射（可重复） */
    maps?: string[];
    /** verify 的位置参数（文件名或路径；与 --id 同义，最多一个） */
    positionals: string[];
    /** web：离线救急台监听端口（缺省 0 = 由内核分配，避免与 DSH 抢端口） */
    port?: number;
    /** web：启动后不自动打开浏览器（SSH / 无桌面场景） */
    noOpen?: boolean;
    /** web：空闲多少分钟自动退出（0 = 不自动退出；缺省 30） */
    idleTimeoutMin?: number;
}
export type ParseResult = {
    ok: true;
    options: CliOptions;
} | {
    ok: false;
    error: string;
};
/** 解析 CLI 参数（纯函数；help 返回 command:'help'，未知/缺值返回错误） */
export declare function parseCli(argv: readonly string[]): ParseResult;
/** 解析 reinstall 交互多选输入：逗号/空格分隔的 1-based 编号；空串返回 null（用默认）。非法编号也返回 null。 */
export declare function parseSelectionInput(text: string): Set<ReinstallItemId> | null;
/** 解析 reinstall 二次确认输入：仅 "YES" 或 "Y"（忽略大小写/空白）视为确认。 */
export declare function parseConfirmInput(text: string): boolean;
/** $DSH_HOME：环境变量优先，缺省 ~/.dsh（dsh-home-paths 的简化规则，CLI 零依赖版） */
export declare function resolveDshHome(env?: Record<string, string | undefined>): string;
/** 快照数据目录：--data-dir 覆盖优先，缺省 $DSH_HOME/dsh-config-manager/snapshots */
export declare function resolveDataDir(flag: string | undefined, env?: Record<string, string | undefined>): string;
/**
 * 插件「控制面根」候选（= 宿主 config.dataDir）：SAFE MODE 标记（<root>/transactions/safe-mode）、
 * 环境锁（<root>/locks）、journal 都在它之下 —— 与 src/index.ts 的 dataDir 派生、core/phase3-host.ts 的
 * safeModeMarkerPath 同一语义。
 *
 * CLI 的 --data-dir 只表达「快照目录 / 导出目录」，单凭它无法区分两种真实用法：
 *   a) --data-dir <root>/snapshots（文档语义）→ 控制面根 = 其父目录；b) --data-dir <root>（直接给数据根）；
 * 两者都进候选，另恒加缺省根 $DSH_HOME/dsh-config-manager —— 多查几处只会更保守，不会放过标记。
 * --data-root 显式给出时以它为准（权威判定，不再叠加推断候选）。
 */
export declare function resolveControlRoots(opts?: {
    dataRoot?: string;
    dataDir?: string;
}, env?: Record<string, string | undefined>): string[];
/**
 * `recover-stale-lock` 的锁目录解析：在「候选控制面根」（与 SAFE MODE 同源）里挑第一个**真的躺着**
 * ownership 文件的 `<root>/locks`；全都没命中 → 缺省根 `$DSH_HOME/dsh-config-manager/locks`。
 *
 * 为什么不能写死缺省根（issue #36 的兜底路径）：宿主 `dataDir` 可被配置成非缺省值，写死会让残留锁
 * 「明明在磁盘上，CLI 却报没有」→ 用户只能手工删锁文件（正是本命令要消灭的处境）。
 */
export declare function resolveRecoverLocksDir(opts?: {
    dataRoot?: string;
    dataDir?: string;
}, env?: Record<string, string | undefined>): string;
/**
 * Phase 3 SAFE MODE 门：任一候选控制面根下存在 durable 标记 → 返回错误文案（调用方必须拒绝执行）。
 * 返回 null = 明确未阻断。
 * fail-closed：标记无法读取 / 无法判定（'unknown'）一律拒绝 —— 「读不到就放行」正是审计 P0-11 的静默旁路。
 */
export declare function checkSafeModeBlocked(roots: readonly string[]): string | null;
/** 快照 id 校验：拒绝路径分隔符/保留名（防 join 越界） */
export declare function validateSnapshotId(id: string): string;
/** 缺省快照选择：metas 已按 createdAt 倒序，取第一个 status !== 'rolled-back' */
export declare function pickDefaultSnapshotId(metas: readonly SnapshotMeta[]): string | null;
export interface CliIo {
    log: (s: string) => void;
    error: (s: string) => void;
}
export declare function printUsage(io?: CliIo): void;
/**
 * 打印单命令详情页（`dcm <命令> --help` / `dcm help <命令>`）。
 *
 * 返回 false 表示不认识该命令名（调用方决定报错文案）；成功时已写完输出。
 * 文案与退出码都在 ./help.ts，本函数只做「渲染 → 输出」。
 */
export declare function printCommandUsage(name: string, io?: CliIo): boolean;
export interface CliDeps {
    /** 交互提问（缺省用真实 stdin/stdout readline） */
    ask?: (prompt: string) => Promise<string>;
    /** 命令执行器（缺省跨平台：Windows powershell -Command / Unix bash -c） */
    exec?: (cmd: string) => Promise<string>;
    /** 平台（仅影响缺省 exec 的包装方式，缺省 process.platform） */
    platform?: NodeJS.Platform;
}
/**
 * CLI 主流程（io/env/deps 可注入供测试）：
 * snapshots → 列表；restore → dry-run 打印计划 / 执行并打印诚实报告；
 * reinstall → 交互多选 + 二次确认 + 跨平台执行。失败项存在时 exit 1，否则 0。
 */
export declare function runCli(argv: readonly string[], io?: CliIo, env?: Record<string, string | undefined>, deps?: CliDeps): Promise<number>;
/** 救急台的目录事实（由 --data-dir / --data-root 统一派生；四处只认这一份）。 */
export interface WebPaths {
    /** 插件数据根（快照/导出/锁都挂在它下面） */
    root: string;
    /** 与 root 同值（RescuePaths.dataDir 的语义） */
    dataDir: string;
    snapshotsDir: string;
    exportsDir: string;
    locksDir: string;
    controlRoots: string[];
}
/**
 * 派生救急台要用的四个目录 —— **root 只算一次**，再同时派生 snapshots / exports / locks / dataDir。
 *
 * 为什么必须统一：`--data-dir` 的历史语义是「快照目录 / 导出目录」，尾段命中 `snapshots`/`exports`
 * 时要**上溯一层**才是数据根。此前只对「那一条」取原值、另一条仍 `path.join(dataDir, ...)`，
 * 于是 `--data-dir <root>/snapshots` 会派生出 `<root>/snapshots/exports`（半上溯）——
 * 命令行与网页看到的目录事实立刻分叉。`--data-root` 恒为准。
 */
export declare function resolveWebPaths(opts?: {
    dataRoot?: string;
    dataDir?: string;
}, env?: Record<string, string | undefined>): WebPaths;
/** 导出目录：--data-dir 覆盖优先，缺省 $DSH_HOME/dsh-config-manager/exports */
export declare function resolveExportsDir(flag: string | undefined, env?: Record<string, string | undefined>): string;
