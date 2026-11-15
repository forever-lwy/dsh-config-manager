/**
 * Trae 来源的翻译层（wiring + draftOf）。
 *
 * evidence 与 truth-table.ts 的 trae 行一致（fixture：单测用**真实 SQLite 库**做夹具端到端跑；
 * 真机无 Trae 安装）。
 */
import { draftFromTranscript, sessionSourceOf } from './session-source.js';
import { readTrae, traeDetectSkips, traeProbePaths } from './read-trae.js';
export const traeWiring = {
    id: 'trae',
    evidence: 'fixture',
    probePaths: (opts) => traeProbePaths(opts),
    // detect 期就预告「为什么没有会话」（密钥错 / 超限 / 旧库无候选键），别等 build 的 400
    probeSkips: (opts) => traeDetectSkips(opts),
    read: (opts) => readTrae(opts),
    draftOf: (file) => draftFromTranscript(file.id, file, 'trae'),
};
export function createTraeSource() {
    return sessionSourceOf(traeWiring);
}
export const traeSource = createTraeSource();
//# sourceMappingURL=trae.js.map