import { isLaunchableShape, type DshProfileLaunchRecord, type DshProfileLaunchResult, type DshProfileShape, type DshProfileStopOutcome } from './dsh-profile-shared.ts';
/** DSH CLI 的调用形态：node 直启 bin.js，或 PATH 上的 dsh 包装脚本（.cmd 需要 shell）。 */
export interface DshCliCommand {
    /** 可执行文件（node.exe 或 dsh.cmd/dsh） */
    command: string;
    /** 固定前置参数（node 形态 = [bin.js 绝对路径]；包装脚本形态 = []） */
    prefixArgs: string[];
    /** 是否经 shell（Windows 的 .cmd/.bat 在 Node ≥ 22 必须经 shell，否则 EINVAL） */
    shell: boolean;
    /** 需要额外/覆写的子进程环境（Desktop 载体要 ELECTRON_RUN_AS_NODE=1）；缺省只继承。 */
    env?: Readonly<Record<string, string>>;
}
/** 启动器可注入的副作用（测试 / 隔离验证用；缺省即真实实现）。 */
export interface DshProfileLauncherDeps {
    /** 定位 dsh CLI（缺省：按本进程 argv/进程树推断，见 defaultResolveCli） */
    resolveCli?: () => DshCliCommand | null;
    /** detached spawn + 输出重定向到日志文件；返回 pid 与「退出通知」注册口 */
    spawnDetached?: (command: string, args: string[], opts: {
        cwd: string;
        env: NodeJS.ProcessEnv;
        logFile: string;
        shell: boolean;
    }) => {
        pid: number | null;
        onExit: (cb: (code: number | null) => void) => void;
    };
    /** 挑一个空闲端口（缺省：先试候选段，全占用则用系统临时端口） */
    findFreePort?: (candidates: number[]) => Promise<number>;
    /** HTTP 探活（任何 HTTP 响应都算「起来了」，含 401） */
    probe?: (port: number, timeoutMs: number) => Promise<boolean>;
    sleep?: (ms: number) => Promise<void>;
    readLog?: (file: string) => string;
    now?: () => number;
    /** pid 是否存活（缺省 process.kill(pid, 0)；EPERM 视为存活） */
    isAlivePid?: (pid: number) => boolean;
    /** 终止进程（缺省：Windows 用 taskkill /T [/F]，其余平台 SIGTERM/SIGKILL） */
    killPid?: (pid: number, mode: 'graceful' | 'force') => void;
    /** 写 / 读实例记录（缺省落 <dataDir>/launches.json；测试注入内存实现） */
    readState?: () => string;
    writeState?: (text: string) => void;
    /**
     * 该档案是否**在别处**已经在跑（宿主注入运行注册表的心跳判据）。
     * 为什么必须有：只认台账时，手动 `dsh web` 起来的实例对插件不可见 → 同一个 profile 会被反复拉起。
     */
    isProfileRunning?: (name: string) => boolean;
}
/** 实例记录文件名（`<dataDir>/launches.json`；机器本地状态，**不进备份/同步**）。 */
export declare const LAUNCHES_FILENAME = "launches.json";
/** 停止结果（UI 只做展示差异；三种都算「已经不在了」）。 */
export interface DshProfileStopResult {
    name: string;
    /** graceful = 自己退了 / killed = 强制杀掉 / already-stopped = 早就没了（残留记录已清） */
    result: DshProfileStopOutcome;
    /** 当时的端口（记录里有才有，仅用于回执文案） */
    port?: number;
}
export interface DshProfileLauncherOptions {
    /** DSH home（`$DSH_HOME`；子进程显式继承同一 home） */
    homeDir: string;
    /** 插件 dataDir（日志落在 <dataDir>/logs/） */
    dataDir: string;
    /** 子进程工作目录（缺省 = 宿主进程 cwd，即用户启动 DSH 时所在的 workspace 根） */
    cwd?: string;
    deps?: DshProfileLauncherDeps;
}
export interface DshProfileLaunchInput {
    name: string;
    shape: DshProfileShape;
    /** 显式端口（缺省自动挑空闲端口） */
    port?: number;
    /** 追加给应用的参数（如 --no-open；验证脚本会用） */
    extraArgs?: string[];
    /** 是否让新实例自己拉起默认浏览器（缺省 true —— 用户点「启动」就应看到新 GUI） */
    openBrowser?: boolean;
    /** 等待就绪的上限（缺省 20s） */
    readyTimeoutMs?: number;
}
/** 端口候选段：默认端口 3080 之后依次试（当前实例通常占着 3080）。 */
export declare function pickFreePortCandidates(base?: number, count?: number): number[];
/** 拼启动参数（纯函数）：`--profile <名> [--port <端口>] [--no-open] [extra]`。 */
export declare function buildLaunchArgs(cli: Pick<DshCliCommand, 'prefixArgs'>, input: {
    name: string;
    port?: number;
    extraArgs?: string[];
    openBrowser?: boolean;
}): string[];
/**
 * 从子进程日志里抓认证 URL（`dsh web: http://127.0.0.1:<port>/?token=...`）。
 * 只认带 token 的根 URL：无 token 的裸 URL 打开会 401，报给用户等于给了一条坏链接。
 */
export declare function parseLaunchUrl(logText: string, port?: number): string | null;
/** 日志尾部（失败时回传给用户，避免「启动失败」四个字之外什么都没有）。 */
export declare function logTail(logText: string, lines?: number): string;
/**
 * 缺省 CLI 定位：宿主进程就是 dsh 启动的，`process.argv[1]` 即 `.../@deepseek-ai/dsh/lib/bin.js`。
 * 校验同目录两级上的 package.json 名字，避免把任意 bin.js 当成 dsh。
 * 推断不出来（如源码树 tsx 直启 / Electron）时回退 PATH 上的 dsh（.cmd 走 shell）。
 */
export declare function defaultResolveCli(): DshCliCommand | null;
/**
 * 直启 bin.js 用的运行时：宿主是 Electron 时必须以 `ELECTRON_RUN_AS_NODE=1` 当 node 用
 * （桌面端宿主 `process.execPath` 是 DeepSeek Harness.exe，真机实测可正常跑 CLI）。
 */
export declare function resolveDirectCliRunner(versions?: Readonly<Record<string, string | undefined>>): {
    command: string;
    env?: Readonly<Record<string, string>>;
};
/**
 * 从 PATH 上的 dsh 包装脚本反解真正的 CLI 入口（`.../@deepseek-ai/dsh/lib/bin.js`）。
 *
 * 为什么必须反解（真机实测根因）：Windows 上 `.cmd/.bat` 只能经 shell 起，而
 * **中间 cmd 层 + `detached: true` 会丢掉孙进程的 stdout/stderr** ——
 * `dsh.cmd --version` 经 detached 起时日志恒 0 字节（非 detached 正常），
 * 于是启动器永远读不到 `dsh web: <带 token 的 URL>` 那行，用户只看到
 * 「20 秒内未确认就绪 / 没能抓到带 token 的 URL」。直启 bin.js 则正常（约 8 秒出 URL）。
 *
 * 先按 npm/pnpm 的常见布局找同目录 `node_modules`，再退回脚本内嵌的入口路径。
 */
export declare function findCliEntryForShim(shimPath: string): string | null;
/** 档案 → 是否可启动（唯一判据在 shared，UI 与本模块共用）。 */
export { isLaunchableShape };
/** 档案启动器（每个实例无状态，可直接复用）。 */
export declare class DshProfileLauncher {
    private readonly homeDir;
    private readonly dataDir;
    private readonly cwd;
    private readonly proc;
    private readonly deps;
    constructor(options: DshProfileLauncherOptions);
    /** 实例记录文件绝对路径（`<dataDir>/launches.json`） */
    stateFile(): string;
    /**
     * 本插件启动且**仍在运行**的实例（同步；死记录顺手清掉）。
     * 判据只认「记录里的 pid 还活着」——记录本身就是启动方写下的权威事实，不猜别的进程。
     */
    listRunning(): DshProfileLaunchRecord[];
    /**
     * 停止某个档案的实例：先请它自己退出（优雅期 PROFILE_STOP_GRACE_MS），超时再强制杀进程树。
     * 记录在结束后一律清掉（无论 graceful/killed/already-stopped）——「已经不在了」是唯一终态。
     */
    stop(name: string): Promise<DshProfileStopResult>;
    /** 子进程日志目录（`<dataDir>/logs`） */
    logsDir(): string;
    /** 能否定位 dsh CLI（UI 可据此提前给出「手动启动」提示）。 */
    resolveCli(): DshCliCommand | null;
    /**
     * 启动所选档案的独立实例。
     *
     * 失败语义（都带码，UI 映射本地化文案）：
     *  - `notLaunchable`：非 web 形态（没有浏览器 GUI 的档案 spawn 出来只会是隐形进程）；
     *  - `launcherUnavailable`：定位不到 dsh CLI（源码树/Electron 等非标准启动）；
     *  - `launchFailed`：子进程早退或没拿到 pid（消息里附日志尾部，绝不只说「失败」）；
     *  - `alreadyRunning`：同名实例还活着（台账里有，**或心跳表明别处/手动启动的实例在跑**）——
      不允许同名多开，否则 UI 的「停止」指向哪一个都说不清，浏览器里也会出现两个同 home 的实例。
     */
    launch(input: DshProfileLaunchInput): Promise<DshProfileLaunchResult>;
    /** 写入 / 覆盖一个实例记录（同名先移除旧的）。 */
    private recordRunning;
}
/** 容错解析实例记录（坏 JSON / 非数组 / 字段缺失 → 只保留可信条目，绝不抛）。 */
export declare function parseLaunches(text: string): DshProfileLaunchRecord[];
/** 序列化实例记录（稳定顺序：按档案名，避免无意义 diff）。 */
export declare function serializeLaunches(records: readonly DshProfileLaunchRecord[]): string;
