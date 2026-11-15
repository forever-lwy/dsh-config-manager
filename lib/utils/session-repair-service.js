/**
 * 会话修复的**服务层**（宿主侧；应用内写会话字节的**唯一编排点**）。
 *
 * 分层：utils/session-log-repair.ts 是字节级执行器（校验 → 备份 → 原子换入 → 复验），
 * 本模块负责它周围的**决策与账目**：
 *   ① 目标解析：把体检用的 unitId（projectKey/会话目录）解析成会话根内的真实日志文件，
 *      全程只接受落在 <home>/sessions 之内的路径（防穿越 / 符号链接逃逸）；
 *   ② 写入门（**在 DSH 运行时也只能这么保守**）：目录内有 session.lock 不动；
 *      文件最近 SESSION_REPAIR_QUIESCENT_MS 内被写过 → 视为活跃使用，拒绝；
 *      预览时给出「大小 + mtime」指纹，应用时必须一致（TOCTOU：预览后被改过就拒绝）；
 *   ③ 修复台账（<dataDir>/session-repairs.json）：记录每次修复的备份名、备份 sha256、修复后目标 sha256
 *      与真 codec 复验结论，**回滚只认台账里的 repairId**（客户端永远不能传路径）；
 *   ④ **写后真 codec 复验门**（utils/session-verify.ts）：执行器里的 sessionLogSelfCheck 只证明「结构自洽」，
 *      本层再加一道「本机 DSH 的官方 codec 真能读到底吗」；
 *   ⑤ 回滚：先确认目标仍是我们修完时的那一份（sha256 一致；旧记录退回 size+mtime 指纹）、
 *      备份内容与台账 sha256 一致，再把备份原子换回去。
 *
 * 复验门的三种结论（语义固定；文案映射由界面做）：
 *   · verified:true → 保持成功语义，结果与台账都带上 verify。注意 verify 里还有
 *     **equivalentToReadPath**：true 才是「DSH 现役读盘路径此刻就能直接读」；pre-v4 日志经迁移链还原成功时
 *     verified:true 但 equivalentToReadPath:false（只能说明「迁移链能还原」，不是现役可读）。
 *   · 确定性失败（invalid-header / decode-failed / finish-failed）→ **不发布**：用本次时间戳备份走既有
 *     rollbackSessionLogFile 自动还原（rolledBack 如实回传），返回 ok:false + reason='verify-failed'，
 *     **不写台账**（这次修复没有留下来）。
 *   · unavailable（拿不到可信 codec：没有 catalog / 代际对不上 / 缺子会话事实）→ **不回滚**：
 *     字节已写、结构自检已过，但我们**证明不了** DSH 能加载它；返回 ok:true + verify:{verified:false,...}
 *     并照常写台账（台账是「可回滚凭据」而不是成功声明 —— 不写反而会让这次已生效的写入失去回滚入口）。
 *     ok:true 的含义严格限于「**操作完成**：字节已写 + 结构复验通过」，**不是**「已验证可加载」；
 *     调用方必须据 verify.verified / verify.equivalentToReadPath 区分「现役可读」「迁移链可还原」「未验证」。
 *
 * 「绝不猜」：任何一步证明不了就拒绝，绝不「修得更狠」；台账里的绝对路径不回传浏览器
 * （回传的是 sessionId / 日志文件名 / 备份文件名这些标识，不含目录）。
 */
import fs from 'node:fs/promises';
import { basename, isAbsolute, join, relative } from 'node:path';
import { PROJECT_KEY_RE, isSessionLogName, sessionLogNames } from './session-log.js';
import { parseSessionRepairBackupName, repairSessionLogFile, rollbackSessionLogFile, SESSION_REPAIR_BACKUP_SUFFIX, } from './session-log-repair.js';
import { sha256Hex } from './hashing.js';
import { isSessionVerifyReason, verifySessionLogBytes, } from './session-verify.js';
/** 写入门：日志最近多久被写过就视为「仍在活跃使用」（毫秒）。 */
export const SESSION_REPAIR_QUIESCENT_MS = 30_000;
/** 修复台账文件名（挂在插件数据目录下）。 */
export const SESSION_REPAIR_LEDGER_FILE = 'session-repairs.json';
/** 台账最多保留的修复条数（超出丢最旧；只影响「能不能一键回滚」，备份文件本身不动）。 */
export const SESSION_REPAIR_LEDGER_MAX = 100;
/* --------------------------------------------------------------- 目标解析 */
async function exists(absPath) {
    try {
        await fs.stat(absPath);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * unitId（projectKey/会话目录）→ 会话根内的真实日志文件。
 *
 * 与体检同一口径：同一会话目录有多份 generation 时，取**字典序最后一份**（体检「以最新一份为准」）。
 * 路径安全：段数与形状先校验，再用 realpath + relative 确认目录确实落在会话根之内。
 */
export async function resolveSessionUnit(sessionsDir, unitId) {
    const parts = unitId.split('/');
    if (parts.length !== 2)
        return undefined;
    const projectKey = parts[0];
    const sessionId = parts[1];
    if (projectKey === undefined || sessionId === undefined)
        return undefined;
    if (!PROJECT_KEY_RE.test(projectKey))
        return undefined;
    if (sessionId === '' || sessionId === '.' || sessionId === '..')
        return undefined;
    if (sessionId.includes('\\') || sessionId.includes('/'))
        return undefined;
    const unitDir = join(sessionsDir, projectKey, sessionId);
    let names;
    try {
        const st = await fs.stat(unitDir);
        if (!st.isDirectory())
            return undefined;
        names = await fs.readdir(unitDir);
    }
    catch {
        return undefined;
    }
    const logs = sessionLogNames(names);
    for (let i = logs.length - 1; i >= 0; i -= 1) {
        const logName = logs[i];
        if (logName === undefined)
            continue;
        const file = join(unitDir, logName);
        if (!(await exists(file)))
            continue;
        const realRoot = await fs.realpath(sessionsDir).catch(() => undefined);
        const realUnit = await fs.realpath(unitDir).catch(() => undefined);
        if (realRoot === undefined || realUnit === undefined)
            return undefined;
        const rel = relative(realRoot, realUnit);
        if (rel === '' || rel.startsWith('..') || isAbsolute(rel))
            return undefined;
        return { unitId: projectKey + '/' + sessionId, projectKey, sessionId, unitDir, logName, file };
    }
    return undefined;
}
/**
 * 写入门（应用内写会话字节的**唯一允许时机**）。
 *
 * 为什么不是「先关 DSH」：本插件就跑在 DSH 里，那条闸门等于永远拒绝。可证明的保守判据是
 * 「这条会话**看起来没有活跃写者**」：目录无 session.lock + 文件不在静止期内 + 预览/应用指纹一致。
 * 真正的写入仍由执行器保证（校验不过就拒绝、备份、原子换入、写后复验）。
 */
async function gateForWrite(target, nowMs) {
    if (await exists(join(target.unitDir, 'session.lock')))
        return { ok: false, reason: 'locked' };
    let st;
    try {
        st = await fs.stat(target.file);
    }
    catch {
        return { ok: false, reason: 'not-found' };
    }
    if (!st.isFile())
        return { ok: false, reason: 'not-found' };
    if (nowMs - st.mtimeMs < SESSION_REPAIR_QUIESCENT_MS) {
        return { ok: false, reason: 'busy', size: st.size, mtimeMs: st.mtimeMs };
    }
    return { ok: true, size: st.size, mtimeMs: st.mtimeMs };
}
/* ------------------------------------------------------------------ 台账 */
export function sessionRepairLedgerPath(dataDir) {
    return join(dataDir, SESSION_REPAIR_LEDGER_FILE);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
/** 台账里的 sha256 必须是 64 位小写十六进制；形状不对一律当「没有」（退回旧口径，绝不拿可疑值当判据）。 */
function isSha256Hex(value) {
    return typeof value === 'string' && SHA256_HEX_RE.test(value);
}
/** 台账里的复验结论；形状不对一律当「没有记录过」（绝不猜）。 */
function toVerifyRecord(value) {
    if (!isRecord(value))
        return undefined;
    const verified = value['verified'];
    if (verified === true) {
        const events = value['events'];
        if (typeof events !== 'number' || !Number.isFinite(events) || events < 0)
            return undefined;
        const strong = value['strong'] === true;
        const equivalentToReadPath = value['equivalentToReadPath'] === true;
        const strongDetail = value['strongDetail'];
        return typeof strongDetail === 'string' && strongDetail !== ''
            ? { verified: true, events, strong, strongDetail, equivalentToReadPath }
            : { verified: true, events, strong, equivalentToReadPath };
    }
    if (verified !== false)
        return undefined;
    const reason = value['reason'];
    if (!isSessionVerifyReason(reason))
        return undefined;
    const detail = value['detail'];
    return typeof detail === 'string' && detail !== ''
        ? { verified: false, reason, detail, equivalentToReadPath: false }
        : { verified: false, reason, equivalentToReadPath: false };
}
function toRepairRecord(value) {
    if (!isRecord(value))
        return undefined;
    const repairId = value['repairId'];
    const unitId = value['unitId'];
    const sessionId = value['sessionId'];
    const projectKey = value['projectKey'];
    const logName = value['logName'];
    const backupName = value['backupName'];
    const at = value['at'];
    if (typeof repairId !== 'string' || repairId === '')
        return undefined;
    if (typeof unitId !== 'string' || typeof sessionId !== 'string' || typeof projectKey !== 'string')
        return undefined;
    if (typeof logName !== 'string' || !isSessionLogName(logName))
        return undefined;
    if (typeof backupName !== 'string' || parseSessionRepairBackupName(backupName) === undefined)
        return undefined;
    if (typeof at !== 'number' || !Number.isFinite(at))
        return undefined;
    const num = (key) => {
        const raw = value[key];
        return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    };
    const record = {
        repairId,
        unitId,
        sessionId,
        projectKey,
        logName,
        backupName,
        at,
        droppedRows: num('droppedRows'),
        bytesBefore: num('bytesBefore'),
        bytesAfter: num('bytesAfter'),
        repairedSize: num('repairedSize'),
        repairedMtimeMs: num('repairedMtimeMs'),
    };
    if (value['lossy'] === true)
        record.lossy = true;
    // 新字段**全部可选**：旧台账记录（T8 前的修复、或从更早版本升级上来的）必须照样能读出来，
    // 否则 toRepairRecord 会整条丢弃 → 那些历史修复就再也回滚不了了。
    const backupSha256 = value['backupSha256'];
    if (isSha256Hex(backupSha256))
        record.backupSha256 = backupSha256;
    const targetSha256After = value['targetSha256After'];
    if (isSha256Hex(targetSha256After))
        record.targetSha256After = targetSha256After;
    const verify = toVerifyRecord(value['verify']);
    if (verify !== undefined)
        record.verify = verify;
    const rolledBackAt = value['rolledBackAt'];
    if (typeof rolledBackAt === 'number' && Number.isFinite(rolledBackAt))
        record.rolledBackAt = rolledBackAt;
    return record;
}
/**
 * 读台账（只读；**绝不抛错**）。
 *
 * 读不出来 / 形状不对 → repairs=[] 且带 error 原因：调用方据此**不谎报**「没有可回滚的修复」，
 * 而是在应用期降级为「本次修复没记上账（备份仍在，可手工还原）」。
 */
export async function readSessionRepairLedger(dataDir) {
    const path = sessionRepairLedgerPath(dataDir);
    let raw;
    try {
        raw = await fs.readFile(path, 'utf8');
    }
    catch (error) {
        const code = error.code;
        if (code === 'ENOENT')
            return { repairs: [], exists: false };
        return { repairs: [], error: 'unreadable', exists: true };
    }
    try {
        const parsed = JSON.parse(raw);
        if (!isRecord(parsed) || !Array.isArray(parsed['repairs']))
            return { repairs: [], error: 'malformed', exists: true };
        const repairs = [];
        for (const item of parsed['repairs']) {
            const record = toRepairRecord(item);
            if (record !== undefined)
                repairs.push(record);
        }
        return { repairs, exists: true };
    }
    catch {
        return { repairs: [], error: 'malformed', exists: true };
    }
}
/** 写台账（原子：临时文件 + rename）。返回是否成功；失败绝不抛出。 */
export async function writeSessionRepairLedger(dataDir, repairs) {
    const path = sessionRepairLedgerPath(dataDir);
    const temp = join(dataDir, '.session-repairs-' + Math.random().toString(16).slice(2, 10) + '.tmp');
    try {
        await fs.mkdir(dataDir, { recursive: true });
        await fs.writeFile(temp, JSON.stringify({ version: 1, repairs }, null, 2), 'utf8');
        await fs.rename(temp, path);
        return true;
    }
    catch {
        return false;
    }
    finally {
        await fs.rm(temp, { force: true }).catch(() => { });
    }
}
/** 台账里的修复记录（界面展示用；台账文件损坏时带 error，界面据此如实提示）。 */
export async function listSessionRepairs(dataDir) {
    const ledger = await readSessionRepairLedger(dataDir);
    const out = { repairs: ledger.repairs };
    if (ledger.error !== undefined)
        out.error = ledger.error;
    return out;
}
async function recordRepair(dataDir, record) {
    const ledger = await readSessionRepairLedger(dataDir);
    if (ledger.error !== undefined && ledger.exists) {
        // 台账损坏：先把坏文件改名留档（绝不静默丢弃证据），再写新账
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        await fs.rename(sessionRepairLedgerPath(dataDir), sessionRepairLedgerPath(dataDir) + '.corrupt-' + stamp).catch(() => { });
    }
    const base = ledger.error !== undefined ? [] : ledger.repairs;
    return await writeSessionRepairLedger(dataDir, [record, ...base].slice(0, SESSION_REPAIR_LEDGER_MAX));
}
/** 预览（**只读**）：解析目标 → 过写入门 → 跑一次 apply=false 的执行器。 */
export async function previewSessionRepair(options) {
    const nowMs = (options.now ?? (() => new Date()))().getTime();
    const sessionsDir = join(options.homeDir, 'sessions');
    const target = await resolveSessionUnit(sessionsDir, options.unitId);
    if (target === undefined)
        return { ok: false, reason: 'unknown-unit', unitId: options.unitId };
    const base = { unitId: target.unitId, sessionId: target.sessionId, logName: target.logName };
    const gate = await gateForWrite(target, nowMs);
    if (!gate.ok) {
        return {
            ok: false,
            reason: gate.reason,
            ...base,
            ...(gate.mtimeMs !== undefined ? { mtimeMs: gate.mtimeMs } : {}),
        };
    }
    // 预览是**只读**的：用 allowLossy 算出「完整的计划」给用户看（截断多少行也摆出来），
    // 真正落盘时再要求显式放行（applySessionRepair 的 allowLossy 缺省 false）。
    const outcome = await repairSessionLogFile(target.file, { apply: false, allowLossy: true });
    if (!outcome.ok)
        return { ok: false, reason: outcome.reason ?? 'verification-refused', ...base };
    return {
        ok: true,
        ...base,
        droppedRows: outcome.droppedRows ?? 0,
        ...(outcome.keptRows !== undefined ? { keptRows: outcome.keptRows } : {}),
        ...(outcome.actions !== undefined ? { actions: outcome.actions } : {}),
        lossy: outcome.lossy === true,
        ...(outcome.bytesBefore !== undefined ? { bytesBefore: outcome.bytesBefore } : {}),
        ...(outcome.bytesAfter !== undefined ? { bytesAfter: outcome.bytesAfter } : {}),
        expect: { size: gate.size, mtimeMs: gate.mtimeMs },
    };
}
/**
 * 跑写后复验门；**绝不 throw**（门自身也不 throw），读不到字节一律按 unavailable 如实回传。
 *
 * 候选缺省**不由本文件给定**：不传 `verify.dshPackageJsonCandidates` 时，门内部按 `anchorPlans()`
 * （session-verify.ts 里**唯一一份锚点计划表**）逐条解析，顺序即真伪顺序 ——
 * 显式 candidates（标签 `anchor`）→ install-anchor（profileContext.installAnchor）→ env-anchor
 * （`DSH_CM_DSH_INSTALL`）→ runtime-anchor（`process.resourcesPath` 下的 `<resources>/app.asar|app`）
 * → profiles-tree（`<home>/profiles/**`）。这里只给 `homeDir`（服务层拿不到 profileContext.installAnchor）。
 * `defaultDshPackageJsonCandidates` 是同一份来源的**对外视图**，**不是**门内部缺省（该函数生产零调用点）。
 */
async function runVerifyGate(bytes, options) {
    if (bytes === undefined)
        return { verified: false, reason: 'unavailable', detail: 'unreadable-after-write', equivalentToReadPath: false };
    const injected = options.verify;
    try {
        // 候选缺省由门内部按 anchorPlans() 锚点链解析（install-anchor → env-anchor → runtime-anchor → profiles-tree）；
        // 显式给了 dshPackageJsonCandidates 就用给的（标签 anchor，顺序即真伪顺序）。
        return await verifySessionLogBytes(bytes, { ...injected, homeDir: injected?.homeDir ?? options.homeDir });
    }
    catch {
        // 兜底：门承诺绝不 throw，这里再兜一层，任何意外都只能得到「未验证」而绝不能变成「成功」
        return { verified: false, reason: 'unavailable', detail: 'verify-threw', equivalentToReadPath: false };
    }
}
/** 应用（**写**）：重跑全部前置判定 → 执行器完整安全序列 → **真 codec 复验门** → 记台账。 */
export async function applySessionRepair(options) {
    const nowMs = (options.now ?? (() => new Date()))().getTime();
    const sessionsDir = join(options.homeDir, 'sessions');
    const target = await resolveSessionUnit(sessionsDir, options.unitId);
    if (target === undefined)
        return { ok: false, reason: 'unknown-unit', unitId: options.unitId };
    const base = { unitId: target.unitId, sessionId: target.sessionId, logName: target.logName };
    const gate = await gateForWrite(target, nowMs);
    if (!gate.ok) {
        return { ok: false, reason: gate.reason, ...base, ...(gate.mtimeMs !== undefined ? { mtimeMs: gate.mtimeMs } : {}) };
    }
    if (options.expect !== undefined && (options.expect.size !== gate.size || Math.abs(options.expect.mtimeMs - gate.mtimeMs) > 1)) {
        return { ok: false, reason: 'changed', ...base };
    }
    const outcome = await repairSessionLogFile(target.file, {
        apply: true,
        allowLossy: options.allowLossy === true,
        ...(options.now !== undefined ? { now: options.now } : {}),
    });
    if (!outcome.ok)
        return { ok: false, reason: outcome.reason ?? 'verification-refused', ...base };
    const repairedBytes = await fs.readFile(target.file).catch(() => undefined);
    const repaired = await fs.stat(target.file).catch(() => undefined);
    const backupName = outcome.backupPath !== undefined ? basename(outcome.backupPath) : undefined;
    // ④ 写后**真 codec 复验门**：执行器里的 sessionLogSelfCheck 只证明「结构自洽」，这一步才证明「本机 DSH 真能加载」。
    const verify = await runVerifyGate(repairedBytes, options);
    if (!verify.verified && verify.reason !== 'unavailable') {
        // 确定性失败 → **不发布**：用本次时间戳备份走既有 rollbackSessionLogFile 自动还原；
        // 台账不写（这次修复一点都没留下来），ok:false + rolledBack 如实回传。
        const rolledBack = outcome.backupPath !== undefined
            ? (await rollbackSessionLogFile(target.file, outcome.backupPath)).ok
            : false;
        return {
            ok: false,
            reason: 'verify-failed',
            ...base,
            droppedRows: outcome.droppedRows ?? 0,
            verify,
            rolledBack,
            ...(backupName !== undefined ? { backupName } : {}),
        };
    }
    const repairId = 'repair-' + Date.now().toString(36) + '-' + Math.random().toString(16).slice(2, 10);
    const record = {
        repairId,
        unitId: target.unitId,
        sessionId: target.sessionId,
        projectKey: target.projectKey,
        logName: target.logName,
        backupName: backupName ?? target.logName + SESSION_REPAIR_BACKUP_SUFFIX + 'unknown',
        at: Date.now(),
        droppedRows: outcome.droppedRows ?? 0,
        bytesBefore: outcome.bytesBefore ?? 0,
        bytesAfter: outcome.bytesAfter ?? 0,
        // size 必须与上面算 sha256 的**同一份字节**一致（避免 stat 与 read 之间被换过时台账自相矛盾）
        repairedSize: repairedBytes?.length ?? repaired?.size ?? outcome.bytesAfter ?? 0,
        repairedMtimeMs: repaired?.mtimeMs ?? 0,
        verify,
    };
    if (outcome.lossy === true)
        record.lossy = true;
    if (repairedBytes !== undefined)
        record.targetSha256After = sha256Hex(repairedBytes);
    if (outcome.backupPath !== undefined) {
        const backupBytes = await fs.readFile(outcome.backupPath).catch(() => undefined);
        // 备份的职责是**保真**而不是合法：这里只算 sha256（它可能是一份修复前的坏日志，
        // **绝不**拿真 codec 门去要求备份通过 —— 那会把「能回滚」和「能加载」两件事绑在一起）
        if (backupBytes !== undefined)
            record.backupSha256 = sha256Hex(backupBytes);
    }
    const recorded = backupName !== undefined && parseSessionRepairBackupName(backupName) !== undefined
        ? await recordRepair(options.dataDir, record)
        : false;
    return {
        ok: true,
        ...base,
        droppedRows: outcome.droppedRows ?? 0,
        ...(outcome.keptRows !== undefined ? { keptRows: outcome.keptRows } : {}),
        ...(outcome.actions !== undefined ? { actions: outcome.actions } : {}),
        lossy: outcome.lossy === true,
        ...(outcome.bytesBefore !== undefined ? { bytesBefore: outcome.bytesBefore } : {}),
        ...(outcome.bytesAfter !== undefined ? { bytesAfter: outcome.bytesAfter } : {}),
        repairId,
        ...(backupName !== undefined ? { backupName } : {}),
        ledgerRecorded: recorded,
        verify,
    };
}
/**
 * 回滚：**只接受台账里的 repairId**（客户端不能传路径）。
 *
 * 回滚是一条「用旧内容覆盖新内容」的路径，所以前置校验按 sha256 从严（台账里没有 sha256 的**旧记录**
 * 退回原来的 size+mtime 指纹，保证历史修复仍可回滚）：
 *  ① 备份文件 sha256 必须与台账一致 → 不一致 / 读不到 = reason 'backup-invalid'（备份已被换过就绝不用它覆盖任何东西）；
 *  ② 目标当前 sha256 必须与 targetSha256After 一致 → 不一致 = reason 'target-changed'（目标又被改过，绝不覆盖别人的内容）。
 * 注意①**只做 sha256 + 执行器里的结构层 sessionLogSelfCheck**：备份的职责是保真而不是合法，
 * 它可能本来就是一份修不好的日志 —— 绝不拿真 codec 门去卡它。
 */
export async function rollbackSessionRepair(options) {
    const ledger = await readSessionRepairLedger(options.dataDir);
    if (ledger.error !== undefined)
        return { ok: false, reason: 'repair-not-found', repairId: options.repairId };
    const record = ledger.repairs.find((item) => item.repairId === options.repairId);
    if (record === undefined)
        return { ok: false, reason: 'repair-not-found', repairId: options.repairId };
    if (record.rolledBackAt !== undefined)
        return { ok: false, reason: 'already-rolled-back', repairId: options.repairId, unitId: record.unitId, sessionId: record.sessionId };
    const target = await resolveSessionUnit(join(options.homeDir, 'sessions'), record.unitId);
    if (target === undefined || target.logName !== record.logName) {
        return { ok: false, reason: 'not-found', repairId: options.repairId, unitId: record.unitId, sessionId: record.sessionId };
    }
    const st = await fs.stat(target.file).catch(() => undefined);
    if (st === undefined)
        return { ok: false, reason: 'not-found', repairId: options.repairId, unitId: record.unitId, sessionId: record.sessionId };
    const backupPath = join(target.unitDir, record.backupName);
    // ① 备份前置：sha256 必须与台账一致（旧记录没有 sha256 → 退回执行器的结构自检，不额外卡）
    if (record.backupSha256 !== undefined) {
        const backupBytes = await fs.readFile(backupPath).catch(() => undefined);
        if (backupBytes === undefined || sha256Hex(backupBytes) !== record.backupSha256) {
            return { ok: false, reason: 'backup-invalid', repairId: options.repairId, unitId: record.unitId, sessionId: record.sessionId };
        }
    }
    // ② 目标前置：sha256 必须与台账一致（旧记录 → 退回 size+mtime 指纹）
    if (record.targetSha256After !== undefined) {
        const current = await fs.readFile(target.file).catch(() => undefined);
        if (current === undefined || sha256Hex(current) !== record.targetSha256After) {
            return { ok: false, reason: 'target-changed', repairId: options.repairId, unitId: record.unitId, sessionId: record.sessionId };
        }
    }
    else if (st.size !== record.repairedSize || Math.abs(st.mtimeMs - record.repairedMtimeMs) > 1) {
        return { ok: false, reason: 'changed', repairId: options.repairId, unitId: record.unitId, sessionId: record.sessionId };
    }
    const outcome = await rollbackSessionLogFile(target.file, backupPath);
    if (!outcome.ok) {
        return { ok: false, reason: outcome.reason ?? 'write-failed', repairId: options.repairId, unitId: record.unitId, sessionId: record.sessionId };
    }
    const next = ledger.repairs.map((item) => (item.repairId === options.repairId ? { ...item, rolledBackAt: Date.now() } : item));
    await writeSessionRepairLedger(options.dataDir, next);
    return { ok: true, repairId: options.repairId, unitId: record.unitId, sessionId: record.sessionId };
}
//# sourceMappingURL=session-repair-service.js.map