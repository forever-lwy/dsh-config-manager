import type { MsgFunc } from '../core/msg-types.ts';
export declare const zh: {
    readonly 'adapter.linkDirEntry': '{path}（{files}）';
    readonly 'adapter.linkSkipLine': '{reason} {count} 个: {paths}{more}';
    readonly 'adapter.listSeparator': '；';
    readonly 'adapter.pluginFilesCollectDirInvalid': 'pluginFiles collectDir 非法（须为相对 ~/.dsh 根的安全路径）: {dir}';
    readonly 'adapter.tarballRelPathInvalid': '非法 tarball 相对路径: {path}';
    readonly 'adapter.localTarballUnpackFailed': '本地插件 {name} 的 tarball 解包失败，回退原始 spec：{err}';
    readonly 'adapter.promptDiffDetail': '行 {line} current={current} imported={imported}';
    readonly 'adapter.sessionUncoupledNote': '{id}（{reason}）';
    readonly 'adapter.workspaceNotesParen': '（{notes}）';
    readonly 'adapter.uiLocalStorageTaskBoard': '任务看板数据存于浏览器 localStorage，Host 侧无访问通道，需在目标机器重新配置';
    readonly 'adapter.uiLocalStoragePanel': '面板宽度/折叠状态存于浏览器 localStorage，Host 侧无访问通道，需在目标机器重新配置';
    readonly 'adapter.uiLocalStorageGeneric': '浏览器端 UI 状态无法经 Host API 迁移';
    readonly 'adapter.pluginDataEnvOverridden': '{path} 的位置被环境变量 {env} 覆盖，本次已跳过（不猜它指向哪里）';
    readonly 'adapter.pluginDataPathNotAllowed': '路径不在第三方插件数据的允许范围内，已拒绝写入: {path}';
    readonly 'adapter.pluginDataSensitiveSkipped': '已剔除 {count} 个凭据文件（首个：{sample}）——第三方插件数据分区永不搬运凭据明文';
    readonly 'adapter.pluginDataNoOsHome': '第三方插件的数据在系统主目录下，但当前宿主没有提供该目录的文件通道（旧版本宿主）：本次不读取也不导入 / third-party plugin data lives under the system home directory, but this host offers no file channel for it (older host): nothing is read or imported this time';
    readonly 'adapter.pwMachinePathStripped': '已剥离 {count} 条与本机路径绑定的 pnpm 设置（换机后会指向不存在的目录）：{keys}';
    readonly 'adapter.pwMachinePathKept': '保留本机原有的 {count} 条 pnpm 路径设置（不搬运来源机的路径）：{keys}';
    readonly 'adapter.pwLocalReadFailed': '读取本机 pnpm-workspace.yaml 失败：{reason}（未写入 —— 避免把本机自己的 pnpm 路径设置清掉）';
};
export declare const en: Record<keyof typeof zh, string>;
/** 本域活翻译器（与 core 的 engineMsg 同一实现；导入本模块即完成目录注册）。 */
export declare const engineMsg: MsgFunc;
