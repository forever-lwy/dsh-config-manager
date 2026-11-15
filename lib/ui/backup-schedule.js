import { DEFAULT_RETENTION_POLICY, RETENTION_LIMITS, hasRetentionTiers, validateRetentionPolicy } from '../sync/retention-policy.js';
// 零依赖跨端共享常量/函数（retention-policy.ts 不 import 任何模块 → client 运行时引用安全）：
// client 侧统一从本层取，不直接 import sync/ 运行时代码。
export { DEFAULT_RETENTION_POLICY, hasRetentionTiers };
/** 可选的间隔档位（UI 展示顺序 = 由短到长）。 */
export const BACKUP_INTERVAL_OPTIONS = ['6h', '12h', '24h', '7d', 'custom'];
/** 每周星期选项（0-6 → 展示文案由 locale 提供；本层只给值域） */
export const WEEKDAY_OPTIONS = [
    { value: 0, label: 'sunday' },
    { value: 1, label: 'monday' },
    { value: 2, label: 'tuesday' },
    { value: 3, label: 'wednesday' },
    { value: 4, label: 'thursday' },
    { value: 5, label: 'friday' },
    { value: 6, label: 'saturday' },
];
/** 校验设置输入（host 侧保存路由与组件提交共用；接受 unknown 防御畸形/空 body）。 */
export function validateBackupScheduleDraft(draft) {
    if (draft === null || typeof draft !== 'object' || Array.isArray(draft)) {
        return { ok: false, error: 'body must be an object with enabled (boolean) and interval' };
    }
    const d = draft;
    if (typeof d['enabled'] !== 'boolean') {
        return { ok: false, error: 'enabled must be a boolean' };
    }
    if (!BACKUP_INTERVAL_OPTIONS.includes(d['interval'])) {
        return { ok: false, error: 'interval must be one of 6h/12h/24h/7d/custom' };
    }
    const interval = d['interval'];
    const value = { enabled: d['enabled'], interval };
    if (interval === 'custom') {
        const weekly = typeof d['customSchedule'] === 'object' && d['customSchedule'] !== null && !Array.isArray(d['customSchedule'])
            ? d['customSchedule']
            : undefined;
        const dayOfWeek = weekly?.['dayOfWeek'];
        const hour = weekly?.['hour'];
        const minute = weekly?.['minute'];
        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6
            || !Number.isInteger(hour) || hour < 0 || hour > 23
            || !Number.isInteger(minute) || minute < 0 || minute > 59) {
            return { ok: false, error: 'customSchedule must include dayOfWeek (0-6), hour (0-23), minute (0-59)' };
        }
        value.customSchedule = { dayOfWeek: dayOfWeek, hour: hour, minute: minute };
    }
    // m-retention：保留策略（可选；给了就必须合法——非法一律拒绝并给可读原因，不静默回退）
    if (d['retention'] !== undefined) {
        const parsedRetention = validateRetentionPolicy(d['retention']);
        if (!parsedRetention.ok) {
            return { ok: false, error: `retention invalid: ${parsedRetention.error}` };
        }
        value.retention = parsedRetention.value;
    }
    return { ok: true, value };
}
/** m-retention：保留策略值域（UI 输入 min/max 直接用；与 validateRetentionPolicy 同源）。 */
export const RETENTION_FIELD_LIMITS = RETENTION_LIMITS;
/** m-retention：策略的三层字段顺序（UI 渲染顺序 = 由近及远）。 */
export const RETENTION_FIELDS = ['keepLast', 'keepMonthly', 'keepYearly'];
/** m-retention：确保拿到完整策略（宿主未返回/字段缺失 → 缺省补齐；绝不产出 undefined 字段）。 */
export function normalizeRetentionPolicy(raw) {
    return {
        keepLast: raw?.keepLast ?? DEFAULT_RETENTION_POLICY.keepLast,
        keepMonthly: raw?.keepMonthly ?? DEFAULT_RETENTION_POLICY.keepMonthly,
        keepYearly: raw?.keepYearly ?? DEFAULT_RETENTION_POLICY.keepYearly,
    };
}
/** 保留策略相等判定（脏检查用；缺省补齐后再比，避免 undefined 与缺省值的伪差异）。 */
export function retentionPolicyEquals(a, b) {
    const x = normalizeRetentionPolicy(a);
    const y = normalizeRetentionPolicy(b);
    return x.keepLast === y.keepLast && x.keepMonthly === y.keepMonthly && x.keepYearly === y.keepYearly;
}
/** 上次运行状态 → Badge kind（success→ok / skipped→info / failed→error / 未知→info）。 */
export function backupRunBadgeKind(status) {
    switch (status) {
        case 'success': return 'ok';
        case 'failed': return 'error';
        case 'skipped': return 'info';
        default: return 'info';
    }
}
/** 判断草稿相对已保存配置是否有未保存修改（决定「保存设置」按钮可用性）。 */
export function backupDraftDirty(draft, saved) {
    if (saved === null)
        return true;
    if (draft.enabled !== saved.enabled || draft.interval !== saved.interval)
        return true;
    // m-retention：保留策略参与脏判定（未保存的策略修改也要让「保存设置」可点）
    if (!retentionPolicyEquals(draft.retention, saved.retention))
        return true;
    if (draft.interval === 'custom') {
        const a = draft.customSchedule;
        const b = saved.customSchedule;
        if (a === undefined || b === undefined)
            return a !== b;
        return a.dayOfWeek !== b.dayOfWeek || a.hour !== b.hour || a.minute !== b.minute;
    }
    return false;
}
/** 立即备份结果摘要（供 UI 展示；不含 secret）。 */
export function backupRunSummary(run) {
    return {
        status: run.status,
        zip: run.zip ?? null,
        sizeBytes: run.sizeBytes ?? null,
        skipReason: run.skipReason ?? null,
        error: run.error ?? null,
    };
}
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
export function backupRunOutcome(run) {
    switch (run.status) {
        case 'success':
            return { kind: 'ok' };
        case 'skipped': {
            switch (run.skipReason) {
                case 'disabled': return { kind: 'skipped', reason: 'disabled' };
                case 'running': return { kind: 'skipped', reason: 'running' };
                case 'conflict': return { kind: 'skipped', reason: 'conflict' };
                case 'mutation-locked': return { kind: 'skipped', reason: 'locked' };
                case 'mutation-lock-stale': return { kind: 'skipped', reason: 'lock-stale' };
                case 'mutation-lock-unavailable': return { kind: 'skipped', reason: 'lock-unavailable' };
                case 'mutation-safe-mode': return { kind: 'skipped', reason: 'safe-mode' };
                default: return { kind: 'skipped', reason: 'other' };
            }
        }
        default:
            return {
                kind: 'error',
                message: run.error !== undefined && run.error.trim() !== '' ? run.error : null,
            };
    }
}
//# sourceMappingURL=backup-schedule.js.map