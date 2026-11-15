import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { parsePackOutput } from './local-plugin-pack.ts';
import type { PackExec, PackLocalPluginsResult } from './local-plugin-pack.ts';
import type { HostContext } from './types.ts';
/**
 * 本地源插件打包钩子签名。
 *
 * 刻意在 core 内**重新声明**该签名（而非从 adapters 反向 import）：架构边界测试
 * （tests/architecture-boundaries.test.ts F7）规定 core 层只允许依赖
 * node 内置 / core 内部 / schema / utils / security —— core → adapters 是违规方向。
 * adapters 侧的 `LocalPluginPackHook` 与这是**结构等价**的，故可直接互赋（TS 结构化类型）。
 * 注意：这里 host ctx 参数只需 HostContext，无需 adapters 的任何类型。
 */
export type LocalPluginPackHook = (plugins: readonly {
    name: string;
    version: string;
    spec?: string;
}[], ctx: Pick<HostContext, 'profile' | 'profileDir'>) => Promise<PackLocalPluginsResult>;
/**
 * 默认 exec：把 `npm pack` 作为子进程执行并收集 stdout/stderr。
 *
 * **刻意不用 `execFile(..., { shell: true })`**：该组合会触发 Node 的 DEP0190
 * （`shell:true` + args 数组只做拼接不做转义，存在注入面）。仓库既有解法是
 * 在 Windows 上显式走 `cmd.exe /d /s /c "<转义后的命令行>"`（见 core/plugin-cli.ts
 * 的 spawnShim + quoteCmdArg），本模块复用同一做法。
 *
 * 失败**不 reject**（把退出码交回调用方判定），只有 spawn 本身失败才 reject——
 * 这样「npm 报错」与「npm 不存在」能被分开处理（前者是插件问题，后者是环境问题）。
 */
/** createPackExec 的注入面（测试用：假子进程 + 记录「整树终止」发生了没有） */
export interface PackExecDeps {
    spawn?: typeof spawn;
    /** 终止整棵进程树（缺省 core/plugin-cli.ts 的 killTree：Windows taskkill /t /f，POSIX 杀进程组） */
    killTree?: (child: ChildProcess) => void;
}
/**
 * 造一个真实 `npm pack` 执行器；默认导出实例给生产用，测试可注入 spawn / killTree。
 *
 * 超时为什么要整棵树：调用方只 `child.kill()` 时，Windows 死掉的只是 cmd.exe 包装进程，
 * npm/pnpm 孙进程成孤儿继续写 tarball，而 `finally` 已经 rm 掉 packDir（审计 P2-3：
 * 孤儿随后在已删除目录里写、或写出一份没人收的产物）。killTree 与 plugin-cli 的
 * `dsh plugin` 子进程用同一实现（Windows taskkill /T /F；POSIX 负 pid 杀进程组 ——
 * 因此 POSIX 上必须 `detached: true` 让子进程自成进程组，否则 -pid 会打到自己的组）。
 */
export declare function createPackExec(deps?: PackExecDeps): PackExec;
export interface LocalPluginPackHookOptions {
    /** $DSH_HOME 绝对路径 */
    homeDir: string;
    /** 插件数据目录（临时打包目录建在其下，保证与既有目录生命周期一致） */
    dataDir: string;
    /** 覆盖 exec（测试注入） */
    exec?: PackExec;
    /**
     * 超限负缓存 TTL（缺省 OVERSIZE_NEGATIVE_TTL_MS；**0 = 关闭缓存**，测试用）。
     * 命中条件 = 源指纹未变 且 距上次实测超限不足 TTL。
     */
    oversizeTtlMs?: number;
    /** 源指纹（测试注入；缺省见 defaultSourceFingerprint） */
    sourceFingerprint?: (absPath: string) => Promise<string | null>;
    /** tarball 体积上限（缺省 MAX_LOCAL_TARBALL_BYTES；测试用小值验证超限负缓存） */
    maxTarballBytes?: number;
    /**
     * 内容缓存上限（字节；缺省 PACKED_CACHE_MAX_BYTES，**0 = 关闭**）。
     * 命中判据 = 源目录的**内容指纹**（递归 rel/size/mtime）未变：命中即复用上次的 tarball 字节，跳过 npm pack。
     */
    packedCacheMaxBytes?: number;
    /** 内容缓存条目上限（缺省 PACKED_CACHE_MAX_ENTRIES）。 */
    packedCacheMaxEntries?: number;
    /** 内容指纹（测试注入；缺省 deepSourceFingerprint）。 */
    contentFingerprint?: (absPath: string) => Promise<string | null>;
}
export declare function createLocalPluginPackHook(opts: LocalPluginPackHookOptions): LocalPluginPackHook;
/** 供其他模块复用（避免重复实现 npm 输出解析） */
export { parsePackOutput };
