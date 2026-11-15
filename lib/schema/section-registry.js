/** 分区载荷版本：当前 17 个分区统一为 1（唯一字面量；分区可独立升级时只改对应条目的引用） */
export const SECTION_DATA_VERSION = 1;
/**
 * 分区注册表（**Record<SectionId, SectionMeta>**：漏注册/写错 id → 编译失败）。
 *
 * 字段来源（改动前分散在多处，现已收敛到此处）：
 *  - `zipPath` / `filePrefix` ← config.ts 的 SECTION_JSON_PATHS / SECTION_FILE_PREFIXES；
 *  - `portability` / `defaultIncluded` ← 各 adapter 的 `portability` / `defaultIncluded`，
 *    以及 `ui/export-flow.ts` 的内置目录、`market/prepare.ts` 的 SECTION_PORTABILITY
 *    （三者此前必须人工保持一致，现以本表为源）；
 *  - `syncOptIn` ← **本表声明**（mcp='auto' / workspaces='manual' / sessions='manual' / 其余 'off'），
 *    `sync/sync-selection.ts` 的 OPT_IN_SYNC_SECTIONS 与 `AUTO_SYNC_OPT_IN_SECTION_IDS` 都是它的派生视图
 *    （此前是两份手写字面量、零护栏 —— issue #78 收敛为单一事实源）；
 *  - `applyOrder` ← 历史 SECTION_IDS 数组顺序（1 起，连续）。
 */
export const SECTION_REGISTRY = {
    settings: {
        id: 'settings',
        displayName: 'Settings',
        group: 'general',
        payload: { kind: 'namespaces', zipPath: 'config/settings.json' },
        dataVersion: SECTION_DATA_VERSION,
        applyOrder: 1,
        riskTier: 'low',
        portability: 'portable',
        syncOptIn: 'off',
        defaultIncluded: true,
        configSnapshot: true,
    },
    ui: {
        id: 'ui',
        displayName: 'UI Preferences',
        group: 'ui',
        payload: { kind: 'namespaces', zipPath: 'config/ui.json' },
        dataVersion: SECTION_DATA_VERSION,
        applyOrder: 2,
        riskTier: 'low',
        portability: 'portable',
        syncOptIn: 'off',
        defaultIncluded: true,
        configSnapshot: true,
    },
    providers: {
        id: 'providers',
        displayName: 'Providers & Models',
        group: 'ai',
        payload: { kind: 'object', zipPath: 'ai/providers.json', key: 'providers' },
        dataVersion: SECTION_DATA_VERSION,
        applyOrder: 3,
        riskTier: 'low',
        portability: 'portable',
        syncOptIn: 'off',
        defaultIncluded: true,
        configSnapshot: true,
    },
    plugins: {
        id: 'plugins',
        displayName: 'Plugin list',
        group: 'extensions',
        payload: {
            kind: 'array', zipPath: 'plugins/plugins.json', key: 'plugins',
            extraArrayKeys: ['patch'], validatePatchFiles: true,
        },
        dataVersion: SECTION_DATA_VERSION,
        applyOrder: 4,
        riskTier: 'medium',
        portability: 'portable',
        syncOptIn: 'off',
        defaultIncluded: true,
        configSnapshot: true,
    },
    mcp: {
        id: 'mcp',
        displayName: 'MCP Servers',
        group: 'mcp',
        payload: { kind: 'array', zipPath: 'mcp/servers.json', key: 'servers' },
        dataVersion: SECTION_DATA_VERSION,
        applyOrder: 5,
        riskTier: 'medium',
        portability: 'platformSpecific',
        // issue #78：MCP 行只写 patch 行（导入期按层写回），按包安装的 stdio server
        // （npx / uvx / pipx）配置本身可跨机 —— 只是命令 / cwd 可能与目标机不同，
        // 由导入分析期 warning 提示。用户显式勾选后，手动与自动同步都带。
        syncOptIn: 'auto',
        defaultIncluded: true,
        configSnapshot: true,
    },
    prompts: {
        id: 'prompts',
        displayName: 'Prompts',
        group: 'customization',
        payload: { kind: 'array', zipPath: 'custom/prompts.json', key: 'prompts' },
        dataVersion: SECTION_DATA_VERSION,
        applyOrder: 6,
        riskTier: 'low',
        portability: 'portable',
        syncOptIn: 'off',
        defaultIncluded: true,
        configSnapshot: true,
    },
    skills: {
        id: 'skills',
        displayName: 'Skills',
        group: 'customization',
        payload: { kind: 'files', filePrefix: 'custom/skills/' },
        dataVersion: SECTION_DATA_VERSION,
        applyOrder: 7,
        riskTier: 'low',
        portability: 'portable',
        syncOptIn: 'off',
        defaultIncluded: true,
        configSnapshot: true,
    },
    agentPresets: {
        id: 'agentPresets',
        displayName: 'Agent Presets',
        group: 'customization',
        payload: { kind: 'files', filePrefix: 'agents/presets/' },
        dataVersion: SECTION_DATA_VERSION,
        applyOrder: 8,
        riskTier: 'low',
        portability: 'portable',
        syncOptIn: 'off',
        defaultIncluded: true,
        configSnapshot: true,
    },
    agentInstructions: {
        id: 'agentInstructions',
        displayName: 'Agent Instructions',
        group: 'customization',
        payload: { kind: 'files', filePrefix: 'custom/agent-instructions/' },
        dataVersion: SECTION_DATA_VERSION,
        applyOrder: 9,
        riskTier: 'low',
        portability: 'portable',
        syncOptIn: 'off',
        defaultIncluded: true,
        configSnapshot: true,
    },
    workspaces: {
        id: 'workspaces',
        displayName: 'Workspaces',
        group: 'workspace',
        payload: { kind: 'array', zipPath: 'workspaces/workspaces.json', key: 'workspaces' },
        dataVersion: SECTION_DATA_VERSION,
        applyOrder: 10,
        riskTier: 'medium',
        portability: 'platformSpecific',
        // issue #127：工作区改为**手动可选**同步分区 —— 会话要能在目标机的工作区里显示出来，
        // 包内就必须有指向它 cwd 的工作区记录（DSH 按 realpath(cwd) == workspace.path 归组）。
        // 仍是 platformSpecific（路径与机器绑定，靠 PathMapping 重定基），故只能手动放行、绝不进自动同步。
        syncOptIn: 'manual',
        defaultIncluded: true,
        configSnapshot: true,
    },
    pluginFiles: {
        id: 'pluginFiles',
        displayName: 'Plugin config files',
        group: 'extensions',
        payload: { kind: 'files', filePrefix: 'plugin-files/' },
        dataVersion: SECTION_DATA_VERSION,
        applyOrder: 11,
        riskTier: 'high',
        portability: 'deviceSpecific',
        syncOptIn: 'off',
        defaultIncluded: false,
        configSnapshot: true,
    },
    credentialsStatus: {
        id: 'credentialsStatus',
        displayName: 'Credentials Status',
        group: 'optional',
        payload: { kind: 'array', zipPath: 'security/credentials.json', key: 'credentials' },
        dataVersion: SECTION_DATA_VERSION,
        applyOrder: 12,
        riskTier: 'high',
        portability: 'deviceSpecific',
        syncOptIn: 'off',
        defaultIncluded: true,
        configSnapshot: true,
    },
    secrets: {
        // 无 adapter、无 ZIP 内分区 JSON：凭据值走独立加密容器（导出侧 .credentials.yaml + secrets.enc）
        id: 'secrets',
        displayName: 'Secrets',
        group: 'optional',
        payload: { kind: 'none' },
        dataVersion: SECTION_DATA_VERSION,
        applyOrder: 13,
        riskTier: 'high',
        portability: 'deviceSpecific',
        syncOptIn: 'off',
        defaultIncluded: false,
        configSnapshot: false,
    },
    sessions: {
        id: 'sessions',
        displayName: 'Sessions',
        group: 'optional',
        payload: { kind: 'files', filePrefix: 'sessions/' },
        dataVersion: SECTION_DATA_VERSION,
        applyOrder: 14,
        riskTier: 'high',
        portability: 'deviceSpecific',
        syncOptIn: 'manual',
        defaultIncluded: false,
        configSnapshot: false,
    },
    self: {
        id: 'self',
        displayName: 'Config Manager settings',
        group: 'extensions',
        payload: { kind: 'files', filePrefix: 'self/' },
        dataVersion: SECTION_DATA_VERSION,
        applyOrder: 15,
        riskTier: 'low',
        portability: 'portable',
        syncOptIn: 'off',
        defaultIncluded: true,
        configSnapshot: true,
    },
    pluginData: {
        id: 'pluginData',
        displayName: 'Plugin data dirs',
        group: 'extensions',
        payload: { kind: 'files', filePrefix: 'plugin-data/' },
        dataVersion: SECTION_DATA_VERSION,
        applyOrder: 16,
        riskTier: 'high',
        // 第三方插件的数据目录不在 DSH 的三个核心存储里：路径是「机器的 home 布局」而非配置内容，
        // 换机后可能整个目录不存在（未安装该插件）→ deviceSpecific + 不参与自动同步。
        portability: 'deviceSpecific',
        syncOptIn: 'off',
        defaultIncluded: false,
        // 体量由用户数据主导（可能几百 MB），与 sessions 同理不进「配置状态」采集口径
        configSnapshot: false,
    },
    pluginAssets: {
        id: 'pluginAssets',
        displayName: 'Plugin large files',
        group: 'extensions',
        payload: { kind: 'files', filePrefix: 'plugin-assets/' },
        dataVersion: SECTION_DATA_VERSION,
        applyOrder: 17,
        riskTier: 'high',
        portability: 'deviceSpecific',
        syncOptIn: 'off',
        defaultIncluded: false,
        configSnapshot: false,
    },
};
/** 分区 id（按 applyOrder 升序）——历史上与 SECTION_IDS 数组逐项一致 */
export const SECTION_IDS = Object.keys(SECTION_REGISTRY)
    .sort((a, b) => SECTION_REGISTRY[a].applyOrder - SECTION_REGISTRY[b].applyOrder);
/** 运行时安全查找：未注册 / 非字符串 → null（不抛错，供调用方自己决定如何报错） */
export function sectionMetaOf(value) {
    if (typeof value !== 'string')
        return null;
    if (!Object.prototype.hasOwnProperty.call(SECTION_REGISTRY, value))
        return null;
    return SECTION_REGISTRY[value];
}
/** 类型安全的元数据读取（id 已是 SectionId） */
export function sectionMeta(id) {
    return SECTION_REGISTRY[id];
}
/** 该 id 是否是已注册分区（运行期守卫；配合 manifest 的未知键告警使用） */
export function isSectionId(value) {
    return sectionMetaOf(value) !== null;
}
/** ZIP 内 JSON 分区路径（null = 该分区无 JSON 载荷：文件类分区 / secrets） */
export function jsonPathOf(id) {
    const p = SECTION_REGISTRY[id].payload;
    return p.kind === 'files' || p.kind === 'none' ? null : p.zipPath;
}
/** 文件类分区在 ZIP 内的目录前缀（null = 非文件类分区） */
export function filePrefixOf(id) {
    const p = SECTION_REGISTRY[id].payload;
    return p.kind === 'files' ? p.filePrefix : null;
}
/** 是否「文件类」分区（ZIP 内以真实文件存放而非单个 JSON） */
export function isFileSection(sectionId) {
    return SECTION_REGISTRY[sectionId].payload.kind === 'files';
}
/** JSON 分区在 ZIP 内的相对路径表（派生自注册表；文件类分区与 secrets 不在表内） */
export const SECTION_JSON_PATHS = Object.fromEntries(SECTION_IDS
    .map((id) => [id, jsonPathOf(id)])
    .filter((entry) => entry[1] !== null));
/** 文件类分区在 ZIP 内的目录前缀表（派生自注册表） */
export const SECTION_FILE_PREFIXES = Object.fromEntries(SECTION_IDS
    .map((id) => [id, filePrefixOf(id)])
    .filter((entry) => entry[1] !== null));
/** 可移植分区（同步/分享默认候选） */
export const PORTABLE_SECTION_IDS = SECTION_IDS.filter((id) => SECTION_REGISTRY[id].portability === 'portable');
/**
 * 同步「可选分区」：非 portable、必须推/拉两侧显式放行的分区（syncOptIn !== 'off'）。
 * 当前 = ['mcp', 'workspaces', 'sessions']。**顺序按 applyOrder**
 * （mcp=5 → workspaces=10 → sessions=14）。
 */
export const OPT_IN_SYNC_SECTION_IDS = SECTION_IDS.filter((id) => SECTION_REGISTRY[id].syncOptIn !== 'off');
/**
 * 「可选分区」里**允许参与自动同步**的子集（syncOptIn === 'auto'）。
 *
 * 为什么必须单独一档：可选分区的准入理由不同 ——
 *  - sessions 是**内容隐私 / 设备相关**（high 风险，自动同步绝不带，绝不悄悄下行会话）；
 *  - mcp 只是**命令 / 路径可能与目标机不同**（medium 风险，用户勾了就该跟着自动同步走）。
 * 用一个布尔没法表达这层差别，会退化成「勾了 mcp 顺带放行 sessions」。
 */
export const AUTO_SYNC_OPT_IN_SECTION_IDS = SECTION_IDS.filter((id) => SECTION_REGISTRY[id].syncOptIn === 'auto');
/** 快速导出默认勾选的分区（deviceSpecific 仍需 UI 就地警示，见 export-flow） */
export const DEFAULT_INCLUDED_SECTION_IDS = SECTION_IDS.filter((id) => SECTION_REGISTRY[id].defaultIncluded);
/**
 * 「配置类分区」的口径（`configSnapshot=true` 的成员）。
 *
 * 与导出口径**刻意不同**：导出要的是「这台机器的完整可迁移状态」，而配置状态只是一小块；
 * 内容数据类分区（sessions，真机 476 MB）属于用户数据，不属于配置状态。
 *
 * **当前无消费者**：这组口径原本服务灾备的自动快照 / 撤销-重做，而灾备快照线已按产品定位
 * 收敛下线（定位 = 迁移 / 同步 / 市场，只保留崩溃归因 + 救援模式）。字段与清单保留为分区的
 * 语义声明（配置类 vs 内容数据类），未来任何状态类功能可直接复用；新增分区若体量由用户数据
 * 主导，把它的 `configSnapshot` 置 false。
 */
export const CONFIG_SNAPSHOT_SECTION_IDS = SECTION_IDS.filter((id) => SECTION_REGISTRY[id].configSnapshot);
//# sourceMappingURL=section-registry.js.map