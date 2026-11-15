import type { BackupVerifyResult } from '../../core/backup-verify.ts';
import { type DiskUsageReport } from '../../core/disk-usage.ts';
import type { SnapshotMeta } from '../../core/restore.ts';
import type { BackupFileMeta } from '../../sync/backup-files.ts';
import type { SessionHealthScanResult } from '../../utils/session-health-scan.ts';
import type { LockReport, ProfilesOutcome, RepairOutcome, RescuePaths, RescueStatus, RestorePlanView } from '../actions.ts';
export interface PageChrome {
    version: string;
    paths: RescuePaths;
    active: 'home' | 'disk' | 'sessions' | 'profiles' | 'unlock' | 'restore' | 'export' | 'reinstall';
}
export declare function esc(value: string): string;
/**
 * **只转义、不脱敏**的展示出口：唯一用途是救急台**有意**回传给终端用户的「能力 URL」
 * （启动器从子进程日志抓到的带 token 的认证 URL）。
 *
 * 为什么必须与 esc() 分开（cli-F1）：esc() 先过安全侧 redact()，而 redact 的 URL_QUERY_RE
 * 会把 `?token=…` 的值抹成 ***REDACTED*** —— 那正是认证 URL 的形态，于是页面给出一条必然
 * 401 的死链（/profiles 的「打开实例」入口 + 启动结果页）。这些 URL 与终端里打印的 bootstrap
 * URL 同一性质：只给拿到会话 cookie 的人，本来就该原样可见。
 * 纪律：**只允许**用于本层自己签发/抓取的能力 URL；其余一切文本仍走 esc()。
 */
export declare function escCapability(value: string): string;
export declare function formatBytes(bytes: number): string;
type Cell = string | {
    html: string;
};
/**
 * 救急台的**页面导航表（唯一事实源）**：头部导航与 404 / 405 / 错误页的「可用页面」清单
 * 全部由它派生 —— 此前那三处各写一份、且与现实不一致（把 JSON 自述的 `/healthz` 说成页面，
 * 又漏掉 `/restore` / `/export`）。`/healthz` 是 JSON 自述、不是页面，故不在表内。
 */
export declare const CONSOLE_PAGE_NAV: ReadonlyArray<{
    key: PageChrome['active'];
    href: string;
    label: string;
}>;
/** 「可用页面」提示行（404 / 405 / 错误页共用这一份派生结果，不再各写一份）。 */
export declare function consolePagesHint(): string;
export declare function renderLayout(chrome: PageChrome, body: string, subtitle?: string): string;
/** 独立极简页（403/404 用；不依赖任何目录事实，避免在错误路径上再读盘）。 */
export declare function renderMessagePage(title: string, message: string, hint?: string): string;
export interface HomePageInput {
    status: RescueStatus;
    version: string;
    actions?: readonly ActionCard[];
}
export declare function renderHomePage(input: HomePageInput): string;
/**
 * 备份名 → 不透明校验 id（sha256 前 16 位 hex）。
 *
 * 为什么不直接用文件名做查询参数：文件名可能**夹带密钥**（实测 `leak-apiKey=SECRET123.zip`），
 * 而 `?file=<原样编码>` 会把明文重新写回页面（redact 只作用于显示文本，改不了 href 里的参数）。
 * 摘要既能正确定位到列表里那一项，又不泄漏任何名字内容（验收 F7）。
 */
export declare function verifyIdOf(name: string): string;
export declare function renderDiskPage(report: DiskUsageReport, version: string, paths: RescuePaths, actionToken: string, done: string): string;
export declare function renderSessionsPage(result: SessionHealthScanResult | null, error: string | undefined, version: string, paths: RescuePaths, plan: RepairOutcome | null, actionToken: string, done: string, 
/** 写入门现状（只读投影）；缺省 = 未探测，页面不显示门卡片 */
gate?: GateView | null, 
/** 就地修复（重放族）的就绪情况；缺省 = 未探测 */
inline?: InlineRepairView | null): string;
/** 首页/磁盘页上的写动作卡（禁用时必须给出原因，绝不静默消失）。 */
/**
 * 就地修复（重放族）视图：来自 actions.repairSessionLogInline 的**只读预览**。
 *
 * 呈现纪律：这里只显示「哪几条会话存在零损失可修项（重放重复行）」以及「其余类别为什么
 * 不在这里修」。合成 closer / seq 空洞 / 子代理缺父 属于**只报告**类（设计稿 §10.3/§10.4 的
 * G-23 界限）——页面必须把这条边界写出来，而不是让用户以为「点一下就能全修好」。
 */
export interface InlineRepairView {
    /** 预览发现的、可零损失修复的会话（unitId + 将丢弃的重复行数） */
    fixable: Array<{
        unitId: string;
        droppedRows: number;
    }>;
    /** 预览探测过的单元数（让「没发现」有分母，不是拍胸脯） */
    probed: number;
    /** 预览里被判为不可修的原因分布（只报告类的证据） */
    blocked: Array<{
        reason: string;
        count: number;
    }>;
}
/** 写入门视图（actions.checkWriteGates 的结构化投影；页面只渲染，不重写判定）。 */
export interface GateView {
    ok: boolean;
    code: string;
    reason: string;
    instances?: Array<{
        name: string;
        pid: number;
        port: number | null;
    }>;
    commands?: string[];
}
export interface ActionCard {
    id: string;
    title: string;
    description: string;
    href: string;
    disabled: boolean;
    disabledReason?: string;
}
/**
 * 「确认后执行」表单：放宽的是**展示层**，不是提交语义。
 *
 * 服务端直出的是 `<details open>` + 原始 `<form method="post">`（一次性 token、副作用说明、勾选项
 * 全都在表单里）：禁用 JS 时它就是今天那份可直接提交的纯 HTML。有 JS 且浏览器支持 showModal 时，
 * 客户端脚本才把 details 升级成原生 `<dialog>` —— 提交仍然 POST 到同一个 action、带同一个 token，
 * token 校验顺序（token → 安全门）在服务端一字未改。客户端校验/弹窗只算 UX，不构成任何边界。
 */
export declare function renderConfirmForm(options: {
    action: string;
    token: string;
    title: string;
    consequence: string;
    submitLabel: string;
    danger: boolean;
    checklist?: ReadonlyArray<{
        name: string;
        label: string;
        description: string;
        checked: boolean;
    }>;
    /** 固定随表单提交的隐藏字段（如档案名）—— 表单是唯一参数载体，不依赖客户端脚本 */
    hidden?: Record<string, string>;
    /** 需要密码输入时给出字段名（值只随本次 POST 传递，不进 URL、不落盘、不回显） */
    passwordField?: string;
    /** 需要版本号输入时给出字段名（如重装的 --version） */
    versionField?: string;
    note?: string;
}): string;
/** 写动作结果页（完成 / 失败共用；结果如实逐条列）。 */
export declare function renderResultPage(title: string, 
/** 逐条结果：默认过 esc()（脱敏+转义）；`{ html }` 仅用于已自行转义的能力 URL 行 */
lines: readonly Cell[], version: string, paths: RescuePaths, kind: 'ok' | 'bad' | 'warn' | string, 
/** 「返回上一页」在禁用 JS 时的落点（有 JS 时走 history.back()，回到列表页并由状态恢复脚本定位） */
backHref?: string): string;
/** 残留锁页：展示锁状态 + 显式回收表单（活锁一律不给可点的回收理由）。 */
export declare function renderLockPage(lock: LockReport, version: string, paths: RescuePaths, actionToken: string, done: string): string;
/** 解锁加密备份：只列加密容器；含「解锁并查看清单」表单。 */
export declare function renderUnlockPage(encrypted: readonly BackupFileMeta[], version: string, paths: RescuePaths, actionToken: string, done: string): string;
/** 恢复：列快照；选定某快照后展示计划（零写入）与执行表单。 */
export declare function renderRestorePage(snapshots: readonly SnapshotMeta[], plan: RestorePlanView | null, version: string, paths: RescuePaths, actionToken: string): string;
/** 离线导出：分区勾选（只列离线可读的文件类分区）+ 不可收集分区如实列出。 */
export declare function renderExportPage(sections: readonly string[], unavailable: readonly string[], version: string, paths: RescuePaths, actionToken: string): string;
/** 重装：计划 + 终端确认码。 */
export declare function renderReinstallPage(items: ReadonlyArray<{
    id: string;
    label: string;
    desc: string;
    destructive: boolean;
    defaultOn: boolean;
}>, version: string, paths: RescuePaths, actionToken: string): string;
export declare function renderVerifyPage(result: BackupVerifyResult, version: string, paths: RescuePaths): string;
/** 档案页：列表 + 启停表单（每个可启动档案一张卡；不可启动的写明原因）。 */
export declare function renderProfilesPage(outcome: ProfilesOutcome, version: string, paths: RescuePaths, actionToken: string, done: string, result: string): string;
export {};
