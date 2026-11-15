import type { PluginDataSource } from '../core/plugin-data-registry.ts';
import type { HostContext } from '../core/types.ts';
/** 单次扫描最多读取多少个已安装插件的 manifest（防御性上限：profile 依赖数量异常时不无限读） */
export declare const MAX_DECLARED_PACKAGES = 300;
/**
 * 解析声明时用的 profile 目录名。
 *
 * 与 DSH 的 profile 解析同口径：空 / undefined = \`web\`（与改造前的私有实现一致）。
 */
export declare function declaredProfileName(profile: string | undefined): string;
/** 扫描本机已安装插件自述的数据目录声明（零副作用；读不到的一律跳过）。 */
export declare function scanDeclaredDataSources(ctx: HostContext, maxPackages?: number): Promise<PluginDataSource[]>;
