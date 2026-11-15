import type { SessionFormatProbeResult } from '../core/types.ts';
/** 一次体检最多解多少条会话日志（每条只解首帧，成本很低；上限只为兜住异常包）。 */
export declare const MAX_PROBED_SESSION_LOGS = 200;
/**
 * 从 DSH 源码文本里解出 `SESSION_FORMAT_VERSION = <n>`。
 *
 * 读不到（打包形态变了/常量改名）→ undefined：调用方按「无法判定」处理，
 * **绝不**拿 DSH 的 semver 去猜格式版本。
 */
export declare function parseSessionFormatVersion(source: string): number | undefined;
/** 从 `<node_modules>/@deepseek-ai/dsh-session/lib/index.js` 读格式常量；读不到 → undefined。 */
export declare function readSessionFormatVersionAt(nodeModulesDir: string): number | undefined;
/** pnpm 段名 → 版本（`…@<version>[_<peerHash>]`）；不是 dsh-session 段 → undefined。 */
export declare function pnpmSessionEntryVersion(entryName: string): string | undefined;
/** 从 startDir 起向上找最近的 `.pnpm` 存储目录；找不到 → undefined。 */
export declare function findPnpmStore(startDir: string): string | undefined;
/**
 * pnpm 隔离布局下 dsh-session 的候选 node_modules 根（issue #74）。
 *
 * 为什么需要：pnpm 全局安装 DSH 时，installAnchor 落在
 *   `<…>/node_modules/.pnpm/@deepseek-ai+dsh@<ver>_<hash>/node_modules/@deepseek-ai/dsh/package.json`
 * 而它的同级 @deepseek-ai 下**没有** dsh-session（`dsh` 的 dependencies 里也没有它，只有
 * dsh-session-projection / -reference），`dsh/node_modules` 同样不存在 —— 「同级目录拼路径」
 * 在隔离布局下必然落空。真实的 dsh-session 在**同一 store 的另一个段**里：
 *   `<store>/@deepseek-ai+dsh-session@<ver>_<hash>/node_modules/@deepseek-ai/dsh-session/lib/index.js`
 *
 * 多个版本共存时取「与本机 dsh 同版本」的那个（DSH 内部包按同一版本号一起发布）；
 * 同版本多份（peer 哈希不同）等价，全试。**版本读不出来且不止一个候选 → 返回空（不猜）**：
 * 体检宁可整体跳过，也不能拿另一份 dsh-session 的常量谎报本机格式。
 */
export declare function pnpmSessionFormatRoots(nodeModulesDir: string, dshVersion?: string): string[];
/**
 * 一个「同树」根展开成全部候选（顺序即真伪顺序）：
 *   ① hoisted 同级 `<nm>/@deepseek-ai/dsh-session`
 *   ② dsh 自己的嵌套 `<nm>/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session`
 *   ③ pnpm 隔离 store（见 `pnpmSessionFormatRoots`）
 */
export declare function sessionFormatRoots(nodeModulesDir: string, dshVersion?: string): string[];
/** 在一棵（含 pnpm 存储的）依赖树里读格式常量；读不到 → undefined（不猜）。 */
export declare function readSessionFormatVersionInTree(nodeModulesDir: string, dshVersion?: string): number | undefined;
/** 读一个 package.json 的 version（只读；不可读 / 不是非空字符串 → undefined）。 */
export declare function readPackageVersionAt(packageJsonPath: string): string | undefined;
/**
 * 按「@deepseek-ai/dsh/package.json 的路径」候选逐个找同树的会话格式常量。
 *
 * 顺序即真伪顺序（与 `resolveDshVersion` 同源）：installAnchor（拉起本宿主的那份运行时，
 * 桌面端在 app.asar 内）优先，其次该档案自己的依赖树。每处再试三种布局（见 `sessionFormatRoots`）。
 *
 * `tried` 可选：收集**所有尝试过的路径**（解析失败时由调用方写进日志——真机排查看的是这个，
 * 而不是一句「解析不到」）。
 */
export declare function resolveSessionFormatVersion(dshPackageJsonCandidates: readonly string[], tried?: string[]): number | undefined;
/** 体检输入：备份里 sessions 分区的条目（`data` 是归档内的原始字节）。 */
export interface SessionFormatProbeFile {
    relativePath: string;
    data: Uint8Array;
}
/**
 * 抽查备份里的会话日志格式版本（每个会话单元只看一条日志）。
 *
 * 只解**首帧**（`readLogHeaderFromBytes` 自己会停在第 1 帧），所以成本与分区大小无关、
 * 只与抽查条数有关。读不出 header 的日志计入 `unreadable`（可能是撕裂/损坏，
 * 也可能是运行环境没有 zstd 能力）—— 一律如实计数，绝不当作「没问题」。
 */
export declare function probeSessionFormats(files: readonly SessionFormatProbeFile[], maxLogs?: number): SessionFormatProbeResult;
