/**
 * DSH profile 的**零依赖共享层**（host 与 client 双端复用）。
 *
 * 本文件不得 import 任何 node 模块：`src/client/` 的运行时 import 会把整条依赖链
 * 打进 lib/client.js，一旦带上 node 内置模块依赖，DSH loader 会拒绝加载整个插件。
 * 引擎（`dsh-profile-manager.ts`，用 node fs）与 UI 视图模型/React 壳都只从这里取
 * 类型、常量与纯函数。
 */
/**
 * 等待新实例就绪的上限（宿主探活默认值；UI 文案引用同一常量，避免两处各写一个数字）。
 *
 * 真机口径（web 档案）：端口约 3 秒就 LISTENING，但带 token 的 URL 要等 dsh 把整棵插件树
 * settle 完 + startup audit 走完才打印，实测 8–10 秒，插件多的档案会更久（有过 >20 秒的样本）。
 * 20 秒会把「慢但成功」误判成未就绪，故放宽到 30 秒。
 */
export const DSH_PROFILE_LAUNCH_TIMEOUT_MS = 30_000;
export const DSH_PROFILE_TEMPLATES = [
    { id: 'base', bundles: ['@deepseek-ai/dsh-base'], patchReload: 'live' },
    { id: 'web', bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'], patchReload: 'live' },
    { id: 'headless', bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless'], patchReload: 'startup' },
    { id: 'sdk', bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-sdk-app'], patchReload: 'startup' },
    { id: 'sdk-minimal', bundles: ['@deepseek-ai/dsh-sdk-minimal'], patchReload: 'startup' },
    { id: 'acp', bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-acp-app'], patchReload: 'startup' },
];
/**
 * 「档案复制进行中」标记文件名（cross-F3）：复制**开始前**写进目标目录，成功或回滚时移除。
 *
 * 为什么需要它：复制是「mkdir 目标 → 逐条 cp → 重写 package.json」的多步长事务；进程被强杀
 * （或断电）会留下「有文件、无 package.json」的半截副本 —— 而档案列表按「有 package.json 才算
 * profile」的既有口径会**跳过**它，于是用户既看不到、也删不掉（删除走 requireProfile 报 notFound），
 * 恢复面板又因为没有 snapshotId 给不出回滚入口。显式标记让半截副本成为一个可列出、可物理删除的
 * 独立可辨识条目（`DshProfileMeta.incomplete`）。
 */
export const PROFILE_COPY_MARKER_FILENAME = '.dcm-copy-in-progress.json';
/**
 * Desktop（Electron 外壳）**独占管理**的保留档案名。
 *
 * 硬事实（DSH 0.1.5-rc.1 / 0.2.0-rc.2 的 `@deepseek-ai/dsh/lib/bin.js`）：普通 dsh CLI 对
 * `--profile desktop` 无条件报 `error: profile "desktop" is managed exclusively by the
 * Electron application`；只有桌面端自带的 `@deepseek-ai/dsh-desktop-host/lib/cli.js`
 * （以 `manageDesktopProfile: true` 启动）才放行。所以它既不能自建，也不能被本插件启动/删除/改名。
 */
export const DESKTOP_PROFILE_NAME = 'desktop'; // 宿主侧的同一字面量在 src/utils/desktop-carrier.ts（那边不能 import 本模块），由 desktop-carrier.test.ts 互钉
/**
 * 该 profile 名是否由 Desktop 应用独占管理（大小写不敏感，与 dsh CLI 的
 * `profile.toLowerCase() === 'desktop'` 同口径）。
 */
export function isManagedProfileName(name) {
    return name.trim().toLowerCase() === DESKTOP_PROFILE_NAME;
}
/**
 * 不允许自建的保留名：shipped template 名（DSH 会自行按模板初始化，手建语义冲突）
 * + Electron 独占的 desktop（CLI 明确拒绝）。
 */
export const RESERVED_PROFILE_NAMES = [
    'web', 'headless', 'sdk', 'sdk-minimal', 'acp', DESKTOP_PROFILE_NAME,
];
/** 形态判定：按 bundles 是否包含官方表层 bundle。 */
export function classifyShape(bundles) {
    if (bundles.includes('@deepseek-ai/dsh-web-app'))
        return 'web';
    if (bundles.includes('@deepseek-ai/dsh-headless'))
        return 'headless';
    return 'generic';
}
/**
 * 该形态能否作为独立实例启动。
 *
 * 只有 web 形态有浏览器 GUI；headless 是「一次性任务」形态、generic（如 base 模板）根本没有
 * 应用表层——把这两类 spawn 出去只会得到一个用户看不见的进程，所以判据是硬性的，
 * UI 与宿主引擎共用这一份（避免两边各写一份后漂移）。
 */
export function isLaunchableShape(shape) {
    return shape === 'web';
}
/**
 * 名字校验（与 DSH 的 resolveProfileDir 同规则）→ 返回错误码，合法则 null。
 * 纯函数，供 UI 输入校验与 host 侧二次校验共用（host 侧仍走 validateProfileName 兜底）。
 */
export function checkProfileName(name) {
    const trimmed = name.trim();
    if (trimmed === '')
        return 'invalidNameInput';
    if (trimmed.length > 64)
        return 'invalidNameInput';
    if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('\0'))
        return 'invalidNameInput';
    if (trimmed === '.' || trimmed === '..' || trimmed === 'node_modules')
        return 'invalidNameInput';
    // routes-F2：保留名比较必须**大小写不敏感**。Windows / macOS 的默认文件系统大小写不敏感，
    // 而 isManagedProfileName（desktop 独占档案）本来就是大小写不敏感 —— 用 includes 做精确比较
    // 会让 Desktop / Web 这类变体绕过保留名校验，建出一个「插件自己删不掉」的目录
    // （remove/rename 会以 managedProfile 拒绝），甚至占用 Electron desktop 的档案目录名。
    if (RESERVED_PROFILE_NAMES.some((reserved) => reserved.toLowerCase() === trimmed.toLowerCase()))
        return 'reservedName';
    return null;
}
//# sourceMappingURL=dsh-profile-shared.js.map