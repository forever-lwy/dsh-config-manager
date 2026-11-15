import type { ClaudePluginInput, ForeignSkip } from './types.ts';
/** 插件数上限触顶（count = 上限） */
export declare const MAX_PLUGINS_REACHED = "max-plugins-reached";
/** 单插件文件数上限触顶（count = 上限） */
export declare const MAX_PLUGIN_FILES_REACHED = "max-plugin-files-reached";
/** plugins/config.json 存在但形状认不出来（**绝不猜**） */
export declare const PLUGINS_CONFIG_UNKNOWN_SHAPE = "plugins-config-unknown-shape";
export interface ClaudePluginReadLimits {
    /** 启用的插件数上限（默认 50） */
    readonly maxPlugins?: number;
    /** 单个插件的文件数上限（默认 200；触顶报 max-plugin-files-reached） */
    readonly maxPluginFiles?: number;
}
export interface ClaudePluginReadOptions {
    /** Claude 配置目录（`<home>/.claude` 或 CLAUDE_CONFIG_DIR 覆盖值） */
    readonly claudeDir: string;
    /** settings.json 的已解析值（enabledPlugins 的权威来源） */
    readonly settings: unknown;
    readonly limits?: ClaudePluginReadLimits;
    /** 单文件读取上限（默认 8 MiB；与同域读盘层同口径） */
    readonly maxFileBytes?: number;
}
export interface ClaudePluginReadResult {
    /** 读到的插件（只含有安装目录、能自证的最小元数据与组件） */
    plugins: ClaudePluginInput[];
    /** 已登记的市场（name + 来源仓库；URL 的 userinfo 已剥离） */
    marketplaces: {
        name: string;
        repo?: string;
    }[];
    /** 落不到具体插件上的发现（市场清单 / 启用清单 / 找不到安装目录 / 插件数触顶） */
    skipped: ForeignSkip[];
    /** 计数（marketplaces / enabledPlugins / plugins / pluginSkills / pluginCommands / pluginAgents / pluginHooks） */
    counts: Record<string, number>;
}
export declare function readClaudePlugins(opts: ClaudePluginReadOptions): Promise<ClaudePluginReadResult>;
