import type { SectionId } from '../schema/types.ts';
import type { SyncTransportType } from './sync-config.ts';
export declare const SYNC_SELECTION_FILE = "sync-selection.json";
export declare const SYNC_SELECTION_SCHEMA_VERSION = 2;
/** 远程同步分区选择模式：default = 快速导出（全量推荐分区）；advanced = 自定义勾选。 */
export type SyncSelectionMode = 'default' | 'advanced';
/** 远程同步分区选择（持久化面；单通道）。 */
export interface SyncSelection {
    schemaVersion: number;
    mode: SyncSelectionMode;
    /** 高级模式勾选分区；default 模式可为空数组 */
    sections: SectionId[];
    /**
     * sessions（历史会话）分区同步的「最新 N 个会话」上限。
     * 仅在 sections 里显式勾选 sessions 时生效；缺省 5（见 DEFAULT_SYNC_SESSIONS_LIMIT）。
     * 0 = 勾了但不带任何会话；负数非法（读盘时按缺省处理）。
     */
    sessionsLimit: number;
    /**
     * 显式勾选的会话单元 id（形如 sessions:<projectKey>/<sessionId>；空数组 = 用
     * sessionsLimit 的「最新 N 个」）。
     *
     * 为什么必须有它：sessionsLimit 只能说「最新几条」，用户无法点名要哪几次对话，也无法
     * 把某次敏感对话排除在外（同步页补齐导出页早已有的逐会话勾选）。**非空时优先于
     * sessionsLimit** —— 见 SyncPushOptions.sessions.include 的语义说明。
     */
    sessionsInclude: string[];
    /** 手动推送默认加密快照（开关持久化；密码本体存 DSH credentials，见 sync/selection 路由） */
    encrypt: boolean;
    /** 手动推送默认导出真实凭据值（安全：必须同时 encrypt；自动同步恒 false） */
    includeSecrets: boolean;
    /**
     * 跟随远端删除插件（issue #132；缺省 **false** = 既有行为逐字不变）。
     *
     * 打开后：祖先快照里有、远端快照里没有、且本机未改过的插件，手动合并与自动同步都会执行
     * `dsh plugin remove`（开关本身就是用户的显式授权，见 docs/known-issues/known-gaps.md G-20）。
     * 关闭时一律不删（候选降级为 `switch-off`，报告里逐项写明原因）。
     */
    deletePlugins: boolean;
}
/** 全通道选择视图（v2 文件直接读取；status 路由一次返回两个通道的选择）。 */
export type SyncSelectionByChannel = Record<SyncTransportType, SyncSelection>;
/**
 * 显式勾选才允许进入同步通道的「可选分区」。
 *
 * **单一事实源 = 分区注册表**（\`SectionMeta.syncOptIn !== 'off'\`）。本文件此前手写
 * \`['sessions']\`，与 \`section-registry.ts\` 的同名字段是**两份字面量、零护栏**
 * （改一处漏一处不会报错）—— issue #78 收敛为派生视图，并在测试里钉住。
 *
 * 当前 = mcp（'auto'，命令 / 路径可能机器相关）
 *      + workspaces（'manual'，路径与机器绑定，但会话要显示在工作区里就必须随行）
 *      + sessions（'manual'，内容敏感 + 设备相关）。
 * 凭据 / 密钥分区不在此列（结构性拒绝，永不进同步）。
 */
export declare const OPT_IN_SYNC_SECTIONS: readonly SectionId[];
/**
 * 「可选分区」里**允许参与自动同步**的子集（当前 = mcp）。
 *
 * 手动与自动的差别只在这里：sessions 是内容隐私 / 设备相关、workspaces 与本机路径绑定，
 * 两者自动同步绝不带（「会话绝不悄悄下行」从注释变成可测断言）；mcp 只是命令 / 路径可能与
 * 目标机不同，用户显式勾选后手动与自动都带。
 */
export declare const AUTO_SYNC_OPT_IN_SECTIONS: readonly SectionId[];
/** sessions 分区默认同步「最新 N 个会话」（用户可在弹窗里改；0 = 不带）。 */
export declare const DEFAULT_SYNC_SESSIONS_LIMIT = 5;
/** sessionsLimit 归一化：非整数 / 缺失 / 负数 → 默认值；超大 → 上限钳制。 */
export declare function normalizeSessionsLimit(value: unknown): number;
/** 缺省配置（首次无文件 / 损坏 / 不支持 schema 时回退） */
export declare function defaultSyncSelection(): SyncSelection;
/**
 * sessionsInclude 归一化：非数组 → []；元素必须是非空字符串；按首次出现去重保序；
 * 上限 5000 条（防止被篡改的持久化文件把 UI/请求体撑爆）。
 *
 * 只做形状归一化，不校验单元是否真实存在 —— 清单是执行期的输入，勾选是计划期的意图，
 * 会话可能在两次同步之间被本机删掉（此时 adapter 的 includeItems 白名单自然匹配不到它，
 * 结果是「少带一次对话」而不是报错）。
 */
export declare function normalizeSessionsInclude(value: unknown): string[];
/**
 * 生效的同步分区范围：
 * - mode='advanced' 且 sections 非空 → sections（自定义导出）；
 * - 其余（default / advanced 但未勾选）→ undefined（= 全部 portable 推荐分区）。
 */
export declare function effectiveSections(sel: SyncSelection): SectionId[] | undefined;
/** 读取全部通道的分区选择配置；文件不存在 / 损坏 / 不支持 schema → 缺省值（不抛错）。 */
export declare function readAllSyncSelections(dir: string): Promise<SyncSelectionByChannel>;
/**
 * 同步读取全部通道的分区选择（apply 期「同步种入缓存」用，2026-11「C6」）。
 *
 * 为什么必须是同步：`apply()` 是同步的，而缓存消费者（调度器首轮 / 手动 push 路由 /
 * model tool）都**同步**读缓存。异步种入会留下一个窗口：窗口内 `selectionCache[ch]` 是
 * undefined ⇒ 引擎兜底 `defaultSyncSelection()` ⇒ `effectiveSections` 返回 undefined
 * （全部 portable），用户 advanced 勾的收窄在那一轮被吞掉（探针
 * `.tmp/probe-c6-race.ts` 复现：同一 tick 读到 undefined，20ms 后才变 `["settings"]`）。
 * 解析与 `readAllSyncSelections` 完全同一份（`parseSelectionFile`），不是第二套口径。
 */
export declare function readAllSyncSelectionsSync(dir: string): SyncSelectionByChannel;
/** 读取指定通道的分区选择配置；文件不存在 / 损坏 / 不支持 schema → 缺省值（不抛错）。 */
export declare function readSyncSelection(dir: string, channel: SyncTransportType): Promise<SyncSelection>;
/** 写入指定通道的分区选择配置（原子写：临时文件 + rename；保留另一通道；自动创建目录）。 */
export declare function writeSyncSelection(dir: string, channel: SyncTransportType, sel: SyncSelection): Promise<void>;
