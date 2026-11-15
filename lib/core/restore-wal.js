/**
 * 恢复的逐动作 WAL（crash 后可判进度，别再退回「整笔不透明」）。
 *
 * 为什么需要：恢复是**多动作**的破坏性操作（整文件还原/删除 → 插件卸载 → file 类补偿）。
 * 执行到一半被 SIGKILL 时，journal 以前只有 operation intent（APPLYING + 零 step + snapshotId=null），
 * 于是 reconcile 只能给出「needs-attention + SAFE MODE」，说不出「哪些还原了、哪些没动」。
 *
 * 语义（与导入引擎 analyzer.ts 的 WAL 完全同构，别另立一套）：
 *  1. **首个写之前**把**全部**会动盘的动作登记为 `planned` 并带上 beforeFp —— 这是关键：
 *     没登记的动作 reconcile 根本不知道存在，只登记「已执行的」会让「崩在第 2 步」被误判成
 *     「全部完成」（recovered）。预登记把「还没做的」变成可证明的「未应用」。
 *  2. 每个动作执行完 → 更新为 `done` + afterFp（重读磁盘算）；失败/不可证明 → `attention`。
 *  3. 删除类动作的期望态是「文件不存在」，用 `ABSENT_FINGERPRINT` 哨兵表达（见 journal.ts）。
 *  4. 插件卸载是外部副作用（可能只改了 package.json 还没 prune node_modules）→ external=true、
 *     不带指纹 ⇒ reconcile 一律保守（unknown → needs-attention）。**刻意不自证**，绝不谎报完成。
 *
 * 判定端不在本模块：reconcile 用 phase3-host 的 verifyStepFingerprint / probeExternal 消费这些 step。
 */
import fs from 'node:fs/promises';
import { sha256Hex } from '../utils/hashing.js';
import { ABSENT_FINGERPRINT } from './journal.js';
/**
 * 会写盘的动作种类白名单。`credentialHint` / `skip` 无副作用，**不登记** ——
 * 登记它们只会给 reconcile 增加永远无法证明的项（把能判 recovered 的场景拖成 needs-attention）。
 */
const WAL_KINDS = new Set([
    'hostFileRestore',
    'hostFileRemove',
    'fileRestore',
    'fileRemove',
    'pluginRemove',
    'pluginInstall',
]);
/** 插件类动作 = 外部副作用（不带文件指纹；reconcile 恒走保守分支）。 */
export function isExternalPluginKind(kind) {
    return kind === 'pluginRemove' || kind === 'pluginInstall';
}
export function isWalActionKind(kind) {
    return WAL_KINDS.has(kind);
}
/**
 * 目标文件的内容指纹。
 *  - 正常：sha256 十六进制
 *  - 文件不存在（ENOENT/ENOTDIR）：`ABSENT_FINGERPRINT`（= 可证明「本来就没有」）
 *  - 其它 IO/权限错误：null（不可指纹 → reconcile 走保守分支，绝不猜）
 */
export async function restoreFingerprint(abs) {
    if (abs === null)
        return null;
    try {
        return sha256Hex(await fs.readFile(abs));
    }
    catch (error) {
        const code = error.code;
        return code === 'ENOENT' || code === 'ENOTDIR' ? ABSENT_FINGERPRINT : null;
    }
}
/**
 * 生成 WAL 句柄。`journal` 缺失或没有 recordStep ⇒ 返回 null（零开销，旧行为不变）。
 */
export function createRestoreWal(journal) {
    const record = journal?.recordStep;
    if (record === undefined)
        return null;
    return {
        async preRegister(entries) {
            const out = [];
            for (const entry of entries) {
                if (!isWalActionKind(entry.kind)) {
                    out.push(undefined);
                    continue;
                }
                // 插件装卸：外部副作用，刻意不带指纹（probeExternal 会得 unknown → 保守）。
                const external = isExternalPluginKind(entry.kind);
                const ref = external ? '' : (entry.abs ?? '');
                const beforeFp = external ? null : await restoreFingerprint(entry.abs);
                const id = stepIdOf(entry, ref);
                await record({
                    id,
                    adapter: 'restore',
                    kind: entry.kind,
                    ref,
                    external,
                    status: 'planned',
                    beforeFp,
                    afterFp: null,
                });
                out.push({ id, kind: entry.kind, ref, external, beforeFp });
            }
            return out;
        },
        async settle(handle, status, message) {
            if (handle === undefined)
                return;
            const afterFp = handle.external ? null : await restoreFingerprint(handle.ref === '' ? null : handle.ref);
            await record({
                id: handle.id,
                adapter: 'restore',
                kind: handle.kind,
                ref: handle.ref,
                external: handle.external,
                status,
                beforeFp: handle.beforeFp,
                afterFp,
                message: message ?? null,
            });
        },
    };
}
/**
 * step id：**由动作语义派生**而非计划下标 —— 崩溃后磁盘状态变化会让计划下标漂移
 * （已经还原过的文件不再产生 restore 动作），语义 id 才能跨两次执行对上同一条 step。
 *
 * 导出（连同 restoreWalSubject）：续跑判定必须用**同一条规则**反查 journal 里的 step，
 * 两处各写一份就会在改规则时静默错位（判定说「计划漂移」而其实只是 id 算法不同）。
 */
export function restoreStepId(kind, subject) {
    return `restore:${kind}:${subject}`;
}
/** step id 的 subject 段：插件卸载用包名，其余用绝对路径（拿不到绝对路径时退回流相对 target）。 */
export function restoreWalSubject(kind, pluginName, refOrTarget) {
    return isExternalPluginKind(kind) ? (pluginName ?? refOrTarget) : refOrTarget;
}
function stepIdOf(entry, ref) {
    return restoreStepId(entry.kind, restoreWalSubject(entry.kind, entry.pluginName, ref || (entry.target ?? '')));
}
/** 计划动作 → step id（调用方比对「这条动作是否已证明完成」时必须用同一规则）。 */
export function restoreActionStepId(action, abs) {
    const ref = isExternalPluginKind(action.kind) ? '' : (abs ?? '');
    return restoreStepId(action.kind, restoreWalSubject(action.kind, action.pluginName, ref || (action.target ?? '')));
}
/**
 * 计划动作 → WAL 条目（只保留会动盘的动作）。`absOf` 把 home 相对目标解析成绝对路径，
 * 解析不了（越界/非法）给 null —— 这类动作在 journal 里恒为不可指纹项，续跑判定会拒绝。
 */
export function collectRestoreWalEntries(actions, absOf) {
    const mutating = [];
    const entries = [];
    for (const action of actions) {
        if (!isWalActionKind(action.kind))
            continue;
        mutating.push(action);
        entries.push({
            kind: action.kind,
            ...(action.target !== undefined ? { target: action.target } : {}),
            ...(action.pluginName !== undefined ? { pluginName: action.pluginName } : {}),
            abs: isExternalPluginKind(action.kind) || action.target === undefined ? null : absOf(action),
        });
    }
    return { mutating, entries };
}
/**
 * 续跑时**不得**重新 preRegister（那会把已完成动作的 beforeFp 覆盖成「执行后内容」，证据全丢）。
 * 改为用 journal 里已有的 step 复原句柄：之后的动作执行完仍要 settle 成 done/attention。
 */
export function restoreWalHandlesFromSteps(entries, steps) {
    return entries.map((entry) => {
        if (!isWalActionKind(entry.kind))
            return undefined;
        const external = isExternalPluginKind(entry.kind);
        const ref = external ? '' : (entry.abs ?? '');
        const id = restoreStepId(entry.kind, restoreWalSubject(entry.kind, entry.pluginName, ref || (entry.target ?? '')));
        const known = steps[id];
        if (known === undefined)
            return undefined;
        return { id, kind: entry.kind, ref, external, beforeFp: known.beforeFp };
    });
}
//# sourceMappingURL=restore-wal.js.map