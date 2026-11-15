/**
 * 离线会话修复规划（issue #45 Fix 3，**纯函数**：零 IO、零字节操作）。
 *
 * 场景：DSH 已经起不来（实测报 corrupt session log / duplicate JSONL session id），插件也就加载不了，
 * 因此在线路径（导入期护栏 / 「会话归位」卡片）全部不可用 —— 唯一可用的通道是 CLI 离线修复。
 * 本模块只做「怎么修」的判定；读写字节与搬目录在 src/cli/sessions-repair.ts（宿主侧）。
 *
 * 判定口径（与在线 planner 的 projectKey 口径完全一致，共用 projectKeyOf）：
 *   1. 同一 id 出现在多个 projectKey 目录 → duplicate-id：**只在用户点名 --keep 时**才隔离其它副本
 *      （否则只报告：谁是权威副本是用户才知道的事，猜错就是删数据）；
 *   2. 目录内有 session.lock → 不动（可能正被其它进程使用）；
 *   3. header 读不出 cwd → 不动（DSH 的 _no-cwd 会话；猜错会让下次启动更糟）；
 *   4. 命中路径映射且与原 cwd 不同 → 先改写首帧 header 再搬目录（rewrite-move）；
 *   5. 否则只按 header 的 cwd 把目录搬到 projectKeyOf(cwd)（move）——**不需要映射**：
 *      位置与 header 一致之后 DSH 就能启动，剩下的「认到本机工作区」交给在线归位卡片。
 */
import { normalizePath } from '../utils/paths.js';
import { projectKeyOf } from './session-meta.js';
import { applyPathMapping } from './path-mapping.js';
function emptySummary() {
    return { scanned: 0, ok: 0, move: 0, rewriteMove: 0, skip: 0, keep: 0, quarantine: 0, duplicates: 0 };
}
/** 路径等价（大小写不敏感 + 分隔符归一；Windows 盘符大小写常不一致）。 */
function sameDir(a, b) {
    return normalizePath(a).toLowerCase() === normalizePath(b).toLowerCase();
}
/**
 * 规划离线修复（纯函数；顺序稳定 = 输入顺序）。
 */
export function planSessionRepair(sessions, options = {}) {
    const plan = { actions: [], summary: emptySummary() };
    const mappings = options.mappings ?? [];
    const byId = new Map();
    for (const session of sessions) {
        const list = byId.get(session.sessionId);
        if (list === undefined)
            byId.set(session.sessionId, [session]);
        else
            list.push(session);
    }
    const countedDuplicates = new Set();
    for (const session of sessions) {
        const group = byId.get(session.sessionId) ?? [];
        plan.summary.scanned += 1;
        const push = (action) => {
            plan.actions.push(action);
            if (action.kind === 'ok')
                plan.summary.ok += 1;
            else if (action.kind === 'move')
                plan.summary.move += 1;
            else if (action.kind === 'rewrite-move')
                plan.summary.rewriteMove += 1;
            else if (action.kind === 'skip')
                plan.summary.skip += 1;
            else if (action.kind === 'keep')
                plan.summary.keep += 1;
            else if (action.kind === 'quarantine')
                plan.summary.quarantine += 1;
        };
        // 1. 重复 id：只在用户点名保留谁时才隔离其它副本（否则只报告）
        if (group.length > 1) {
            if (!countedDuplicates.has(session.sessionId)) {
                countedDuplicates.add(session.sessionId);
                plan.summary.duplicates += 1;
            }
            const kept = options.keep !== undefined && sameDir(options.keep, session.dir);
            push({
                kind: kept ? 'keep' : 'quarantine',
                sessionId: session.sessionId,
                dir: session.dir,
                fromProjectKey: session.fromProjectKey,
                reason: 'duplicate-id',
                // 被保留下来的那份也要继续参与位置修复，所以它不算「已处理」；
                // 隔离副本只在用户点名 keep 时才允许落盘。
                applies: !kept && options.keep !== undefined,
            });
            continue;
        }
        // 2. 加锁 / 多 generation 不一致 / 缺 cwd：只报告
        if (session.locked === true) {
            push({ kind: 'skip', sessionId: session.sessionId, dir: session.dir, fromProjectKey: session.fromProjectKey, reason: 'locked', applies: false });
            continue;
        }
        if (session.consistent === false) {
            push({ kind: 'skip', sessionId: session.sessionId, dir: session.dir, fromProjectKey: session.fromProjectKey, reason: 'inconsistent-generations', applies: false });
            continue;
        }
        if (session.cwd === undefined || session.cwd === '') {
            push({ kind: 'skip', sessionId: session.sessionId, dir: session.dir, fromProjectKey: session.fromProjectKey, reason: 'no-cwd', applies: false });
            continue;
        }
        // 3. 目标 cwd：命中映射就用映射后的值（并需要改写首帧），否则沿用原文
        const mapped = applyPathMapping(session.cwd, mappings);
        const toProjectKey = projectKeyOf(mapped ?? session.cwd);
        const rewrite = mapped === null ? undefined : { from: session.cwd, to: mapped };
        if (rewrite === undefined && toProjectKey === session.fromProjectKey) {
            push({ kind: 'ok', sessionId: session.sessionId, dir: session.dir, fromProjectKey: session.fromProjectKey, toProjectKey, reason: 'already-placed', applies: false });
            continue;
        }
        push({
            kind: rewrite === undefined ? 'move' : 'rewrite-move',
            sessionId: session.sessionId,
            dir: session.dir,
            fromProjectKey: session.fromProjectKey,
            toProjectKey,
            ...(rewrite !== undefined ? { rewrite } : {}),
            reason: rewrite === undefined ? 'needs-move' : 'needs-rewrite-move',
            applies: true,
        });
    }
    return plan;
}
/** 报告里是否需要用户介入（重复项 / 跳过项 / 待搬迁项）。 */
export function sessionRepairNeedsAttention(plan) {
    const s = plan.summary;
    return s.move > 0 || s.rewriteMove > 0 || s.skip > 0 || s.duplicates > 0;
}
//# sourceMappingURL=session-repair.js.map