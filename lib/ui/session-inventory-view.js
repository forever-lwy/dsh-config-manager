import { SESSION_HEALTH_SEVERITIES } from '../core/session-health.js';
import { redact } from '../security/redaction.js';
/**
 * 应用内**可修**的问题码（与执行器 planSessionLogRepair 的三类动作同源）：
 *  重放重复行 / 可证明的合成收尾块（零损失）；seq 空洞 / 不可解析行（截断，**有损**，需显式确认）。
 * 其余码（撕裂尾帧自愈、格式超前、缺工作区/缺父对话…）一律不给应用内入口。
 *
 * T4 的工具生命周期码（`missing-message-id` / `empty-tool-call-id` / `dangling-tool-call` /
 * `tool-result-id-mismatch` / `duplicate-tool-call-id`）同样**只报不修**，刻意不进本集合：
 * 修复它们必须真的改写消息/工具行，超出「只读体检」的范围。
 * 界面文案经 src/ui/session-issue-labels.ts 映射成词典键（**绝不裸渲染机器 code**；
 * 未知码回落 sessions.issue.unknown）—— 与 sessionLayoutReasonKey / cloudIssueKey 同一条判据。
 */
export const SESSION_REPAIRABLE_ISSUE_CODES = new Set([
    'replay-duplicate-rows',
    'synthetic-closer',
    'seq-gap',
    'unparsable-event',
]);
/** 单个问题码是否可应用内修复。 */
export function sessionIssueRepairable(code) {
    return SESSION_REPAIRABLE_ISSUE_CODES.has(code);
}
/** 严重级 → 徽章语义（与 Badge 的四态一一对应；DESIGN.md 先想语义再选 kind）。 */
export function sessionSeverityBadgeKind(severity) {
    if (severity === 'blocksStartup')
        return 'error';
    if (severity === 'unloadable')
        return 'error';
    if (severity === 'nextRequestFails')
        return 'warn';
    if (severity === 'invisible')
        return 'warn';
    return 'ok';
}
/** 严重级 → 面板文案键（config-manager-recovery 命名空间）。 */
export const SESSION_SEVERITY_KEYS = {
    blocksStartup: 'sessions.severity.blocksStartup',
    unloadable: 'sessions.severity.unloadable',
    nextRequestFails: 'sessions.severity.nextRequestFails',
    invisible: 'sessions.severity.invisible',
    ok: 'sessions.severity.ok',
};
/**
 * 需要处理的四档（不含 ok），顺序 = 由重到轻（直接派生自 core 的 `SESSION_HEALTH_SEVERITIES`，
 * 不在展示层另抄一份顺序）。
 *
 * 用途：摘要里的严重级 chips 与列表排序共用同一份顺序 —— 两处各写一遍必然分叉。
 */
export const SESSION_ATTENTION_SEVERITIES = SESSION_HEALTH_SEVERITIES.filter((severity) => severity !== 'ok');
/**
 * 严重级 → **短标签**键（摘要 chips 进屏的那一份）。
 *
 * 为什么另有一份短标签：完整句（`SESSION_SEVERITY_KEYS`，如「会让 DSH 起不来」）在 564px
 * 画布上四档并排必然折行成两行同权重灰字（用户 2026-10-12 反馈「UI 太丑」）。
 * 短标签进屏、完整句仍走 `title` —— 事实一个字不少。
 * `satisfies` 让「新增一档而漏配短标签」在 typecheck 阶段就红灯。
 */
export const SESSION_SEVERITY_SHORT_KEYS = {
    blocksStartup: 'sessions.severityShort.blocksStartup',
    unloadable: 'sessions.severityShort.unloadable',
    nextRequestFails: 'sessions.severityShort.nextRequestFails',
    invisible: 'sessions.severityShort.invisible',
};
/**
 * 严重级 → **进屏的短标签键**（`ok` 档回落完整键）。
 *
 * 单一出口：摘要 chips 与列表行徽章都走它 —— 两处各判一次必然分叉（一处显示「阻断启动」、
 * 另一处显示「会让 DSH 起不来」就是同屏术语漂移）。
 */
export function sessionSeverityShortKey(severity) {
    return severity === 'ok' ? SESSION_SEVERITY_KEYS.ok : SESSION_SEVERITY_SHORT_KEYS[severity];
}
/**
 * 摘要 → 严重级 chips（只保留 count > 0 的档）。
 *
 * 「0 条」的档不渲染：0 值 chip 会被读成「有这一类但不多」，而摘要里真正要回答的是
 * 「哪几档、各多少」。总数另有 tiles 承载，不缺这一条。
 */
export function sessionSeverityChips(summary) {
    if (summary === null)
        return [];
    return SESSION_ATTENTION_SEVERITIES
        .filter((severity) => summary.bySeverity[severity] > 0)
        .map((severity) => ({
        severity,
        shortKey: SESSION_SEVERITY_SHORT_KEYS[severity],
        fullKey: SESSION_SEVERITY_KEYS[severity],
        count: summary.bySeverity[severity],
        badgeKind: sessionSeverityBadgeKind(severity) === 'error' ? 'error' : 'warn',
    }));
}
/** 缺省进屏的问题 chip 条数：564px 画布下超过 2 条就折行、把行卡拉成三行。 */
export const SESSION_ISSUE_CHIP_LIMIT = 2;
/**
 * 问题码 → chip 视图（截断 + 如实计数）。
 *
 * 为什么截断：一行可能有 4~6 条码，全量进屏会让行卡高度随问题数变化、列表节奏被打散；
 * 折叠的条数由 `hidden` 如实回传，界面渲染「还有 N 条」并把全文放进 title。
 */
export function sessionIssueChips(codes, limit = SESSION_ISSUE_CHIP_LIMIT) {
    const size = Number.isInteger(limit) && limit >= 0 ? limit : SESSION_ISSUE_CHIP_LIMIT;
    return { codes: codes.slice(0, size), hidden: Math.max(0, codes.length - size) };
}
/** 字节 → 人类可读体积（与磁盘占用卡同一套阈值，避免两处口径）。 */
export function formatSessionBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0)
        return '';
    if (bytes < 1024)
        return `${bytes} B`;
    const kib = bytes / 1024;
    if (kib < 1024)
        return `${kib.toFixed(1)} KiB`;
    const mib = kib / 1024;
    if (mib < 1024)
        return `${mib.toFixed(1)} MiB`;
    return `${(mib / 1024).toFixed(2)} GiB`;
}
/** 行 → 展示行（纯映射；缺字段不填假值）。 */
/** 严重级是否需要处理（ok = 不需要）。 */
function needsAttention(severity) {
    return severity !== 'ok';
}
/**
 * 行列表：**默认只显示「需要处理」的行**（非 ok），
 * 但**可应用内修复的行一律保留**（哪怕它当前被判为 ok —— 那说明判据分叉，宁可显示也不藏）。
 * 全绿时返回空列表，界面据此渲染空态；「共 N 条」仍在摘要里如实给出总数。
 */
export function sessionHealthRows(response) {
    if (response === null)
        return [];
    const all = response.rows.map((row) => ({
        unitId: row.unitId,
        sessionId: row.sessionId,
        // 展示文本一律先脱敏（标题是用户自由文本，可能含粘贴进来的密钥）；省略由 CSS 单行省略负责
        title: typeof row.title === 'string' && row.title.trim() !== '' ? redact(row.title) : null,
        blank: row.blank === true,
        projectKey: row.projectKey,
        severity: row.severity,
        severityKey: SESSION_SEVERITY_KEYS[row.severity],
        severityShortKey: sessionSeverityShortKey(row.severity),
        badgeKind: sessionSeverityBadgeKind(row.severity),
        issueCodes: row.issues.map((issue) => issue.code),
        issueDetailText: (() => {
            const parts = row.issues
                .map((issue) => issue.detail)
                .filter((detail) => typeof detail === 'string' && detail !== '');
            return parts.length === 0 ? null : redact(parts.join(' · '));
        })(),
        versionText: row.version !== undefined ? 'v' + String(row.version) : null,
        projectKeyText: row.projectKey !== '' ? row.projectKey : null,
        subagent: row.origin === 'subagent',
        sizeText: row.sizeBytes !== undefined ? formatSessionBytes(row.sizeBytes) : null,
        mtimeMs: row.mtimeMs ?? null,
        // 应用内修复只做「能从字节证明」的三类（与执行器 planSessionLogRepair 同源判据）
        repairable: row.issues.some((issue) => sessionIssueRepairable(issue.code)),
    }));
    return all.filter((row) => row.repairable || needsAttention(row.severity));
}
/** 这一档严重级是否需要处理（ok = 不需要；与 healthNeedAttention 同口径）。 */
export function sessionSeverityNeedsAttention(severity) {
    return needsAttention(severity);
}
export function sessionHealthSummaryView(response) {
    if (response === null)
        return null;
    const by = response.summary.bySeverity;
    const needsAttention = by.blocksStartup + by.unloadable + by.nextRequestFails + by.invisible;
    return {
        needsAttention,
        bySeverity: { ...by },
        total: response.summary.total,
        deepUnverified: response.summary.deepUnverified,
        deepVerified: response.summary.deepVerified,
        untested: response.summary.untested,
        unreadableEntries: response.summary.unreadableEntries,
        targetFormatVersion: response.targetFormatVersion,
        allHealthy: response.summary.total === 0 ? true : needsAttention === 0,
        // 只数**返回行**里的可修复条数（没回传的行界面看不到，也就不该给它入口）
        repairable: response.rows.filter((row) => row.issues.some((issue) => sessionIssueRepairable(issue.code))).length,
        hiddenHealthy: response.rows.filter((row) => row.severity === 'ok' && !row.issues.some((issue) => sessionIssueRepairable(issue.code))).length,
    };
}
/** 空态判定：没有会话数据（不是错误）。 */
export function sessionHealthEmpty(response) {
    return response !== null && response.summary.total === 0;
}
/** 截断提示（>0 时必须显示）。 */
export function sessionHealthTruncated(response) {
    return response?.truncated ?? 0;
}
/**
 * 每行的「复制修复命令」（离线）。
 *
 * 为什么仍然保留：应用内修复（T8）只覆盖「重放重复行」这一零损失类；其它损坏类别
 * （seq 空洞 / 不可解析行 / 容器非法 / 格式超前 …）仍然只能离线处理，所以这条出路必须一直在。
 * 按问题码精细生成命令会给人「点一下就能修」的错觉 —— 那是错的。
 */
export function sessionRepairCommands() {
    return [
        { command: 'dsh-config-manager sessions doctor --json', reason: 'diagnose' },
        { command: 'dsh-config-manager sessions repair', reason: 'preview' },
        { command: 'dsh-config-manager sessions repair --fix', reason: 'apply' },
    ];
}
/** 修复失败/提示原因 → 文案键（config-manager-recovery 命名空间；未知原因回退通用文案）。 */
export const SESSION_REPAIR_REASON_KEYS = {
    'unknown-unit': 'sessions.repair.reason.unknownUnit',
    'not-found': 'sessions.repair.reason.notFound',
    locked: 'sessions.repair.reason.locked',
    busy: 'sessions.repair.reason.busy',
    changed: 'sessions.repair.reason.changed',
    'repair-not-found': 'sessions.repair.reason.repairNotFound',
    'already-rolled-back': 'sessions.repair.reason.alreadyRolledBack',
    unavailable: 'sessions.repair.reason.unavailable',
    unreadable: 'sessions.repair.reason.unreadable',
    'corrupt-container': 'sessions.repair.reason.corruptContainer',
    'torn-tail': 'sessions.repair.reason.tornTail',
    'invalid-header': 'sessions.repair.reason.invalidHeader',
    'nothing-to-fix': 'sessions.repair.reason.nothingToFix',
    'lossy-required': 'sessions.repair.reason.lossyRequired',
    'verification-refused': 'sessions.repair.reason.verificationRefused',
    'write-failed': 'sessions.repair.reason.writeFailed',
    'postcheck-failed': 'sessions.repair.reason.postcheckFailed',
    'backup-invalid': 'sessions.repair.reason.backupInvalid',
    // M2 缺口⑥：写后真 codec 复验未通过（已按安全序列处置）与回滚时目标又被改过 —— 过去只落到通用「未知原因」文案
    'verify-failed': 'sessions.repair.reason.verifyFailed',
    'target-changed': 'sessions.repair.reason.targetChanged',
    unknown: 'sessions.repair.reason.unknown',
};
/** 机器可读原因 → 字典键（未知原因一律回退 unknown，**绝不**把裸枚举渲染出去）。 */
export function sessionRepairReasonKey(reason) {
    if (reason !== undefined && Object.prototype.hasOwnProperty.call(SESSION_REPAIR_REASON_KEYS, reason)) {
        return SESSION_REPAIR_REASON_KEYS[reason];
    }
    return SESSION_REPAIR_REASON_KEYS.unknown;
}
/** 写后复验三态（+ 一个危险态）→ 文案键（config-manager-recovery 命名空间）。 */
export const SESSION_REPAIR_VERIFY_KEYS = {
    current: 'sessions.repair.verify.current',
    migrated: 'sessions.repair.verify.migrated',
    unverified: 'sessions.repair.verify.unverified',
    rollbackFailed: 'sessions.repair.verify.rollbackFailed',
};
/**
 * 写后真 codec 复验结论 → 文案键（**三态 + 一个危险态**；undefined → null，绝不臆造「已验证」）。
 *
 *  · rolledBack === false  → rollbackFailed（**最高优先**）：复验确定性失败、且自动回滚**没成功**
 *    ⇒ 目标当前仍是「修复后字节」，这是危险态，必须压过其它一切叙述；
 *  · verified && equivalentToReadPath  → current（现役读盘可读）；
 *  · verified && !equivalentToReadPath → migrated（迁移链可还原，**不等于**现役读盘可读）；
 *  · !verified → unverified（**未验证 ≠ 已验证**）；
 *  · verify === undefined → null（没回传复验结论就不添油加醋；预览路径就是这一态）。
 *
 * 判定全部落在这个纯函数里：组件只拿返回值去查字典，不在 JSX 里写三态判断。
 */
export function sessionRepairVerifyKey(verify, rolledBack) {
    if (rolledBack === false)
        return SESSION_REPAIR_VERIFY_KEYS.rollbackFailed;
    if (verify === undefined)
        return null;
    if (!verify.verified)
        return SESSION_REPAIR_VERIFY_KEYS.unverified;
    return verify.equivalentToReadPath ? SESSION_REPAIR_VERIFY_KEYS.current : SESSION_REPAIR_VERIFY_KEYS.migrated;
}
/**
 * 一次 `repairSession` 调用的结果 → 批量条目（成功 / 失败**两条分支的唯一搬运**）。
 *
 * 只搬真实存在的字段（缺字段不填假值）：verify 缺席 = 没做/没回传复验，
 * 界面据此**不渲染**任何复验结论，也绝不臆造「已验证」。
 */
export function sessionRepairBatchEntry(input) {
    const entry = { unitId: input.unitId, sessionId: input.sessionId, ok: input.ok };
    if (input.reason !== undefined)
        entry.reason = input.reason;
    if (input.lossy === true)
        entry.lossy = true;
    if (input.droppedRows !== undefined)
        entry.droppedRows = input.droppedRows;
    if (input.transportError !== undefined)
        entry.transportError = input.transportError;
    if (input.verify !== undefined)
        entry.verify = input.verify;
    if (input.rolledBack !== undefined)
        entry.rolledBack = input.rolledBack;
    return entry;
}
export function sessionRepairEntries(response) {
    const raw = response?.repairs;
    if (raw === undefined)
        return [];
    return raw
        .filter((entry) => typeof entry?.repairId === 'string' && entry.repairId !== '')
        .map((entry) => ({
        repairId: entry.repairId,
        unitId: entry.unitId,
        sessionId: entry.sessionId,
        logName: entry.logName ?? null,
        backupName: entry.backupName ?? null,
        at: entry.at ?? null,
        droppedRows: entry.droppedRows ?? 0,
        rolledBack: entry.rolledBackAt !== undefined,
    }))
        .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}
export function sessionHealthPhase(state) {
    if (state.error !== null)
        return 'error';
    if (state.loading)
        return 'loading';
    return state.response === null ? 'idle' : 'ready';
}
//# sourceMappingURL=session-inventory-view.js.map