import { type DiffHunk } from '../utils/line-diff.ts';
import type { RollbackWriteAttributionPort, RollbackWriteRecorder } from './rollback-attribution.ts';
import { type InterruptedUndo } from './rollback-undo-journal.ts';
import { ROLLBACK_DEFAULT_LEDGER_BYTES } from './rollback-ledger.ts';
/** 活跃时间窗的**读**端口（core/rollback-activity.ts 的实现注入；缺省 = 没有时间证据） */
export interface RollbackActivityPort {
    hasDataFor(sessionId: string): boolean;
    sessionsActiveAt(at: number, toleranceMs?: number): string[];
}
/** 活跃时间窗的**写**端口（tracker 用；缺省 = 不采集） */
export interface RollbackActivityRecorder {
    noteActivity(sessionId: string, at?: number): void;
}
export declare const ROLLBACK_SCHEMA_VERSION = 2;
/** 回滚点库目录名（dataDir/rollback-points）——路由族 /recovery/rollback-points/* 同源 */
export declare const ROLLBACK_POINTS_DIR_NAME = "rollback-points";
/**
 * 台账**清单**文件名（v3，issue #89）：它只是一份小清单（元数据 + 段摘要），
 * 完整记录在 records/<id>.json、工作区载荷在 payloads/<sha256>.json —— 清单里绝不含大数组。
 */
export declare const ROLLBACK_LEDGER_NAME = "index.json";
export declare const ROLLBACK_OBJECTS_DIR_NAME = "objects";
/**
 * 台账字节预算（records/ + payloads/）的缺省值，可由 RollbackEngineOptions.ledgerBytesBudget 覆盖。
 * 为什么需要它：ROLLBACK_MAX_RECORDS（50）只限**条数**；本机实测 50 条 = 473 MB 直接把宿主撑爆。
 */
export { ROLLBACK_DEFAULT_LEDGER_BYTES };
/** 全局自动点上限（S6）；protected / guard 点不占预算、只进不出 */
export declare const ROLLBACK_MAX_RECORDS = 50;
/** 每会话自动点上限（S6） */
export declare const ROLLBACK_MAX_RECORDS_PER_SESSION = 20;
/**
 * 每会话 **guard 点**上限（S6 的显式例外，t14 冻结）：guard 是「回退前自动救援点」，
 * 用户无法手动删除（remove 一律回 protected-point），所以**必须**有自己的上限，
 * 否则反复回退会让台账无界增长。超过上限时只淘汰**最旧的 guard**（每会话各自计）。
 *
 * 与 20/50 的关系：guard **不占**自动点预算、也**不**被自动点的 20/50 淘汰；
 * 反过来自动点也不会因 guard 的淘汰而受影响。protected 点（只有测试能造出来 ——
 * capture 端点已下线、tracker 从不设 protect）仍保持「只进不出」。
 */
export declare const ROLLBACK_MAX_GUARDS_PER_SESSION = 20;
/**
 * **全局** guard 点上限（S6 的第二道 guard 预算，用户 2026-10-12 追加）。
 *
 * 每会话 20 只挡住单个会话：本机 1300+ 会话时，跨会话的 guard 仍会无界增长（台账 + 对象仓
 * 都留在磁盘上）。所以全局再设一道 —— 全部会话的 guard 合计最多 50，超出只淘汰**最旧的 guard**。
 *
 * 与自动点的全局 `ROLLBACK_MAX_RECORDS`（50）**互相独立**：两类各自计预算，谁也不吃谁的额度
 * （数值相同纯属巧合，不构成耦合 —— 改一个不必改另一个）。
 */
export declare const ROLLBACK_MAX_GUARDS = 50;
/**
 * fork **继承链**扫描时最多读多少个会话日志头（有界）。
 *
 * 为什么有上限：一次扫描的代价必须可预测；超限时如实把链标成**不完整**
 * （客户端据此把「未命中」报成**未知**而不是「确知没有」，绝不把看不完说成没有）。
 */
export declare const ROLLBACK_FORK_LINKS_MAX_READS = 500;
/**
 * 继承链扫描结果的缓存 TTL（毫秒）。
 *
 * 为什么要有 TTL：`list()` 是只读热路径（聊天里每条消息一颗按钮、回滚卡刷新都走它），
 * 每次重扫会话目录会把只读路径变成 IO 热点。15 s 是「刚 fork 出来的子会话最多 15 s 内被认出来」
 * 与「热路径几乎不重扫」之间的折中；活会话登记（{@link RollbackPointEngine.noteSessionBinding}）
 * 让**本次运行**里刚 fork 的子会话立刻可用，不依赖这个 TTL。
 */
export declare const ROLLBACK_FORK_LINKS_TTL_MS = 15000;
/**
 * 会话父链上溯的**深度上限**（与宿主侧 `ANCESTOR_LOOKUP_MAX_DEPTH` 同口径取 8：
 * DSH 的分叉 / 子代理树实际深度是个位数）。上限 + 环保护一道，异常数据不会把路径卡死。
 */
export declare const ROLLBACK_ANCESTOR_MAX_DEPTH = 8;
/**
 * `list()` 里为 fork 子会话补的**继承视图**条目上限（有界；超出如实标记
 * {@link RollbackListResult.inheritedViewTruncated}）。
 */
export declare const ROLLBACK_INHERITED_VIEW_MAX = 100;
/**
 * 继承判据用的台账快照 TTL（毫秒）。
 *
 * 为什么需要：留点器每个 `turn/start` 都要问一次「祖先有没有这个回合的点」，而台账是整份读
 * （真机 4.7 MB）—— 每回合都读会把写热路径拖慢。2 s 足够短（父会话的点通常早就写完了，
 * 而且留点器还会先用**本进程见过的祖先回合**这一档判据），也足够省。
 */
export declare const ROLLBACK_INHERITED_LEDGER_TTL_MS = 2000;
export declare const ROLLBACK_DEFAULT_MAX_FILES = 20000;
export declare const ROLLBACK_DEFAULT_MAX_BYTES: number;
/** 单文件上限（缺省 = 总量预算）：超限文件**先 stat 判大小后跳过**，绝不整份读进内存 */
export declare const ROLLBACK_DEFAULT_MAX_FILE_BYTES: number;
/**
 * 用户可在分块根放的忽略规则文件名（语法同 .gitignore 的常用子集；见 rollback-ignore-rules.ts）。
 * 被忽略的**文件**照旧进 skipped（证明名单仍完整）；被忽略的**整个目录**不进走查，
 * 因此证明名单不完整 ⇒ 该点的删除集整体拒绝（fail-closed）。
 */
export declare const ROLLBACK_IGNORE_FILE_NAME = ".dsh-rollback-ignore";
/** skipped / excludedDirs 列表的**记录条数**上限：超出只计数 + 置 skippedTruncated（计数仍如实回传） */
export declare const ROLLBACK_SKIPPED_LIST_LIMIT = 5000;
/** 会话日志超过此大小则只记游标 + 弱指纹（字节副本不进对象仓） */
export declare const ROLLBACK_DEFAULT_SESSION_MAX_BYTES: number;
/** 预览里「该会话日志刚被写过」的窗口（仅供提示；fork 只读，不再据此拒绝） */
export declare const ROLLBACK_DEFAULT_SESSION_QUIESCENT_MS = 30000;
/** 轮询回退的间隔上界（S1：会话日志 mtime ≤5 s 轮询） */
export declare const ROLLBACK_DEFAULT_POLL_INTERVAL_MS = 5000;
export declare const ROLLBACK_LEFTOVER_LIST_LIMIT = 20;
/**
 * 工作区捕获的**挂钟时间预算**（缺省 30 s）。
 *
 * 为什么需要（对标 dsh-turn-rewind 的 `deadline.ts`、dsh-checkpoint-rewind 至今未合并的 PR #25）：
 * 捕获路径此前只有「文件数 / 总字节 / 单文件字节」三个**规模**上限，没有**时间**上限 ——
 * 一个「文件数很多但总量不大」的工作区能让 walk + stat + sha256 跑很久。
 * 超预算**不是失败**：已收条目照常成点（ok=true），未走查的部分按 `budget-time` 逐条留痕、
 * `truncated` 置真 ⇒ 删除集自动 fail-closed（证明名单不完整就一条都不删）。
 */
export declare const ROLLBACK_DEFAULT_CAPTURE_BUDGET_MS = 30000;
/**
 * 自适应预算区间（见 RollbackEngineOptions.captureBudgetMs）：上一次留点被截断 ⇒ 下次 ×2，
 * 上一次只用掉不到 1/4 ⇒ 下次 ÷2。区间外不再调整（避免无限拉长 / 缩到不可用）。
 */
export declare const ROLLBACK_MIN_CAPTURE_BUDGET_MS = 10000;
export declare const ROLLBACK_MAX_CAPTURE_BUDGET_MS = 120000;
/**
 * 捕获期「读内容 + 写对象仓」的并发上限。
 *
 * 为什么必须并发：真机实测（34k 文件 / 512 MiB）一次全量捕获 175 s，其中 **148 s 花在
 * 31,702 次对象写**（一次 4.7 ms：temp + fsync + rename），而走查本身只要 0.66 s。
 * 对象写入是纯 I/O，串行做等于把预算全花在等待上 ⇒ 覆盖永远只有一小半。
 * 并发上限与**在飞字节闸门**共同限流（在飞内容上界 = `captureInFlightBytes`）。
 */
export declare const ROLLBACK_DEFAULT_CAPTURE_CONCURRENCY = 16;
/**
 * 捕获期**读入内存、尚未落对象仓**的内容字节上限（真正的内存闸门）。
 *
 * 为什么必须独立于 `maxFileBytes`（0.1.74 真机闪退事故，2026-10-16）：
 *  `maxFileBytes` 的缺省是**总量预算** `maxBytes`（512 MiB）。并发捕获把闸门接到它上面，
 *  于是「同时在飞的内容」可以到 ~512 MiB —— 串行实现的上界是「一份文件」，并发实现的
 *  上界是「闸门限额」，两者差着两三个数量级。真机表现：发出消息后 1–2 s（= `turn/start`
 *  开始留点）DSH Desktop 宿主被系统终止 ⇒ 桌面闪退（无 JS 栈、插件零错误、
 *  退出码是「被外部终止」形状）。这里取一个小常量当闸门；要放宽只能显式传
 *  `captureInFlightBytes`，且被 `maxBytes` 夹住。
 */
export declare const ROLLBACK_DEFAULT_CAPTURE_INFLIGHT_BYTES: number;
/** 捕获阶段①的 stat 批大小：判定仍严格按顺序，只是 stat 并发取（真机 34k 次 stat 从 5 s → <1 s） */
export declare const ROLLBACK_CAPTURE_STAT_BATCH = 128;
/**
 * 捕获期**候选名单**上限（不是入点上限）：必须显著大于 maxFiles，否则「缺口优先」排序作用不到
 * 那些排在遍历顺序尾部、上一回合没覆盖到的文件（它们连候选都进不了 ⇒ 覆盖率永远不收敛）。
 * 走查本来就会把每条路径记进 walked（路径索引的来源），这里多留的只是候选数组本身。
 */
export declare const ROLLBACK_CAPTURE_LIST_LIMIT = 200000;
/** 走查中断时逐条记下的「没进去的子树」上限；超出即放弃精确范围，退回全局 fail-closed */
export declare const ROLLBACK_UNWALKED_DIRS_LIMIT = 200;
/**
 * 「删除回退点之后新建的路径」的**整套上限**（用户 2026-10-11 定案 A）。
 * 超过就整套拒绝（fail-closed），绝不删一半 —— 半套删除既没有可解释的状态，也无法整体回滚。
 */
export declare const ROLLBACK_MAX_CREATED_REMOVALS = 5000;
export declare const ROLLBACK_DETAIL_LIMIT = 50;
/**
 * E1：预览里「逐文件行级统计」的规模上限。四条**只影响** `workspace.files[].added/removed`：
 * 触到任一条的条目仍然照给 status，但 added/removed 置 null 且 truncated=true ——
 * **宁可说「不知道」，也绝不谎报行数**。
 *
 * 为什么需要：预览要读「快照对象 + 当前文件」两份内容再做行级 diff，而一个点的记录可能有上千条目；
 * 没有上限时一次预览就能把宿主的 I/O 与 CPU 拖住。
 * - 单文件 1 MiB：单条目的读写/解码都钉在一个小上限内（绝大多数源码文件远小于它）；
 * - 单张预览累计 32 MiB：与捕获期字节预算（`ROLLBACK_DEFAULT_MAX_BYTES`）同量级；
 * - 单文件 8e6 步 / 单张预览 32e6 步：行级 diff 是 Myers O((N+M)·D)，步数上限就是时间上限
 *   （32e6 步在毫秒~百毫秒量级），避免「大文件被整篇改写」这种最坏情形把请求拖死。
 */
export declare const ROLLBACK_PREVIEW_DIFF_MAX_FILE_BYTES: number;
export declare const ROLLBACK_PREVIEW_DIFF_MAX_TOTAL_BYTES: number;
export declare const ROLLBACK_PREVIEW_DIFF_MAX_WORK = 8000000;
export declare const ROLLBACK_PREVIEW_DIFF_TOTAL_WORK = 32000000;
/**
 * 单文件前后对照（fileDiff）的展示上限：
 *  · maxFileBytes 与预览行数统计**同一档**（同一份数据不该有两个口径）；
 *  · context = 变更块外保留的上下文行数（3，与 git unified diff 一致）。
 * 超限时的行为是**说「看不了」**（结构化 reason + 空 hunks），绝不截半截差异。
 */
export declare const ROLLBACK_FILE_DIFF_LIMITS: {
    readonly maxFileBytes: number;
    readonly context: 3;
    /**
     * Myers 编辑距离上限（2026-10-15 用户：不该动辄出现「已按整块替换展示」）。
     * 实测（本仓 rollback-point.ts 的 4983 行 × 2492 行版本对）：D 在 3000~4000 就能拿到
     * 最小编辑脚本 —— 耗时 ≤70 ms；代价是回溯的 V 快照 O(D²)，RSS 峰值 +~100 MB。
     * 缺省那档 400 会让几千行里的普通改动一律退化成「整块替换」，那正是用户看到的那条提示；
     * 单文件是**按需点开**的一屏，这点内存换「真差异」划算。再大就换算法，不加预算。
     */
    readonly maxD: 4000;
};
/** 恢复顺序（工作区在前；工作区失败即中止后面的会话段） */
export declare const ROLLBACK_REWIND_ORDER: readonly ['workspace', 'session'];
/** 存储栈缺失时给出的组合指引（技术标识；界面按 code 映射字典键） */
export declare const ROLLBACK_STORAGE_REQUIREMENTS: readonly string[];
/**
 * 路径身份缓存的落盘格式版本（dataDir/rollback-points/path-cache.json）。
 * 键 = dev:ino:size:mtimeNs:ctimeNs:mode（全 BigInt 字符串化）⇒ 身份未变即认为内容未变，
 * 于是不必重读、重算 sha256。缓存是**纯优化**：读失败 / 形状不符一律丢弃并回落全量读，
 * 且**绝不**参与任何删除 / 覆盖判定（那些判据只认本次走查与台账）。
 */
export declare const ROLLBACK_PATH_CACHE_VERSION = 1;
export declare const ROLLBACK_PATH_CACHE_NAME = "path-cache.json";
export type RollbackStateKind = 'workspace' | 'session';
/**
 * auto = 回合自动留点；guard = 恢复前自动救援点（用户不可删、不占自动点的 20/50 预算，
 * 但受 `maxGuardsPerSession` 自身上限约束、可作为回退目标 —— 见 ROLLBACK_MAX_GUARDS_PER_SESSION）。
 */
export type RollbackPointKind = 'auto' | 'guard';
export type RollbackOutcome = 'restored' | 'partial' | 'failed' | 'denied';
export type RollbackSegmentStatus = 'restored' | 'skipped' | 'failed';
export type RollbackGuardPolicy = 'require' | 'warn' | 'off';
/** mode 三选一（S5/S7）；显式 segments 优先于 mode */
export type RollbackMode = 'files+session' | 'files' | 'session';
/**
 * 机器可读结果码。**冻结集**（wire contract，必须严格保用）：
 * ok / deleted / confirmation-required / protected-point / record-not-found /
 * record-incomplete / invalid-input / no-boundary / storage-unavailable /
 * mutation-locked / method-not-allowed。
 * 其余为**内部分级码**：只出现在 segments[].reasonCode / warnings / detail，
 * 顶层 code 只用冻结集（例外：`restore-failed`、`guard-failed`、`ledger-write-failed`，
 * 前端按「未知码回落 unknown」处理）。
 */
export type RollbackCode = 'ok' | 'deleted' | 'storage-unavailable' | 'ledger-unreadable' | 'ledger-write-failed' | 'confirmation-required' | 'record-not-found' | 'protected-point' | 'record-incomplete' | 'invalid-input' | 'no-boundary' | 'guard-failed' | 'invalid-path' | 'object-missing' | 'object-hash-mismatch' | 'restore-failed' | 'verify-failed' | 'nothing-to-restore'
/**
 * 待删除的「该点未记录」路径数超过 `ROLLBACK_MAX_CREATED_REMOVALS` ⇒ **整套拒绝、零写入**
 * （绝不删一半）。是**顶层 code**：界面必须说清「因为待删路径超过上限，一条都没动」，
 * 不得回落成泛化的「请求参数不合法」（那正是用户看不懂「回退为什么失败」的来源）。
 */
 | 'created-removals-limit'
/**
 * T10：该态**没有记录任何文件**（工作区段 files=0）—— 与「有记录但全部已一致」严格分开：
 * 界面必须说两句不同的话（「这点没记录文件」vs「工作区已与该点一致」），
 * 而 `detail` 是技术细节、**不能**当用户可见分派依据。只出现在 segments[].reasonCode。
 */
 | 'no-recorded-files' | 'mutation-locked' | 'method-not-allowed' | 'session-missing' | 'session-out-of-root' | 'session-too-large' | 'session-active'
/**
 * 子代理会话（`header.origin === 'subagent'`）：**不自动留点**。
 * 它的工作区与父会话相同、回合号是自己的，留点既与父会话重复又只挤占预算；
 * 用户在侧栏看到的是嵌套在父对话下的子代理，不需要单独回退。
 * 读不到 `origin`（老宿主）时**不加判定** —— 绝不因为读不到就少留点。
 */
 | 'subagent-session' | 'session-fork-unavailable' | 'fork-failed' | 'capture-failed' | 'capture-truncated' | 'capture-degraded' | 'no-chunks' | 'chunk-not-absolute' | 'chunk-not-found'
/** 单文件差异：该路径**不在**这个回滚点的记录里（收窄：绝不把本端点做成任意路径读取器）。 */
 | 'file-not-recorded';
/** 结构化指引 / 告警：code 供界面映射字典键，detail 是技术标识（路径 / errno / 计数）。 */
export interface RollbackGuidance {
    code: string;
    detail?: string;
}
export interface RollbackWorkspaceFile {
    /** 捕获时的绝对路径（恢复目标） */
    path: string;
    /** 该文件所属的显式分块（chunks 里的一项） */
    chunk: string;
    bytes: number;
    sha256: string;
    mtimeMs: number;
    /** 对象仓键（= 内容 SHA-256） */
    object: string;
}
export interface RollbackSkippedEntry {
    path: string;
    /**
     * link（符号链接/junction，不跟随）/ missing / not-a-file / self-store /
     * dep-dir（运行时依赖目录，整棵忽略）/ ignored（用户忽略规则命中）/ too-large（超单文件上限）/
     * budget-bytes（加它会超总量预算）/ budget-files（文件数预算用尽）/
     * asar-container（含 `.asar` 段的路径：宿主会把它当容器解析、畸形夹具能带走宿主，因此绝不碰）/
     * sensitive（内置敏感文件：.env / 私钥 / 凭据文件 —— 不明文物化进对象仓，也不可被 `!` 规则取消；
     *   仍进走查名单，故删除集不受影响，见 rollback-ignore-rules.ts 的 builtinSensitiveReason）
     */
    reason: string;
}
/**
 * 「留点时刻**走过**哪些路径」的完整证明名单（内容寻址的 gzip 对象：每行一个绝对路径，UTF-8）。
 *
 * 它存在的唯一理由 = **方向 B**：`maxSkippedEntries`（逐条跳过名单的记录上限，缺省 5000）一旦截断，
 * `files ∪ skipped` 就不再是完整名单 —— 没有它，「未记录」就无法与「留点时就存在」区分，
 * 于是只能整点放弃删除（那正是「中间回合新建的文件一个都没被删」的机制）。
 */
export interface RollbackPathIndex {
    /** 对象仓键（内容寻址到 gzip 后的字节） */
    object: string;
    /** 名单条数（= 走查过的文件数） */
    count: number;
    /** gzip 后的字节数（诊断 / 日志用） */
    bytes: number;
}
export interface RollbackWorkspacePayload {
    /** 显式路径分块：恢复只在这些分块内覆盖 */
    chunks: string[];
    /**
     * 记录在案的**文件条目数**。**必须自带**（不能再用 `files.length`）：增量视图下 `files` 只是
     * 「相对基准新增/改写的子集」，而摘要（界面上的条数 / 可恢复判定）要的是全量条数。
     */
    fileCount?: number;
    files: RollbackWorkspaceFile[];
    /**
     * **存盘专用**：这份载荷是「相对某个基准载荷的增量」（见 rollback-ledger 的 resolvePayload）。
     * 只在写盘那一刻存在 —— 任何读路径（readRecord / 预览 / 回退 / 对象回收）拿到的都是**物化后**
     * 的完整 `files`（`delta` 已被抹掉）。**绝不把带 delta 的对象交给消费者**：它看起来像一份
     * 「只有这几条记录」的完整清单，拿去规划删除会删掉其它全部文件。
     */
    delta?: {
        /** 基准载荷的内容寻址哈希（必须在 prune/回收时一并保活） */
        base: string;
        /** 基准自己的依赖链（深→浅，含基准），保活用 */
        baseChain: string[];
        /** 相对基准**不再存在**的路径（逐字，与捕获产出的绝对路径同形） */
        removed: string[];
        /** 相对基准**新增 / 改写**的条目（`files` 在增量视图下为 null） */
        added?: RollbackWorkspaceFile[];
    };
    skipped: RollbackSkippedEntry[];
    /**
     * 整棵跳过的「运行时依赖目录」（忽略规则 = 全仓唯一来源 EXCLUDED_DEP_DIR_NAMES，当前 node_modules）。
     * 与 skipped 分开：这是**预期的忽略**（不是降级），所以不计入 degraded，但必须留痕。
     */
    excludedDirs: RollbackSkippedEntry[];
    unreadableDirs: string[];
    unreadableFiles: RollbackSkippedEntry[];
    /**
     * `skipped` 桶的跳过事件**总数**（含超出 maxSkippedEntries 只计数的那部分）。
     * 不含 excludedDirs —— 那是预期内的忽略（如 node_modules），逐条记在 `excludedDirs` 里、
     * 不使该点降级。语义：逐条列表 + 本计数都必须实话实说，谁也不许静默。
     */
    skippedCount: number;
    /** `skipped` 逐条列表到达记录上限（skippedCount 仍然如实） */
    skippedTruncated: boolean;
    /**
     * 用户忽略规则整棵跳过的**目录**（与 excludedDirs 分开：内置 node_modules 是预期内的忽略，
     * 用户忽略的目录则意味着「其下有什么我们不知道」⇒ 见 ignoreIncomplete）。
     */
    ignoredDirs: RollbackSkippedEntry[];
    /** ignoredDirs 的**总数**（逐条列表可截断，计数仍如实） */
    ignoredDirCount: number;
    /**
     * true = 有整个目录被用户忽略 ⇒ 走查证明名单**不完整** ⇒ 删除集整体拒绝（fail-closed）。
     * 文件级忽略**不**置它：被忽略的文件既进 skipped、也进 walked（路径索引来源）⇒ 名单照样完整。
     */
    ignoreIncomplete?: boolean;
    /**
     * true = 走查被**时间预算 / 取消信号**中断 ⇒ 剩余子树**一条都没进任何名单**
     * （不在 files / skipped / walked 里）⇒ 证明名单**不完整** ⇒ 删除集整体拒绝（fail-closed）。
     *
     * 与 `truncated` 的**关键区别**：`truncated` 的三种成因（文件数 / 总字节 / 单文件超限）都是
     * 「继续遍历 + 逐条留痕」，名单依然完整，所以**不**拒删；只有「整棵子树根本没被走查」才必须拒删
     * —— 否则那些文件会被判成「留点后才新建」而被删掉（数据丢失）。
     * 老台账（本字段诞生前写下的点）一律没有它：按「名单完整」处理（与旧行为一致）。
     */
    walkIncomplete?: boolean;
    /**
     * 走查被中断时**栈里还没进去的子树**（精确到目录）。有它 ⇒ 拒删只覆盖这些子树
     * （分子树 fail-closed），而不是把整个工作区的删除全关掉；缺它（老台账 / 栈太深被截断）
     * ⇒ 退回全局拒删。与 walkIncomplete 一起看：后者是「安全判据」，本字段是「精确范围」。
     */
    unwalkedDirs?: string[];
    /** 命中文件数 / 字节上限（内容未全部进来，已如实留痕） */
    truncated: boolean;
    bytes: number;
    /**
     * 捕获时走查过的**全部**文件路径（gzip 对象）。只在 `skippedTruncated === true`（逐条跳过名单被
     * 记录上限截断）时才有值：
     *  · 有值 ⇒ 删除候选可以证明「当前存在但不在任何名单里」= 留点之后新建的；
     *  · null 且 `skippedTruncated` ⇒ **证明不了** ⇒ 回退一条都不删（fail-closed，如实报告）；
     *  · null 且未截断 ⇒ 不需要它（`files ∪ skipped` 已经是完整名单）。
     * 老台账（本字段诞生前写下的点）一律没有它 —— 与「索引丢失」同一条 fail-closed 路径。
     */
    pathIndex?: RollbackPathIndex | null;
}
export interface RollbackSessionPayload {
    sessionId: string | null;
    /** 会话日志绝对路径（宿主能给就给；缺失 = null —— 本引擎不做字节写回，路径只作审计） */
    logPath: string | null;
    /** 会话游标（**事件数** = session.seq）：fork 的语义位置 */
    cursorSeq: number | null;
    /** 会话日志字节数（能 stat 到才有；审计证据） */
    cursorBytes: number | null;
    mtimeMs: number | null;
    /** content = 内容 SHA-256；size = 只认字节数（超上限）；cursor = 只有事件游标 */
    fingerprintKind: 'content' | 'size' | 'cursor';
    fingerprint: string;
    /** 内容副本的对象仓键；null = 没有副本（回退不依赖它，fork 走 sessionId + boundarySeq） */
    object: string | null;
    bytes: number;
    /** 目标回合（1 基）；未知 = null */
    turnSeq: number | null;
    /** 目标回合开始前最后一个事件 seq（fork 的 inclusive 稳定边界）；null = 无前置边界 */
    boundarySeq: number | null;
    /** 目标回合 turn/end 事件的 seq（inclusive）；未知 = null */
    boundaryEndSeq: number | null;
}
export interface RollbackTrack<TPayload> {
    kind: RollbackStateKind;
    /** 捕获时刻（单调非回退） */
    capturedAt: number;
    ok: boolean;
    /** 捕获成功但**不完整**（截断 / 链接跳过 / 内容副本缺失）—— 不静默 */
    degraded: boolean;
    /** 该态的内容指纹；null = 没有可指纹的内容 */
    fingerprint: string | null;
    reasonCode: RollbackCode | null;
    reasonDetail: string | null;
    payload: TPayload | null;
}
export interface RollbackPointRecord {
    schemaVersion: number;
    id: string;
    kind: RollbackPointKind;
    createdAt: number;
    /** 两态 capturedAt 的跨度（诚实事实；两态之间没有「同点」判定） */
    spreadMs: number;
    /** 用户显式保护：不可回退、不可删除、不被自动清理 */
    protected: boolean;
    /** 有态捕获失败的（回退缺省拒绝，需显式 allowPartial） */
    incomplete: boolean;
    note: string | null;
    /** 归属会话（自动留点必有；无会话信息 = null） */
    sessionId: string | null;
    /** 会话单元键 <projectKey>/<sessionId>（界面展示 / 归属） */
    unitId: string | null;
    /** 目标回合（1 基） */
    turnSeq: number | null;
    /** 目标回合开始前最后一个事件 seq（fork 边界） */
    boundarySeq: number | null;
    workspace: RollbackTrack<RollbackWorkspacePayload>;
    session: RollbackTrack<RollbackSessionPayload>;
}
export interface RollbackSegmentSummary {
    state: RollbackStateKind;
    ok: boolean;
    degraded: boolean;
    capturedAt: number;
    fingerprint: string | null;
    reasonCode: RollbackCode | null;
    /** 该态捕获的条目数（工作区文件数 / 会话 0|1） */
    entries: number;
    bytes: number;
    /** 会话态：事件游标；其它态 null */
    cursorBytes: number | null;
    /** 该态是否**可回退**（工作区有可写回条目 / 会话有 sessionId + 边界） */
    restorable: boolean;
    /** 跳过事件总数（工作区态：skipped + excludedDirs；会话态恒 0） */
    skippedCount: number;
    /** 该态捕获是否被上限截断（工作区态 = payload.truncated） */
    truncated: boolean;
}
export interface RollbackPointSummary {
    id: string;
    createdAt: number;
    sessionId: string | null;
    unitId: string | null;
    /** 1 基回合号；无法判定 = null */
    turn: number | null;
    /** fork 的 inclusive 边界 seq；null = 无前置边界 */
    boundarySeq: number | null;
    kind: RollbackPointKind;
    protected: boolean;
    incomplete: boolean;
    note: string | null;
    spreadMs: number;
    /** 恒为 [workspace, session] 两项 */
    segments: RollbackSegmentSummary[];
    /**
     * **继承视图**标记（t9）：该条目属于 fork 子会话，但状态/边界都来自这个祖先点 id。
     * 同一个 `id` ⇒ `preview` / `rewind` / `remove` 全部作用在**原点**上，
     * 回退仍在原会话上做 fork（语义与今天逐字相同）；台账里**没有**这条记录（零幽灵点）。
     */
    inheritedFrom?: string;
    /** 继承视图里「状态真正的归属会话」（= 祖先会话 id；与 `inheritedFrom` 成对出现） */
    inheritedSessionId?: string | null;
}
/**
 * 台账（records/ + payloads/）的可观测快照。
 * 路由层转发给界面时必须**照抄字段名与形状**（issue #89 的交付契约）。
 */
export interface RollbackLedgerStatus {
    /** 清单里的记录条数 */
    records: number;
    /** records/ + payloads/ 当前总字节 */
    bytes: number;
    /** 生效的字节预算（缺省 ROLLBACK_DEFAULT_LEDGER_BYTES） */
    budgetBytes: number;
    /** 本进程内被**预算**淘汰的自动点累计数（条数淘汰不计入） */
    evicted: number;
    /**
     * 当前磁盘字节**已超**预算、且已无处可淘汰（典型：单条点本身就大于预算）。
     * 界面据此说「台账已超预算、无法再自动回收」，绝不静默成「一切正常」。
     */
    overBudget: boolean;
}
export interface RollbackStorageStatus {
    available: boolean;
    root: string;
    detail?: string;
    guidance: RollbackGuidance[];
    requirements: readonly string[];
    /** 新增，可选（不破坏既有构造点）；存储栈不可用时缺省 */
    ledger?: RollbackLedgerStatus;
}
/** 捕获一个回滚点的输入（宿主/测试构造；无 HTTP capture 端点） */
export interface RollbackPointInput {
    kind?: RollbackPointKind;
    sessionId?: string | null;
    unitId?: string | null;
    sessionLogPath?: string | null;
    /** 会话事件游标（session.seq） */
    cursorSeq?: number | null;
    /** 目标回合（1 基） */
    turnSeq?: number | null;
    /** 目标回合开始前最后一个事件 seq */
    boundarySeq?: number | null;
    /** 目标回合 turn/end 的 seq */
    boundaryEndSeq?: number | null;
    /** 工作区显式路径分块（绝对路径） */
    chunks?: readonly string[];
    note?: string | null;
    protect?: boolean;
    /**
     * 调用方的取消信号（插件卸载 / 会话销毁）：已中止时捕获在**下一个文件边界**停下，
     * 已收条目照常成点（部分点 + truncated）。缺省不传 = 只受时间预算约束。
     */
    signal?: AbortSignal;
}
export interface RollbackCaptureResult {
    ok: boolean;
    code: RollbackCode;
    detail?: string;
    point?: RollbackPointRecord;
    guidance: RollbackGuidance[];
    storage: RollbackStorageStatus;
}
/** 会话 fork seam（宿主注入；core 不 import @deepseek-ai/*） */
export interface RollbackForkInput {
    sessionId: string;
    /** inclusive 边界 seq */
    boundarySeq: number;
}
export type RollbackForkOutcome = 
/**
 * 成功 fork。`warning` 非空 = 子会话**没能挂回原工作区**（宿主侧三档匹配全落空），
 * 它会出现在侧栏「未分组」—— 回退本身仍然成功，但必须如实告诉用户（绝不假装已归位）。
 */
{
    ok: true;
    childSessionId: string;
    warning?: string;
} | {
    ok: false;
    code: RollbackCode;
    detail?: string;
};
export type RollbackForkSeam = (input: RollbackForkInput) => Promise<RollbackForkOutcome>;
/** 宿主侧的 fork 载体（DshSessionStoreFacade 结构性实现；路由侧只做窄化读取） */
export interface RollbackForkCarrier {
    forkSession?: (sessionId: string, boundarySeq: number) => Promise<{
        childSessionId: string;
        warning?: string;
    } | {
        error: string;
    }>;
}
/** 预览里「回退会改动的一个文件」的动作。 */
export type RollbackPreviewFileStatus = 'overwrite' | 'create' | 'delete';
/**
 * E1：逐文件的行级统计（简洁版预览弹窗的数据源）。
 * **只列真的会被改动的文件** —— 已与快照一致的条目一个都不列（353 项里 0 项不同 ⇒ 空数组）。
 */
export interface RollbackPreviewFile {
    path: string;
    /**
     * overwrite = 覆盖已有文件；create = 当前不存在（回退会重新创建）。
     *
     * `delete` **不由 `files[]` 产出**：整文件删除是**另一条**清单 —— 该点**未记录**的路径
     * （`RollbackPreviewWorkspace.removals` = 会被删的，`createdSkipped` = 按安全判据拒删的）。
     * 那些路径**不在**这个点的记录里，所以既不进这份逐文件行级统计，也读不出前后对照。
     * 保留该取值只为契约形状向前兼容。
     */
    status: RollbackPreviewFileStatus;
    /** 回退会让该文件**新增**的行数；null = 本次不给数字（见 truncated） */
    added: number | null;
    /** 回退会从该文件**删除**的行数；null = 本次不给数字（见 truncated） */
    removed: number | null;
    /**
     * true = 本次没有可信行数（added/removed 均为 null）：任一侧超过单文件上限、单张预览累计上限、
     * 行级比对步数上限，或内容不是文本，或对象仓读不出，或**当前文件 stat 失败但不是 ENOENT**
     * （存在性未知 —— 这种条目 status 仍给 'overwrite'，绝不谎报成 create）。
     * **宁可说「不知道」，也绝不谎报行数。**
     */
    truncated: boolean;
    /**
     * true = 该文件在留点**之后**是**别的会话**写的（写入归属台账证明；见 core/rollback-attribution.ts）。
     * 界面据此默认不勾选它（用户仍可勾上）。缺字段 / false = **没有归属证据**，
     * 而不是「本会话写的」——「未判定」与「确知是本会话」必须分开。
     */
    foreign?: boolean;
    /** 那些「别的会话」的会话 id（仅当 foreign 为 true） */
    foreignSessionId?: string;
    /** 那次写入的时间（毫秒；仅当 foreign 为 true） */
    foreignAt?: number;
    /**
     * true = 这次回退**不会改动它**：要么与其它对话的改动冲突、要么无法安全合并（缺共同祖先 / 二进制 /
     * 差异被降级 / 对方删了它）。行级统计一律为 null —— 「不改动」不是「0 行变化」。
     */
    skipped?: boolean;
    /** 不改动的机器原因（界面映射成字典键，绝不裸渲染） */
    mergeReason?: string;
}
/** 单文件差异里一侧（当前磁盘 / 回退点快照）的展示信息。 */
export interface RollbackFileDiffSide {
    /** 该侧当前存在吗（快照侧 false = 对象仓里那份读不出来，**不是**「空文件」） */
    exists: boolean;
    bytes: number;
    /** 行数；null = 未读取（二进制 / 超限 / 不可读）—— 只有真读到文本才有数字 */
    lines: number | null;
    binary: boolean;
    oversized: boolean;
    unreadable: boolean;
}
/**
 * 单文件差异**无法逐行对比**的原因。有值时 hunks 恒为空数组 ——
 * 「不知道」与「没有差异」是两件事，界面必须分开说。
 */
export type RollbackFileDiffReason = 'missing-blob' | 'binary' | 'too-large' | 'unreadable';
/**
 * fileDiff 的返回：**一个记录在案的文件**的前后逐行对照。
 *
 * 方向（与预览行数统计同一口径，别读反）：before = **当前磁盘**，after = **回退点快照**
 * —— 也就是「点下回退之后该文件会变成的样子」。界面左右双栏与之一致。
 */
export interface RollbackFileDiffResult {
    ok: boolean;
    code: RollbackCode;
    detail?: string;
    id: string;
    /** 记录里的绝对路径（收窄后 = 请求路径逐字命中记录的那一条） */
    path: string;
    status: RollbackPreviewFileStatus;
    before: RollbackFileDiffSide;
    after: RollbackFileDiffSide;
    hunks: DiffHunk[];
    added: number;
    removed: number;
    identical: boolean;
    /** 规模超限 → 结果仍是完整替换，只是不是最小编辑脚本 */
    degraded: boolean;
    /** 无法逐行对比的原因（有值时 hunks 为空） */
    reason?: RollbackFileDiffReason;
    /** true = 「回退后」一侧显示的是**三方合并**的结果，而不是记录里的原文 */
    merged?: boolean;
    /**
     * true = 这次回退**不会改动**它（与其它对话的改动冲突 / 无法安全合并）—— 此时 after 与 before 相同。
     * 界面必须把「不会改动」与「0 行变化」分开说。
     */
    mergeSkipped?: boolean;
    /** 不改动的机器原因（界面映射成字典键，绝不裸渲染） */
    mergeReason?: string;
    limits: typeof ROLLBACK_FILE_DIFF_LIMITS;
}
export interface RollbackPreviewWorkspace {
    /** 记录在案、会被覆盖的条目数 */
    overwrite: number;
    /** 与当前内容不同、确实会被改动 */
    different: number;
    /** 记录里的文件当前已不存在（恢复会重新创建） */
    missing: number;
    /**
     * 该点**未记录**的条目总数（含留点时被跳过的既有文件）。**不是**「之后新建」，
     * 也**不是**「会被删除」—— 会被删的是 {@link removals}。
     */
    createdAfter: number;
    /** E1：逐文件行级统计；**只含会被改动的文件**（内容已一致的一个都不列） */
    files: RollbackPreviewFile[];
    /**
     * **能证明「留点之后新建」**的路径（含被拒删的；逐条清单上限 `ROLLBACK_LEFTOVER_LIST_LIMIT`）。
     * 判据 = 当前存在、在分块内、且不在证明名单（`files` ∪ `skipped` ∪ `unreadableFiles` ∪
     * `excludedDirs` ∪ 路径索引）里 —— 留点时被预算挡下的既有文件同样在名单里，**不算**新建。
     * **不是删除清单**：删除清单是 {@link removals}（逐条过了同一套安全判据）。
     */
    leftovers: string[];
    leftoversTruncated: boolean;
    /**
     * **会被删除**的路径（= 该点未记录 **且**通过安全判据）—— **全量**（不切上限）：
     * 界面直接把这份清单渲染成「删除」行，所以它逐条等于实际会删的。
     *
     * 与 rewind 执行阶段**共用同一个函数**（`planCreatedRemovals`）⇒ 「预览说会删的」与
     * 「实际删的」逐条一致（旧实现两处各算一次：预览用未过滤的 leftovers、执行用过滤后的
     * 全量清单，于是预览里混进永不删除的 .git 路径、又会漏掉第 21 条之后的会删路径）。
     */
    removals: string[];
    /** 会被删除的条数（= {@link removals}.length；两者同源，恒相等） */
    removalsCount: number;
    /** 遍历被文件数上限截断 ⇒ 清单可能不完整（实践中蕴含捕获也截断 ⇒ 删除已整体拒绝、清单为空） */
    removalsTruncated: boolean;
    /**
     * 按安全判据**拒删**的路径（逐条清单有界，总数见 {@link createdSkippedCount}）：
     * `.git`/`node_modules` 段、插件数据区、分块外、非绝对路径、单文件超上限，
     * 以及**证明名单不完整**时全部候选（见 {@link createdRefusedReason}）。
     */
    createdSkipped: string[];
    createdSkippedCount: number;
    createdSkippedTruncated: boolean;
    /**
     * 非 null = **证明名单不完整** ⇒「未记录」不能证明「新建」，故**一条都不删**。
     * 只有两种成因：跳过名单被记录上限截断而路径索引缺失/读不出、有读不出的目录
     * （**不是**「预算截断」—— 那正是 2026-10-12 修掉的那一条假判据）。
     */
    createdRefusedReason: 'capture-incomplete' | null;
    chunks: string[];
    available: boolean;
    reasonCode: RollbackCode | null;
    /**
     * `skipped` 桶的跳过事件**总数**（含超出记录上限只计数的那部分）。
     *
     * **不含** `excludedDirs`（内置运行时依赖目录等**预期内的忽略**：逐条记在 `excludedDirs` 里，
     * 另有自己的列表、不使该点降级）与 `ignoredDirs`（用户忽略规则整棵跳过的目录，总数见
     * `ignoredDirCount`）。与引擎内部的 `ChunkWalkSink.skippedCount` 同一口径 ——
     * `recordSkip` 只对 `skipped` 桶 +1。上限截断只影响逐条列表，不影响本计数。
     */
    skippedCount: number;
    /** 捕获是否被上限截断（超单文件上限 / 字节预算 / 文件数预算任一命中即为 true） */
    truncated: boolean;
    /**
     * **冲突**：两侧改到同一处（含同一插入点）⇒ 回退会**跳过**该文件（零写入）。
     * 与执行阶段的 `conflictCount` 同一判据（调用同一份 `mergeForeignRecord`）⇒「预览说有冲突的」=「执行时真的跳过」。
     */
    conflictCount: number;
    /** 冲突路径逐条清单（上限 {@link ROLLBACK_LEFTOVER_LIST_LIMIT}） */
    conflictPaths: string[];
    /**
     * **无法安全撤销**而会被跳过的文件总数（冲突之外的成因：没有共同祖先 / 二进制 / 差异被降级 /
     * 对方把它改成了不存在 / 读不出）。预览把它们**列出来**而不是静默略过 —— 逐条原因在
     * {@link files} 的 `mergeReason` 上。
     */
    unavailableCount: number;
    /**
     * **落点无人认领**而会被跳过的文件总数（时间窗归属判定：文件在目标会话静默之后被改过，
     * 且当时没有任何会话处于活跃窗口 —— 手改 / 外部工具 / 另一个进程）。
     * 成因逐条在 {@link files} 的 `mergeReason`（`external-edits`）上。
     */
    externalCount: number;
}
export interface RollbackPreviewSession {
    /** fork 的 inclusive 边界 seq（目标回合开始前最后一个事件）；null = 无边界 */
    from: number | null;
    /** 目标回合 turn/end 的 seq；null = 未知 */
    to: number | null;
    /** 目标回合号（1 基） */
    turns: number | null;
    cursorSeq: number | null;
    cursorNowBytes: number | null;
    cursorTargetBytes: number | null;
    restorable: boolean;
    /** 会话日志刚被写过（仅供参考：fork 只读，不会覆盖日志） */
    active: boolean;
    reasonCode: RollbackCode | null;
}
export interface RollbackPreviewResult {
    ok: boolean;
    code: RollbackCode;
    detail?: string;
    id: string;
    point?: RollbackPointSummary;
    workspace: RollbackPreviewWorkspace;
    session: RollbackPreviewSession;
    /**
     * 能否作为**回退目标**（t22 冻结口径）：`!protected && !incomplete && 至少一个段可恢复`。
     * **不**包含 `kind !== 'guard'` —— 救援点正是「回到回退前」的唯一路径，必须可回退。
     * 与 rewind() 的准入判定**逐条一致**（preview 说能恢复，rewind 就必须真能成功）。
     */
    canRestore: boolean;
    /**
     * 能否**删除**：`!protected && kind !== 'guard'`。
     * 与 canRestore **互相独立**（t22）：guard 用户删不掉（自动淘汰见 ROLLBACK_MAX_GUARDS_PER_SESSION），
     * 但它照样可以回退 —— 把「不可删除」当成「不可恢复」是曾经的缺陷。
     */
    canRemove: boolean;
    storage: RollbackStorageStatus;
    guidance: RollbackGuidance[];
    warnings: RollbackGuidance[];
}
export interface RollbackListResult {
    ok: boolean;
    storage: RollbackStorageStatus;
    points: RollbackPointSummary[];
    maxRecords: number;
    maxRecordsPerSession: number;
    /** **全局** guard 救援点上限（S6 第二道 guard 预算，见 ROLLBACK_MAX_GUARDS） */
    maxGuards: number;
    /**
     * **继承链**（fork 子会话 id → 父会话 id；只登记「历史被继承」的 fork 子会话，t9）。
     *
     * 客户端据此在「本会话/本回合未命中」时沿链只上溯找祖先的同回合点（环保护 + 深度上限在客户端）。
     * 缺省 = 本次没算出来（未知，不是「没有」）—— 客户端此时保持今天的口径，绝不猜。
     */
    inheritLinks?: Record<string, string>;
    /** 继承链是否**完整**（false = 扫描被预算截断 ⇒ 未命中不得当成「确知没有」） */
    inheritLinksComplete?: boolean;
    /** 继承视图条目是否被上限截断（`points` 里补的继承条目） */
    inheritedViewTruncated?: boolean;
    error?: string;
}
export interface RollbackRemoveResult {
    ok: boolean;
    code: RollbackCode;
    id: string;
    detail?: string;
}
export interface RollbackSegmentResult {
    state: RollbackStateKind;
    status: RollbackSegmentStatus;
    reasonCode?: RollbackCode;
    /** 逐条事实（技术细节，非用户可见文案） */
    detail: string[];
    restored: number;
    failed: number;
    /**
     * 能证明「留点之后新建」的路径（逐条清单有界；含被拒删的）。缺省只报告；
     * 开 `removeCreated` 时其中通过安全判据的会被删 —— 那一份是 `removedPaths`，**不是**本字段。
     */
    leftovers: string[];
    leftoversTruncated: boolean;
    /** 本次真的**删除**的「该点未记录」路径数（用户 2026-10-11 定案 A） */
    removed?: number;
    /**
     * 已删除路径（**全量**；与预览的 `workspace.removals` 同源同序 —— 两份清单逐条相等，
     * 界面因此可以把「预览说会删的」当成「实际删的」）。
     */
    removedPaths?: string[];
    /**
     * 按安全判据**拒删**的路径（越界 / 落在插件数据区 / `.git` / `node_modules` / 单文件过大；
     * 证明名单不完整时是**全部候选**）。逐条清单有界，总数见 `createdSkippedCount`。
     */
    createdSkipped?: string[];
    /** 拒删路径的**真实总数**（不受逐条清单上限影响） */
    createdSkippedCount?: number;
    /** 拒删逐条清单不完整（条数超上限 / 遍历被截断） */
    createdSkippedTruncated?: boolean;
    /**
     * 非 null = 该点捕获**不完整** ⇒ 一条都没删（安全拒删，绝不误删既有文件）；
     * 与 preview.workspace.createdRefusedReason 同一判据。
     */
    createdRefusedReason?: 'capture-incomplete';
    writtenBytes?: number;
    /**
     * 因路径选择（onlyPaths）而未恢复 / 未删除的条目数。
     * 与 createdSkipped（安全拒删）**分开**：这里的原因是用户自己没勾它，不是安全判据挡下。
     */
    selectionSkipped?: number;
    /**
     * 因**归属隔离**（2026-10-17 定案 B）而跳过的记录条目数：该文件在留点之后是**别的会话**写的。
     * 只在**没有显式点名**（`onlyPaths` 缺省）时生效；显式点名 = 用户明确要它，归属不再拦。
     */
    foreignSkipped?: number;
    /**
     * **落点无人认领**而未写回的文件总数（时间窗归属判定：文件在目标会话静默之后被改过，
     * 而那一刻没有任何会话处于活跃窗口 ⇒ 手改 / 外部工具 / 另一个 DSH 进程）。
     * 与 conflictCount / unavailableCount 一样是「故意没退」，绝不能并进「0 变更」。
     */
    externalCount?: number;
    /** 无人认领而未写回的路径逐条清单（上限 {@link ROLLBACK_LEFTOVER_LIST_LIMIT}） */
    externalPaths?: string[];
    /** 三方合并成功、写回「撤销本会话 + 保留对方改动」的条目数（有界清单同给） */
    mergedCount?: number;
    mergedPaths?: string[];
    /** 冲突：两侧改到同一处 ⇒ **未写**，交给用户处理 */
    conflictCount?: number;
    conflictPaths?: string[];
    /** 无法安全撤销（无中间版本 / 二进制 / 差异被降级 / 对方改成了不存在）⇒ **未写** */
    unavailableCount?: number;
    unavailablePaths?: string[];
    /** 写入前发现又被改过（并发）⇒ **未写** */
    concurrentCount?: number;
    concurrentPaths?: string[];
    /** 会话段：fork 出来的子会话 id */
    childSessionId?: string;
    guidance?: RollbackGuidance[];
}
export interface RollbackRewindInput {
    id: string;
    /** fail-closed 确认门：必须**恰好** true */
    userConfirmed: boolean;
    mode?: RollbackMode;
    segments?: readonly RollbackStateKind[];
    allowPartial?: boolean;
    guardPolicy?: RollbackGuardPolicy;
    /**
     * 是否**删除**「回退点之后新建」的路径（用户 2026-10-11 定案 A：回退要连文件一起退回去）。
     *
     * 缺省 false = 老口径（只报告 leftovers）。开启后：先读前像 → 删 → 任一失败就**整体回滚**
     * （把已写回的文件还原、把已删的文件写回）。拒删判据见 createdRemovalRefusal。
     */
    removeCreated?: boolean;
    /**
     * **路径级选择性恢复**（2026-10-17 用户定案 A）：只恢复 / 只删除这些路径。
     *
     * 缺省（undefined）= 既有全量口径，行为一字不变。给了值就：
     *  · 记录在案的文件里**不在**清单中的：不写（计入 selectionSkipped）；
     *  · 「留点后新建」的候选里**不在**清单中的：不删（同样计入）。
     * 清单里出现**既未记录、也不在删除候选**里的路径 ⇒ **fail-closed 拒绝、零写入**（invalid-input）：
     * 绝不把「用户打错一个路径」变成「静默少恢复几个文件」。
     */
    onlyPaths?: readonly string[];
}
export interface RollbackRewindResult {
    ok: boolean;
    outcome: RollbackOutcome;
    code: RollbackCode;
    detail?: string;
    id: string;
    segments: RollbackSegmentResult[];
    skippedSegments: RollbackStateKind[];
    /** S3：会话段的 fork 产物 */
    childSessionId?: string;
    /** S5：恢复前自动救援点 */
    guardPointId?: string;
    storage: RollbackStorageStatus;
    guidance: RollbackGuidance[];
    warnings: RollbackGuidance[];
}
export type RollbackStorageProbe = () => Promise<{
    ok: true;
} | {
    ok: false;
    detail: string;
}>;
export interface RollbackEngineOptions {
    /** 插件数据目录（= $DSH_HOME/dsh-config-manager）；回滚点库在 dataDir/rollback-points */
    dataDir: string;
    /**
     * 写入归属台账（2026-10-17 用户定案 B）。缺省 = 没有归属信息 ⇒ 预览不标 foreign，
     * 回退行为与旧版**逐字一致**（未判定绝不当作「别的会话写的」）。
     */
    attribution?: RollbackWriteAttributionPort;
    /**
     * 会话活跃时间窗（2026-10-18 新增）。缺省 = 没有时间证据 ⇒ 归属判定退回归属台账那一条，
     * 回退行为与加它之前**逐字一致**（未判定绝不当作「别的会话写的」，也绝不凭空拦截）。
     */
    activity?: RollbackActivityPort;
    /** DSH home（会话根 = homeDir/sessions） */
    homeDir: string;
    now?: () => number;
    maxFiles?: number;
    maxBytes?: number;
    /** 单文件上限（缺省 = maxBytes）：超限文件先 stat 判大小后跳过，绝不整份读进内存 */
    maxFileBytes?: number;
    /** skipped / excludedDirs 的逐条记录上限（缺省 5000）；超出只计数 + 置 skippedTruncated */
    maxSkippedEntries?: number;
    sessionMaxBytes?: number;
    sessionQuiescentMs?: number;
    maxRecords?: number;
    maxRecordsPerSession?: number;
    /** 每会话 guard 点上限（缺省 20，见 ROLLBACK_MAX_GUARDS_PER_SESSION） */
    maxGuardsPerSession?: number;
    /** **全局** guard 点上限（缺省 50，见 ROLLBACK_MAX_GUARDS；与自动点的 maxRecords 无关） */
    maxGuards?: number;
    /**
     * 台账字节预算（records/ + payloads/ 的总字节，缺省 ROLLBACK_DEFAULT_LEDGER_BYTES）。
     * 超预算时**只淘汰最旧的 auto 点**（guard / protected 不淘汰，沿用 selectPrune 的类别口径）。
     */
    ledgerBytesBudget?: number;
    /**
     * 工作区捕获的挂钟时间预算（毫秒，缺省 ROLLBACK_DEFAULT_CAPTURE_BUDGET_MS）。
     * 超时留**部分点**，不拒绝留点；见该常量的说明。
     *
     * 运行期**自适应**：被截断 ⇒ 下次翻倍；用得很少 ⇒ 下次减半（区间见
     * ROLLBACK_MIN/MAX_CAPTURE_BUDGET_MS）。回退期走查的预算见 rewindBudgetMs。
     */
    captureBudgetMs?: number;
    /** 自适应区间下界（缺省 ROLLBACK_MIN_CAPTURE_BUDGET_MS；测试可注入更小值） */
    captureBudgetMinMs?: number;
    /** 自适应区间上界（缺省 ROLLBACK_MAX_CAPTURE_BUDGET_MS；测试可注入更小值） */
    captureBudgetMaxMs?: number;
    /** 回退期走查的时间预算（缺省 = captureBudgetMs 初值；**不参与自适应**） */
    rewindBudgetMs?: number;
    /** 捕获期读 + 写并发上限（缺省 ROLLBACK_DEFAULT_CAPTURE_CONCURRENCY，1..64） */
    captureConcurrency?: number;
    /**
     * 捕获期**在飞内容字节**上限（缺省 ROLLBACK_DEFAULT_CAPTURE_INFLIGHT_BYTES = 32 MiB，
     * 有效范围 1..maxBytes）。与 `maxFileBytes`（单文件「要不要读」的判据）是两件事：
     * **这个才是并发的内存闸门**。
     */
    captureInFlightBytes?: number;
    guardPolicy?: RollbackGuardPolicy;
    /** 存储栈探针（缺省 = 真实磁盘探测）；注入失败探针可测「缺失时仍可挂载」 */
    storage?: RollbackStorageProbe;
    /** 会话 fork seam（宿主注入 ctx.get('sessions').fork） */
    fork?: RollbackForkSeam;
    /** 写回 seam（缺省 = atomicWriteFile + symlink:'reject'）；测试可注入以验证「校验失败整体回滚」 */
    writeFile?: (target: string, bytes: Uint8Array) => Promise<void>;
    /**
     * 读文件 seam（缺省 = node:fs/promises readFile）：只用于**捕获期读内容**这一步。
     * 测试用它计数「真的读了几次」，从而钉住路径身份缓存命中时**零重读**。
     */
    readFile?: (target: string) => Promise<Uint8Array>;
    /**
     * 台账读盘观测 seam（缺省不观测）：每次「读一条记录文件 / 一份载荷文件」前回调一次。
     * 与 readFile seam 同一用途 —— 测试用它**确定性地**计数「一次留点到底读了几份记录」，
     * 而不是靠无法复现的堆采样（issue #89 的内存护栏）。
     */
    ledgerReadFile?: (file: string) => void;
    /** E1：预览行级统计的规模上限（缺省见 ROLLBACK_PREVIEW_DIFF_*）；注入小值即可确定性地覆盖 truncated 分支 */
    previewDiffMaxFileBytes?: number;
    previewDiffMaxTotalBytes?: number;
    previewDiffMaxWork?: number;
    previewDiffTotalWork?: number;
    /** best-effort 日志（清理失败等；绝不抛给调用方） */
    log?: (line: string) => void;
}
/**
 * 路径里是否存在以 `.asar` 结尾的段（**捕获 / 走查期一律不碰这类路径**）。
 *
 * 为什么（真机事故，0.1.76）：Electron 宿主对任何含 `.asar` 段的路径**启用了 asar 虚拟化** ——
 * 即使那只是个普通文件，`fs.stat`/`readdir`/`read` 也会被接管去当容器解析。工作区里只要躺着一枚
 * **畸形** `.asar`（测试夹具、被打断的打包残留），宿主进程就会被原生层带走：crashpad
 * `not connected`、退出码 4294930435 ⇒ DSH Desktop 闪退（无 JS 栈、插件零错误）。
 * 实测（本仓真机捕获、同一份输入）：`.tmp` 下 19 枚 `.asar` 夹具在场 → Electron 进程死；
 * 全部改名后 → 同一趟捕获 9 s 跑完、退出码 0。
 * `.asar.unpacked` 是**真目录**（段名不以 `.asar` 结尾）⇒ 不拦。
 */
export declare function hasAsarSegment(target: string): boolean;
/** child 是否等于 parent 或位于其下（win32 折叠大小写；段边界判定） */
export declare function isInsidePath(child: string, parent: string): boolean;
/**
 * T10：`preview` 里 `fs.stat` 失败的**唯一**分类口径。
 * **只有 ENOENT** 才表示「当前确实不存在」→ 回退会重新创建它（create + 快照行数）；
 * 其余一切（EACCES / EPERM / ELOOP / ENOTDIR / ERR_INVALID_ARG_VALUE / 拿不到 errno）
 * 都是「存在性与可读性**未知**」⇒ 绝不报成 create +N/-0，必须 status 照给 + added/removed=null + truncated=true。
 * 判据只看 errno **code**，不看 message（message 里出现 ENOENT 不算数）。
 */
export declare function classifyPreviewStatFailure(error: unknown): 'missing' | 'unavailable';
/** 会话事件的最小形状（宿主把 session/event 的载荷窄化后喂进来；core 不认识 DSH 事件类型）。 */
export interface RollbackEventLike {
    seq: number;
    type: string;
    data?: unknown;
}
export interface RollbackTurnBoundary {
    turn: number;
    /** turn/start 的 seq */
    startSeq: number;
    /** turn/end 的 seq；回合还没结束 = null */
    endSeq: number | null;
    /**
     * **稳定边界** = 该回合开始前最后一个事件的 seq（startSeq − 1）。
     * startSeq === 0（本会话第一条事件就是 turn/start，首回合）→ null = 无前置边界。
     */
    boundarySeq: number | null;
}
/**
 * 从事件流里抽出回合边界（只认 turn/start 与 turn/end 的 seq；不解析日志字节）。
 */
export declare function turnBoundariesOf(events: readonly RollbackEventLike[]): RollbackTurnBoundary[];
/**
 * 求「回退到第 turnSeq 回合末」所需的 fork 边界。
 * 首回合无前置边界（turn/start 在 seq 0）→ **结构化 no-boundary**（绝不猜一个不存在的 seq）。
 */
export declare function resolveTurnBoundary(events: readonly RollbackEventLike[], turnSeq: number): {
    ok: true;
    boundarySeq: number;
    endSeq: number | null;
} | {
    ok: false;
    code: 'no-boundary';
    detail: string;
};
/**
 * 记录在案的文件条目数：优先用载荷自带的 `fileCount`（增量视图下 `files` 可能只是子集），
 * 老载荷没有该字段才回落到 `files.length`。
 */
export declare function workspaceFileCount(payload: RollbackWorkspacePayload | null): number;
export declare function summarizeRollbackPoint(record: RollbackPointRecord): RollbackPointSummary;
/** 浅层形状校验：台账被篡改 / 半写时不把它当记录用（宁可当「读不到」）。 */
export declare function isRollbackPointRecord(value: unknown): value is RollbackPointRecord;
/** mode → 要恢复的段（显式 segments 优先，路由层负责优先级） */
export declare function statesForMode(mode: RollbackMode | undefined): RollbackStateKind[];
export declare class RollbackPointEngine {
    private readonly dataDir;
    private readonly homeDir;
    private readonly sessionsRoot;
    private readonly root;
    private readonly objectsDir;
    private readonly ledgerPath;
    private readonly nowFn;
    private readonly maxFiles;
    private readonly maxBytes;
    private readonly maxFileBytes;
    private readonly captureInFlightBytes;
    private readonly maxSkippedEntries;
    private readonly sessionMaxBytes;
    private readonly sessionQuiescentMs;
    private readonly maxRecords;
    private readonly maxRecordsPerSession;
    private readonly maxGuardsPerSession;
    private readonly maxGuards;
    private readonly guardPolicy;
    private readonly probe;
    private readonly forkSeam;
    private readonly writeSeam;
    private readonly readSeam;
    /** 路径身份缓存（首次用到时惰读；纯优化，任何异常都只回落全量读） */
    private pathCache;
    private readonly previewDiffMaxFileBytes;
    private readonly previewDiffMaxTotalBytes;
    private readonly previewDiffMaxWork;
    private readonly previewDiffTotalWork;
    private readonly log;
    private lastStamp;
    /**
     * fork **继承链**（子会话 → 父会话，t9）。两个来源：
     *  ① 活会话登记（{@link noteSessionBinding}，本次运行里刚 fork 的立刻可用）；
     *  ② 台账所在项目键下的会话日志头扫描（{@link refreshForkLinks}，覆盖「已存在的坏子会话」）。
     */
    private readonly forkLinks;
    private forkLinksAt;
    private forkLinksComplete;
    /** 会话日志头缓存（mtime + size 失效；只服务 fork 链扫描） */
    /**
     * **本进程**最近一次成功留点的工作区摘要（清单增量化的基准）。
     *
     * 为什么是内存而不是读盘：一次留点只准读清单（L-08 / issue #89）—— 读上一份 12 MB 载荷去算差异
     * 正是那条被消灭的路。内存量 ≈ 每文件一个 `sha:bytes:chunk` 串（3.4 万文件约几 MB），
     * 与已有的身份缓存（`pathCache`）同量级；进程重启后第一次留点落全量锚点，随后继续链。
     */
    private deltaBase;
    private readonly forkHeaderCache;
    /** 继承判据用的台账快照（TTL 缓存；只缓存**清单条目**，绝不缓存完整记录） */
    private ledgerSnapshotCache;
    /** 台账存储层（v3：清单 + 单条记录 + 内容寻址载荷；issue #89） */
    private readonly ledger;
    /** 写入归属（2026-10-17 定案 B）。undefined = 没有归属信息 ⇒ 预览不标 foreign */
    private readonly attribution;
    private readonly activity;
    private readonly ledgerBytesBudget;
    /**
     * 工作区捕获的挂钟时间预算（毫秒；见 ROLLBACK_DEFAULT_CAPTURE_BUDGET_MS）。**可变**：
     * 每次留点后按「是否被截断 / 用掉多少」自适应（见 ROLLBACK_MIN/MAX_CAPTURE_BUDGET_MS）。
     */
    private captureBudgetMs;
    /** 自适应区间下界 / 上界（构造期定死，运行期只调 captureBudgetMs） */
    private readonly captureBudgetMinMs;
    private readonly captureBudgetMaxMs;
    /** 回退期走查的时间预算（与捕获预算分开：自适应不该顺手拉长回退期的走查） */
    private readonly rewindBudgetMs;
    /** 捕获期读 + 写并发上限 */
    private readonly captureConcurrency;
    /** 对象仓目录已确认存在（省掉每个对象一次 mkdir） */
    private objectsDirReady;
    /**
     * 本回合对象名单快照（一次 readdir 顶掉「每个候选一次 fs.access」；真机 34k 次 access ≈ 3.7 s）。
     * null = 读不到名单（首次还没建目录/异常）⇒ 回落逐条 objectExists。
     * 只保证「写进去的立刻可见」：捕获期间被**并发删除**的对象可能仍被判为存在 —— 那一路由
     * 读取侧（readObject + 哈希校验）响亮失败，不会静默给出错误的 before 内容。
     */
    private captureObjectNames;
    /**
     * 启动期一次性初始化（流式迁移 v2 -> v3 + 孤儿 tmp 清理）的惰性单飞。
     * 为什么惰取而不是构造时同步跑：构造发生在每个请求路径上，同步扫盘/迁移会把请求卡死；
     * 而「每回合都扫一遍」正是要避免的浪费 —— 所以只跑一次并记住结果。
     */
    private initPromise;
    /** 启动期初始化失败的如实记录（读路径必须报出来，绝不假装台账是空的） */
    private initError;
    constructor(options: RollbackEngineOptions);
    /** 回滚点库根目录（只读侦察用；写路径全部经本类的门） */
    get storeDir(): string;
    get sessionsRootDir(): string;
    private stamp;
    private warn;
    /**
     * 记一条留痕。`skipped` 桶：列表未满就逐条落盘，满了只计数 + 置 skippedTruncated（上限只影响
     * **记录条数**，不影响 skippedCount —— 绝不静默丢弃）；`excluded` 桶（预期内的忽略目录，如
     * node_modules）逐条记录、**不计入 skippedCount**，因此不会把点判成 degraded。
     */
    private recordSkip;
    /**
     * 打开一次回退的前像暂存目录（`<root>/undo/<pid>-<ts36>-<8hex>/`）。
     * 返回 null = 建不出来（权限 / 磁盘满）⇒ 调用方必须**零写入失败**。
     */
    private openUndoStager;
    private writeFile;
    /**
     * 启动期一次性初始化（惰性单飞）：先**流式**迁移 v2 单文件 -> v3，再清理崩溃残留的原子写 tmp。
     *
     * 为什么惰取而不是在构造里同步跑：引擎在每个请求路径上都会被新建（路由层不缓存引擎），
     * 构造里同步扫盘/迁移会把请求卡死；而「每回合扫一遍」又是纯浪费 —— 所以只跑一次并记住结果。
     * 迁移失败**不抛**：如实记进 initError，由读路径报出来，并**拒写**（绝不覆盖还没迁完的 v2 文件）。
     */
    private ensureReady;
    private runInit;
    storageStatus(): Promise<RollbackStorageStatus>;
    /** 台账可观测快照（清单条数 + 磁盘字节 + 预算 + 本进程淘汰计数） */
    private ledgerStatus;
    /** 对象仓目录只 mkdir 一次（每个对象各 mkdir 一次是纯白花的 syscall） */
    private ensureObjectsDir;
    /**
     * 写内容寻址对象（对象文件名 = 内容 SHA-256）。
     *
     * **为什么这里不用 atomicWriteFile**：那是给「可写配置文件」用的强原子写（同目录 tmp → fsync →
     * rename），真机实测一次约 4.7 ms —— 34k 文件的工作区一次全量捕获 148 s 全花在它上面（走查本身
     * 只要 0.66 s）。对象仓的正确性要求不同：文件名即内容哈希 ⇒
     *   · 用 'wx' **独占创建最终名**本身已是原子的（不覆盖已有对象；并发同写只有一方成功）；
     *   · 半截 / 被篡改的内容在读取侧必然过不了哈希校验（readObject + sha256Hex）⇒ 按「读不出」
     *     处理并 fail-closed，绝不会冒充有效前像；
     *   · 不做 fsync：回滚点是尽力而为的本地快照，不为掉电持久性付出每文件一次 fsync 的代价。
     */
    private writeObjectWithHash;
    /** 对象仓里是否真有这个 blob（缓存命中时校验；任何异常一律按「没有」处理） */
    private objectExists;
    private readObject;
    /**
     * 读回路径索引并校验完整性（内容寻址 ⇒ 字节一变就对不上，绝不用坏名单下删除判断）。
     * 任何异常（对象丢失 / gzip 坏 / 哈希不符）都抛给调用方 —— 调用方据此 fail-closed。
     */
    private readPathIndex;
    private emptyTrack;
    /**
     * 会话态捕获：记录 sessionId / 事件游标 / 字节数 / 指纹；容量允许时把**字节副本**放进
     * 对象仓（仅为审计证据 —— 回退走 fork，不依赖它）。
     */
    private captureSession;
    /**
     * 列出一个显式分块内的候选文件（不跟随符号链接 / junction；跳过与读不到都留痕）。
     * 返回 null = 该分块本身不可用（不存在 / 是链接 / 非常规文件），细节已写进 sink。
     *
     * `truncated` 与 `walkAborted` 是**两件事**：前者只说「本次列表不完整」（文件数上限 / 提交上限），
     * 后者说「走查被预算或取消打断，栈里还有没进去的子树」—— 只有后者才意味着那些路径
     * **一条都没进任何名单**，调用方必须据此让删除集 fail-closed。
     */
    private listChunkFiles;
    private captureWorkspace;
    /** 用户忽略规则是否命中该路径（只认「相对分块根」的斜杠路径） */
    /**
     * 处理一个分块的候选文件（**两阶段**）。
     *
     *  ① **顺序判定**（与旧的串行实现逐条一致，保证预算 / 计数 / 字节上限完全确定）：
     *     文件数上限、时间预算、自身数据区、stat、单文件上限、总量上限、身份缓存 + 对象存在性
     *     → 得出「当场入点（缓存命中）」还是「要真读」，该跳过的**当场**按原有 reason 逐条留痕。
     *     stat 按**有序批**并发取（判定仍严格按顺序），并用「一次 readdir 的对象名单快照」代替
     *     每个文件一次 fs.access —— 这两处是稳态成本的大头（真机实测各占 ~5 s / ~3.7 s）。
     *  ② **并发读 + 哈希 + 落对象仓**：这是捕获耗时的**唯一大头**（真机 148 s / 31,702 个对象，
     *     96% 的时间），用 captureConcurrency 个 worker 并发跑；并用**在飞字节闸门**保证
     *     「同时在飞的内容字节 ≤ captureInFlightBytes」。**不是** maxFileBytes —— 它缺省 =
     *     总量预算（512 MiB），拿它当闸门等于允许把整个点的预算同时驻留（0.1.74 闪退根因）。
     *
     * 返回本分块**真正入点**的文件数（调用方据此推进 maxFiles 预算）。
     * 没判到 / 没读完的条目一律逐条进 skipped(budget-time)，绝不静默丢弃。
     */
    private captureChunkCandidates;
    /**
     * 缺口优先排序：身份缓存里**没有**的路径排前面。
     *
     * 为什么：预算固定时按目录顺序走查，同一个「已覆盖且便宜」的前缀每回合都会吃掉全部预算，
     * 尾部永远进不来（真机：34k 文件每次只覆盖 1/5，且五次都是同一批 outputs/ 前缀）。
     * 未覆盖的排前面 ⇒ 每个点都在补上一次的缺口，覆盖率随回合**单调收敛**到 100%。
     * 组内保持走查顺序（稳定），因此同一输入下的结果仍然确定。
     */
    private orderByCoverage;
    private ignoredByRules;
    /** 读文件（可注入 seam；只用于捕获期读内容这一步） */
    private readFileBytes;
    /**
     * 路径身份键：dev:ino:size:mtimeNs:ctimeNs:mode（全 BigInt 字符串化）。
     *
     * 为什么必须 BigInt：ino / mtimeNs / ctimeNs 在 64 位 inode 文件系统上会超出 Number 的
     * 安全整数范围，用 Number 会静默丢精度（把两次不同的写当成同一个身份）。
     * 用毫秒换算同样不行：会把「同一毫秒内的两次写」当成同一个身份。
     * 读不到身份（文件消失 / 权限 / 平台不支持 bigint stat）→ null ⇒ 回落全量真读。
     */
    /**
     * 一次 bigint stat 拿到阶段①需要的**全部**东西（是否文件 / 大小 / mtime / 身份）。
     * 旧实现「fs.stat + pathIdentityOf」每文件 stat 两次，真机 34k 文件白花约 5 s。
     */
    private fileStatOf;
    /** 对象名单快照（每个捕获回合一次 readdir）；读不到则返回 null ⇒ 调用方回落逐条判断 */
    private objectNamesSnapshot;
    private pathIdentityOf;
    private pathCachePath;
    /**
     * 惰读缓存（每个引擎实例一次）。任何形状不符 / 读失败都当作空缓存 —— 缓存是纯优化，
     * 绝不因为缓存坏掉而拒绝留点或改变任何判定。
     */
    private loadPathCache;
    /** 缓存命中：身份键存在、且路径逐字相同（身份被复用也绝不认）。 */
    /**
     * 「这条记录的当前内容**仍然是它**吗」的身份快路径 —— **预览与执行共用同一条判据**
     * （否则「预览说会改的 = 实际会改的」这条不变式会被打破）。
     *
     * 判据：路径身份（dev:ino:size:mtimeNs:ctimeNs:mode）命中**身份缓存**，且缓存里的 sha/bytes 与记录一致。
     * 身份未变 ⇒ 内容未变：缓存里的 sha 就是**这份内容**在留点那一次真读出来的哈希（身份含 size/mtimeNs/
     * ctimeNs/ino/dev/mode，改内容必动 mtime/ctime，Windows 上 user 代码改不了 ctime）。
     * 任何一环拿不到（读不到身份 / 缓存没有该身份 / sha 或 bytes 不同）⇒ false，调用方回落「真读 + 哈希」。
     *
     * 为什么必须有它：大仓库一次预览/回退要判 3 万+ 条目，逐个真读等于把整个工作区读两遍
     * （真机 34k 文件 / 609 MiB：预览 14.2 s 里 13 s 全在这，回退 60 s+ 同理）。**记录的指纹被篡改**
     * 时本判据必然不成立（缓存的 sha 是真算出来的）⇒ 仍走真读 + 哈希的旧路径，护栏不退化。
     */
    private unchangedByIdentity;
    private lookupCachedFile;
    private rememberCachedFile;
    /** 缓存落盘（best-effort：写失败只意味着下次全量读，绝不影响留点成败） */
    private persistPathCache;
    /**
     * 缓存随引用回收：台账里没有任何回滚点引用的路径，其条目一律清掉（不无界增长）。
     * 注意判据是**路径**（缓存条目自带 path 字段），而不是内容哈希。
     */
    private gcPathCache;
    /** 拒删成因的如实说明（没有可解释成因时返回空数组，绝不编理由） */
    private createdRefusalWarnings;
    /**
     * 读台账**清单**（只读元数据 + 段摘要；代价与工作区文件数**无关**）。
     *
     * 与 v2 的差别只在实现：v2 每回合把整份 index.json 读进内存并 parse（473 MB 那条路），
     * v3 读的是一份小清单。**外部语义一个字没变**：返回 entries + 同一套 error 文案。
     * 启动期初始化失败时如实回报（不读 v2 文件、不假装台账为空）。
     */
    private readManifest;
    /**
     * 读**完整**记录（引用解析对调用方透明）。失败一律如实回报，**绝不返回半个记录**：
     * 载荷缺失 / 哈希不符 / 形状不符 ⇒ error（调用方走 record-incomplete 路径）。
     */
    private readFullRecord;
    /**
     * S6 淘汰（t14 冻结 + 2026-10-12 guard 全局上限）：三类点各按各的预算裁，**只删最旧的**。
     *
     * | 类别 | 预算 | 说明 |
     * |---|---|---|
     * | auto 自动点 | 每会话 `maxRecordsPerSession`（20）→ 全局 `maxRecords`（50） | 两次裁剪都只删最旧 |
     * | guard 救援点 | 每会话 `maxGuardsPerSession`（20）→ 全局 `maxGuards`（`ROLLBACK_MAX_GUARDS`，50） | **不占**自动点预算、**不受**自动点的 20/50 影响；用户删不掉 ⇒ 必须有自己的两道预算（单会话挡住不够，跨会话也要收敛） |
     * | protected 点 | 无上限（只进不出） | 生产路径**造不出来**（capture 端点已下线、tracker 从不设 protect），只有测试能造 |
     */
    /**
     * 条数淘汰（口径与 v2 逐字相同，只是从「记录」换成「清单条目」）：三类点各按各的预算裁，**只删最旧的**。
     *
     * | 类别 | 预算 | 说明 |
     * |---|---|---|
     * | auto 自动点 | 每会话 maxRecordsPerSession（20）→ 全局 maxRecords（50） | 两次裁剪都只删最旧 |
     * | guard 救援点 | 每会话 maxGuardsPerSession（20）→ 全局 maxGuards（ROLLBACK_MAX_GUARDS，50） | **不占**自动点预算、**不受**自动点的 20/50 影响；用户删不掉 ⇒ 必须有自己的两道预算（单会话挡住不够，跨会话也要收敛） |
     * | protected 点 | 无上限（只进不出） | 生产路径**造不出来**（capture 端点已下线、tracker 从不设 protect），只有测试能造 |
     */
    private selectPruneEntries;
    /**
     * 字节预算淘汰（issue #89 的**根因修复**）：条数没超、字节超了照样会 OOM。
     *
     * 判据与条数淘汰共用同一类别口径：**只淘汰最旧的 auto 点**（guard / protected 永不淘汰）。
     * 释放量按「记录文件字节 + 载荷**最后一个引用**消失时的载荷字节」估算（引用计数靠清单，不读载荷）。
     * 返回淘汰后的清单（调用方负责落盘与删文件）。
     */
    private applyByteBudget;
    /**
     * 对象仓回收（**重写版**，issue #89）：账本字节数不再进内存。
     *
     * 旧实现要从「内存里所有记录的全部 files 数组」累计引用 ⇒ 回收一次 = 把整份台账读进内存。
     * 现在：扫**清单** -> 逐个读引用到的**载荷文件**（一次只驻留一份）-> 累计 referenced 对象键 -> 扫 objects/。
     * 峰值内存 ∝ 单份载荷 + 对象键集合，**不 ∝ 台账总字节**。
     * 任何一份被引用的载荷读不出来 ⇒ 整体放弃回收（fail-closed：读不到的载荷里有什么对象谁也不知道）。
     */
    private gcObjects;
    /**
     * 把记录写进台账（**留点侧唯一写入口**）：整段「读全文 → 合并 → S6 淘汰 → 原子写 → 回收对象」
     * 都在 {@link withLedgerWriteLock} 的进程内串行队列里 —— 绝不与 tracker / 路由的另一次写交错。
     */
    /**
     * 写一条记录（**最多三次尝试**）—— 跨进程乐观并发（①B）。
     *
     * dataDir 由 `$DSH_HOME` 决定、**不随 profile 分家**（与本插件自带的实例锁同一套多实例假设），
     * 所以「另一个 DSH 实例正在写同一份清单」是设计内的场景，而 `withLedgerWriteLock` 只串行本进程。
     * 策略：读清单前后各取一次**代际戳**，被改过就重读重试；三次都变 ⇒ **放弃本次留点并 warn**，
     * 绝不拿自己的快照覆盖别人的清单（宁可少一条点，也不丢别人的点）。
     * 诚实的边界：检测与写入之间仍有极小窗口，无跨进程锁时无法彻底消除 —— 这里保证的是
     * 「不静默覆盖 + 尽量合并」，不是原子性。
     */
    /**
     * 把工作区载荷改写成**增量视图**（相对最近一个同分块的点）——清单增量化，省的是磁盘，不是语义。
     *
     * 判据与安全边界（逐条）：
     *  · 基准 = 清单里最近一个 `workspace.payload` 非空、**分块完全相同**的点（只试最近几个，代价有界）；
     *  · 增量 = 「相对基准新增 / 改写的条目」+「基准里不再存在的路径」，条目**逐字比较**（同形绝对路径）；
     *  · 只有增量明显更小（< 全量的 60%）才用；否则原样全量落盘；
     *  · 读路径由 ledger 物化（`resolvePayload`）⇒ 预览 / 回退 / 回收看到的永远是完整清单；
     *  · 基准读不出来 / 分块对不上 / 任何异常 ⇒ 原样全量（绝不因为省字节而让点不可用）；
     *  · 基准载荷的保活由 ledger 的 `payloadChain` 负责（淘汰时不会把基准删掉）。
     */
    private storagePlanFor;
    /** 记下这份点作为下一次留点的增量基准（内存摘要，见 {@link deltaBase}） */
    private rememberDeltaBase;
    private appendRecord;
    /** `appendRecord` 的单次尝试；`conflict: true` = 这期间清单被别的实例改过，调用方应当重试。 */
    private appendRecordOnce;
    /**
     * 留一个回滚点（宿主自动留点 / 恢复前救援点 / 测试构造都走这一条）。
     * 没有 HTTP capture 端点 —— 手动「拍点」已随规格 S1 下线。
     */
    capturePoint(input?: RollbackPointInput): Promise<RollbackCaptureResult>;
    /**
     * 活会话登记时喂进来的 fork 关系（宿主每见一个会话对象调一次；非 fork 子会话不记）。
     *
     * 为什么需要：磁盘扫描只覆盖**台账里有点的项目键**，而「本次运行里刚 fork 出来的子会话」
     * 必须立刻可用（否则用户刚回退完、打开子会话还是灰的）。
     */
    noteSessionBinding(binding: RollbackSessionBinding): void;
    /** 沿继承链**只上溯**（环保护 + 深度上限）；返回祖先 id 列表（不含起点）。 */
    ancestorIdsOf(sessionId: string): string[];
    /** 台账快照（TTL；继承判据用 —— 只读、失败按空台账处理，绝不因此拒绝留点）。 */
    private ledgerSnapshot;
    /**
     * 本会话/本回合**没有自己的点**时，沿继承链找祖先的同回合点（t9 的判据层）。
     *
     * 只上溯、带环保护与深度上限；返回 null = 链上没有（祖先没有点 / 不是继承子会话）——
     * 调用方（留点器）据此区分「继承回合」与「本会话自己的新回合」。
     */
    ancestorPointForTurn(sessionId: string, turn: number): Promise<RollbackPointSummary | null>;
    /** 读会话日志头（带 mtime + size 缓存；失败缓存 null，不反复打盘）。 */
    private readForkHeaderCached;
    /**
     * 补齐继承链：扫「台账里有点的项目键」下的会话目录，登记 fork 子会话 → 父会话。
     *
     * 为什么只扫这些项目键：继承点解析只对「**祖先有回滚点**」的子会话有意义（祖先没有点 ⇒ 解析不出
     * 任何东西），而 fork 子会话与父会话在**同一个项目键**下（fork 不改 cwd）⇒ 覆盖这点就够了。
     * 台账空 ⇒ 直接返回（零扫描，热路径零代价）；结果按 {@link ROLLBACK_FORK_LINKS_TTL_MS} 缓存。
     */
    private refreshForkLinks;
    /**
     * `list()` 里为 fork 子会话补的**继承视图**条目（t9）。
     *
     * 为什么必须补：**不属于本任务 scope 的匹配器**（`RollbackReviewDialog` 的 `findPointForTurn`）
     * 只认「`sessionId` + `turn` 同时相等」—— 不补的话，入口按钮亮了、点开对话框却说「没有回滚点」。
     * 条目语义（**不是幽灵点**）：
     *  · 与祖先点**同一个 id**：preview / rewind / remove 全部作用在原点 ⇒ 回退仍在原会话上做 fork
     *    （`boundarySeq` 也来自原点），与今天的语义逐字相同；
     *  · 台账**不写任何记录**（只在只读列表里成景），状态全部来自祖先的真实捕获；
     *  · `inheritedFrom` / `inheritedSessionId` 如实标出它的来处。
     * 有界（{@link ROLLBACK_INHERITED_VIEW_MAX}），超出如实标记。
     */
    private inheritedViews;
    list(): Promise<RollbackListResult>;
    read(id: string): Promise<{
        point?: RollbackPointRecord;
        records: RollbackPointRecord[];
        error?: string;
        storage: RollbackStorageStatus;
    }>;
    /**
     * 预览的**单条只读判定**（阶段 A，可并发跑）：一次 bigint lstat + 身份快路径。
     * `unchanged = true` 表示「已证明与记录一致」（身份命中身份缓存且 sha/bytes 相同）⇒ 调用方直接跳过。
     */
    private previewScan;
    private trackWarnings;
    /**
     * 「证明为留点之后新建」的完整规划 —— 预览（`preview`）与执行（`restoreWorkspace`）**共用这一份**。
     *
     * 为什么必须只有一份：旧实现两处各算一次删除口径 —— 预览用只按「未记录 + 在 chunks 内」
     * 过滤、且只取前 `ROLLBACK_LEFTOVER_LIST_LIMIT` 条、**不过滤拒删项**的清单；执行用
     * 「全量 + 过安全判据」的清单。于是预览里混进**永远不会删**的 `.git` 路径，又漏掉第 21 条
     * 之后**真的会删**的路径 —— 跳过的回合越多，两个集合差得越远（用户 2026-10-12 实测：
     * 预览列 20 条 = 3 条 .git（不会删）+ 17 条会删；实际删 25 条 ⇒ 8 条会删的没被列出）。
     *
     * 三条判据都在这里一次算清（预览与执行逐条同源）：
     *  ① **证明**（方向 A+B）：候选 = 当前存在、在分块内、且不在证明名单里的路径 —— 证明名单 =
     *     `files` ∪ `skipped` ∪ `unreadableFiles` ∪ `excludedDirs` ∪ **路径索引**（`payload.pathIndex`，
     *     捕获时走查过的全部路径）。证明名单**不完整时一条都不删**（只有两种情形：名单被记录上限截断
     *     而索引缺失/读不出、有读不出的目录 —— 目录内容在留点时刻未知，索引也补不上）。
     *     **「预算截断」本身不再拒删**：预算挡下的既有文件都在 `skipped` 或路径索引里 ⇒ 它们照样不是候选；
     *     旧口径拿它整体放弃删除，于是大工作区里中间回合新建的文件一条都删不掉（用户 2026-10-12 真机）。
     *  ② 路径判据 {@link createdRemovalRefusal}（分块外 / 数据区 / `.git` / `node_modules` / 非绝对路径）；
     *  ③ 单文件上限（先 `stat` 判大小；读不出大小且非 ENOENT 一律拒删 ——「不知道多大」≠「可以删」）。
     */
    private planCreatedRemovals;
    /**
     * E1：一个**执行过但无事可做**的段。T10 起按原因分成两个码（界面据此说两句不同的话，
     * **不靠 detail 分派**）：
     * - `'nothing-to-restore'`：记录了条目、但全部已与快照一致（工作区已与该点一致）；
     * - `'no-recorded-files'`：该态**没有记录任何文件**（例如捕获时分块不可用 / 空分块）。
     *
     * status 用 'restored' 而不是 'skipped' —— 它不是「没执行」，而是「执行了、0 变更」（restored=0）；
     * 于是 rewind 能靠它把「无事可做」与「真失败」分开（见 rewind 的 allNoop）。两者都不是错误。
     */
    private noopSegment;
    /**
     * E1：单个「会被改动的文件」的行级统计 —— 方向**只有一侧**，别读反：
     * **current → snapshot**（=「这次回退会给该文件新增/删除多少行」），与 `RollbackPreviewFile`
     * 的 `added` / `removed` 字段注释同一口径：
     *  · `added`   = 快照里有、当前**没有**的行 ⇒ 回退会**加进去**的行数；
     *  · `removed` = 当前有、快照里**没有**的行 ⇒ 回退会**删掉**的行数。
     * 对应到实现：`lineDiffCounts(before, after)` 的 **`after` 是快照（回退目标）**、`before` 是当前文件。
     *
     * 任何一条超限、读不出、非文本 ⇒ 返回 null 数字 + truncated（调用方照给 status，但**不给数字**）。
     * `budget` 是**单张预览**共享的累计预算（字节 + 步数），跨条目生效。
     */
    private previewFileCounts;
    /**
     * **合并结果**的逐文件行级统计（与 `previewFileCounts` 同一套预算与降级判据）。
     *
     * 为什么单独一份：合并后要写进去的内容既不是记录里的原文（ours），也不是磁盘现状（theirs）——
     * 预览若照旧拿 ours 算差异，就会把「其实会被保留的对方改动」显示成「会被删掉」。
     */
    private previewMergeCounts;
    /**
     * **中断的回退**（2026-10-18）：进程在「回退写到一半」时没了 ⇒ 工作区停在半回退状态。
     *
     * 判据 = 目录名形态（`<pid>-<ts36>-<8hex>`）+ 有 journal 索引 + **没有 done** + 持锁进程已死
     *（全部在 rollback-undo-journal.ts 里，可注入 isAlive 以便测试）。
     *
     * 只读：不改工作区、不删现场；是否重放由用户决定（见 recoverInterruptedRollback）。
     * 这也是 cleanupOrphanTempFiles 不再整目录删它的原因 —— 删了就等于把半回退现场变成
     * 「无人知晓的部分修改」，正是任务要求里禁止留下的东西。
     */
    interruptedRollbacks(): Promise<InterruptedUndo[]>;
    /**
     * 把一条中断的回退**退回回退前**（重放前像），返回逐条结果。
     *
     * 安全边界全在 replayUndoJournal 里：只有「当前内容仍等于 after 镜像」的条目才写回 ——
     * 之后发生的任何人工 / 外部 / 别的会话的改动一律**跳过**并如实回报（绝不覆盖）。
     * 只有全部条目都成功（没有 skipped / failed）才清理现场；否则现场留着，可以再看、再试。
     */
    recoverInterruptedRollback(dir: string): Promise<{
        ok: boolean;
        restored: number;
        skipped: string[];
        failed: string[];
        detail: string;
    }>;
    /** 只读预览：零写入（不过确认门、不拍 guard、不写任何字节）。 */
    preview(id: string): Promise<RollbackPreviewResult>;
    /**
     * 只读：单个回滚点里**一个记录在案的文件**的逐行前后对照（零写入、不拍 guard、不写字节）。
     *
     * 收窄（安全不变量）：路径必须**逐字命中**记录里的 workspace.files ——
     * 绝不把这条端点做成「任意路径读取器」；未命中 ⇒ file-not-recorded，**一个字节都不读**。
     * 二进制 / 单侧超限 / 对象仓读不出 / 当前读不出都返回结构化 reason（hunks 恒为空数组），
     * 既不抛错，也不把「不知道」谎报成「没有差异」。
     */
    fileDiff(id: string, filePath: string): Promise<RollbackFileDiffResult>;
    private result;
    private emptySegment;
    rewind(input: RollbackRewindInput): Promise<RollbackRewindResult>;
    /**
     * S4/S5：写回**记录在案**的路径，并删除**该点未记录且可证**的路径（同一份 planCreatedRemovals）。
     * 阶段 1 只读校验（任何一条不合格 → 零写入整体失败）→ 阶段 2 记前像 + 写 →
     * 阶段 3 逐文件 hash 复核 → 阶段 4 删除；任一失败 → **整体回滚到恢复前状态**。
     */
    /**
     * 「这一条新建路径**不许删**」的判据（命中即拒删；每条都能被逐字解释，绝不靠启发式）。
     *
     * · 不在任何记录在案的分块内（chunk 之外不是我们的地盘）；
     * · 落在插件自己的数据区（`this.root`）内 —— 那是回滚台账/对象仓本身；
     * · 路径里出现 `.git` 或 `node_modules` 段（仓库元数据与依赖树：它们在回退点之后**天天在变**，
     *   按「新建」判据删掉等于毁掉工作副本）；
     * · 不是绝对路径。
     */
    private createdRemovalRefusal;
    /**
     * 把一条「留点之后被**别的会话**写过」的记录做成三方合并结果（2026-10-17 跨对话安全回退）。
     *
     * 三方：`ours` = 记录里的内容（回退目标）、`base` = 目标点之后**最早**那份中间版本、
     * `theirs` = 当前磁盘。结果是「撤销本会话那次改动 + 保留对方后来的改动」。
     *
     * 返回：`write`（合并干净且确实要写，带目标哈希 + 期望的当前哈希）、
     * `unchanged`（合并结果就是当前内容 —— 对方没动这一处，本来就不需要写）、
     * `blocked`（不能安全处理：冲突 / 没有中间版本 / 二进制 / 差异被降级 / 对方改成了不存在 / 读不出）。
     */
    private mergeForeignRecord;
    /**
     * 三方合并的 **base**：目标点之后**最早**那份仍含该路径的中间版本（共同祖先）。
     *
     * 为什么这么取：回滚点的「工作区态」是回合开始前拍的 ⇒ 别的会话那个回合的点，
     * 正好是「本会话改动之后、对方改动之前」的版本 —— 标准三方合并的共同祖先。
     * 取**最早**而不是最近是刻意选安全方向：宁可少撤销，也绝不把对方更晚的改动算进 ours 侧。
     *
     * 排除四类：目标点自己（`createdAt > afterAt`）、**救援点 guard**（它在执行回退那一刻拍，
     * 内容 ≈ 当前磁盘，拿它当 base 会让合并结果直接等于 ours = 整文件覆盖，正是本机制要消灭的形态）、
     * **本会话的点**（见上）、以及内容读不出来的点（继续往后找 —— 找不到 ⇒ 调用方按「无法安全撤销」
     * 处理，绝不用近似值代替）。
     */
    /**
     * 这条路径**是谁写的** —— 只读旁证（归属台账 + 活跃时间窗），**绝不从内容猜**。
     *
     * 优先归属台账（tool/call 参数，精确到调用）；没有归属时看文件 mtime 落在谁的活跃窗口内 ——
     * 这一条与工具无关，因此 bash / 脚本 / 外部编辑器写的路径同样能被判出来。
     * `hasDataFor` 是「有没有覆盖」的自证：**没有覆盖就返回 unknown**（不拦），有覆盖却没有任何会话
     * 活跃在那一刻才返回 unclaimed（手改 / 外部工具 / 另一个 DSH 进程）。
     */
    private provenanceOf;
    /**
     * 目标点之后**别的会话的回合点**里，有没有哪个**不含**这条路径（= 那一刻它不存在）。
     *
     * 它证明的是：「当前磁盘上这份内容是该点之后才出现的」⇒ 拿目标点的内容整文件覆盖它，等于
     * 抹掉对方新建/重建的工作（2026-10-18：A 删文件、B 重建，回退 A 把 B 的内容覆盖回旧版本）。
     * 截断的点（`payload.truncated`）不能用来证明「不存在」，一律跳过；只扫最早的若干个点（有界）。
     */
    private absentAtForeignPointOf;
    /** 两档 base：**别的会话的回合点**优先，其次**救援点**（见 baseVersionFor 的判据注释） */
    private baseFor;
    private baseVersionFor;
    /**
     * **别的会话的回合点里记录过的路径集合** —— 删除集保护的第二种证据（不依赖归属台账）。
     *
     * 为什么需要第二证据：归属可能整条缺失（工具不在白名单 / 另一个 DSH 进程把 attribution.json
     * 整体覆盖写 / 采集时机错过），而「别人的点里出现过这个路径」是**点台账本身**记录的事实 ——
     * 它足以证明「这条路径在留点之后被别的会话所在的回合捕获过」，因此删它就是销毁别人的工作。
     *
     * 有界：只扫目标点之后**最早**的 `limit` 个别的会话的点（按时间升序），且只读路径不读内容。
     * 扫不完不影响安全方向（少保护也会被归属那条兜一部分），但绝不因此声称「已扫全」。
     */
    private foreignRecordedPaths;
    private restoreWorkspace;
    /**
     * S3：会话回退 = 在目标回合前的稳定边界 **fork 子会话**。
     * 原会话日志**只读**：本方法不写任何字节（旧版的静止期门 / 分叉门 / 字节写回全部下线）。
     */
    private restoreSession;
    /**
     * 删除一个回滚点。保护点与 guard 点**一律拒绝**（「不删被保护点」，用户删不掉 guard；
     * guard 的增长靠两道自动淘汰收敛 —— 每会话 `maxGuardsPerSession`（20）与全局 `maxGuards`（50），
     * 见 ROLLBACK_MAX_GUARDS_PER_SESSION / ROLLBACK_MAX_GUARDS），
     * 没有 force 后门。成功后回收无人引用的对象（best-effort）。
     *
     * 整段「读 → 判 → 写 → 回收」都在 {@link withLedgerWriteLock} 队列里：否则并发的自动留点
     * 会在本方法的读与写之间插入一次 append，把刚删掉的点**复活**（评审 20 轮实测 12 轮复现）。
     */
    remove(id: string): Promise<RollbackRemoveResult>;
    /**
     * 磁盘清理入口（引擎侧）：删**全部**自动点（includeGuards=true 时连 guard 也删），
     * protected 点**永不删**（生产路径造不出来，只有测试能造）。随后回收无人引用的载荷与对象。
     *
     * 零写入拒绝路径照旧：存储不可用 / 清单读不出来（形状不符、迁移失败、迁移中）⇒ **抛带 code 的错误**，
     * 一个字节都不动、也绝不静默返回全 0（「什么都没删」与「读不出来所以没删」是两件事）。
     * 返回的 bytes = 本次真正删掉的字节（记录文件 + 载荷文件 + 对象文件）。
     */
    purgeLedger(options?: {
        includeGuards?: boolean;
    }): Promise<{
        removedRecords: number;
        removedPayloads: number;
        removedObjects: number;
        bytes: number;
    }>;
}
/**
 * 台账清理的**显式拒绝**（形状不符 / 存储不可用）：带机器可读 code，绝不静默返回全 0。
 * 路由层按 code 映射 HTTP（与既有 RollbackCode 冻结集同源）。
 */
export declare class RollbackLedgerRefusedError extends Error {
    readonly code: RollbackCode;
    constructor(code: RollbackCode, detail: string);
}
/** 会话登记（宿主订阅 session/event 时按会话登记一次）。 */
export interface RollbackSessionBinding {
    sessionId: string;
    /** 会话单元键 <projectKey>/<sessionId>（界面展示 / 归属） */
    unitId?: string | null;
    /** 会话日志绝对路径（能拿到就给；只作审计，回退走 fork） */
    logPath?: string | null;
    /** 工作区快照分块（通常 = 会话 cwd）；缺省 = 只留会话态（该点 incomplete） */
    chunks?: readonly string[];
    /**
     * 父会话 id（t9）：活会话头里有 `parentSession` / `parentSessionId` 就带出来。
     * 它**不改变任何留点行为**（点仍只属于本会话），只服务于「这条 replay 出来的回合是不是继承的」判据。
     */
    parentSessionId?: string | null;
    /**
     * 该会话的历史是不是**从父会话播种**来的（`isSeeded` / `seedLength`，t9）。
     * 只有 true 的父子关系才进继承链 —— 子代理会话的回合号是它自己的，按同回合上溯会误命中。
     */
    forked?: boolean;
}
export interface RollbackTrackedEvent {
    sessionId: string;
    seq: number;
    type: string;
    data?: unknown;
    /**
     * 事件的写入面（DSH 的顶层 `surfaceOp`；`'append'` = 用户新发的一条消息）。
     *
     * 为什么留点器需要它：**排队中的用户消息**（上一回合还在跑时发出的那条）会先落成
     * `user/message(surfaceOp='append')` / `agent/inbox/spliced`，**再**出现下一个 `turn/start`。
     * 若边界直接取 `startSeq - 1`，这些「还没被消费的输入」会被切进子会话 ——
     * 真机表现就是「回退后的对话变成排队发送里的一条消息」（2026-10-11 用户反馈）。
     */
    surfaceOp?: string;
}
export interface RollbackTrackerOptions {
    engine: RollbackPointEngine;
    now?: () => number;
    /** 轮询回退间隔（≤5 s） */
    pollIntervalMs?: number;
    log?: (line: string) => void;
    /** 会话日志 stat 探针（轮询回退用） */
    statSessionLog?: (logPath: string) => Promise<{
        size: number;
        mtimeMs: number;
    } | undefined>;
    /**
     * 写入归属采集器（2026-10-17 定案 B）。缺省 = 不采集 ⇒ 预览永远没有 foreign 标记，
     * 回退行为与旧版**逐字一致**。
     */
    attribution?: RollbackWriteRecorder;
    /**
     * 会话活跃时间窗采集器（2026-10-18）。缺省 = 不采集 ⇒ 归属判定只剩 tool/call 参数那一条。
     * **每个事件都记一次**（与工具参数无关），因此 bash / 脚本 / 外部编辑器写的路径同样有归属证据。
     */
    activity?: RollbackActivityRecorder;
}
export interface RollbackTrackerResult {
    captured: boolean;
    pointId?: string;
    code?: RollbackCode;
    detail?: string;
}
/**
 * session/event 载荷的窄化结果（F-2）：形状不符走**显式机器码**，绝不静默回落到「什么都不做」。
 * 宿主拿到 ok:false 必须记日志/上报，而不是当成「这个事件不需要留点」。
 */
export type RollbackEventNarrowResult = {
    ok: true;
    event: RollbackTrackedEvent;
} | {
    ok: false;
    code: RollbackCode;
    detail: string;
};
/**
 * 把 DSH 的 session/event 载荷窄化成留点器认识的最小形状（seq / type / 透传 data）。
 * core 不认识 DSH 的事件类型：只做**形状**校验，语义判断（turn/end 才留点）在 noteEvent 里。
 */
export declare function rollbackTrackedEventOf(sessionId: string, event: unknown): RollbackEventNarrowResult;
/**
 * 一次 live Session → 留点器的会话登记（F-2）。
 *
 * 工作区快照分块取 `session.header.cwd`（DSH 记录会话创建时的绝对工作目录）；cwd 缺失或
 * 非绝对时**不给分块** —— 那个点只留会话态（`incomplete=true` + workspace.reasonCode
 * `no-chunks`），由界面如实展示，**绝不**拿别的目录凑数；`chunkless` 给出机器码供宿主记录。
 * 会话日志路径不在这里猜：回退走 `fork(sessionId, boundarySeq)`（S3），引擎不依赖日志路径。
 */
export type RollbackBindingNarrowResult = {
    ok: true;
    binding: RollbackSessionBinding;
    chunkless: 'cwd-missing' | 'cwd-not-absolute' | null;
} | {
    ok: false;
    code: RollbackCode;
    detail: string;
};
export declare function rollbackSessionBindingOf(session: unknown): RollbackBindingNarrowResult;
/**
 * 回合自动留点器（S1）。
 *
 * **主路径 = 事件驱动**：宿主订阅 `session/event`，把每个事件交给 `noteEvent`；
 * 见到 `turn/end` 就为当前会话留一个回滚点（工作区快照 + 会话游标 + fork 边界）。
 * 边界来自该回合的 `turn/start`：`boundarySeq = startSeq - 1`（startSeq=0 → 无前置边界）。
 *
 * **回退路径 = mtime 轮询**（宿主拿不到事件订阅时）：`start()` 起 ≤5 s 的定时器，
 * 日志 size/mtime 变了就留一个点。轮询**拿不到回合边界**（core 不解析日志字节），
 * 因此这些点只有工作区态 + 会话游标，`boundarySeq=null` → 会话回退会结构化 `no-boundary`。
 *
 * 幂等：同一会话同一回合只留一次（重复事件 / 重复轮询都不会重复留点）。
 */
export declare class RollbackAutoTracker {
    private readonly engine;
    private readonly nowFn;
    private readonly pollIntervalMs;
    private readonly log;
    private readonly statSessionLog;
    private readonly attribution;
    private readonly activity;
    private readonly bindings;
    private readonly open;
    /**
     * 每个会话「尚未被回合消费的输入」的首个 seq（排队发送的用户消息 / inbox 拼接）。
     * 见 {@link RollbackTrackedEvent.surfaceOp} 的说明与 {@link isPendingInputEvent}。
     */
    private readonly pendingInput;
    private readonly lastBoundary;
    private readonly seenTurns;
    private readonly lastStat;
    private timer;
    private mechanism;
    /** 在途捕获的取消信号（stop() 时 abort；重新 start() 时换一个新的） */
    private captureAbort;
    constructor(options: RollbackTrackerOptions);
    /** 实际采用的留点机制（output / 诊断用） */
    get mechanismKind(): 'event' | 'poll';
    registerSession(binding: RollbackSessionBinding): void;
    unregisterSession(sessionId: string): void;
    private warn;
    private captureFor;
    /**
     * 事件驱动的入口。宿主订阅 session/event 后把事件窄化成 {@link RollbackTrackedEvent} 再喂进来。
     * 绝不对未知事件抛错（宿主回调必须 try/catch 也就够了，但这里也不抛）。
     */
    noteEvent(event: RollbackTrackedEvent): Promise<RollbackTrackerResult>;
    /**
     * 该回合是不是**继承**来的（t9）。
     *
     * 判据（两档，先便宜后准）：
     *  ① 本进程里已经见过**祖先**这一回合的点（父会话通常同时在跑，这一档零 IO）；
     *  ② 台账快照里祖先有同回合点（{@link RollbackPointEngine.ancestorPointForTurn}，只上溯 + 环保护 + 深度上限）。
     *
     * 语义（为什么继承回合**不补点**）：
     *  · fork 子会话 replay 出来的历史回合，其「该回合之前的工作区态」属于**父会话**那一时刻；
     *    在这里补一个点 = 把**现在**的工作区态贴到那个回合上 ⇒ **幽灵点**（回退会把文件写回错误状态）；
     *  · 继承回合的可回退性由**祖先点**提供：客户端沿继承链解析（`lookupPointForTurn`）、
     *    `list()` 里另有继承视图条目供其它匹配器使用 —— 所以「继承回合不补点」不会让子会话永久无点；
     *  · 本会话**自己的新回合**（祖先没有同回合点）照常留点 ⇒ 子会话从此有自己的点。
     */
    private inheritedTurnOf;
    private defaultStat;
    /**
     * 轮询回退：日志 size/mtime 变了就留一个点（**无回合边界**）。
     * 首次见到某会话只记基线（不立刻留点），避免把「历史文件」当成新回合。
     */
    pollOnce(): Promise<RollbackTrackerResult[]>;
    /** 起轮询定时器（≤5 s）。已起则幂等返回。 */
    start(): void;
    stop(): void;
    /** 当前时钟（测试用；保持与引擎 now 同源语义） */
    now(): number;
}
