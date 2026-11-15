import type { SyncTransportType } from './sync-config.ts';
import type { SessionFormatDisposition } from '../core/types.ts';
export declare const UI_PREFS_FILE = "ui-prefs.json";
export declare const UI_PREFS_SCHEMA_VERSION = 1;
/** 同步通道类型：**唯一来源** = sync-config 的 SYNC_CHANNELS（type-only 引用，无运行期耦合，
 *  也不会与 sync-config 形成循环 import）。 */
export type UiPrefsChannel = SyncTransportType;
/** 插件自身 UI 偏好（持久化面）。 */
export interface UiPrefs {
    schemaVersion: number;
    /** 用户上次选择的同步通道；未配置为 undefined */
    lastSyncChannel?: UiPrefsChannel;
    /** Star 引导弹窗：首次进入页面时间（ms 时间戳）；未配置 = 尚未进入过页面 */
    starPromptFirstSeenAt?: number;
    /** Star 引导弹窗：用户点过「不再提示」（永久不再弹） */
    starPromptDismissed?: boolean;
    /** Star 引导弹窗：用户点过「去点 Star」（方案 A：引导完成，不再弹） */
    starPromptClicked?: boolean;
    /** 更新内容弹窗：上次已记录/展示过的插件版本号（如 '0.1.54'） */
    releaseNotesLastSeenVersion?: string;
    /** 更新内容弹窗：用户点过「永不提示」（永久不再自动弹出） */
    releaseNotesDismissed?: boolean;
    /**
     * 会话格式处置的**插件级缺省**（T1；缺省值见 ui/session-format-disposition.ts 的
     * DEFAULT_SESSION_FORMAT_DISPOSITION = 'abort'）。
     *
     * 语义：请求体没带 `sessionFormatDisposition` 时（第三方客户端 / 老客户端 / 脚本）
     * 宿主按这里的值处置；本插件自己的向导**总是**显式下发用户当前选择，所以这里只在
     * 「用户主动改配置」或「非本插件客户端」时起作用。
     */
    sessionFormatDisposition?: SessionFormatDisposition;
    /**
     * 回合自动留点（回滚点）总开关。**缺省 / 任何非 true 值 = 关闭**（issue #88 / #89：
     * 该功能与「配置备份 / 同步」是两件事，却随 bundle 默认启用且没有关闭入口；
     * 默认启用时账本每回合整份读改写，真机上把宿主拖到 V8 heap OOM）。
     *
     * 关闭语义（宿主侧 gate，见 src/core/rollback-gate.ts）：
     *  · 不订阅 `session/event`（不是「订阅了什么都不做」）；
     *  · 不留点、不写台账；
     *  · 聊天内的「↺ 回退」入口收起（不是置灰）。
     * 台账 / 回退路由本身仍可用：已有回滚点仍能查看、回退、删除、清理 —— 关的是「自动留点」。
     */
    rollbackEnabled?: boolean;
    /**
     * 迁移历史自动清理的保留上限（条）。
     *
     * 语义：缺省 = 1000（core 的 DEFAULT_MIGRATION_RETENTION）；0 = 不限制（只增不减，老行为）；
     * 非法值一律回落缺省。宿主每次写入历史后按本值节流清理最旧条目，
     * 用户可在「迁移历史」面板改（GET/POST /history/retention）。
     */
    historyRetentionMaxEntries?: number;
}
/** 缺省配置（首次无文件 / 损坏 / 不支持 schema 时回退） */
export declare function defaultUiPrefs(): UiPrefs;
/** 读取 UI 偏好；文件不存在 / 损坏 / 不支持 schema → 缺省值（不抛错）。 */
export declare function readUiPrefs(dir: string): Promise<UiPrefs>;
/**
 * 同步读取「回滚点开关」（启动期专用）。
 *
 * 为什么必须有同步版本：宿主 `apply()` 是同步函数（`src/index.ts`），而开关必须在
 * **注册订阅之前**就定下来 —— 否则「关闭」只等于「订阅了什么都不做」，与 issue 要求的
 * 「关闭后不再订阅 `session/event`」不符。读一个几百字节的小文件，启动期一次，代价可忽略。
 *
 * 任何异常（不存在 / 损坏 / 形状不符）一律回 false = 关闭。
 */
export declare function readRollbackEnabledSync(dir: string): boolean;
/** 写入 UI 偏好（原子写：临时文件 + rename；自动创建目录）。 */
export declare function writeUiPrefs(dir: string, prefs: UiPrefs): Promise<void>;
/**
 * 局部原子更新：read → merge → write。
 * 多端点共写 ui-prefs.json 时（sync/ui-prefs 与 star-prompt），任一端点写全量对象
 * 都会丢掉另一端点刚写入的字段；统一走本函数按补丁合并，杜绝互相覆盖。
 */
export declare function updateUiPrefs(dir: string, patch: UiPrefsPatch): Promise<UiPrefs>;
/** updateUiPrefs 的补丁类型（UiPrefs 全部可选字段，schemaVersion 不可补丁）。 */
export type UiPrefsPatch = Partial<Omit<UiPrefs, 'schemaVersion'>>;
