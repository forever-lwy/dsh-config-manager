/**
 * 定时全量备份设置 —— 框架无关纯函数层（node 可测）。
 *
 * 职责：设置草稿校验 / 运行状态映射 / 类型定义（BackupScheduleStatus 等）。
 * 不产出任何用户可见文案（文案由 React 壳走 locale 字典 t()），不 import node 模块。
 *
 * P0-⑤：新增「自定义（每周固定时刻）」档（interval='custom' + customSchedule），
 * 校验层与草稿类型同步扩展；host 保存路由、BackupScheduleCard 共用本层校验。
 *
 * 安全：定时备份恒不含 secret、不加密（加密密码仅内存且不能持久化）——
 * 本层无任何敏感字段，随 runStore 切片持久化亦安全。
 */
import type { BackupInterval, BackupRunStatus, BackupWeeklySchedule } from '../sync/backup-schedule-config.ts';
import type { BackupRunResult } from '../sync/backup-scheduler.ts';
import { DEFAULT_RETENTION_POLICY, hasRetentionTiers } from '../sync/retention-policy.ts';
import type { RetentionPolicy } from '../sync/retention-policy.ts';
export type { BackupInterval, BackupRunStatus, BackupRunResult, BackupWeeklySchedule, RetentionPolicy };
export { DEFAULT_RETENTION_POLICY, hasRetentionTiers };
/** 设置草稿（表单编辑态：总开关 + 间隔档位 + 自定义周档 + 保留策略）。 */
export interface BackupScheduleDraft {
    enabled: boolean;
    interval: BackupInterval;
    /** custom 档的每周固定时刻（仅 interval='custom' 时校验；其他档位忽略） */
    customSchedule?: BackupWeeklySchedule;
    /** m-retention：备份产物 + 快照的保留策略（GFS 分层）；缺省 = 「最近 10 个」 */
    retention?: RetentionPolicy;
}
/** 可选的间隔档位（UI 展示顺序 = 由短到长）。 */
export declare const BACKUP_INTERVAL_OPTIONS: readonly BackupInterval[];
/** 每周星期选项（0-6 → 展示文案由 locale 提供；本层只给值域） */
export declare const WEEKDAY_OPTIONS: readonly {
    value: number;
    label: string;
}[];
/** 定时备份配置的浏览器侧视图（与 sync/backup-schedule-config.ts 的持久化面一致；无敏感字段）。 */
export interface BackupScheduleStatus {
    enabled: boolean;
    interval: BackupInterval;
    customSchedule?: BackupWeeklySchedule;
    /** m-retention：保留策略（GFS 分层）；宿主未返回时由组件回退 DEFAULT_RETENTION_POLICY */
    retention?: RetentionPolicy;
    startupMinIntervalMs: number;
    consecutiveFailures: number;
    lastRunAt?: string;
    lastRunStatus?: BackupRunStatus;
    lastRunMessage?: string;
}
/** 校验设置输入（host 侧保存路由与组件提交共用；接受 unknown 防御畸形/空 body）。 */
export declare function validateBackupScheduleDraft(draft: unknown): {
    ok: true;
    value: BackupScheduleDraft;
} | {
    ok: false;
    error: string;
};
/** m-retention：保留策略值域（UI 输入 min/max 直接用；与 validateRetentionPolicy 同源）。 */
export declare const RETENTION_FIELD_LIMITS: {
    readonly keepLast: {
        readonly min: 0;
        readonly max: 1000;
    };
    readonly keepMonthly: {
        readonly min: 0;
        readonly max: 120;
    };
    readonly keepYearly: {
        readonly min: 0;
        readonly max: 120;
    };
};
/** m-retention：策略的三层字段顺序（UI 渲染顺序 = 由近及远）。 */
export declare const RETENTION_FIELDS: readonly (keyof RetentionPolicy)[];
/** m-retention：确保拿到完整策略（宿主未返回/字段缺失 → 缺省补齐；绝不产出 undefined 字段）。 */
export declare function normalizeRetentionPolicy(raw: Partial<RetentionPolicy> | undefined): RetentionPolicy;
/** 保留策略相等判定（脏检查用；缺省补齐后再比，避免 undefined 与缺省值的伪差异）。 */
export declare function retentionPolicyEquals(a: RetentionPolicy | undefined, b: RetentionPolicy | undefined): boolean;
/** 上次运行状态 → Badge kind（success→ok / skipped→info / failed→error / 未知→info）。 */
export declare function backupRunBadgeKind(status: BackupRunStatus | undefined): 'info' | 'ok' | 'warn' | 'error';
/** 判断草稿相对已保存配置是否有未保存修改（决定「保存设置」按钮可用性）。 */
export declare function backupDraftDirty(draft: BackupScheduleDraft, saved: BackupScheduleStatus | null): boolean;
/** 立即备份结果摘要（供 UI 展示；不含 secret）。 */
export declare function backupRunSummary(run: BackupRunResult): {
    status: BackupRunStatus;
    zip: string | null;
    sizeBytes: number | null;
    skipReason: string | null;
    error: string | null;
};
/**
 * 宿主 BackupRunResult.skipReason 的结构化投影；未知 token 落 'other'（不静默当成功）。
 *
 * 锁相关四种分开：宿主按 lockSkipToken() 分档发 token（issue：locks 目录为空也说「锁被占用」）。
 * 'locked' 只表示「真被另一项活任务持有」，残留锁与 SAFE MODE 各有自己的处置方向。
 */
export type BackupSkipReason = 'disabled' | 'running' | 'conflict' | 'locked'
/** 残留锁（含心跳降级）：重试/重启都不会自愈，必须去事故恢复回收 */
 | 'lock-stale'
/** 锁不可用（目录 IO/权限/未知状态）：稍后重试 */
 | 'lock-unavailable'
/** SAFE MODE 阻断写入：锁目录通常是空的，处置入口是事故恢复 */
 | 'safe-mode' | 'other';
/** 立即备份结果 → 客户端提示通道（壳据 kind 选 toast，据 reason 选文案键）。 */
export type BackupRunOutcome = {
    kind: 'ok';
} | {
    kind: 'skipped';
    reason: BackupSkipReason;
} | {
    kind: 'error';
    message: string | null;
};
/**
 * issue #43：宿主 `/backup-schedule/run` 对 `skipped` / `failed` 也回 HTTP 200 + `ok:true`
 * （见 src/index.ts 的 backup-schedule/run 路由），所以**不能**用「有没有抛异常」判成败 ——
 * 那会把「定时备份未启用 → 一个备份文件都没产出」读成「备份完成」。
 *
 * 本函数只做语义投影（零文案）：success → ok；skipped → 结构化 reason（**未知 token 归一为 other**，
 * 绝不把机器 token 原样摆到用户面前——仓库既有纪律：用户可见文本里不留裸 token）；
 * 其余（含 failed 与未来新增 status）→ error，fail-safe 地绝不宣称成功。
 * `failed` 但宿主没给出可用错误文本（undefined / 空串 / 全空白）→ message 为 null，由壳层回退通用文案
 * （否则会渲染出「备份失败：」这种半截提示）。
 */
export declare function backupRunOutcome(run: BackupRunResult): BackupRunOutcome;
