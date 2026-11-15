/**
 * 会话体检的**纯分类器**（T3；零 IO、零字节操作）—— 设计稿 §10.2 的损坏分类 + 可见性维度。
 *
 * 分层纪律（AGENTS.md）：core 不得 import 会话字节工具（`utils/session-log*` / `utils/zstd-frame`）。
 * 所以本模块只消费**已经读出来的事实**（首帧 header 字段 / 结构扫描结论 / 可选深度校验结论），
 * 真正的读字节在宿主侧 `utils/session-health-scan.ts`。
 *
 * 严重级排序（设计稿 §10.4，最高在前）：
 *   blocksStartup > unloadable > nextRequestFails > invisible > ok
 * 为什么「会让 DSH 起不来」必须最高：workspace 插件启动期枚举到一份坏会话日志时，
 * Web 会**永远到不了工作区选择页**（handbook #4855）—— 那不是「少一条对话」，是整机不可用。
 *
 * 绝不猜：读不到 = 对应事实缺省 → 不产生该条结论（宁可不报，也绝不谎报「已验证」）。
 */
import { projectKeyOf } from './session-meta.js';
import { sessionIdKey } from './session-select.js';
/** 供宿主复用：cwd/路径 → projectKey（避免两处口径漂移）。 */
export { projectKeyOf };
export const SESSION_HEALTH_SEVERITIES = [
    'blocksStartup', 'unloadable', 'nextRequestFails', 'invisible', 'ok',
];
const SEVERITY_RANK = {
    blocksStartup: 0, unloadable: 1, nextRequestFails: 2, invisible: 3, ok: 4,
};
/**
 * 一条会话的全部问题（顺序 = 严重级由重到轻，同级按检查顺序）。
 *
 * 每个分支都只在**事实存在**时产出问题：读不到的字段不产生结论。
 */
export function sessionHealthIssues(input, ctx) {
    const issues = [];
    // 同一 code 只留一条：重复出现时取**更重**的严重级（不因一条较轻的重复记录把结论说轻）。
    const push = (code, severity, detail) => {
        const existing = issues.find((issue) => issue.code === code);
        if (existing !== undefined) {
            if (SEVERITY_RANK[severity] < SEVERITY_RANK[existing.severity]) {
                existing.severity = severity;
                if (detail !== undefined)
                    existing.detail = detail;
            }
            return;
        }
        issues.push(detail === undefined ? { code, severity } : { code, severity, detail });
    };
    // ---- 1. 会让 DSH 起不来的两件事（最高优先级） ----
    if (ctx.duplicateSessionIds?.has(sessionIdKey(input.sessionId)) === true) {
        push('duplicate-id', 'blocksStartup', input.sessionId);
    }
    const cwd = input.headerCwd;
    if (cwd !== undefined && cwd !== '') {
        const expected = projectKeyOf(cwd);
        if (expected !== input.projectKey) {
            push('location-mismatch', 'blocksStartup', input.projectKey + ' ≠ ' + expected);
        }
    }
    // ---- 2. 结构层面：容器/首帧读不出来 ----
    if (input.structural.headerUnreadable === true) {
        push('header-unreadable', 'unloadable', String(input.logFiles === 0 ? 'no-log' : 'header'));
    }
    if (input.structural.corruptReason !== undefined) {
        push('corrupt-frame', 'unloadable', input.structural.corruptReason);
    }
    else if (input.structural.ok === false && input.structural.headerUnreadable !== true) {
        // 结构扫描明确失败但读不出 header（如 0 字节文件）：不猜具体原因，只如实标记
        push('header-unreadable', 'unloadable', 'unreadable');
    }
    if (input.structural.tornTail === true) {
        // 设计稿 §10.2：撕裂的末尾帧 DSH **自愈**（无需修复）—— 只提示，不升级严重级
        push('torn-tail', 'ok', 'self-healing');
    }
    // ---- 3. 深度校验（可选）：只有真的用 DSH codec 校验过才下结论 ----
    const deep = input.deep;
    if (deep !== undefined && deep.verified) {
        for (const issue of deep.issues ?? []) {
            // 行档采集器可给出**实测**的严重级（如「step 已闭合的悬空 tool/call」）；缺省才回落静态表。
            push(issue.code, issue.severity ?? DEEP_SEVERITY[issue.code] ?? 'unloadable', issue.detail);
        }
    }
    // ---- 4. 可见性（DSH 不报错，但用户看不见/请求会失败） ----
    if (ctx.targetFormatVersion !== undefined && input.headerVersion !== undefined
        && input.headerVersion > ctx.targetFormatVersion) {
        push('format-newer', 'invisible', 'v' + String(input.headerVersion) + ' > v' + String(ctx.targetFormatVersion));
    }
    if (cwd !== undefined && cwd !== '' && ctx.workspaceKeys.size > 0 && !ctx.workspaceKeys.has(projectKeyOf(cwd))) {
        push('unregistered-workspace', 'invisible', projectKeyOf(cwd));
    }
    // 父子存在性只在**已知集合确实可用**时判：undefined（未知）→ 不报；空集（确知本机没有该父）→ 报。
    // 绝不把「调用方没给集合」读成「本机没有任何会话」。
    if (input.origin === 'subagent' && input.parentSessionId !== undefined && input.parentSessionId !== ''
        && ctx.knownSessionIds !== undefined
        && !ctx.knownSessionIds.has(sessionIdKey(input.parentSessionId))) {
        push('subagent-without-parent', 'invisible', input.parentSessionId);
    }
    // 首帧能读但**没有 cwd**（DSH 的 _no-cwd 会话）：归属无法判定 → 只报告，不猜归属，
    // 也不升级严重级（DSH 能加载它，只是工作区列表里挂不上）。
    if ((cwd === undefined || cwd === '') && input.structural.ok === true && input.structural.headerUnreadable !== true) {
        push('unregistered-workspace', 'invisible', 'no-cwd');
    }
    return issues.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
/**
 * 深度校验问题码 → **回落**严重级（与 §10.2 的后果分类一致）。
 *
 * 这是「问题没有自带 severity 时」的静态默认，不是唯一事实源：行档采集器对四类生命周期问题
 * （缺 message id / 空 tool-call id / 悬空 tool-call / 重复 tool-call id）会用**真 codec 实测**
 * 出的严重级覆盖它（见 `utils/session-health-scan.ts` 的校准注释）。
 */
const DEEP_SEVERITY = {
    'unparsable-event': 'unloadable',
    'replay-duplicate-rows': 'nextRequestFails',
    'synthetic-closer': 'nextRequestFails',
    'seq-gap': 'unloadable',
    'missing-message-id': 'unloadable',
    'empty-tool-call-id': 'unloadable',
    /** 采集器只在**证明 step 已闭合**时才发这个码，而真 codec 对该形状直接拒读（step/end leaves unresolved tool call） */
    'dangling-tool-call': 'unloadable',
    'tool-result-id-mismatch': 'unloadable',
    /** v4/pre-v4 实测被 current/Session.fromRestore 闸门拒读（`assistant/message repeats advertised tool call`） */
    'duplicate-tool-call-id': 'unloadable',
    'invalid-settlement': 'nextRequestFails',
    'closed-turn-continued': 'nextRequestFails',
};
/** 行的严重级 = 其问题里最重的一档（无问题 = ok）。 */
export function sessionHealthSeverityOf(issues) {
    let worst = 'ok';
    for (const issue of issues) {
        if (SEVERITY_RANK[issue.severity] < SEVERITY_RANK[worst])
            worst = issue.severity;
    }
    return worst;
}
/** 单条会话 → 体检行。 */
export function classifySessionHealth(input, ctx) {
    const issues = sessionHealthIssues(input, ctx);
    return {
        unitId: input.unitId,
        sessionId: input.sessionId,
        projectKey: input.projectKey,
        severity: sessionHealthSeverityOf(issues),
        issues,
        ...(input.headerVersion !== undefined ? { version: input.headerVersion } : {}),
        ...(input.headerCwd !== undefined ? { cwd: input.headerCwd } : {}),
        ...(input.origin !== undefined ? { origin: input.origin } : {}),
        ...(input.sizeBytes !== undefined ? { sizeBytes: input.sizeBytes } : {}),
        ...(input.mtimeMs !== undefined ? { mtimeMs: input.mtimeMs } : {}),
    };
}
/**
 * 汇总（纯函数）。
 *
 * 注意 `deepUnverified` 的语义：**不做深度校验也要计入**（界面必须能说「另外 N 条只做了
 * 结构体检，未做深度校验」）—— 把「没检查」说成「没问题」是本轮明确要消灭的那类谎报。
 */
export function analyzeSessionHealth(inputs, ctx) {
    const rows = inputs.map((input) => classifySessionHealth(input, ctx));
    const bySeverity = {
        blocksStartup: 0, unloadable: 0, nextRequestFails: 0, invisible: 0, ok: 0,
    };
    let structurallyChecked = 0;
    let deepVerified = 0;
    for (const input of inputs) {
        if (input.structural.ok || input.structural.headerUnreadable === true || input.structural.corruptReason !== undefined) {
            structurallyChecked += 1;
        }
        if (input.deep?.verified === true)
            deepVerified += 1;
    }
    for (const row of rows)
        bySeverity[row.severity] += 1;
    return {
        rows: rows.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.unitId.localeCompare(b.unitId)),
        summary: {
            total: rows.length,
            bySeverity,
            structurallyChecked,
            deepVerified,
            deepUnverified: rows.length - deepVerified,
        },
    };
}
/** 会话目录名 → 裸会话键（`session-<uuid>` 与裸 `<uuid>` 归一）。 */
export function bareSessionKey(sessionId) {
    return sessionIdKey(sessionId);
}
/** 一条会话是否「需要人工介入」（非 ok）。 */
export function sessionHealthNeedsAttention(row) {
    return row.severity !== 'ok';
}
//# sourceMappingURL=session-health.js.map