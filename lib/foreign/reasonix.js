/**
 * Reasonix 来源的翻译层（wiring + draftOf）。
 *
 * evidence 与 truth-table.ts 的 reasonix 行一致（fixture = 单测按同一份布局建夹具端到端跑；
 * 本机无 ~/.reasonix 安装，真机未验证）。
 */
import { draftFromTranscript, sessionSourceOf } from './session-source.js';
import { readReasonix, reasonixSessionRoots } from './read-reasonix.js';
export const reasonixWiring = {
    id: 'reasonix',
    evidence: 'fixture',
    probePaths: (opts) => reasonixSessionRoots(opts),
    read: (opts) => readReasonix(opts),
    draftOf: (file) => draftFromTranscript(file.id, file, 'reasonix'),
};
export function createReasonixSource() {
    return sessionSourceOf(reasonixWiring);
}
export const reasonixSource = createReasonixSource();
//# sourceMappingURL=reasonix.js.map