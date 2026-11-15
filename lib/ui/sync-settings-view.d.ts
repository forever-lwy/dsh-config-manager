/**
 * 同步设置面板的**框架无关纯逻辑**（t42：从 src/client/sync/SyncSettingsView.tsx 下沉）。
 *
 * 分层约定（AGENTS.md「逻辑放 src/ui/」）：
 * - 本模块**不 import src/client/**（避免 ui → client 反向依赖，也让 node 可直接测）；
 * - 入参用**结构类型**：client 侧的 `SyncPushPayload` / `ChannelSyncState` / `SyncStatusResponse`
 *   与这里的结构同形，可直接传入（类型变了会在 typecheck 阶段报出来，不会静默漂移）；
 * - 只放「状态机 / 派生计算 / 请求体组装 / 格式化」四类可测逻辑，**不放 React**。
 *
 * 组件（SyncSettingsView.tsx）保留：React 状态、useRef 定时器、网络调用与 JSX 装配。
 */
import type { SectionId } from '../schema/types.ts';
import type { Selection } from './selection-model.ts';
import { SYNC_CHANNELS } from '../utils/shared-constants.ts';
import type { CloudConfigIssueCode, S3CompatProvider, SyncTransportType } from '../sync/sync-config.ts';
/**
 * 转出宿主错误码联合（客户端要按它建「码 → 字典键」的全量 Record）。
 * 仅类型转出：不在本模块产生任何运行期依赖。
 */
export type { CloudConfigIssueCode };
/**
 * 通道名（**由 `SYNC_CHANNELS` 单一事实源派生**：git | webdav | s3 | gist）。
 *
 * 与 `src/client/sync/sync-view.ts` 的 `SyncChannel` 同集合（两者都派生自同一常量）。
 * 历史：本类型曾与 `SyncUiState.channel` 一起被**故意收窄**成 `'git' | 'webdav'`（s3/gist 界面
 * 未接线时），t12 接线后两处一起放宽 —— 放宽是成对的，只改一处会立刻编译报错。
 */
export type SyncChannelName = (typeof SYNC_CHANNELS)[number];
/** 自动同步间隔（与 client 的 AutosyncInterval 同形）。 */
export type SyncAutosyncInterval = '5m' | '15m' | '30m' | '60m' | '6h' | '12h' | '24h';
/** 表单快照（组件 state 里与本模块相关的那部分）。 */
export interface SyncFormSnapshot {
    channel: SyncChannelName;
    repoUrl: string;
    /** 仓库内子目录前缀（空 = 仓库根；issue #131：多工具共用一个私有仓库时各自独立） */
    gitSubdir: string;
    /** 仅内存；成功后由组件清空（已写入 DSH credentials） */
    token: string;
    webdavUrl: string;
    webdavUsername: string;
    /** 仅内存；成功后由组件清空 */
    webdavPassword: string;
    /** 具体兼容商（s3 / oss / cos / minio / kodo） */
    s3Provider: string;
    s3Endpoint: string;
    s3Region: string;
    s3Bucket: string;
    /** 对象键前缀（空 = 根前缀） */
    s3Prefix: string;
    /** AccessKey ID（标识符，可回显；**不是**密钥） */
    s3AccessKeyId: string;
    /** path-style 寻址（MinIO 常需 true；缺省跟随兼容商变体） */
    s3PathStyle: boolean;
    /** 仅内存；成功后由组件清空（已写入 DSH credentials 的 cloudSecretRef 槽位） */
    s3Secret: string;
    gistId: string;
    /** GitHub API 根（空 = 缺省 https://api.github.com；GitHub Enterprise 可改） */
    gistApiBaseUrl: string;
    /** gist 内文件名前缀（空 = 缺省 dsh-sync） */
    gistFilePrefix: string;
    /** 仅内存；成功后由组件清空（已写入 DSH credentials 的 gist token 槽位） */
    gistToken: string;
}
/** 当前通道的设置快照（组件 state.byChannel[channel] 中与本模块相关的那部分）。 */
export interface SyncChannelSettings {
    syncSections: readonly SectionId[];
    sessionsLimit: number;
    /**
     * 显式点名的会话单元 id（非空时优先于 sessionsLimit；空 = 「最新 N 个」模式）。
     * 与导出选择器的单元 id 同命名空间（sessions:<projectKey>/<sessionId>）。
     */
    sessionsInclude: readonly string[];
    encrypt: boolean;
    includeSecrets: boolean;
    /**
     * 跟随远端删除插件（issue #132，缺省 **false**）：祖先有、远端没有、本机未改过的插件
     * 会执行 `dsh plugin remove`。勾上 = 用户显式授权手动合并与自动同步都删。
     */
    deletePlugins: boolean;
    encryptPassword: string;
    encryptPasswordConfirm: string;
    /** 本机凭据库里是否已有密码（只回布尔，值永不回浏览器） */
    encryptPasswordSaved: boolean;
    decryptPassword: string;
}
/** 推/拉请求体（与 client 的 SyncPushPayload / SyncPullPayload 同形）。 */
export interface SyncPushBody {
    /**
     * 请求体 transport：**宿主可接受的通道全集**（`SYNC_CHANNELS` = git/webdav/s3/gist）。
     *
     * 为什么是宽集合而不是上面的 `SyncChannelName`：client 的 `SyncPushPayload.transport`
     * 已是宽集合（云端通道并入 `SYNC_CHANNELS` 后由 `SyncTransportType` 派生），t42 组装器
     * 的产物会直接喂给 `saveQueueOnRequest` 等以 `SyncPushBody` 为参的纯函数；写窄会让
     * 「client 宽 → ui 窄」在 typecheck 阶段失败（T0 合并 origin/main 实测 3 条）。
     * transport 是**线上形状**，宿主按 `isSyncTransportType` 校验，宽集合才是正确口径。
     */
    transport?: SyncTransportType;
    repoUrl?: string;
    /** git：仓库内子目录前缀（issue #131；空 / 缺省 = 仓库根，旧配置读出来即空） */
    subdir?: string;
    token?: string;
    url?: string;
    username?: string;
    password?: string;
    sections?: SectionId[];
    /**
     * sessions（可选分区）选项：**只有显式提供它**，会话才被允许进入同步通道
     * （Host 侧安全默认：未提供则按非 portable 分区跳过）。绝不悄悄携带。
     */
    sessions?: {
        limit?: number;
        include?: string[];
    };
    /** s3：具体兼容商 */
    provider?: string;
    endpoint?: string;
    region?: string;
    bucket?: string;
    prefix?: string;
    accessKeyId?: string;
    pathStyle?: boolean;
    /** 显式覆盖签名方言（高级覆盖；宿主忽略非法值，回落兼容商变体默认） */
    dialectId?: 'aws4' | 'oss4';
    /** gist：目标 gist id */
    gistId?: string;
    apiBaseUrl?: string;
    filePrefix?: string;
    /**
     * 云端点密钥（s3 的 AccessKey Secret / gist 的 token）：**只写**。
     * 仅请求体内存传输 → 宿主写入 DSH credentials 槽位（cloudSecretRef）后即丢弃；
     * 绝不落配置文件 / 日志 / 响应（凭据铁律）。
     */
    secret?: string;
    encrypt?: boolean;
    encryptPassword?: string;
    includeSecrets?: boolean;
}
/** 同步分区选择请求体（与 client 的 SyncSelectionPayload 同形；响应回填字段不在此列）。 */
export interface SyncSelectionRequestBody {
    transport: SyncChannelName;
    mode: 'advanced';
    sections: SectionId[];
    sessionsLimit: number;
    sessionsInclude: string[];
    encrypt: boolean;
    includeSecrets: boolean;
    deletePlugins: boolean;
    encryptPassword?: string;
    decryptPassword?: string;
    clearEncryptPassword?: boolean;
    clearDecryptPassword?: boolean;
}
/** 分区选择的部分更新（与组件内 SelectionPatch 同形）。 */
export interface SyncSelectionPatch {
    sections?: SectionId[];
    sessionsLimit?: number;
    sessionsInclude?: string[];
    encrypt?: boolean;
    includeSecrets?: boolean;
    deletePlugins?: boolean;
    encryptPassword?: string;
    decryptPassword?: string;
    clearEncryptPassword?: boolean;
    clearDecryptPassword?: boolean;
}
/** 组件 state 的通道补丁（Partial<ChannelSyncState> 的可用子集）。 */
export interface SyncChannelSettingsPatch {
    syncSections?: SectionId[];
    sessionsLimit?: number;
    sessionsInclude?: string[];
    encrypt?: boolean;
    includeSecrets?: boolean;
    deletePlugins?: boolean;
    encryptPassword?: string;
    encryptPasswordConfirm?: string;
    encryptPasswordSaved?: boolean;
    decryptPassword?: string;
    decryptPasswordSaved?: boolean;
}
/** 从 /sync/status 回填到单个通道的字段（与 ChannelSyncState 的这些字段同形）。 */
export interface SyncChannelBackfill {
    syncMode: 'advanced';
    syncSections: SectionId[];
    sessionsLimit: number;
    sessionsInclude: string[];
    encrypt: boolean;
    includeSecrets: boolean;
    deletePlugins: boolean;
    encryptPasswordSaved: boolean;
    decryptPasswordSaved: boolean;
    autosyncEnabled: boolean;
    autosyncInterval: SyncAutosyncInterval;
}
/** 按通道的持久化选择（/sync/status 的 syncSelectionByChannel[ch]）。 */
export interface SyncSelectionLike {
    sessionsLimit?: number;
    sessionsInclude?: string[];
    encrypt?: boolean;
    includeSecrets?: boolean;
    deletePlugins?: boolean;
}
/** 按通道的自动同步状态（/sync/status 的 autosyncByChannel[ch]）。 */
export interface SyncAutosyncLike {
    enabled: boolean;
    interval: SyncAutosyncInterval;
}
/** 按通道的凭据状态（/sync/status 的 syncCredentialsByChannel[ch]；只回布尔）。 */
export interface SyncCredentialsLike {
    encryptPasswordConfigured?: boolean;
    decryptPasswordConfigured?: boolean;
}
/** GitHub device flow 轮询响应里本模块关心的字段。 */
export interface GithubPollLike {
    status: 'pending' | 'success' | 'denied' | 'expired' | 'error';
    /** 服务端建议的下次轮询间隔（ms）；缺省用 interval 兜底 */
    pollDelayMs?: number;
}
/** GitHub device flow 轮询的下一步决策（组件据此 patch 状态 / 排下一次定时器）。 */
export interface GithubPollDecision {
    /** 下一步相位（pending → waiting；success → success；其余终止态 → error） */
    phase: 'waiting' | 'success' | 'error';
    /** pending 时下一次轮询的延迟（ms）；非 pending 为 null（不再排期） */
    delayMs: number | null;
}
/** 表单改动 → 自动保存的防抖时长（ms）。 */
export declare const SYNC_CONFIG_SAVE_DEBOUNCE_MS = 600;
/** push / pull / 一键同步的公共请求体（仅通道鉴权字段；空串不携带，密码仅内存）。 */
export declare function buildSyncChannelBody(form: SyncFormSnapshot): SyncPushBody;
/**
 * 「保存配置」请求体：该通道远端**未就绪** → null（自动保存跳过）。
 *
 * 四通道共用 `channelRemoteReady` 一条判据（git/webdav = 地址非空；s3/gist = 表单全部校验通过）——
 * 拿一个必然被宿主 400 的载荷去自动保存，只会让用户每敲一个字符就吃一条失败提示。
 */
export declare function buildSyncConfigBody(form: SyncFormSnapshot): SyncPushBody | null;
/**
/**
 * S3 兼容商清单（t88：**不再是客户端副本**，直接用零依赖共享常量 S3_COMPAT_PROVIDERS；
 * 宿主 sync-config.ts 只是它的 re-export）。下面的穷尽检查保留为双保险：
 * 宿主若新增兼容商而共享清单没同步，编译仍然失败；结构/运行时守卫见 sync-config.test.ts 的 t88。
 */
export declare const S3_PROVIDERS: readonly ["s3", "oss", "cos", "minio", "kodo"];
/** 缺省兼容商（AWS S3）。 */
export declare const DEFAULT_S3_PROVIDER: S3CompatProvider;
/** 云端点表单里会出错、且能内联定位的字段。 */
export type CloudFormField = 'provider' | 'endpoint' | 'region' | 'bucket' | 'prefix' | 'accessKeyId' | 'gistId' | 'apiBaseUrl' | 'filePrefix';
/** 一条表单问题：字段 + 稳定码（码与宿主一致，字典键 = 码本身）。 */
export interface CloudFormIssue {
    readonly field: CloudFormField;
    readonly code: CloudConfigIssueCode;
}
/**
 * 端点校验（http(s)、无空白、无 userinfo、无 query/hash）→ 码或 null。
 * 与宿主 `validateCloudEndpoint` **同口径**：客户端先校验只为「填错立刻可见 + 不拿必然 400 的
 * 载荷去打宿主」；宿主仍是最终权威，拒绝时回同一个码，UI 映射同一条文案。
 */
export declare function validateCloudEndpoint(endpoint: string): CloudConfigIssueCode | null;
/** region 校验：非空、无空白。 */
export declare function validateCloudRegion(region: string): CloudConfigIssueCode | null;
/** 桶名校验（同宿主规则）。 */
export declare function validateCloudBucket(bucket: string): CloudConfigIssueCode | null;
/** 对象键前缀校验（首尾斜杠先归一，再判非法形态；空 = 根前缀，合法）。 */
export declare function validateCloudPrefix(prefix: string): CloudConfigIssueCode | null;
/** gist id 校验（同宿主规则）。 */
export declare function validateGistId(gistId: string): CloudConfigIssueCode | null;
/** GitHub API 根校验（http(s)、无 userinfo）。 */
export declare function validateCloudApiBaseUrl(url: string): CloudConfigIssueCode | null;
/** s3 表单的全部问题（顺序 = 字段出现顺序：provider → endpoint → region → bucket → prefix → accessKeyId）。 */
export declare function validateS3Form(form: SyncFormSnapshot): CloudFormIssue[];
/** gist 表单的全部问题（gistId 必填；两个可选字段**填了才校验**，空 = 用缺省）。 */
export declare function validateGistForm(form: SyncFormSnapshot): CloudFormIssue[];
/** 按通道校验表单；git / webdav 走「地址非空」一条规则（见 channelRemoteReady），故返回空表。 */
export declare function validateCloudForm(form: SyncFormSnapshot): CloudFormIssue[];
/** 每个字段的首条问题（内联提示用；字段顺序稳定 = 上面的问题顺序）。 */
export declare function cloudFieldIssues(form: SyncFormSnapshot): Partial<Record<CloudFormField, CloudConfigIssueCode>>;
/** /sync/status 的 s3 / gist 非密视图（结构类型：只含可回显字段，**没有任何密钥值**）。 */
export interface CloudStatusLike {
    s3?: {
        provider?: string;
        endpoint?: string;
        region?: string;
        bucket?: string;
        prefix?: string;
        accessKeyId?: string;
        pathStyle?: boolean;
    };
    gist?: {
        gistId?: string;
        apiBaseUrl?: string;
        filePrefix?: string;
    };
}
/** 云端点表单里可回填的字段（= 非密字段；密钥**永不回传**，故不在其中）。 */
export type CloudFormBackfill = Pick<SyncFormSnapshot, 's3Provider' | 's3Endpoint' | 's3Region' | 's3Bucket' | 's3Prefix' | 's3AccessKeyId' | 's3PathStyle' | 'gistId' | 'gistApiBaseUrl' | 'gistFilePrefix'>;
/**
 * /sync/status 的云端点视图 → 表单字段（**只回填非密字段**）。
 *
 * 密钥（AccessKey Secret / gist token）永远不在响应里：宿主只回 `secretStored` 布尔，
 * 该布尔供界面显示「密钥已保存」徽章（由组件直接读 statusInfo），不映射成任何表单值。
 */
export declare function cloudFormFromStatus(info: CloudStatusLike): CloudFormBackfill;
/**
 * 通道「远端是否就绪」（四通道**唯一**判定；按钮可用性与自动保存共用同一条规则）：
 * - git = repoUrl 非空；webdav = url 非空（与拆分前逐字一致）；
 * - s3 / gist = 表单**全部校验通过**（必填 + 格式）—— 半截的云端点配置没有任何可用动作。
 */
export declare function channelRemoteReady(form: SyncFormSnapshot): boolean;
/**
 * push / 预览的完整请求体 = 通道鉴权 + 分区选择 + 加密选项。安全不变量：
 * - **sessions 必须显式放行**：只有勾选了 sessions 才携带 `sessions`（否则会话绝不随同步上行）；
 * - **includeSecrets ⇒ encrypt**：勾了「导出密钥」即使没勾加密，也强制 `encrypt: true`（密钥绝不明文上行）。
 */
export declare function buildSyncPushBody(form: SyncFormSnapshot, settings: SyncChannelSettings): SyncPushBody;
/**
 * 同步分区选择请求体（POST /sync/selection）。既有语义：
 * - mode 恒 `advanced`（勾选集合就是同步范围，UI 已无模式概念）；
 * - 未给出的字段沿用当前通道既有值；
 * - 密码字段：**非空才携带**（空 = 沿用本机凭据库里已保存的密码）；
 * - `clear*` 删除标记与密码写入可同时出现（Host 侧以删除优先）。
 */
export declare function buildSelectionRequest(channel: SyncChannelName, current: SyncChannelSettings, patch?: SyncSelectionPatch): SyncSelectionRequestBody;
/** 勾选/取消某个同步分区（不产生重复项；取消时按 id 过滤）。 */
export declare function toggleSectionSelection(current: readonly SectionId[], id: SectionId, checked: boolean): SectionId[];
/** 勾选是否非空（勾选集合就是同步范围 → 空集合禁止推送）。 */
export declare function hasSelectedSections(settings: Pick<SyncChannelSettings, 'syncSections'>): boolean;
/**
 * 本次勾选是否需要会话单元清单（= 勾了 sessions 才需要）。
 *
 * 为什么是个函数而不是让组件直接判：仓库的结构守卫禁止「sessions 显式放行规则」散落在
 * React 壳里（src/client/sync/SyncSettingsView.test.ts 的 t42 分层守卫），且这条规则
 * 属于业务判断 —— 放在 ui 层可 node 直测，组件只消费结论。
 */
export declare function needsSessionInventory(sections: readonly SectionId[]): boolean;
/**
 * 打开会话选择器时的初始勾选：
 * - 已有显式点名（include 非空）→ 原样返回（绝不覆盖用户的结果）；
 * - 否则取清单**前 N 条**作为「最新 N 个」的可视化预选 —— 清单由宿主按会话最新活动
 *   时间倒序返回（/export-preview 注入 unitActivityTimes），所以前 N 条就是引擎会带走的那几个。
 *
 * 为什么要有这一步：sessionsInclude 为空时引擎按「最新 N 个」筛选，用户看不到是哪几个。
 * 预选把它们显式呈现出来，从「数量」平滑过渡到「点名」，也让「不勾任何 = 回到最新 N 个」
 * 这条回退语义有据可依。
 */
export declare function initialSessionPicks(unitIds: readonly string[], include: readonly string[], limit: number): string[];
/** sessionsInclude（白名单）→ ContentPicker 的 Selection（excluded = 清单里没被点名的那些）。 */
export declare function sessionPickerSelection(unitIds: readonly string[], picks: readonly string[]): Selection;
/**
 * ContentPicker 的 Selection → sessionsInclude（按清单顺序，结果稳定可复现）。
 *
 * 绕开 buildExportRequest 的「整分区全选 = 不下发白名单」压缩：同步侧的 include 空数组
 * 有**独立语义**（= 回到「最新 N 个」），不能被“全选”悄悄吞掉。
 */
export declare function pickedSessionIds(sel: Selection, unitIds: readonly string[]): string[];
/**
 * 「加密备份」开关的联动（既有语义，搬家不改）：
 * - 打开：只改 encrypt（密钥导出的勾选保持用户原样）；
 * - 关闭：一并取消「导出密钥」、清空两个密码输入框、复位「已保存」标记，并**删除本机凭据库里保存的加密密码**
 *   （用户主动取消勾选即清除保存的密码，密钥绝不明文进同步通道）。
 */
export declare function encryptToggle(next: boolean, settings: SyncChannelSettings): {
    channelPatch: SyncChannelSettingsPatch;
    selectionPatch: SyncSelectionPatch;
};
/** 「导出密钥」开关的联动：勾选时自动打开加密（密钥绝不明文进同步通道）。 */
export declare function includeSecretsToggle(next: boolean, settings: SyncChannelSettings): {
    channelPatch: SyncChannelSettingsPatch;
    selectionPatch: SyncSelectionPatch;
};
/**
 * 加密推送校验（加密/导出密钥已勾选时）：
 * - 输入框填了 → 必须与确认框一致（半截密码不算数）；
 * - 输入框留空 → 必须本机凭据库里已有密码（留空即沿用）。
 */
export declare function computeEncryptInvalid(settings: SyncChannelSettings): boolean;
/** GitHub device flow 是否进行中（请求设备码 / 等待授权 / 轮询）：进行中禁用 push/pull。 */
export declare function isGithubFlowInFlight(phase: string): boolean;
/**
 * GitHub 轮询的下一步决策：pending → 继续等待并按服务端建议（缺省 interval，最小 1 秒）排期；
 * success → 成功（组件刷新状态）；其余终止态（denied/expired/error）→ 错误态、不再排期。
 */
export declare function githubPollDecision(poll: GithubPollLike, fallbackIntervalSec: number): GithubPollDecision;
/**
 * /sync/status → 单通道设置回填。既有语义：
 * - 模式恒 advanced；
 * - 分区初始值由调用方算好传入（推荐分区规则住在 sync-view.ts 的 initialSyncSections，
 *   本模块不重复实现；用户主动清空 → 传空数组，保持为空，绝不悄悄填回来）；
 * - 密码「已保存」来自本机凭据库，只回布尔；库里没有 → 复位 false。
 */
export declare function channelBackfillFromStatus(input: {
    selection: SyncSelectionLike | undefined;
    autosync: SyncAutosyncLike | undefined;
    credentials: SyncCredentialsLike | undefined;
    /** 初始勾选：推荐分区规则住在 sync-view.ts 的 initialSyncSections（本模块不重复实现） */
    persistedSections: readonly SectionId[];
    /** 已归一化的 sessions 上限：归一化规则住在 sync-view.ts 的 normalizeSessionsLimit */
    sessionsLimit: number;
}): SyncChannelBackfill;
/** 配置保存的防重入状态（纯数据；组件用 useRef 持有，不用 useState —— 不触发重渲）。 */
export interface SaveQueueState {
    /** 保存请求在途 */
    inFlight: boolean;
    /** 在途期间排入的待发改动（`null` = 无待发；地址清空时也会被置 null） */
    pending: SyncPushBody | null;
}
/**
 * 一次保存请求的入口决策（对应 doSaveConfig 开头）：
 * - 已在途 → 记下最新待发改动并返回 `'queue'`（防重入，不并发发请求）；
 * - 空闲 → 置在途并返回 `'send'`（待发改动**原样保留**，与原实现一致）。
 */
export declare function saveQueueOnRequest(state: SaveQueueState, requested: SyncPushBody | null): {
    state: SaveQueueState;
    action: 'send' | 'queue';
};
/**
 * 请求结束（成功/失败都走）后的收敛（对应 finally）：清在途，返回需要在途期间排入的
 * 待发改动（非 null 则由调用方立即补发，保证「保存中又改」的内容不丢）。
 */
export declare function saveQueueOnSettled(state: SaveQueueState): {
    state: SaveQueueState;
    next: SyncPushBody | null;
};
/**
 * flush（手动点保存 / 防抖到点）：优先用**待发改动**，否则按当前表单值重建；
 * 无论走哪条都清空待发（一次性消费）。
 */
export declare function saveQueueOnFlush(state: SaveQueueState, rebuilt: SyncPushBody | null): {
    state: SaveQueueState;
    payload: SyncPushBody | null;
};
/** 自动同步间隔 → i18n 键（组件用 `t(key)` 取文案；未知值返回 null，由调用方原样展示）。 */
export type SyncAutosyncIntervalKey = 'autosync.interval5m' | 'autosync.interval15m' | 'autosync.interval30m' | 'autosync.interval60m' | 'autosync.interval6h' | 'autosync.interval12h' | 'autosync.interval24h';
/** 间隔 → 文案键；未知值 → null（组件保留原样展示，与搬家前的 default 分支一致）。 */
export declare function autosyncIntervalKey(iv: SyncAutosyncInterval): SyncAutosyncIntervalKey | null;
/**
 * 初始通道解析：store 切片缺省 'git'，无法区分「持久化过 git」与「从未持久化」——
 * 无明确记录时回退 localStorage 记住的选择（升级前遗留），避免冲掉用户选择。
 */
export declare function resolveInitialChannel(persistedChannel: SyncChannelName, rememberedChannel: SyncChannelName | null): SyncChannelName;
/**
 * 上次同步时间（ISO 字符串，来自 GET /sync/status 的 lastSyncAt）→ 展示文本。
 *
 * 既有语义原样保留：**只有 undefined** 显示占位符 `—`；空串等异常输入交给
 * `Date` 自己处理（与搬家前的 `new Date(x).toLocaleString()` 完全一致 —— 顺手改成
 * 「空串也显示 —」会改变展示行为，留作独立小项）。
 */
export declare function formatSyncStatusTimestamp(lastSyncAt: string | undefined, locale?: string): string;
/** 远端地址预览（列表/事实行用）：超长截断到 max 字符（不省略号，保持既有展示）。 */
/**
 * 工作副本自检结果的状态字典键（issue #79）。
 *
 * 入参用**结构类型**（status.workDir 的形状），判定只有这一份实现：
 *  - 自检读不出来（error）→ unknown（读不到 ≠ 不存在）
 *  - 无 .git → missing（首次同步才会 clone）
 *  - origin 已跟随 repoUrl → match；否则 mismatch（改地址后最需要看见的那一条）
 */
export declare function workdirStateKey(workDir: {
    facts?: {
        exists: boolean;
        match: boolean;
    };
    error?: string;
} | undefined): 'workdir.match' | 'workdir.mismatch' | 'workdir.missing' | 'workdir.unknown' | null;
/** 工作副本状态 → 徽章语义（ok = 已跟随；warn = 仍指旧地址 / 读不出；info = 尚未创建）。 */
export declare function workdirStateBadgeKind(state: ReturnType<typeof workdirStateKey>): 'ok' | 'warn' | 'info' | null;
/** 是否需要给用户「重指向仓库地址」入口（只在自检成功、目录存在且地址不一致时）。 */
export declare function needsWorkdirRelink(workDir: {
    facts?: {
        exists: boolean;
        match: boolean;
    };
    error?: string;
} | undefined): boolean;
/** 是否可以「重新克隆工作副本」（自检成功、目录存在且确实是 git 工作副本时才允许）。 */
export declare function canRecloneWorkdir(workDir: {
    facts?: {
        exists: boolean;
        match: boolean;
    };
    error?: string;
} | undefined): boolean;
/**
 * 是否可以「采纳远端历史」（issue #104）：前提与「重新克隆」相同（自检成功、目录里确实是 git
 * 工作副本），区别只在破坏性 —— adopt 不删任何本地提交，可以 revert。
 *
 * 为什么**不**要求 workDir.match：issue #104 的触发路径恰恰是 mismatch（用户把仓库地址改成另一个
 * 仓库后，自检看到 origin 仍指旧地址）。adopt 内部第一步就是 reconcileOrigin + fetch 当前配置地址，
 * 所以 mismatch 正是该给这个入口的时候。地址还没跟上时先 relink 也行，但两键并不互斥。
 */
export declare function canAdoptWorkdir(workDir: {
    facts?: {
        exists: boolean;
        match: boolean;
    };
    error?: string;
} | undefined): boolean;
/**
 * 工作副本的「积压」判定（issue #104 建议 3）。
 *
 * 要回答的是 issue 里那个拖了两周才暴露的问题：本地一直在攒提交，远端从来没收到过快照，
 * 而界面没有任何一处说这件事。判定只用状态接口回传的两个数字（`ahead` / `remoteSnapshots`），
 * 任何一个是 null（没走 detail 自检 / 无远端分支）就不猜 —— 返回 unknown，不渲染告警。
 *
 *  - clean：没有未上传的提交；
 *  - never-synced：本地领先且远端零快照 ⇒ **醒目告警**（这条通道可能一直没在真正备份）；
 *  - ahead：本地领先，但远端确实收到过快照（只是还没推完）。
 */
export type WorkdirBacklog = {
    kind: 'unknown';
} | {
    kind: 'clean';
    ahead: number;
    remoteSnapshots: number;
} | {
    kind: 'ahead';
    ahead: number;
    remoteSnapshots: number;
} | {
    kind: 'never-synced';
    ahead: number;
};
export declare function workdirBacklog(workDir: {
    facts?: {
        ahead?: number | null;
        remoteSnapshots?: number | null;
    };
    error?: string;
} | undefined): WorkdirBacklog;
/**
 * 「这一步该按哪个方向」—— 动作行只留一个 primary（issue 115：两个按钮并排、首次使用看不出该按哪个）。
 *
 * 判定只用**已确证**的远端事实，没证据就回落下行：一键同步先拉远端再三方合并、逐项确认，
 * 不会拿本机默认值覆盖远端历史；上行推送才是产生新快照、改写远端历史的那个动作。
 * 唯一让上行成为 primary 的情形是「远端确证零快照」（git 工作副本自检 remoteSnapshots === 0）：
 * 此时同步无事可做，用户要的就是第一次备份。判定入口收在本函数里（channel 一并传入），
 * 组件不用在调用点再判一次通道 —— 判据只有一处。
 */
export declare function pickSyncPrimary(statusInfo: {
    workDir?: {
        facts?: {
            ahead?: number | null;
            remoteSnapshots?: number | null;
        };
        error?: string;
    };
} | null | undefined, channel: string): 'push' | 'sync';
export declare function formatSyncUrlPreview(url: string, max?: number): string;
