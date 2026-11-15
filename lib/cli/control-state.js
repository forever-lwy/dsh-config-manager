/**
 * 救急台与 CLI 共用的**只读事实层**：进程存活、心跳实例、SAFE MODE 标记、环境锁状态。
 *
 * 为什么单独成文件：这四件事是「写动作前置门」与首页聚合共同依赖的最小事实集，原先挤在
 * 1600 行的 actions.ts 里（体量棘轮已顶格）。这里**只放读取**，判据仍只由 core/utils 给，
 * 绝不因为「看起来像残留」就自行回收（回收只有显式命令一条路）。
 */
import fssync from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { readSafeModeMarkerSync, safeModeMarkerPath } from '../core/phase3-host.js';
import { parseRuntimeRecord, RUNTIME_STALE_MS } from '../profiles/dsh-profile-runtime.js';
import { EnvironmentLockManager, OWNERSHIP_FILE } from '../utils/env-lock.js';
/* ------------------------------------------------------------ 进程/实例事实 */
/** 进程是否存活（不发送信号，只探测）。EPERM = 存在但无权限发信号 → 仍算存活。 */
export function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return error.code === 'EPERM';
    }
}
/**
 * 读「本机正在跑的 DSH 实例」。
 *
 * **为什么按候选根扫描**：心跳在 `<插件 dataDir>/running/`，而 CLI 的 `--data-dir` 语义是
 * 「快照目录」（缺省 `$DSH_HOME/dsh-config-manager/snapshots`）。旧实现把快照目录当 dataDir 用，
 * 于是缺省路径下**永远找不到心跳** —— 那道「DSH 在跑就别写会话字节」的门形同虚设（fail-open）。
 * 这里改为复用 `resolveControlRoots` 的候选根：显式 `--data-root` 只认它，否则同时看
 * `--data-dir` 本身与它的父目录，再叠加缺省根；多查几处只会更保守。
 */
export async function readRunningInstances(controlRoots) {
    const alive = [];
    const seen = new Set();
    const now = Date.now();
    for (const root of controlRoots) {
        const dir = path.join(root, 'running');
        let names;
        try {
            names = (await fsp.readdir(dir)).filter((n) => n.endsWith('.json'));
        }
        catch {
            continue; // 该候选根没有心跳目录：正常情况，不阻断
        }
        for (const name of names) {
            try {
                const record = parseRuntimeRecord(await fsp.readFile(path.join(dir, name), 'utf8'));
                if (record === null)
                    continue;
                if (!isProcessAlive(record.pid) || now - record.updatedAt > RUNTIME_STALE_MS)
                    continue;
                const key = record.name + '#' + String(record.pid);
                if (seen.has(key))
                    continue;
                seen.add(key);
                alive.push({
                    name: record.name,
                    pid: record.pid,
                    port: record.port,
                    startedAt: record.startedAt,
                    updatedAt: record.updatedAt,
                });
            }
            catch {
                // 单条心跳读不出来不阻断（best-effort）
            }
        }
    }
    return alive;
}
/** 逐个候选根读 SAFE MODE 标记（fail-closed 的判定仍在 CLI/core；这里只报事实）。 */
export function readSafeMode(controlRoots) {
    return controlRoots.map((root) => ({
        root,
        marker: safeModeMarkerPath(root),
        state: readSafeModeMarkerSync(root),
        established: fssync.existsSync(root) || fssync.existsSync(path.join(root, 'transactions')),
    }));
}
/**
 * 读环境锁状态（只读）。
 *
 * 复用宿主/CLI 同一套 `inspectLockState`：**绝不**因为「看起来是残留」就自动回收 ——
 * 回收只有显式命令一条路（`recover-stale-lock`）。
 */
export async function readLockState(locksDir) {
    const present = await pathExists(path.join(locksDir, OWNERSHIP_FILE));
    if (!present)
        return { locksDir, present: false, state: 'NONE' };
    const lock = new EnvironmentLockManager({ locksDir, op: 'rescue-console-inspect', target: locksDir, lockVersion: '0.1.0' });
    const inspection = await lock.inspectLockState();
    return inspection.detail === undefined
        ? { locksDir, present: true, state: inspection.state }
        : { locksDir, present: true, state: inspection.state, detail: inspection.detail };
}
async function pathExists(target) {
    try {
        await fsp.stat(target);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=control-state.js.map