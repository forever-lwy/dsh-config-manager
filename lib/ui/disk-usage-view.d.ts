/**
 * 磁盘占用视图模型（框架无关纯函数层，node 可测）。
 *
 * 输入 = 宿主 `GET /disk-usage` 的报告（`src/core/disk-usage.ts` 的 DiskUsageReport），
 * 输出 = 界面要渲染的行/汇总（含**已翻译**的标签与说明）——组件只负责摆放，判定都在这里。
 *
 * 三条判定规则（都有单测钉住）：
 *  ① 读不到的子区**绝不显示 0 字节**，而是标 `unreadable`（未统计），否则用户会以为盘是空的；
 *  ② 只有 `policy === 'regenerable'` 的子区进「可立即清理」清单，且**不显示保留期**
 *     （它们本来就是随时可清，给一个「7 天后自动清理」的说明会误导）；
 *  ③ 定时备份（豁免前缀）不计入导出产物的「可回收」数字 —— 与宿主回收口径逐条一致；
 *  ④ 遗留数据（core 的 `report.legacy`：插件已不再读取的旧目录）**单列**，既不计入合计、也不进任何清理候选；
 *     标签走字典、相对路径只作「在哪儿」展示（**绝不**把 id / 路径当文案渲染）。
 */
import type { DiskUsageReport, DiskUsageScanArea } from '../core/disk-usage.ts';
import type { UiT } from './i18n.ts';
/** 展示所需的最小注入面 */
export interface DiskUsageViewDeps {
    t: UiT;
    /** 字节格式化（复用 `src/ui/report.ts` 的 formatBytes，保持全仓同口径） */
    formatBytes: (n: number) => string;
}
/** 子区展示行（id 域含附加子区：`rollback-points` 等只报告区也要成行） */
export interface DiskUsageRow {
    id: DiskUsageScanArea;
    /** 子区名（已翻译） */
    label: string;
    /** 一句话说明（已翻译） */
    desc: string;
    /** 体积文本（未统计时为空串） */
    size: string;
    /** 文件数文本 */
    files: string;
    /** 目录读不到（界面显示「未统计」而不是 0） */
    unreadable: boolean;
    policy: 'regenerable' | 'retained' | 'protected';
    /** 保留期文本（仅 retained 有值，形如「7 天」） */
    retention: string;
    /** 按保留期已到回收条件的体积文本（仅 retained；无过期项为 null） */
    expired: string | null;
    /** 是否属于「可立即清理」区（regenerable） */
    reclaimable: boolean;
}
/**
 * 遗留数据展示行（`report.legacy`）。
 *
 * 与 `DiskUsageRow` 分开：遗留目录**不计入**上方子区合计（core 刻意分列），且插件已不再读取它们 ——
 * 界面必须能把「能解释来源的占用」与「遗留占用」分开说，不能让用户以为合计里已经算过。
 */
export interface DiskUsageLegacyRow {
    /** core 的稳定 id（`LEGACY_DATA_DIRS`）——**只作 React key / 去重**，绝不直接当文案渲染 */
    id: string;
    /** 相对 dataDir 的路径（如 `checkpoints`）：这是「在哪儿」，不是机器码文案 */
    relPath: string;
    /** 已翻译的标签（走字典，不渲染 id） */
    label: string;
    /** 体积文本（未统计时为空串） */
    size: string;
    /** 文件数文本（未统计时为空串） */
    files: string;
    /** 读不到/不存在/被非目录占住 → 界面显示「未统计」而不是 0 字节 */
    unreadable: boolean;
    /** 恒为 `protected`：只报告，绝不提供自动清理 */
    policy: 'protected';
}
/** 可立即清理的动作（供界面按 _可用性_ 决定按钮 disabled —— 组件不再自行判断） */
export interface DiskUsageCleanAction {
    id: 'tmp-market' | 'expired-exports';
    label: string;
    /** 该动作当前能释放多少（0 → 界面禁用它） */
    bytes: number;
    /** 体积文本 */
    size: string;
    /** 说明（已翻译；含保留期口径） */
    desc: string;
}
/** 完整视图模型 */
export interface DiskUsageViewModel {
    summary: {
        total: string;
        files: string;
        dataDir: string;
        /** 有子区读不到（界面顶部给一条「部分未统计」提示） */
        anyUnreadable: boolean;
    };
    rows: DiskUsageRow[];
    /**
     * 遗留数据行（插件已不再读取、也不代删；**不计入** summary.total）。
     * 恒为数组（无遗留目录时为空），组件不需要判空。
     */
    legacy: DiskUsageLegacyRow[];
    clean: {
        /** 可立即清理区当前合计 */
        reclaimable: string;
        /** 到回收期的导出产物合计 */
        expired: string;
        actions: DiskUsageCleanAction[];
    };
}
/** 保留期 → 人类可读（7 天 / 24 小时；非整档按小时/分钟回落） */
export declare function formatRetention(ms: number, t: UiT): string;
/**
 * 报告 → 视图模型。
 * `report` 为 null 时返回 null（界面显示加载态；调用方不必自己判空）。
 */
export declare function diskUsageViewModel(report: DiskUsageReport | null, deps: DiskUsageViewDeps): DiskUsageViewModel | null;
/**
 * 清理回执的呈现分类（e2e-F3 / client 侧）。
 *
 * 为什么需要它：宿主回执只有 `removed` / `freedBytes` / `errors` / `detail` 四个数字/列表，
 * 而 `errors > 0` 有两种完全不同的现场：
 *  ① **真失败** —— 目标区里还有东西（rm 失败/占用），必须报出来；
 *  ② **目标不存在/已空** —— 全新安装时 market/cache、market/work 尚未创建，或清理前就已经没有内容；
 *     这不是失败，用红色「清理失败 N 项」呈现会让用户以为自己弄坏了什么。
 * 判据只在**一份**实现里（本函数）：用回执里带回来的**清理后体检报告**看目标区是否仍有内容。
 * 组件只按 kind 挑 toast —— AGENTS.md §UI 分层铁律 1（逻辑放 src/ui/）。
 */
export type CleanupOutcomeKind = 'nothing' | 'nothing-absent' | 'cleaned' | 'partial' | 'failed';
export interface CleanupOutcome {
    kind: CleanupOutcomeKind;
    /** 成功/中性文案（ok toast）；空串 = 不弹 */
    okText: string;
    /** 需注意文案（warn/error toast）；空串 = 不弹 */
    warnText: string;
    /** warnText 的语义色：'warn' = 部分条目被跳过；'error' = 一件都没清成 */
    warnKind: 'warn' | 'error';
}
export interface CleanupOutcomeInput {
    /** 删除条目数 */
    removed: number;
    /** 释放字节数 */
    freedBytes: number;
    /** 单项失败数（宿主已把「可选目录不存在」排除在外） */
    errors: number;
    /** 清理后重新体检的报告（缺省 = 老宿主/测试没带 → 保守按真失败呈现） */
    report?: DiskUsageReport | null;
    /** 本次请求实际覆盖的动作（缺省 = 只清可重建缓存） */
    requested?: readonly string[];
}
/**
 * 清理回执 → 呈现分类（纯函数）。
 *
 * - `nothing`：一件都没删、也没有失败 → 「没有可释放的内容」（成功语义）；
 * - `nothing-absent`：有失败计数但目标区**已空** → 归为「没有需要清理的内容（目标目录不存在或已为空）」，
 *   **不报失败**（e2e-F3 的用户现场）；
 * - `cleaned`：全成；
 * - `partial`：删到了一些又失败了若干 → 成功 + 「N 项失败（已跳过）」；
 * - `failed`：一件都没删成、目标区**仍有内容** → 真失败。
 */
export declare function cleanupOutcome(input: CleanupOutcomeInput, deps: DiskUsageViewDeps): CleanupOutcome;
