/**
 * sessions 分区 adapter（默认关，设计 §3.3/§15）：
 * 数据源 = ~/.dsh/sessions/<projectKey>/<sessionId>/…（zstd jsonl，含敏感信息）。
 * defaultIncluded=false：Quick Export 不包含，用户显式勾选才导出（v1 文件级复制）。
 * 研究报告 §4.9：DSH 无会话批量导出 API，逐会话文件复制是唯一通道。
 *
 * issue #39 Feature 1：支持按数量筛选（`ExportOptions.sessions.limit`），挑选规则与排序在
 * core/session-select.ts（单位 = 会话目录、文件名判据不写死、按日志最新 mtime 倒序）。
 */
import { FileCollectionAdapter } from './file-collection.ts';
import './messages.ts';
import type { ApplyResult, ExportOptions, ExportSection, HostContext, ImportContext, PlanItem } from '../core/types.ts';
import type { FilesSection } from '../schema/types.ts';
export declare class SessionsAdapter extends FileCollectionAdapter {
    readonly id: 'sessions';
    readonly displayName = "Sessions";
    readonly defaultIncluded = false;
    readonly portability: 'deviceSpecific';
    readonly baseDir = "sessions";
    /**
     * 单元 = `<projectKey>/<sessionId>`。
     *
     * 不能用基类默认的「首个路径段」——那会把**整个项目的所有会话**捆成一个单元，
     * 粒度粗到用户无法只挑几次会话；也不能取全部路径段，那会把一次会话的文件拆散
     * （jsonl / 附件 / 索引必须同进同出）。
     */
    protected unitIdOf(relativePath: string): string;
    /**
     * 「最新 N 个会话」预筛选（issue #39 Feature 1）。
     *
     * 语义与 `ExportOptions.sessions.limit` 一致：缺省 / 负数 = 不筛选；0 = 一个都不带；
     * 正数 = 最新 N 个（按会话目录下最新一份会话日志的 mtime 倒序）。
     * 宿主门面不提供 `mtimeMs`（或整棵树的日志都读不到时间）时**退回全量 + 告警** ——
     * 绝不把「时间未知」当成「最旧」，那会静默丢掉最近的会话。
     */
    protected restrictUnits(ctx: HostContext, rels: readonly string[], options: ExportOptions): Promise<{
        keep: Set<string> | null;
        warnings: string[];
    } | null>;
    /**
     * 本机**全部**会话单元 id（P1-5 会话删除墓碑的「本机现存集合」）。
     *
     * 只做「列目录 + 按单元分组」，**不 stat 时间**（时间只用于排序，这里只要集合）——比
     * restrictUnits 少一轮 stat，扫描千级会话库的代价可接受。目录不可读 → 空数组：调用方
     * 据此**跳过**本轮删除检测（把「读不到」当成「全删了」会误标一大片墓碑）。
     */
    listAllUnitIds(ctx: HostContext): Promise<string[]>;
    /**
     * 会话日志文件 → mtime（毫秒；读不到 = null）。批量并发 stat，避免一次性开满 Promise 打爆 libuv 线程池。
     *
     * 两个调用方共用同一实现（口径不许漂移）：
     *  - `restrictUnits`：「最新 N 个会话」预筛选（issue #39 Feature 1）；
     *  - `unitActivityTimes`：导出选择器「历史对话按最新到最旧排序」的时间来源。
     *
     * @param rels 调用方的键（这里一律是 baseDir 相对路径）；@param homeRelOf 把它们映射到
     *   FileSystemFacade 认的 homeDir 相对路径（缺省 = 键本身就是 homeDir 相对路径）。
     */
    private logMtimes;
    /**
     * 导出选择器的排序时间源（宿主 `/export-preview` 调用）：会话裸键 → 该会话**最新一份**日志的 mtime。
     *
     * 为什么需要它：会话标题与活跃时间来自 DSH 的 `storages/session_projcache.json`，而那份缓存只覆盖
     * **一部分**会话（真机实测：同一项目 731 个会话目录里 347 个不在缓存内）。这些会话拿不到时间，
     * 只能按 uuid 字典序排在组尾 —— 用户看到的就是「历史对话没有按最新到最旧排序」。会话日志 mtime
     * 对每个会话都存在，且与「最新 N 个会话」预筛选（restrictUnits）**同一口径**（同一门面、同一批大小）。
     *
     * 返回键 = `sessionIdKey(目录名)`（`session-<uuid>` 与裸 `<uuid>` 归一化成同一个会话，取较大者）；
     * 时间读不到的会话**不进 Map**（调用方按「时间未知」处理，绝不把未知当成 0 —— 那会把它排到最旧）。
     * 宿主不提供 `mtimeMs` 门面 → 返回空 Map（调用方退回元数据缓存时间，行为与改造前一致）。
     *
     * @param precomputed 预览**顺带**取到的时间（`SectionPreview.statTimes`：homeDir 相对路径 → mtime）。
     *   给了就**不再逐文件 stat**（这正是「合并成一次 stat」的落点）；只认那些确实是会话日志的路径。
     *   缺省（旧宿主 / 未实现 `statInfo`）→ 走原来的逐文件 `mtimeMs`。
     */
    unitActivityTimes(ctx: HostContext, section: ExportSection<FilesSection>, precomputed?: ReadonlyMap<string, number>): Promise<Map<string, number>>;
    /**
     * 分区收尾（issue #45）：把用户填的路径映射**同时**作用到会话日志首帧 cwd 与目录位置。
     *
     * 为什么必须做：DSH 判定工作区成员要求 realpath(会话首帧 cwd) == workspace.path 且 id 在
     * sessionIds 里；跨机恢复时 header 还是源机路径，attachSession 必然被拒 —— 这正是
     * 「会话数据恢复了却显示不出来」。workspace.path 侧已由 analyzer 应用了同一份映射，
     * 这里补上会话侧，两边共用同一个 applyPathMapping（口径不许漂移）。
     *
     * 顺序与一致性（DSH 启动时校验「日志位置 == projectKeyOf(header.cwd)/id」，不一致直接拒绝启动）：
     *   ① 先改写首帧（全部 generation）→ ② 再按映射后的 cwd 归位目录 → ③ 目录搬不动就回滚首帧。
     * 任何一步失败都如实报告，绝不留「header 与位置不一致」的半套状态；回滚也失败时按硬失败上报
     * （宁可让 rollbackOnError 把这次导入整体回滚，也不要悄悄留下坏状态）。
     *
     * 没有命中映射时退回原有护栏：只校验「目录段 == projectKeyOf(首帧 cwd)」，不一致就归位。
     * 读不出 cwd（非日志 / 非 zstd / 首帧不完整）→ 跳过该单元：不猜、不动、也不谎报通过。
     */
    /**
     * 导出收尾：选中子代理会话时**连带它的父对话**（真机事故：导入全部成功，工作区里却看不见）。
     *
     * 为什么（DSH 客户端源码 dsh-client-ui-workspace 的 sessionVisible）：
     *   session.origin !== "subagent" && ...
     * —— 工作区列表**只显示** origin !== 'subagent' 的会话；子代理会话只在**父对话之下**出现。
     * 于是「只导出子会话、不带父对话」的包在导入侧一切成功（文件落盘、workspace.json 也登记了），
     * 用户在 DSH 工作区里却一条都看不到（真机：用户勾了 4 条子代理会话导出再导入，全无踪影）。
     * 所以导出侧按父链补齐（父对话本身也可能是子代理会话 → 继续往上追），并在报告里如实说明；
     * 追不到（本机没有 / 超出分区上限）也绝不静默。
     */
    export(ctx: HostContext, options: ExportOptions): Promise<ExportSection<FilesSection>>;
    /** 一个会话单元的 header（取该单元第一份日志；读不出 → undefined，不猜）。 */
    private firstUnitHeader;
    /**
     * 按「父会话 id」在本机找它的会话目录（两种命名形态 + 子会话所在项目键优先）。
     * 只认「目录里真有会话日志」的候选：空目录 / 同名目录不算命中（不猜）。
     */
    private findSessionDir;
    /**
     * 目标机上是否已有该父对话。
     *
     * 探测面 = 两种目录命名形态（`session-<uuid>` / 裸 `<uuid>`）× 目录本身 + 三种已知日志文件名：
     * 目录级探测在真实宿主上就够，文件级探测则让内存 fs（单测）与「日志名不按常见形态」的机器也能命中。
     * 探针异常按「不知道」处理 —— 宁可多告警一条（可解释），也不静默放过。
     */
    private parentExistsLocally;
    /**
     * 导出侧会话族补齐：**只向上补父对话**（选中子代理会话 → 连带它的父对话，否则 DSH 工作区列表里
     * 一条都看不见）。追不到（本机没有 / 超出分区上限）一律进报告，绝不静默。
     *
     * **引擎为什么不再向下展开**（历史上这里还有一条「勾父带子」）：条目级白名单是**用户意图的唯一事实**，
     * 而引擎看不到「界面为什么没勾这条子会话」—— 一旦自己向下补，「用户在界面上单独取消某条子代理会话」
     * 就会被无声地加回包里（真机事故：只勾 2 条，导出 41 个会话目录）。所以「勾父带子」改由**界面**在
     * 勾选时联动完成（`src/ui/selection-model.ts` 的 `applySessionParentCoupling`：勾父自动勾上它的子代理
     * 会话、勾子自动带上父、取消父连带取消子），引擎只保留这条「不让用户吃亏」的**向上**兜底
     * （父对话缺席 = 导入后在工作区里完全看不见）。
     */
    private coupleSessionParents;
    /**
     * 导入侧：子代理会话的父对话**既不在本包内、本机也没有** → 一条 warning。
     *
     * 为什么要探测「本机有没有」：目标机本来就有该父对话时（例如把旧包导回同机），子会话会正常
     * 挂在本地父对话之下 —— 无脑告警会把正常情况说成「看不到」，比不告警更糟。
     */
    private orphanSubagentWarnings;
    applyItem(item: PlanItem, ctx: ImportContext): Promise<ApplyResult>;
    /**
     * 目标机上是否存在该会话单元的**任何文件**（ui-F1 的判据）。
     *
     * 用途：归位失败且宿主报 `unavailable` 时，区分「目录不存在（本次没写它）」与「真的搬不动」。
     * 目录列表都读不到（门面抛错）按「不确定」处理 → 返回 true：保守地保留原有的硬失败上报，
     * 绝不把一次真实的搬迁失败悄悄降级成成功。
     */
    private unitOnTargetDisk;
    finalizeApply(ctx: ImportContext): Promise<ApplyResult[]>;
}
