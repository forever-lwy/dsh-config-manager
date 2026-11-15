/**
 * 问题码 → config-manager-recovery 词典键。
 *
 * satisfies 让 core 的 SessionHealthIssueCode 成为单一事实源：新增一条码而漏映射，
 * npm run typecheck 直接红灯（不会静默上屏英文枚举）。
 */
export const SESSION_ISSUE_KEYS = {
    'duplicate-id': 'sessions.issue.duplicateId',
    'location-mismatch': 'sessions.issue.locationMismatch',
    'header-unreadable': 'sessions.issue.headerUnreadable',
    'torn-tail': 'sessions.issue.tornTail',
    'corrupt-frame': 'sessions.issue.corruptFrame',
    'unparsable-event': 'sessions.issue.unparsableEvent',
    'replay-duplicate-rows': 'sessions.issue.replayDuplicateRows',
    'synthetic-closer': 'sessions.issue.syntheticCloser',
    'seq-gap': 'sessions.issue.seqGap',
    'missing-message-id': 'sessions.issue.missingMessageId',
    'empty-tool-call-id': 'sessions.issue.emptyToolCallId',
    'dangling-tool-call': 'sessions.issue.danglingToolCall',
    'tool-result-id-mismatch': 'sessions.issue.toolResultIdMismatch',
    'duplicate-tool-call-id': 'sessions.issue.duplicateToolCallId',
    'invalid-settlement': 'sessions.issue.invalidSettlement',
    'closed-turn-continued': 'sessions.issue.closedTurnContinued',
    'format-newer': 'sessions.issue.formatNewer',
    'unregistered-workspace': 'sessions.issue.unregisteredWorkspace',
    'subagent-without-parent': 'sessions.issue.subagentWithoutParent',
};
/** 未知码的回落键（与 sessions.layout.reason.unknown 同一条「绝不裸渲染」判据）。 */
export const SESSION_ISSUE_UNKNOWN_KEY = 'sessions.issue.unknown';
/** 全部已知问题码（运行时清单；satisfies 已保证与 core 联合类型同集合）。 */
export const SESSION_ISSUE_CODES = Object.keys(SESSION_ISSUE_KEYS);
/**
 * 单个问题码 → 词典键；未知码回落 sessions.issue.unknown。
 *
 * 判据是「**自有键**」而不是取值是否为 undefined：直接 table[code] 会让
 * '__proto__' / 'constructor' / 'toString' 这类继承键返回原型上的成员（不是字符串），
 * 渲染出来变成 "[object Object]"。真实码都带连字符，但回退路径必须是纯函数式的确定行为。
 */
export function sessionIssueKey(code) {
    if (!Object.prototype.hasOwnProperty.call(SESSION_ISSUE_KEYS, code))
        return SESSION_ISSUE_UNKNOWN_KEY;
    return SESSION_ISSUE_KEYS[code] ?? SESSION_ISSUE_UNKNOWN_KEY;
}
/** 一行的问题码 → 可渲染文本（按传入顺序，中段分隔与其它面板一致）。 */
export function sessionIssuesText(codes, t) {
    return codes.map((code) => t(sessionIssueKey(code))).join(' · ');
}
//# sourceMappingURL=session-issue-labels.js.map