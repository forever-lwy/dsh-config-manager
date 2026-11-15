/**
 * 「档案」页（DSH profile 管理）—— 框架无关纯函数层（node 可测）。
 *
 * 职责：名字输入校验、列表排序（当前运行置顶）、列表摘要统计、危险态判定、运行中实例判定、
 * 展示格式化（时间/字节）、终端启动命令文本。不产出用户可见散文（文案走 locale 字典 `t()`），
 * 不 import node 模块、不 import React。
 *
 * 依赖方向：只从 `src/profiles/dsh-profile-shared.ts`（零依赖）取类型与纯函数——
 * 绝不 import 用 node fs 的引擎（否则 client bundle 会带上 node 内置模块依赖而整插件不加载）。
 */
import { formatMinuteStamp, parseDateInput } from '../utils/time.js';
import { checkProfileName, isLaunchableShape, isManagedProfileName, } from '../profiles/dsh-profile-shared.js';
/** 校验输入框里的 profile 名：与 host 侧同规则，但把「空」与「过长」细分以便给出更准的提示。 */
export function validateProfileNameInput(name) {
    const trimmed = name.trim();
    if (trimmed === '')
        return 'required';
    if (trimmed.length > 64)
        return 'tooLong';
    const reason = checkProfileName(trimmed);
    if (reason === 'invalidNameInput')
        return 'illegal';
    if (reason === 'reservedName')
        return 'reserved';
    return null;
}
/** 列表排序：当前运行中的置顶 → 接着是「本插件启动的实例」→ 其余按名字（localeCompare）。 */
export function sortProfilesForDisplay(profiles, opts = {}) {
    const running = new Set(opts.runningNames ?? []);
    const rank = (p) => {
        if (opts.currentName !== undefined && opts.currentName !== null && p.name === opts.currentName)
            return 0;
        if (running.has(p.name))
            return 1;
        return 2;
    };
    return [...profiles].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
export function profilesPanelPhase(profiles, loadError) {
    if (loadError !== null)
        return 'error';
    return profiles === null ? 'loading' : 'ready';
}
export function summarizeProfiles(profiles) {
    const summary = { total: profiles.length, web: 0, headless: 0, generic: 0, broken: 0, withNodeModules: 0, patchEntries: 0 };
    for (const p of profiles) {
        summary[p.shape] += 1;
        if (p.issues.length > 0)
            summary.broken += 1;
        if (p.hasNodeModules)
            summary.withNodeModules += 1;
        summary.patchEntries += p.patchEntryCount;
    }
    return summary;
}
export function profileRowFacts(profile) {
    return {
        bundles: profile.bundles.length,
        patchEntries: profile.patchEntryCount,
        deps: Object.keys(profile.dependencies).length,
        hasNodeModules: profile.hasNodeModules,
    };
}
export function profileVersionFacts(profile) {
    return {
        dshVersion: typeof profile.dshVersion === 'string' && profile.dshVersion !== '' ? profile.dshVersion : null,
        sessionFormatVersion: typeof profile.sessionFormatVersion === 'number' ? profile.sessionFormatVersion : null,
    };
}
export function sessionFormatRisk(profile, currentFormatVersion) {
    const mine = typeof profile.sessionFormatVersion === 'number' ? profile.sessionFormatVersion : null;
    const current = typeof currentFormatVersion === 'number' ? currentFormatVersion : null;
    if (mine === null || current === null)
        return 'none';
    if (mine > current)
        return 'newer';
    if (mine < current)
        return 'older';
    return 'none';
}
/** 详情弹窗：bundle 层（**保持声明顺序** —— 顺序就是 patch 应用顺序，不可排序）。 */
export function bundleLines(profile) {
    return [...profile.bundles];
}
/** 详情弹窗：依赖行（按包名排序，`<name> <spec>`；spec 为空时只给包名）。 */
export function dependencyLines(profile) {
    return Object.entries(profile.dependencies)
        .map(([name, spec]) => (spec === '' ? name : `${name} ${spec}`))
        .sort((a, b) => a.localeCompare(b));
}
/**
 * 副本缺依赖时的安装命令（DSH 自己的 `cannot resolve profile bundle` 报错指向的就是这条）。
 * 只作为**文本**给用户复制，本插件不去执行它。
 */
export function profileInstallCommand(name) {
    return `dsh plugin --profile ${name} install`;
}
/**
 * 复制档案时建议的副本名：`<name>-copy`，被占用则 `-copy-2`、`-copy-3`…（总长不超过 64 = checkProfileName 的上限）。
 * 超长前缀只截断前缀，避免用户一打开弹窗就吃 tooLong 校验。
 */
export function suggestCopyName(name, existingNames, maxLength = 64) {
    const taken = new Set(existingNames);
    let index = 1;
    for (;;) {
        const suffix = index === 1 ? '-copy' : `-copy-${index}`;
        const prefix = name.slice(0, Math.max(1, maxLength - suffix.length));
        const candidate = `${prefix}${suffix}`;
        if (!taken.has(candidate))
            return candidate;
        index += 1;
    }
}
/**
 * 复制告警码 → i18n key。目前只有 `depsNotInstalled` 一类（副本没带 node_modules 却声明了依赖）。
 *
 * 为什么是 `Record<告警码, 文案键>` 而不是 if + 兜底：原先 if 与兜底 return 同一字面量，
 * 任何新告警码都会被静默显示成「缺 node_modules」的文案，注释里承诺的「新增码编译报错」
 * 并不存在（审计 P10-4）。Record 的键即告警码全集 —— 码增删而映射不跟上就是编译错误。
 */
const COPY_WARNING_KEY = {
    depsNotInstalled: 'profiles.duplicate.warn.depsNotInstalled',
};
export function copyWarningKey(warning) {
    return COPY_WARNING_KEY[warning];
}
/** 终端启动命令（非 web 形态没有浏览器界面，只能在终端用它拉起）。 */
export function restartCommand(name) {
    return `dsh --profile ${name}`;
}
/**
 * 能否「用该档案启动」独立实例：
 *  - 只有 web 形态有浏览器 GUI（headless/generic spawn 出去只会是用户看不见的进程）；
 *  - Desktop 独占档案（desktop）命令行根本起不来 —— 普通 dsh CLI 对它硬报
 *    'profile "desktop" is managed exclusively by the Electron application'。
 * 判据在 shared（宿主引擎共用同一份），这里只是视图层的名字。
 */
export function canLaunchProfile(profile) {
    if (isManagedProfileName(profile.name))
        return false;
    return isLaunchableShape(profile.shape);
}
export function launchBlockReason(profile) {
    return isManagedProfileName(profile.name) ? 'managed' : 'notWeb';
}
export function launchState(result) {
    return result.ready && result.url !== null ? 'ready' : 'pending';
}
/** 该档案是否有实例正在运行（台账 ∪ 心跳的合并视图；UI 的「启动 ↔ 停止」判据）。 */
export function isProfileRunning(running, name) {
    return running.some((r) => r.name === name);
}
/** 取该档案的运行记录（没有 = undefined）；UI 用它显示端口/URL/来源。 */
export function runningRecordFor(running, name) {
    return running.find((r) => r.name === name);
}
export function profileRowAction(name, running) {
    const record = runningRecordFor(running, name);
    if (record === undefined)
        return 'launch';
    return record.current ? 'current' : 'stop';
}
/** 停止回执 → i18n key（强制杀掉要如实说，不能假装是优雅退出）。 */
export function stopResultKey(result) {
    if (result === 'killed')
        return 'profiles.stop.forced';
    if (result === 'already-stopped')
        return 'profiles.stop.gone';
    return 'profiles.stop.done';
}
/** 启动告警码 → i18n key（保持 key 字面量类型，便于 t() 编译期校验）。 */
export function launchWarningKey(warning) {
    return warning === 'notReady' ? 'profiles.launch.warn.notReady' : 'profiles.launch.warn.urlNotFound';
}
/** 形态 → i18n key（保持 key 字面量类型，便于 t() 编译期校验）。 */
export function shapeLabelKey(shape) {
    if (shape === 'web')
        return 'profiles.shape.web';
    if (shape === 'headless')
        return 'profiles.shape.headless';
    return 'profiles.shape.generic';
}
/* ---------------- cross-F3：中断的档案复制残留（半截副本） ---------------- */
/**
 * 该条目是否为「中断的档案复制」留下的半截副本。
 *
 * 判据**只有**宿主 `list()` 显式给出的 `incomplete: true` —— 绝不从 shape / bundles / 缺包名去猜：
 * 「generic + 空 bundles」同样可能是用户手工建的空档案，猜错就会把真档案标成残留（进而隐藏它的启动/改名入口）。
 */
export function isIncompleteProfileCopy(profile) {
    return profile.incomplete === true;
}
export function incompleteCopyFacts(profile) {
    const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value : null);
    return {
        copiedFrom: text(profile.copiedFrom),
        startedAt: text(profile.copyStartedAt),
        dir: text(profile.dir),
    };
}
export function profileRowCapabilities(profile) {
    const incomplete = isIncompleteProfileCopy(profile);
    return {
        detail: true,
        launchOrStop: !incomplete,
        duplicate: !incomplete,
        rename: !incomplete,
        delete: true,
    };
}
/**
 * 残留行展示用的开始时刻文本：可解析则格式化为本地时间，不可解析则原样回显（**绝不显示空** ——
 * 那会让「未完成的副本」看起来像没有来源信息的正常档案）。null = host 没给该字段。
 */
export function incompleteCopyStartedAtText(startedAt) {
    if (startedAt === null)
        return null;
    const ms = Date.parse(startedAt);
    if (Number.isNaN(ms))
        return startedAt;
    return formatProfileTime(ms) || startedAt;
}
/**
 * 行内形态徽章 → i18n key：残留行必须显式标成「未完成的副本」，不得伪装成「自定义（generic）」档案。
 * 返回类型保持字面量联合（`t()` 的编译期键校验才会生效）。
 */
export function profileShapeLabelKey(profile) {
    return isIncompleteProfileCopy(profile) ? 'profiles.shape.incomplete' : shapeLabelKey(profile.shape);
}
/**
 * 列表概览里的「未完成的副本」计数（与档案计数**分开**呈现）。
 *
 * 刻意不改 `summarizeProfiles`：那会动到既有 summary 断言（total/generic 的口径）；
 * 残留清单是独立一类信息，单独给一行计数即可。
 */
export function countIncompleteProfileCopies(profiles) {
    return profiles.filter(isIncompleteProfileCopy).length;
}
/** issue → i18n key。 */
export function issueLabelKey(issue) {
    return issue === 'manifestInvalid' ? 'profiles.issue.manifestInvalid' : 'profiles.issue.patchTooLarge';
}
/** 时间戳（毫秒）→ 本地 `YYYY-MM-DD HH:mm`；null / 非法 = 空串。 */
export function formatProfileTime(ms) {
    const d = parseDateInput(ms);
    return d === null ? '' : formatMinuteStamp(d);
}
/** 字节数 → 人类可读（B / KB / MB，保留一位小数）。 */
export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0)
        return '0 B';
    if (bytes < 1024)
        return `${Math.round(bytes)} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
//# sourceMappingURL=dsh-profiles-view.js.map