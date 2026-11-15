/**
 * 问题码 → config-manager-recovery 词典键。
 *
 * satisfies 让 core 的 SessionHealthIssueCode 成为单一事实源：新增一条码而漏映射，
 * npm run typecheck 直接红灯（不会静默上屏英文枚举）。
 */
export declare const SESSION_ISSUE_KEYS: {
    readonly 'duplicate-id': 'sessions.issue.duplicateId';
    readonly 'location-mismatch': 'sessions.issue.locationMismatch';
    readonly 'header-unreadable': 'sessions.issue.headerUnreadable';
    readonly 'torn-tail': 'sessions.issue.tornTail';
    readonly 'corrupt-frame': 'sessions.issue.corruptFrame';
    readonly 'unparsable-event': 'sessions.issue.unparsableEvent';
    readonly 'replay-duplicate-rows': 'sessions.issue.replayDuplicateRows';
    readonly 'synthetic-closer': 'sessions.issue.syntheticCloser';
    readonly 'seq-gap': 'sessions.issue.seqGap';
    readonly 'missing-message-id': 'sessions.issue.missingMessageId';
    readonly 'empty-tool-call-id': 'sessions.issue.emptyToolCallId';
    readonly 'dangling-tool-call': 'sessions.issue.danglingToolCall';
    readonly 'tool-result-id-mismatch': 'sessions.issue.toolResultIdMismatch';
    readonly 'duplicate-tool-call-id': 'sessions.issue.duplicateToolCallId';
    readonly 'invalid-settlement': 'sessions.issue.invalidSettlement';
    readonly 'closed-turn-continued': 'sessions.issue.closedTurnContinued';
    readonly 'format-newer': 'sessions.issue.formatNewer';
    readonly 'unregistered-workspace': 'sessions.issue.unregisteredWorkspace';
    readonly 'subagent-without-parent': 'sessions.issue.subagentWithoutParent';
};
/** 已知码的文案键联合（词典键，供 t() 编译校验）。 */
export type SessionIssueKey = (typeof SESSION_ISSUE_KEYS)[keyof typeof SESSION_ISSUE_KEYS];
/** 未知码的回落键（与 sessions.layout.reason.unknown 同一条「绝不裸渲染」判据）。 */
export declare const SESSION_ISSUE_UNKNOWN_KEY: 'sessions.issue.unknown';
/** 全部已知问题码（运行时清单；satisfies 已保证与 core 联合类型同集合）。 */
export declare const SESSION_ISSUE_CODES: readonly string[];
/**
 * 单个问题码 → 词典键；未知码回落 sessions.issue.unknown。
 *
 * 判据是「**自有键**」而不是取值是否为 undefined：直接 table[code] 会让
 * '__proto__' / 'constructor' / 'toString' 这类继承键返回原型上的成员（不是字符串），
 * 渲染出来变成 "[object Object]"。真实码都带连字符，但回退路径必须是纯函数式的确定行为。
 */
export declare function sessionIssueKey(code: string): SessionIssueKey | typeof SESSION_ISSUE_UNKNOWN_KEY;
/** 一行的问题码 → 可渲染文本（按传入顺序，中段分隔与其它面板一致）。 */
export declare function sessionIssuesText(codes: readonly string[], t: (key: SessionIssueKey | typeof SESSION_ISSUE_UNKNOWN_KEY) => string): string;
