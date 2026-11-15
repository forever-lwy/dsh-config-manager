/**
 * Vibe 来源的翻译层（wiring + draftOf）。
 *
 * evidence 与 truth-table.ts 的 vibe 行一致（fixture：单测按同一份布局建夹具端到端跑；真机无 ~/.vibe）。
 * 会话目录由「目录里有 messages.jsonl」自证并**递归**收集（不再只认 session_ 前缀、不只扫一层）；
 * cwd 取 meta.environment.working_directory / origin_directory。probeEnvKeys 只登记
 * **VIBE_HOME**（真正的来源位置覆盖）；report 期只回键名，绝不回值。
 */
import { draftFromTranscript, sessionSourceOf } from './session-source.js';
import { readVibe, vibeSessionRoots } from './read-vibe.js';
export const vibeWiring = {
    id: 'vibe',
    evidence: 'fixture',
    probePaths: (opts) => vibeSessionRoots(opts),
    probeEnvKeys: ['VIBE_HOME'],
    read: (opts) => readVibe(opts),
    draftOf: (file) => draftFromTranscript(file.id, file, 'vibe'),
};
export function createVibeSource() {
    return sessionSourceOf(vibeWiring);
}
export const vibeSource = createVibeSource();
//# sourceMappingURL=vibe.js.map