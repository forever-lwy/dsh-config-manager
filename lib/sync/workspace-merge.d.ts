/**
 * workspaces 分区的**记录级**三方合并（issue #127）。
 *
 * 为什么不能走通用 JSON 合并：`merge.ts` 的 `mergeJsonValues` 对数组一律「双侧都改且不逐字相等
 * → 冲突」（数组绝不按索引合并，见该文件头）。而 workspaces 的 `sessionIds` 天生两侧都会各自增长
 * ——A 机把会话挂进工作区、B 机也挂，两条记录就永远冲突，用户每轮同步都要手工裁决，且无论选哪
 * 一侧都会**静默丢掉另一侧的会话归属**（丢归属 = 那几次对话在目标机的工作区里看不见）。
 *
 * 因此这里按「记录 id」做并集，规则逐条如下（与 git 的三方口径一致，祖先只用于判断「谁改了这一
 * 字段」，**绝不猜**）：
 *  - `sessionIds`：恒取两侧并集（本地在前、远端新增按原序追加，按裸键去重）。这是本分区唯一的
 *    「合并」语义：挂接只是提示，多余的 id 最多 attach 不到会话，而少了 id 会让本地已有会话直接
 *    从工作区消失；
 *  - 其它字段（path / title / createdAt / updatedAt / 未来新增字段）：两侧相同即取该值；不同时
 *    看祖先 —— 只有一侧相对祖先变了取变更侧；两侧都变了（或没有祖先）→ **冲突**（点号路径
 *    `workspaces.<id>.<field>`，交用户裁决），绝不按「先到者 / 本地优先」静默取舍；
 *  - 只在单侧存在的记录：有祖先且该侧与祖先逐字相同 → 跟随另一侧的删除（真删除）；否则保留它
 *    —— 无祖先时无法区分「对方删了」与「本机独有」，保留是唯一不丢数据的解释；有祖先且该侧
 *    与祖先不同则记冲突（modify-delete），交用户裁决。
 *
 * 纯函数、零 I/O；形状不认识（非 `{version:1, workspaces:[]}`）时返回 undefined，交回通用合并
 * 路径处理（畸形数据由通用路径的形状闸门拒绝，这里不另造一套判定）。
 */
import type { SectionData } from '../schema/types.ts';
import type { MergeConflict } from './merge.ts';
/** 记录级合并结果：`merged` 为整分区数据；`conflicts` 非空时上层按 conflict 处置（不半应用）。 */
export interface GranularMergeOutcome {
    merged: SectionData;
    conflicts: MergeConflict[];
    /** 自动并入的变更点（口径 = 用户能感知的「两侧各自的改动都保住了」处数） */
    mergePoints: number;
}
/**
 * 钩子可读的合并上下文（只放「用户开关」与「本进程事实」，不放会让钩子做出猜测的东西）。
 *
 * issue #145 起两者分工固定：
 *  - 合并**恒参与**（开关不再决定钩子是否介入，否则 patch 行这类与卸载无关的改动永远合不进去）；
 *  - `deletePlugins` 只管「远端删了、本机未改的条目要不要真的删掉」；
 *  - `selfPluginName` 让 plugins 钩子排除自身（自身条目永不删、不报冲突）。
 */
export interface GranularMergeHooks {
    deletePlugins?: boolean;
    /** 本插件的包名（空串 / 缺省 = 不知道，不排除任何条目）。 */
    selfPluginName?: string;
}
/** 记录级合并钩子签名（`merge.ts` 按分区 id 调用；返回 undefined = 不参与，走通用路径）。 */
export type GranularMerger = (local: SectionData, remote: SectionData, ancestor: SectionData | undefined, hooks?: GranularMergeHooks) => GranularMergeOutcome | undefined;
/** workspaces 分区记录级合并（`merge.ts` 的分区钩子）。 */
export declare const mergeWorkspacesSection: GranularMerger;
