/**
 * **目标平台**的目录真值（档 B 全量来源的共享地基，零 I/O、零依赖）。
 *
 * 为什么参数里必须有 `platform`（不是洁癖，是取证纪律）：竞品 dsh-chat-import 的
 * `defaultRoots({home})` 在 Windows 上用 `joinFor('win32', ...)` **按目标平台**拼接，
 * 因此「在任一台机器上算出 Windows 真值路径」是它的既有能力（`convert/goose.mjs:48-50` 同款）。
 * 我们若用 `process.platform` 拼路径，同一个函数在三平台 CI 上会给出三种结果：
 * Windows 分支在 macOS/Linux 的测试进程里**永远跑不到**，单测就无法离线覆盖真值表。
 * ⇒ 规则：**真值表函数必须显式收 platform**；只有装配层（`registry.ts`）在把宿主事实
 * 投影进 `ForeignSourceContext` 时才允许碰 `process.platform`（全仓唯一一处）。
 *
 * 两个基准函数的区别（**别混用**）：
 *  · `roamingAppDataDir` = **配置风格**目录（VS Code 的 `<User>`：win `%APPDATA%`、
 *    mac `~/Library/Application Support`、linux `$XDG_CONFIG_HOME|~/.config`）；
 *  · `xdgDataHome` = **数据风格**目录（crush / zed：win `%LOCALAPPDATA%`、
 *    mac `~/Library/Application Support`、linux `$XDG_DATA_HOME|~/.local/share`）。
 */
/** 三个被四份调研报告共同承认的目标平台 */
export type ForeignPlatform = 'win32' | 'darwin' | 'linux';
/**
 * 归一化平台取值：不认识的平台（aix / freebsd / android / 空串）一律按 **linux（posix）** 处理，
 * 与 Node 自己「非 win32 即 posix」的口径一致；**绝不**当成 win32
 * （那会让分隔符、%APPDATA%、VS Code 目录三件事同时错）。
 */
export declare function normalizePlatform(raw: string | undefined | null): ForeignPlatform;
/** 目标平台的分隔符（**不是** path.sep —— 那取决于运行平台） */
export declare function sepFor(platform: ForeignPlatform): string;
/** 段间拼接（按目标平台的分隔符；空段跳过；前导分隔符与盘符原样保留） */
export declare function joinFor(platform: ForeignPlatform, ...parts: readonly string[]): string;
/** 目标平台下的绝对路径判定（Windows 认盘符与 UNC；posix 认前导 /） */
export declare function isAbsoluteFor(platform: ForeignPlatform, p: string): boolean;
/** 环境变量的**非空**字符串取值（空串与缺失同解：绝不把 '' 当成一个目录） */
export declare function envValue(env: Readonly<Record<string, string | undefined>>, key: string): string | undefined;
/**
 * 目标平台下的「绝对路径环境变量」取值：竞品的 `GOOSE_PATH_ROOT` / `CRUSH_GLOBAL_DATA` /
 * `XDG_*` 都有一条共同语义 —— **只有绝对路径才生效**（相对路径忽略，绝不 join 到 home 上）。
 */
export declare function absoluteEnvPath(env: Readonly<Record<string, string | undefined>>, key: string, platform: ForeignPlatform): string | undefined;
/**
 * **配置风格**的平台基准目录：win32 = `%APPDATA%`（缺失回落 `<home>\\AppData\\Roaming`）；
 * darwin = `~/Library/Application Support`；linux = `$XDG_CONFIG_HOME`（绝对才生效）→ `~/.config`。
 * 这就是 VS Code 系（trae / cline legacy）产品数据根的基准，也是 `XDG_CONFIG_HOME` 的唯一消费者。
 */
export declare function roamingAppDataDir(platform: ForeignPlatform, homeDir: string, env: Readonly<Record<string, string | undefined>>): string;
/**
 * **数据风格**的平台基准目录：win32 = `%LOCALAPPDATA%`（缺失回落 `<home>\\AppData\\Local`）；
 * darwin = `~/Library/Application Support`；linux = `$XDG_DATA_HOME`（**仅绝对、仅 linux 列**）
 * → `~/.local/share`。crush / zed 的默认根基准即此。
 */
export declare function xdgDataHome(platform: ForeignPlatform, homeDir: string, env: Readonly<Record<string, string | undefined>>): string;
/**
 * VS Code 系产品的用户数据目录：`<User>`（其下有 `workspaceStorage` / `globalStorage`）。
 *
 * 三分支逐字对齐竞品 `traeUserDataDirs` / `clineLegacyStorageDirs`：
 *  win32 = `%APPDATA%/<product>/User`；darwin = `~/Library/Application Support/<product>/User`；
 *  linux = `$XDG_CONFIG_HOME|<~/.config>/<product>/User`。
 */
export declare function vscodeUserDataDir(platform: ForeignPlatform, homeDir: string, env: Readonly<Record<string, string | undefined>>, product: string): string;
/**
 * 三平台同形的 `~/.local/share`（竞品 opencode 家族的真值：**Windows 也不走 %APPDATA%**）。
 * 用目标平台的分隔符拼接，因此 win32 下给出 `<home>\\AppData` 之外的 `<home>\\.local\\share\\...`
 * —— 这正是竞品在 Windows 上真实扫描的位置（`discovery.mjs:125-131`）。
 */
export declare function posixLocalShare(platform: ForeignPlatform, homeDir: string): string;
/** 把任意分隔符形态的串归一成 POSIX 形态（**位置标签**与人读文案一律 POSIX） */
export declare function toPosixLabel(p: string): string;
