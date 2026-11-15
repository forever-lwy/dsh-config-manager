import type { PathMapping } from '../core/types.ts';
/** 归一化内部表示：统一 `/` 分隔、去尾部斜杠（空串保持） */
export declare function normalizePath(p: string): string;
/** 转当前平台原生路径 */
export declare function toNativePath(p: string, platform?: string): string;
/** 跨平台绝对路径识别（POSIX `/x` 与 Windows `C:\x`、UNC `\\server\share`） */
export declare function isAbsolutePath(p: string): boolean;
/** ZIP 条目名安全检查（Zip Slip / 绝对路径 / 盘符 / NUL，规范 §19.1-2）。
 * 规则与 node:path 解耦：纯分段校验，跨平台无歧义。 */
export declare function isPathSafe(entryName: string): boolean;
/** 越界判定选项。 */
export interface PathInsideOptions {
    /**
     * 比较前折叠大小写（Windows 文件系统大小写不敏感）。缺省按当前平台。
     * 显式传 false 的场景：拿另一台机器的路径做形状判定（跨平台导入）。
     */
    foldCase?: boolean;
}
/** 候选路径是否位于父目录之内（含等于父目录）。
 *
 * 全仓**唯一**的越界判定（restore / verify-recovery / zip / recursive-walk / 路由都走这里）：
 * 早期四处各写一份，其中三份用 `rel.startsWith('..')` 判越界 —— 名字真的叫 `..foo` 的
 * 兄弟目录会被误判为逃逸（`path.relative('/a/b','/a/b/..foo') === '..foo'`）。
 * 越界只有两种形态：相对结果是 `..` 段本身，或以 `..` + 分隔符开头；绝对结果（跨盘符）同样越界。
 *
 * 纯字符串语义（**不碰文件系统**）：两侧各自 `path.resolve` 后比较。调用方若混用
 * realpath 结果与原路径（Windows 8.3 短名、macOS `/var`→`/private/var`）仍会误判为越界 ——
 * `path.resolve` 不折叠短名，真实路径那一层必须两侧都先 realpath 再调用。
 */
export declare function isPathInside(child: string, parent: string, options?: PathInsideOptions): boolean;
/** 候选目录是否位于父目录之内（含等于父目录）—— `isPathInside` 的读法友好别名。 */
export declare function isSameOrChild(p: string, parent: string): boolean;
/**
 * 归一化并折叠 `.` / `..` 路径段（Reviewer B P0 修复）。
 * 宿主 fs 经 `resolve(join(homeDir, rel))` 会折叠 `..`，因此「看似不在保留命名空间、实际经 `..` 落到保留区」
 * 的路径（如 `dsh-config-manager/../dsh-config-manager/snapshots/...`）必须在此折叠后再判，否则 F23 被绕过。
 * 纯字符串、跨平台（只用 `/`）语义与 node:path normalize 一致；`..` 超根时按根截断（不越到 home 外）。
 */
export declare function normalizePathCollapsed(p: string): string;
/** 判断相对 homeDir 的路径是否落在内部 control-plane namespace（F23 投毒防护）。
 *  大小写不敏感（Windows 文件系统大小写不敏感，防 `DSh-Config-Manager/...` 绕过）；
 *  先折叠 `..`/`.` 段（宿主 fs 会折叠，此处必须同样折叠以免被路径穿越绕过）。 */
export declare function isReservedInternalRel(relPath: string): boolean;
/**
 * 凭据文件（home 相对路径）判定 —— **全仓唯一出口**（审计 P2-1 P0 修复，2026-11-13）。
 *
 * 为什么必须有：pluginData / pluginAssets 的分区根是**系统主目录**，来源既可能是内置表，
 * 也可能是插件自己在 package.json 里声明的 `dsh.dataDirs`。声明方只要写 `.dsh`，就会把
 * `~/.dsh/.credentials.yaml` 当普通配置收进**明文 ZIP** —— 而 manifest 仍报「不含密钥」
 * （真机实测：包内出现 plugin-data/.dsh/.credentials.yaml，containsSecrets=false）。
 * 字段级脱敏只处理结构化值，管不到「整文件即秘密」的形态，所以按**文件名形态**判一次，
 * 收集侧（adapter）与打包侧（exporter）共用同一判据 —— 两处都在，缺一即回归。
 *
 * 只认名字、不做内容嗅探：收集期读全部字节既慢又读不完大资产。
 */
export declare function isSensitiveHomeRel(relPath: string): boolean;
/**
 * 前缀批量映射（规范 §12）：把对象内所有字符串值中匹配 oldPrefix 的路径
 * 替换为 newPrefix（路径感知：必须落在段边界）。返回新对象（不改原对象）。
 *
 * **Windows 形状路径先折叠大小写再比较**（core-F4）：Windows 文件系统大小写不敏感，
 * 用户手输 / 两台机器用户名大小写不同都会让 oldPrefix 与真实值只差大小写 —— 只做逐字比较
 * 会让整条映射**静默失效**（目标机保留源机绝对路径，workspace.path 与会话 cwd 对不上）。
 * POSIX 路径仍逐字比较（/home/Alice 与 /home/alice 是不同目录，不得误匹配）。
 */
export declare function applyPrefixMappings(value: unknown, mappings: PathMapping[]): unknown;
/** 对对象内所有字符串叶节点做变换（迭代式，保留非字符串原样；二进制 Uint8Array 视为叶子） */
export declare function mapStrings(value: unknown, fn: (s: string) => string): unknown;
/**
 * 收集对象中所有绝对路径叶值（供 analyzer 做跨设备路径检测）。
 * 返回 (value, jsonPath) 对；jsonPath 形如 "workspaces[0].path"。
 */
export declare function collectAbsolutePaths(value: unknown, prefix?: string): {
    value: string;
    path: string;
}[];
