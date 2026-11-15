/**
 * 离线救急台的**结构化动作层**（阶段 0 只读 + 阶段 2/3 写动作）。
 *
 * 为什么要有这一层：CLI 与救急台网页必须给出**同一个结论**。CLI 现在是「算完就打印」，
 * 而网页要的是数据；若让网页自己重算一遍，同一个备份迟早出现「命令行说 OK、网页说坏」。
 * 所以凡是两边都要用的判定都收敛到这里：函数返回结构，CLI 负责排版、网页负责渲染。
 *
 * 纪律（与 CLI 同源）：
 *  - 零 @deepseek-ai 依赖（peerDependencies 缺失也能跑）；
 *  - 只读函数（verify/磁盘体检/会话体检/档案列表/心跳与锁读取）不写任何字节；
 *    写函数一律在**调用方过完门之后**才执行（门本身也在这里：checkWriteGates），并且复用 CLI 的同一实现；
 *  - 读不到一律如实上报（error / unreadable），绝不把「读不到」显示成 0 或「没问题」。
 */
import fssync from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { verifyBackupZip } from '../core/backup-verify.js';
import { EXPORTS_RETENTION_DEFAULT_MS, MARKET_RETENTION_DEFAULT_MS, TMP_RETENTION_DEFAULT_MS, } from '../core/cache-cleaner.js';
import { scanDiskUsage } from '../core/disk-usage.js';
import { readSafeModeMarkerSync } from '../core/phase3-host.js';
import { listSnapshots } from '../core/restore.js';
import { readInstalledVersion, resolveProfileDir } from '../core/plugin-cli.js';
import { DshProfileError, DshProfileManager } from '../profiles/dsh-profile-manager.js';
import { DshProfileLauncher, LAUNCHES_FILENAME, parseLaunches } from '../profiles/dsh-profile-launcher.js';
import { DshProfileRuntimeRegistry, parseRuntimeRecord, RUNTIME_STALE_MS } from '../profiles/dsh-profile-runtime.js';
import { isManagedProfileName } from '../profiles/dsh-profile-shared.js';
import { readTextSafe } from '../profiles/dsh-profile-io.js';
import { AUTO_BACKUP_PREFIX, DEFAULT_BACKUP_RETENTION, listBackupFiles, } from '../sync/backup-files.js';
import { scanSessionHealth } from '../utils/session-health-scan.js';
import { formatDateStamp } from '../utils/time.js';
// 只读事实层与写入门已拆到独立模块（体量棘轮：本文件曾顶格 1574 行），re-export 保持既有调用点不变。
import { isProcessAlive, readLockState, readRunningInstances, readSafeMode, } from './control-state.js';
import { checkWriteGates, locksDirFromControlRoots } from './write-gates.js';
export { isProcessAlive, readLockState, readRunningInstances, readSafeMode } from './control-state.js';
export { checkWriteGates, SAFE_MODE_REFUSAL_CODE, locksDirFromControlRoots } from './write-gates.js';
/**
 * 定位待校验目标：显式目标（文件名或路径）优先，否则列出导出目录下全部 *.zip（名称升序）。
 * 与 `dsh-config-manager verify` 同一实现（CLI 与网页共用）。
 */
export async function resolveVerifyTargets(exportsDir, explicit) {
    if (explicit !== undefined && explicit !== '') {
        // 文件名：在导出目录内解析；路径：按原样使用（相对当前工作目录）
        const looksLikePath = explicit.includes('/') || explicit.includes('\\') || path.isAbsolute(explicit);
        const target = looksLikePath ? path.resolve(explicit) : path.join(exportsDir, explicit);
        return { ok: true, targets: [target] };
    }
    let names;
    try {
        names = (await fsp.readdir(exportsDir)).filter((n) => n.endsWith('.zip')).sort();
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            return { ok: false, error: '导出目录不存在 / export directory not found: ' + exportsDir };
        }
        return { ok: false, error: '读取导出目录失败 / failed to read export directory: ' + (err instanceof Error ? err.message : String(err)) };
    }
    if (names.length === 0) {
        return { ok: false, error: '导出目录内没有备份 ZIP / no backup ZIP in: ' + exportsDir };
    }
    return { ok: true, targets: names.map((n) => path.join(exportsDir, n)) };
}
/** 收集备份自检结果（只读；不通过不是异常，而是结果里的 verdict）。 */
export async function collectVerifyResults(exportsDir, explicit) {
    const resolved = await resolveVerifyTargets(exportsDir, explicit);
    if (!resolved.ok)
        return { ok: false, error: resolved.error };
    const results = [];
    for (const target of resolved.targets)
        results.push(await verifyBackupZip(target));
    return { ok: true, results };
}
/* ------------------------------------------------------------ 快照 / 备份产物 */
/**
 * 快照列表（与 `dsh-config-manager snapshots` 同源）。
 *
 * `unreadable` = 目录**读不出来**（不是不存在）—— 调用方必须如实展示，绝不显示成「没有快照」。
 */
export async function readSnapshots(snapshotsDir, out) {
    return await listSnapshots(snapshotsDir, out);
}
/**
 * 导出产物列表；**打开容器形态探测**（加密容器 DCA1 必须在列表里被标出来）。
 * `unreadable` = 目录读不出来（非 ENOENT），调用方必须如实展示。
 */
export async function readBackups(exportsDir, out) {
    const options = { withContainerKind: true };
    // 把调用方给的对象**直接挂上**：listBackupFiles 会把读不出来的原因写进 options.unreadable，
    // 若在别处复制一份，原因就回不到调用方（验收 F2 的第一版就是这么漏的）。
    const result = await listBackupFiles(exportsDir, Object.assign(options, out ?? {}));
    if (options.unreadable !== undefined && out !== undefined)
        out.unreadable = options.unreadable;
    return result;
}
/* ------------------------------------------------------------ 磁盘占用 */
/**
 * 插件数据根的固定布局 → 磁盘体检子区目录。
 *
 * 与宿主 `src/routes/backup.ts` 的 `diskUsageDirsOf` 同一映射（子区目录不在这里另立一套语义）。
 * `exportsDir` 允许覆盖：`--data-dir` 可被当成导出目录使用（verify/backup 的历史语义）。
 */
export function diskUsageDirsOf(dataDir, exportsDir) {
    const under = (name) => path.join(dataDir, name);
    return {
        dataDir,
        exportsDir: exportsDir !== undefined && exportsDir !== '' ? exportsDir : under('exports'),
        snapshotsDir: under('snapshots'),
        syncDir: under('sync'),
        marketCacheDir: path.join(dataDir, 'market', 'cache'),
        marketWorkDir: path.join(dataDir, 'market', 'work'),
        tmpDir: under('tmp'),
        logsDir: under('logs'),
        bootStateDir: under('boot-state'),
        migrationHistoryDir: under('migration-history'),
        transactionsDir: under('transactions'),
        locksDir: under('locks'),
        vaultDir: under('vault'),
    };
}
/** 只读磁盘体检（零写入）。 */
export async function readDiskUsage(dataDir, exportsDir) {
    return await scanDiskUsage({
        dirs: diskUsageDirsOf(dataDir, exportsDir),
        policy: {
            tmpRetentionMs: TMP_RETENTION_DEFAULT_MS,
            exportsRetentionMs: EXPORTS_RETENTION_DEFAULT_MS,
            marketRetentionMs: MARKET_RETENTION_DEFAULT_MS,
            // 定时备份产物不按天回收（保留策略归 BackupScheduler）——「已超期」统计必须排除它们
            exportsExemptPrefix: AUTO_BACKUP_PREFIX,
        },
        backupKeepLast: DEFAULT_BACKUP_RETENTION,
    });
}
/** 只读会话体检（结构档 + 限额内的行档）。scanSessionHealth 本身不写任何字节。 */
export async function readSessionsHealth(homeDir) {
    try {
        return { ok: true, result: await scanSessionHealth({ homeDir }) };
    }
    catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}
/** 首页聚合：每一项各自 try/catch，缺一项不影响其余（但失败必须在 errors 里可见）。 */
export async function readRescueStatus(paths, now = () => new Date()) {
    const errors = [];
    let snapshots = [];
    try {
        const probe = {};
        snapshots = await readSnapshots(paths.snapshotsDir, probe);
        // 目录存在但读不出来 ≠ 没有快照（验收 F2）：必须进横幅，不能显示成空列表
        if (probe.unreadable !== undefined)
            errors.push(probe.unreadable);
    }
    catch (error) {
        errors.push('快照列表读取失败：' + errorText(error));
    }
    let backups = [];
    try {
        const probe = {};
        backups = await readBackups(paths.exportsDir, probe);
        if (probe.unreadable !== undefined)
            errors.push(probe.unreadable);
    }
    catch (error) {
        errors.push('导出产物列表读取失败：' + errorText(error));
    }
    let instances = [];
    try {
        instances = await readRunningInstances(paths.controlRoots);
    }
    catch (error) {
        errors.push('实例心跳读取失败：' + errorText(error));
    }
    let lock = { locksDir: paths.locksDir, present: false, state: 'NONE' };
    try {
        lock = await readLockState(paths.locksDir);
    }
    catch (error) {
        errors.push('环境锁读取失败：' + errorText(error));
    }
    return {
        generatedAt: now().toISOString(),
        paths,
        safeMode: readSafeMode(paths.controlRoots),
        lock,
        instances,
        snapshots,
        backups,
        errors,
    };
}
function errorText(error) {
    return error instanceof Error ? error.message : String(error);
}
/* ----------------------------------------------- 会话修复行的文案（纯函数，可单测） */
/**
 * 真 codec 复验结论 → 一句人话（**三态**；服务层 utils/session-verify.ts 的定义为准）。
 *
 *  · verified && equivalentToReadPath   → 「现役读盘可读」= header.version === catalog.currentVersion === 已装版本，
 *                                          DSH 的现役读盘路径此刻就能直接读它；
 *  · verified && !equivalentToReadPath  → 只有**迁移链**能还原（pre-v4 日志：官方 resolveCurrentLog 对本代之前的
 *                                          代际返回 undefined，即「没有现役日志」）；
 *  · !verified                          → 「**未验证**」= 本机跑不了真 codec 门（如 available catalog 缺席 / 代际对不上 /
 *                                          缺子会话事实）——**这是最常见的一态，必须说出来**，绝不能让它看起来像成功；
 *  · verify 缺失（改造前的旧结果 / 预览路径）→ 空串：调用方保持原文案，绝不臆造「已验证」。
 */
export function sessionVerifyNoteOf(verify) {
    if (verify === undefined)
        return '';
    if (verify.verified) {
        return verify.equivalentToReadPath
            ? '真 codec 复验通过（现役读盘可读）。'
            : '真 codec 复验通过（迁移链可还原，非现役读盘）。';
    }
    return '未验证：本机无法运行真 codec 复验（' + verify.reason + '）。';
}
/**
 * 会话修复行 → message（CLI 与离线救急台**同一份**文案）。
 *
 * 成功路径按 verify 分三态；**!verified 时不出现无限定的成功表述**（先声明未验证，再如实说写入已生效）；
 * verify 缺失时**逐字保持改造前的文案**（向后兼容，不臆造）；verify-failed 时说明已自动回滚 + 官方错误 detail。
 */
export function sessionRepairRowMessage(facts) {
    const dropped = String(facts.droppedRows ?? 0);
    const backup = String(facts.backupName ?? '（未落盘）');
    if (!facts.ok) {
        if (facts.reason === 'verify-failed') {
            const rolled = facts.rolledBack === true
                ? '已自动回滚到修复前字节'
                : facts.rolledBack === false
                    ? '已自动回滚未成功（目标仍是修复后字节，需人工处理）'
                    : '已自动回滚（服务层未回传结果，请以目标字节为准）';
            const detail = facts.verify !== undefined && !facts.verify.verified && facts.verify.detail !== undefined && facts.verify.detail !== ''
                ? '；官方错误：' + facts.verify.detail
                : '';
            return '未修复（verify-failed）：真 codec 复验未通过，' + rolled + detail + '。';
        }
        return '未修复（' + (facts.reason ?? 'unknown') + '）：原文件未改动。';
    }
    if (facts.verify === undefined) {
        // 向后兼容：没有复验结论就不添油加醋（改造前逐字如此）
        return '已丢弃 ' + dropped + ' 行重放重复事件；备份 ' + backup;
    }
    if (facts.verify.verified) {
        return '已丢弃 ' + dropped + ' 行重放重复事件；备份 ' + backup + '。' + sessionVerifyNoteOf(facts.verify);
    }
    return sessionVerifyNoteOf(facts.verify)
        + '写入已生效（已丢弃 ' + dropped + ' 行重放重复事件；备份 ' + backup + '）——本机 DSH 能否现役读它**没有被证明**，可用 repairId 回滚。';
}
/**
 * **就地修复「重放重复行」**（离线救急台 /sessions 页的写入口）。
 *
 * 能力边界（**不得放宽**）：
 *  - 只做 `session-repair-service` 已有的那一类 —— 字节相同 + seq 相同的重放重复行（零损失）；
 *    其余类别（合成 closer / seq 空洞 / 不可解析行 / 容器非法 / header 不可读 / 子代理缺父）
 *    **只报告**，绝不在这里扩张（设计稿 §10.3/§10.4 的 G-23 界限）。
 *  - **离线出口只有一个**：救急台 `dsh-config-manager web`（别名 `dcm web`）—— 它调用的就是本函数。
 *    CLI 的 `sessions repair`（加 `--fix`/`--apply` 才落盘）**不是**字节级修复的等价命令：
 *    它只做**布局归位**（按首帧 cwd 把目录搬回 `projectKeyOf(cwd)`）与**重复 id 隔离**，不碰会话字节。
 *    此前把 `sessions repair --apply` 写成「等价命令」是不实表述（已订正，见下面的 `commands`）。
 *  - 三道写入门由服务层自持：单元必须解析到会话根内 / 无 `session.lock` / 文件不在 30s 静止期内；
 *    「DSH 已停」这一条由 `checkWriteGates` 在这里补上（与 CLI 写动作共用同一道写入门，
 *    比应用内 T8 通道更严：T8 跑在 DSH 内部，靠静止期而非停机）。
 *  - 与 CLI 同源：预览-应用指纹一致（TOCTOU）/ 时间戳备份 / 原子换入 / 写后复验，全在服务层。
 *
 * 为什么页面需要一个「一键」入口：救急台的定位是「DSH 起不来时唯一的可视化通道」，
 * 而 `session-repair-service` 的 CLI 出入口此前只挂在应用内通道上 —— 离线时用户只能敲命令。
 */
export async function repairSessionLogInline(options, controlRoots) {
    const base = {
        ok: true, dryRun: !options.apply, rows: [],
        // 不得再把 `sessions repair --apply` 说成等价命令：它只做布局归位与重复 id 隔离，不改写会话字节。
        commands: [
            'dsh-config-manager web  # 离线救急台：字节级就地修复的唯一离线通道（别名 dcm web）',
            'dsh-config-manager sessions repair  # 只做布局归位与重复 id 隔离，不改写会话字节（--fix/--apply 才落盘）',
        ],
    };
    if (options.unitIds.length === 0)
        return { ...base, ok: false, error: '没有选中任何会话单元。' };
    if (options.apply) {
        // 与 CLI 写动作共用同一道写入门：改写会话字节必须先停 DSH（+ SAFE MODE + 环境锁）。
        // 环境锁目录由控制面根派生（审计 P11-4：此前不传 locksDir，锁存在时也照样改写字节）。
        const locksDir = options.locksDir ?? locksDirFromControlRoots(controlRoots);
        const gate = await checkWriteGates(controlRoots, {
            needsDshStopped: true,
            ...(locksDir !== undefined ? { locksDir } : {}),
        });
        if (!gate.ok)
            return { ...base, ok: false, error: gate.reason };
    }
    const svc = await import('../utils/session-repair-service.js');
    const rows = [];
    for (const unitId of options.unitIds.slice(0, 50)) {
        if (!options.apply) {
            const preview = await svc.previewSessionRepair({ homeDir: options.home, unitId });
            rows.push({
                unitId,
                ok: preview.ok,
                ...(preview.reason !== undefined ? { reason: preview.reason } : {}),
                ...(preview.droppedRows !== undefined ? { droppedRows: preview.droppedRows } : {}),
                ...(preview.bytesBefore !== undefined ? { bytesBefore: preview.bytesBefore } : {}),
                ...(preview.bytesAfter !== undefined ? { bytesAfter: preview.bytesAfter } : {}),
                ...(preview.expect !== undefined ? { expect: preview.expect } : {}),
                message: preview.ok
                    ? '可零损失修复：将丢弃 ' + String(preview.droppedRows ?? 0) + ' 行重放重复事件。'
                    : '不可修复（' + (preview.reason ?? 'unknown') + '）：这一类只报告，本入口绝不改写它的字节；'
                        + '字节级离线出口是救急台 dsh-config-manager web（sessions repair 只做布局归位与重复 id 隔离）。',
            });
            continue;
        }
        const expect = options.expects?.[unitId];
        const applied = await svc.applySessionRepair({
            homeDir: options.home, dataDir: options.dataDir, unitId,
            ...(expect !== undefined ? { expect } : {}),
        });
        // 文案与结构化字段同源：verify 逐字段透传（JSON 消费者据它区分三态），message 由纯函数分派
        const facts = {
            ok: applied.ok,
            ...(applied.reason !== undefined ? { reason: applied.reason } : {}),
            ...(applied.droppedRows !== undefined ? { droppedRows: applied.droppedRows } : {}),
            ...(applied.backupName !== undefined ? { backupName: applied.backupName } : {}),
            ...(applied.rolledBack !== undefined ? { rolledBack: applied.rolledBack } : {}),
            ...(applied.verify !== undefined ? { verify: applied.verify } : {}),
        };
        rows.push({
            unitId,
            ...facts,
            ...(applied.bytesBefore !== undefined ? { bytesBefore: applied.bytesBefore } : {}),
            ...(applied.bytesAfter !== undefined ? { bytesAfter: applied.bytesAfter } : {}),
            ...(applied.repairId !== undefined ? { repairId: applied.repairId } : {}),
            message: sessionRepairRowMessage(facts),
        });
    }
    return { ...base, ok: rows.every((r) => r.ok || !options.apply), rows };
}
/**
 * 会话布局修复：`dryRun: true` 时**零写入**（与 `sessions repair` 缺省行为一致）。
 *
 * 实现方式：复用 `runSessionsRepair`（CLI 的同一实现）并收集它的输出行 —— 这样「网页看到的计划」
 * 与「命令行看到的计划」逐字同源；解析失败的极端情况如实进 notices，不假装成功。
 */
export async function repairSessions(options, controlRoots) {
    const base = {
        ok: true, dryRun: !options.fix, needsAttention: false, home: options.home,
        steps: [], scanned: 0, movable: 0, skipped: 0, duplicates: 0,
        done: [], errors: [], notices: [],
    };
    if (options.fix) {
        // 环境锁目录同样由根派生：调用点漏传时不再静默跳过环境锁检查（与 repairSessionLogInline 同一口径）
        const locksDir = options.locksDir ?? locksDirFromControlRoots(controlRoots);
        const gate = await checkWriteGates(controlRoots, {
            needsDshStopped: true,
            ...(locksDir !== undefined ? { locksDir } : {}),
        });
        if (!gate.ok) {
            return { ...base, ok: false, error: gate.reason, errors: [gate.reason] };
        }
    }
    const { runSessionsRepair } = await import('./sessions-repair.js');
    const out = [];
    const err = [];
    const io = { log: (line) => out.push(line), error: (line) => err.push(line) };
    const code = await runSessionsRepair({
        home: options.home,
        fix: options.fix,
        maps: options.maps ?? [],
        json: false,
        ...(options.keep !== undefined ? { keep: options.keep } : {}),
    }, io);
    const text = out.join('\n');
    const summary = /扫描 (\d+) 条会话：位置正确 (\d+)，待搬家 (\d+)，待改写\+搬家 (\d+)，跳过 (\d+)，重复 id (\d+)/.exec(text);
    if (summary !== null) {
        base.scanned = Number(summary[1]);
        base.movable = Number(summary[2]) === 0 ? Number(summary[3]) + Number(summary[4]) : Number(summary[3]) + Number(summary[4]);
        base.skipped = Number(summary[5]);
        base.duplicates = Number(summary[6]);
    }
    for (const line of out) {
        // 解析 CLI 的逐条计划行。**括号形态两种都认**（验收 F5：CLI 打印用的是全角括号，
        // 只写半角会让 rewrite-move 行静默丢失；同时容忍英文环境下的半角写法）。
        const step = /^ {2}\[(\w[\w-]*)\] (\S+) {2}(\S+)(?: → (\S+))?(?:[（(]改写首帧 cwd: (.+) → (.+)[）)])? {2}reason=(.*)$/.exec(line);
        if (step !== null && step[1] !== 'ok' && step[1] !== 'keep') {
            const kind = step[1];
            base.steps.push({
                kind,
                sessionId: step[2],
                fromProjectKey: step[3],
                ...(step[4] !== undefined ? { toProjectKey: step[4] } : {}),
                ...(step[5] !== undefined && step[6] !== undefined ? { prefixRewrite: { from: step[5], to: step[6] } } : {}),
                reason: step[7] ?? '',
                /**
                 * 是否能真的执行 —— **由 planner 的语义决定，不靠「kind 不是 keep」这种猜测**（验收 F5）。
                 * planner 里只有 move / rewrite-move 是可执行的；skip / ok 恒不可执行；
                 * quarantine 只在用户点名 --keep 时才可执行，而救急台当前不暴露 keep。
                 */
                applies: kind === 'move' || kind === 'rewrite-move',
            });
            continue;
        }
        if (line.startsWith('已归位') || line.startsWith('已隔离重复副本'))
            base.done.push(line.trim());
        else if (line.startsWith('跳过非 projectKey'))
            base.notices.push(line.trim());
    }
    base.errors = err.slice();
    base.ok = code === 0;
    base.needsAttention = base.steps.length > 0;
    if (!base.ok && base.error === undefined && err.length > 0)
        base.error = err[0];
    return base;
}
/**
 * 清理可重建缓存（tmp / 市场缓存 / 市场工作副本）。
 *
 * 硬边界（与路由 `/disk-usage/cleanup` 同源）：
 *  - 候选集只有**可重建区**；`snapshots` 与 `sync` 永不在候选集内；
 *  - **只有用户显式勾选 expired-exports 才碰导出产物**，且永远只按保留期（绝不「立即清空」）；
 *  - 不做 SAFE MODE / 环境锁门（本动作不写配置、不碰会话字节），但绝不越界删别的目录。
 */
export async function cleanupDisk(dataDir, exportsDir, selection) {
    const sections = [];
    if (selection.caches)
        sections.push('tmp', 'marketCache', 'marketWork');
    if (selection.expiredExports)
        sections.push('exports');
    if (sections.length === 0) {
        return { ok: false, removed: 0, freedBytes: 0, errors: 0, detail: [], sections: [], error: '没有勾选任何清理项。' };
    }
    const { cleanupCaches } = await import('../core/cache-cleaner.js');
    try {
        const result = await cleanupCaches({
            tmpDir: path.join(dataDir, 'tmp'),
            exportsDir,
            marketCacheRoot: path.join(dataDir, 'market', 'cache'),
            marketWorkRoot: path.join(dataDir, 'market', 'work'),
            // 手动清理：可重建区忽略保留期整块清（与 GUI 「立即清理」同一语义）
            includeRecent: selection.caches,
            sections,
            // 定时备份产物由保留策略管理，不按天回收
            exportsExemptPrefix: AUTO_BACKUP_PREFIX,
        });
        /**
         * 「目录不存在」不是失败：cache-cleaner 把 readdir 失败统一记进 errors（其余分区照常回执），
         * 所以判据不是 errors === 0，而是「没有分区因为目录本来就不存在而整个跳过」。
         * 做法：先对本次勾选的分区各 stat 一次，缺失的都不计入失败 —— 剩下的才是真实删除失败。
         */
        let missing = 0;
        for (const section of sections) {
            const dir = section === 'exports' ? exportsDir
                : section === 'tmp' ? path.join(dataDir, 'tmp')
                    : path.join(dataDir, 'market', section === 'marketCache' ? 'cache' : 'work');
            if (!fssync.existsSync(dir))
                missing += 1;
        }
        const realErrors = Math.max(0, result.errors - missing);
        return {
            ok: realErrors === 0,
            removed: result.removed,
            freedBytes: result.freedBytesRecursive,
            errors: result.errors,
            detail: result.detail.slice(0, 200),
            sections: result.sections.slice(),
        };
    }
    catch (error) {
        return { ok: false, removed: 0, freedBytes: 0, errors: 0, detail: [], sections: [], error: errorText(error) };
    }
}
/**
 * 回收残留环境锁（**显式动作**，与 `recover-stale-lock` 同一实现）。
 *
 * 绝不自动、绝不放宽：只有 `inspectLockState` 确证 stale（或崩溃残留无有效 owner）才动；
 * 活锁一律拒绝（判据在 `EnvironmentLockManager.recoverStaleLock` 内部二次验证）。
 */
export async function recoverStaleEnvironmentLock(locksDir, dataDir) {
    const { EnvironmentLockManager } = await import('../utils/env-lock.js');
    const lock = new EnvironmentLockManager({
        locksDir,
        op: 'rescue-console-recover',
        target: dataDir,
        lockVersion: '0.1.0',
    });
    try {
        const result = await lock.recoverStaleLock();
        return {
            ok: result.ok && result.removed === true,
            removed: result.removed === true,
            state: result.state,
            detail: result.detail ?? '（无详情）',
        };
    }
    catch (error) {
        return { ok: false, removed: false, state: 'LOCK_IO_ERROR', detail: errorText(error) };
    }
}
/** 同步读心跳（列表页用；异步版 readRunningInstances 仍是网页其余部分的口径）。 */
function readRunningInstancesSync(controlRoots) {
    const out = [];
    const seen = new Set();
    const now = Date.now();
    for (const root of controlRoots) {
        const dir = path.join(root, 'running');
        let names;
        try {
            names = fssync.readdirSync(dir).filter((n) => n.endsWith('.json'));
        }
        catch {
            continue;
        }
        for (const name of names) {
            try {
                const record = parseRuntimeRecord(fssync.readFileSync(path.join(dir, name), 'utf8'));
                if (record === null)
                    continue;
                if (!isProcessAlive(record.pid) || now - record.updatedAt > RUNTIME_STALE_MS)
                    continue;
                const key = record.name + '#' + String(record.pid);
                if (seen.has(key))
                    continue;
                seen.add(key);
                out.push({ name: record.name, pid: record.pid, port: record.port, startedAt: record.startedAt, updatedAt: record.updatedAt });
            }
            catch {
                // 单条读不出来不阻断
            }
        }
    }
    return out;
}
/** 列档案 + 实例状态（台账 ∪ 心跳；零写入 —— 只读 launches.json 与 running/）。 */
export function readProfiles(paths) {
    const errors = [];
    const profilesDir = path.join(paths.homeDir, 'profiles');
    let rows = [];
    try {
        const manager = new DshProfileManager({ homeDir: paths.homeDir });
        const launches = parseLaunches(readTextSafe(path.join(paths.dataDir, LAUNCHES_FILENAME)) ?? '');
        const heartbeats = readRunningInstancesSync(paths.controlRoots);
        rows = manager.list().map((meta) => {
            const managed = isManagedProfileName(meta.name);
            const shapeOk = meta.shape === 'web';
            const record = launches.find((l) => l.name === meta.name && isProcessAlive(l.pid));
            const beat = heartbeats.find((h) => h.name === meta.name);
            const running = record !== undefined || beat !== undefined;
            const launchable = !managed && shapeOk && !running;
            const blocked = managed
                ? '该档案由桌面端（Electron）独占管理，普通 CLI 无法启动它。'
                : shapeOk
                    ? '已有实例在运行（先停止再启动，避免同名多开）。'
                    : '该档案不是 web 形态（没有浏览器界面），启动出来是看不见的进程。';
            return {
                name: meta.name,
                shape: meta.shape,
                bundles: meta.bundles.length,
                dependencies: Object.keys(meta.dependencies).length,
                hasNodeModules: meta.hasNodeModules,
                patchEntryCount: meta.patchEntryCount,
                updatedAtMs: meta.updatedAtMs,
                dshVersion: meta.dshVersion ?? null,
                sessionFormatVersion: meta.sessionFormatVersion ?? null,
                launchable,
                ...(launchable ? {} : { launchBlockedReason: blocked }),
                owned: record !== undefined,
                running,
                port: record?.port ?? beat?.port ?? null,
                url: record?.url ?? null,
                pid: record?.pid ?? beat?.pid ?? null,
            };
        });
    }
    catch (error) {
        errors.push('档案列表读取失败：' + errorText(error));
    }
    return { ok: errors.length === 0, profilesDir, rows, errors };
}
/** 启动某个档案的独立实例（与宿主「启动」按钮同一实现）。 */
export async function launchProfile(paths, name) {
    const manager = new DshProfileManager({ homeDir: paths.homeDir });
    const meta = manager.list().find((m) => m.name === name);
    if (meta === undefined) {
        return { ok: false, code: 'notFound', message: '找不到该档案：' + name, warnings: [] };
    }
    const launcher = new DshProfileLauncher({
        homeDir: paths.homeDir,
        dataDir: paths.dataDir,
        deps: {
            // 心跳判据：手动 `dsh web` 起来的实例也必须挡住同名多开（与宿主注入同源）
            isProfileRunning: (candidate) => readRunningInstancesSync(paths.controlRoots).some((r) => r.name === candidate),
        },
    });
    try {
        const result = await launcher.launch({ name: meta.name, shape: meta.shape });
        return {
            ok: true,
            code: 'started',
            message: result.ready ? '实例已就绪。' : '进程已启动，但探活未通过（见下方告警）。',
            ...(result.url !== null ? { url: result.url } : {}),
            port: result.port,
            // pid 为 null 时（极端：拿不到子进程 pid）如实省略，不塞一个假数字
            ...(result.pid !== null ? { pid: result.pid } : {}),
            logFile: result.logFile,
            warnings: result.warnings.slice(),
        };
    }
    catch (error) {
        const code = error instanceof DshProfileError ? error.code : 'launchFailed';
        return { ok: false, code, message: errorText(error), warnings: [] };
    }
}
/** 停止实例：先台账（本插件启动的），再心跳（手动启动的）。都找不到 → notRunning。 */
export async function stopProfile(paths, name) {
    const launcher = new DshProfileLauncher({ homeDir: paths.homeDir, dataDir: paths.dataDir });
    try {
        const result = await launcher.stop(name);
        return { ok: true, code: 'stopped', message: '已停止（' + result.result + '）。', result: result.result };
    }
    catch (error) {
        const code = error instanceof DshProfileError ? error.code : 'stopFailed';
        if (code !== 'notRunning')
            return { ok: false, code, message: errorText(error) };
    }
    // 台账里没有 → 看心跳（手动启动 / 别的实例管理的）。
    // **pid 必须传本进程**：stopExternal 的「不能停自己」判定是 record.pid === this.pid，
    // 传一个假的 -1 会让那道护栏永远不成立 —— 心跳恰好指向本进程时就会把自己杀掉（实测踩到）。
    const registry = new DshProfileRuntimeRegistry({ dataDir: paths.dataDir, name, pid: process.pid });
    try {
        const result = await registry.stopExternal(name);
        const portText = result.port === undefined ? '' : '，端口 ' + String(result.port);
        return { ok: true, code: 'stopped', message: '已停止外部实例（' + result.result + portText + '）。', result: result.result };
    }
    catch (error) {
        const code = error instanceof DshProfileError ? error.code : 'stopFailed';
        return { ok: false, code, message: errorText(error) };
    }
}
/**
 * 解锁一个**加密容器备份**（DCA1）并列出其内容清单（**零写入**）。
 *
 * 三条硬约束：
 *  ① 明文 ZIP **只在进程内存**里存在（不落盘、不进日志、不回传内容），用完即弃；
 *  ② 失败码可判别（not-encrypted / bad-password / tampered / unsupported），页面据此给不同指引；
 *  ③ 只处理「导出目录里确实存在的那个文件名」（与 /verify 同源），不解析用户给的路径 → 无目录穿越。
 */
export async function unlockEncryptedBackup(exportsDir, fileName, password) {
    if (password === '')
        return { ok: false, code: 'bad-password', message: '密码为空。' };
    const target = path.join(exportsDir, fileName);
    try {
        await fsp.stat(target);
    }
    catch {
        return { ok: false, code: 'not-found', message: '导出目录里没有这个备份：' + fileName };
    }
    const { decryptArchive, verifyEncryptedBlob } = await import('../security/encryption.js');
    const { parseZip } = await import('../utils/zip.js');
    try {
        const blob = await fsp.readFile(target);
        const verified = await verifyEncryptedBlob(blob, password);
        if (!verified.valid) {
            /**
             * 统一归一到 'not-encrypted'：core 的 TAMPERED / UNSUPPORTED_FORMAT 是**字节级**分类，
             * 而这里对用户要说的是「这个文件不是本插件的加密容器（或已损坏）——先确认选对了文件」。
             * 原始 code 保留在 message 里，便于排查。
             */
            return {
                ok: false,
                code: 'not-encrypted',
                message: '这不是本插件产出的加密容器（或文件已损坏）。底层判定：' + String(verified.code ?? 'unknown'),
            };
        }
        if (!verified.ok) {
            return { ok: false, code: 'bad-password', message: '密码不正确（认证标签校验失败）。' };
        }
        if (verified.info === null || verified.kdf === null) {
            return { ok: false, code: 'unsupported', message: '容器参数缺失，无法解密。' };
        }
        const plain = await decryptArchive(blob, verified.info, verified.kdf, password);
        const archive = parseZip(plain);
        const entries = [];
        let totalBytes = 0;
        for (const name of archive.names()) {
            const data = archive.readEntry(name);
            entries.push({ path: name, sizeBytes: data.length });
            totalBytes += data.length;
            if (entries.length >= 5000)
                break;
        }
        return {
            ok: true,
            code: 'ok',
            message: '解锁成功（清单如下；明文只在内存中解出，未写入磁盘）。',
            entries,
            entryCount: entries.length,
            totalBytes,
            plaintextWritten: false,
        };
    }
    catch (error) {
        const code = error.code;
        return { ok: false, code: code ?? 'io-error', message: errorText(error) };
    }
}
/** 危险动作判定：会改动磁盘的分区（skip / credentialHint 不算）。 */
function isDangerousRestoreKind(kind) {
    return kind === 'hostFileRestore' || kind === 'hostFileRemove' || kind === 'fileRestore' || kind === 'fileRemove' || kind === 'pluginRemove' || kind === 'pluginInstall';
}
/** 本机 DSH 包名（T8-F3；与 core/restore.ts 的 `DSH_PACKAGE_NAME` 同值 —— 两处读的是同一个文件）。 */
const DSH_PACKAGE_NAME = '@deepseek-ai/dsh';
/**
 * 目标档案当前的 DSH 版本（T8-F3；离线 CLI 的 best-effort 来源）。
 *
 * 为什么是这个来源：CLI 恰恰在 **DSH 已经起不来** 的场景下运行，没有「运行时权威版本」可问
 * （那是宿主侧的东西：`HostContext.dshVersion` / `profileContext.installAnchor`）。这里与
 * `core/restore.ts` 的兜底、档案页的 `DshProfileMeta.dshVersion` **读的是同一个文件**
 * （`profiles/<p>/node_modules/@deepseek-ai/dsh/package.json`），所以显式传出不改变数值，
 * 但把「版本判定来源」固定在一处（将来 CLI 若拿到更好的来源只改这里），且不再让 core 猜一次。
 * 读不到 → undefined：core 按「版本未知」处理（不猜、不产出「版本不同」告警）。
 */
function currentProfileDshVersion(paths) {
    try {
        return readInstalledVersion(resolveProfileDir(paths.homeDir, paths.profile), DSH_PACKAGE_NAME) ?? undefined;
    }
    catch {
        // 档案名非法 / 目录不可读 → 与「没装」同样处理：不猜版本（绝不因此让恢复计划失败）
        return undefined;
    }
}
/**
 * 取某个快照的**恢复计划**（只读；与 CLI \`restore --dry-run\` 同一实现）。
 *
 * 与 CLI 完全同源：\`planRestore\` + 同一个 \`snapshotsRoot\` 校验（存在/READY/manifest/blob-hash/symlink/provenance）。
 */
export async function planSnapshotRestore(paths, snapshotId) {
    const { planRestore } = await import('../core/restore.js');
    const snapshotDir = path.join(paths.snapshotsDir, snapshotId);
    try {
        const plan = await planRestore({
            snapshotDir,
            homeDir: paths.homeDir,
            profile: paths.profile,
            snapshotsRoot: paths.snapshotsDir,
            currentDshVersion: currentProfileDshVersion(paths),
        });
        return {
            ok: true,
            code: 'ok',
            message: '计划已生成（尚未改动任何文件）。',
            snapshotId: plan.snapshotId,
            createdAt: plan.createdAt,
            sourceZip: plan.sourceZip,
            pluginBaselineConfirmed: plan.pluginBaselineConfirmed,
            actions: plan.actions.map((action) => ({
                kind: action.kind,
                description: action.description,
                ...(action.target !== undefined ? { target: action.target } : {}),
                ...(action.detail !== undefined ? { detail: action.detail } : {}),
                ...(action.manualHint !== undefined ? { manualHint: action.manualHint } : {}),
                dangerous: isDangerousRestoreKind(action.kind),
            })),
            summary: { ...plan.summary },
        };
    }
    catch (error) {
        return { ok: false, code: 'plan-failed', message: errorText(error) };
    }
}
/**
 * 执行快照恢复（**destructive**：会覆盖 $DSH_HOME 文件、删除文件、卸载插件）。
 *
 * 与 CLI 同源：执行前过 \`checkWriteGates\`（SAFE MODE → 残留锁 → DSH 未运行），
 * 覆盖前由 core 复制到 \`<snapshotDir>/pre-restore/\`（可人工反悔），并在恢复后刷新工作区登记序号。
 */
export async function runSnapshotRestore(paths, snapshotId) {
    const gate = await checkWriteGates(paths.controlRoots, { needsDshStopped: true, locksDir: paths.locksDir });
    if (!gate.ok)
        return { ok: false, code: gate.code, message: gate.reason };
    const { restore } = await import('../core/restore.js');
    try {
        const report = await restore({
            snapshotDir: path.join(paths.snapshotsDir, snapshotId),
            homeDir: paths.homeDir,
            profile: paths.profile,
            snapshotsRoot: paths.snapshotsDir,
            currentDshVersion: currentProfileDshVersion(paths),
        });
        return {
            ok: report.failed.length === 0,
            code: report.failed.length === 0 ? 'restored' : 'partial',
            message: report.failed.length === 0 ? '恢复完成。' : '恢复完成但有失败项（见下）。',
            restored: report.restored.slice(0, 500),
            removedPlugins: report.removedPlugins.slice(0, 200),
            manualHints: report.manualHints.slice(0, 200),
            failed: report.failed.slice(0, 200).map((f) => ({ item: f.item, reason: f.reason })),
            skipped: report.skipped.slice(0, 200),
        };
    }
    catch (error) {
        return { ok: false, code: 'restore-failed', message: errorText(error) };
    }
}
/**
 * 离线文件级导出（与 CLI \`backup\` 同一实现：collectBackupEntries → buildChecksums/manifest → writeZip）。
 *
 * 只打包**离线可直读**的文件类分区；结构化分区读不到就不进归档（宁可如实少导，也不给假备份）。
 * 文件落在导出目录，命名与 CLI 一致（自动去重，绝不覆盖既有文件）。
 */
export async function exportOfflineBackup(paths, sections) {
    const { collectBackupEntries, buildSectionFlags, OFFLINE_UNAVAILABLE_SECTIONS, } = await import('../core/backup-plan.js');
    const { buildChecksums } = await import('../utils/hashing.js');
    const { stringifyJsonSafe } = await import('../utils/json.js');
    const { buildManifest, CHECKSUMS_FILE, MANIFEST_FILE } = await import('../schema/manifest.js');
    const { writeZip } = await import('../utils/zip.js');
    const only = sections;
    try {
        const collection = await collectBackupEntries(paths.homeDir, only);
        if (collection.entries.length === 0) {
            return { ok: false, code: 'nothing-to-export', message: '没有可打包的内容（该 home 下未找到可离线收集的分区）。' };
        }
        const stamp = formatDateStamp();
        const { randomBytes } = await import('node:crypto');
        const desired = 'dsh-config-cli-' + stamp + '-' + randomBytes(4).toString('hex') + '.zip';
        await fsp.mkdir(paths.exportsDir, { recursive: true });
        let existing = [];
        try {
            existing = await fsp.readdir(paths.exportsDir);
        }
        catch {
            existing = [];
        }
        let outPath = path.join(paths.exportsDir, desired);
        if (existing.includes(desired)) {
            const base = desired.slice(0, -4);
            for (let i = 1;; i += 1) {
                const candidate = base + '-' + String(i) + '.zip';
                if (!existing.includes(candidate)) {
                    outPath = path.join(paths.exportsDir, candidate);
                    break;
                }
            }
        }
        const checksums = buildChecksums(collection.entries);
        const manifest = buildManifest({
            // 真实版本（runWeb 经 RescuePaths 注入）；拿不到时给中性占位，绝不谎报某个具体版本。
            exporterVersion: paths.exporterVersion ?? '0.0.0-unknown',
            // 离线探测不到真实 DSH 版本：如实标注，不谎报
            dshVersion: 'cli-offline',
            platform: process.platform,
            arch: process.arch,
            sections: buildSectionFlags(collection.included),
            containsSecrets: false,
            encrypted: false,
            encryption: null,
        });
        const entries = [
            ...collection.entries,
            { name: CHECKSUMS_FILE, data: new TextEncoder().encode(stringifyJsonSafe(checksums, { space: 2 })) },
            { name: MANIFEST_FILE, data: new TextEncoder().encode(stringifyJsonSafe(manifest, { space: 2 })) },
        ];
        await writeZip(outPath, entries);
        // 落盘后立即自检（与 verify 同一实现）：只有自检通过才算成功
        const check = await verifyBackupZip(outPath);
        if (check.verdict !== 'OK') {
            return {
                ok: false, code: 'self-check-failed',
                message: '备份已写出但自检未通过（文件保留供复核）：' + outPath,
                outPath,
            };
        }
        return {
            ok: true,
            code: 'exported',
            message: '导出完成并已自检通过。',
            outPath,
            entryCount: collection.entries.length,
            sections: collection.sections.map((s) => ({
                sectionId: s.sectionId, label: s.label, entryCount: s.entryCount, excludedCount: s.excludedCount,
                ...(s.risk !== undefined ? { risk: s.risk } : {}),
            })),
            warnings: collection.warnings.slice(0, 200),
            unavailableSections: [...OFFLINE_UNAVAILABLE_SECTIONS],
        };
    }
    catch (error) {
        return { ok: false, code: 'export-failed', message: errorText(error) };
    }
}
/** 离线默认可导出的分区（页面渲染勾选项）。 */
export async function defaultExportSections() {
    const { DEFAULT_BACKUP_SECTIONS } = await import('../core/backup-plan.js');
    return [...DEFAULT_BACKUP_SECTIONS];
}
/** 生成重装计划（只读；与 CLI \`reinstall --dry-run\` 同一实现）。 */
export async function planDshReinstall(selection, version, exec) {
    const { buildReinstallPlan, detectInstalledDshVersion } = await import('../core/reinstall.js');
    try {
        const current = await detectInstalledDshVersion(exec);
        const plan = await buildReinstallPlan(new Set(selection), version, exec);
        return {
            ok: true,
            code: 'ok',
            message: current === null
                ? '探测不到当前已安装版本：执行会被 fail-closed 拒绝（先确认 dsh --version 可用）。'
                : '计划已生成（尚未执行任何命令）。',
            version: plan.version,
            wipeConfig: plan.wipeConfig,
            steps: plan.steps.map((s) => ({ label: s.label, command: s.command, dangerous: s.dangerous === true })),
            currentVersion: current,
        };
    }
    catch (error) {
        return { ok: false, code: 'plan-failed', message: errorText(error) };
    }
}
/**
 * 执行重装（**最高危**：卸载全局包 + 清缓存，勾选数据类还会清 ~/.dsh）。
 *
 * 与 CLI 同源的安全序列（一步都不能省）：
 *  ① SAFE MODE 门 + 环境锁（\`runWithMutationLock\`）；
 *  ② program 步前先探测旧版本，探测不到 → fail-closed 不执行；
 *  ③ 写 durable recovery point 成功后才跑第一条命令；
 *  ④ 逐条执行、逐条记录结果（失败不静默）。
 */
export async function runDshReinstall(paths, selection, version, exec) {
    const { buildReinstallPlan, detectInstalledDshVersion, writeReinstallRecoveryPoint, } = await import('../core/reinstall.js');
    const { EnvironmentLockManager, runWithMutationLock, EnvironmentLockUnavailableError } = await import('../utils/env-lock.js');
    const { Phase3Recovery } = await import('../core/phase3-host.js');
    const safeMsg = checkSafeModeBlockedLocal(paths.controlRoots);
    if (safeMsg !== null)
        return { ok: false, code: 'safe-mode', message: safeMsg };
    try {
        const plan = await buildReinstallPlan(new Set(selection), version, exec);
        const failed = [];
        const executed = [];
        let recoveryPointWritten = false;
        const lock = new EnvironmentLockManager({
            locksDir: paths.locksDir,
            op: 'console-reinstall',
            target: plan.version,
            lockVersion: '0.1.0',
        });
        const recovery = new Phase3Recovery({ dataDir: paths.dataDir, packageVersion: '0.1.0', fingerprintDataDir: paths.dataDir });
        await recovery.initFingerprint().catch(() => undefined);
        await runWithMutationLock(lock, { op: 'console-reinstall', target: plan.version }, async (lockCtx) => {
            const runAll = async (journalCtx) => {
                if (selection.includes('program')) {
                    const previous = await detectInstalledDshVersion(exec);
                    if (previous === null) {
                        failed.push({
                            label: 'program recovery point', command: 'detectInstalledDshVersion',
                            reason: '探测不到当前已安装版本，拒绝执行（fail-closed）：先确认 dsh --version 可用。',
                        });
                        return;
                    }
                    try {
                        await writeReinstallRecoveryPoint(paths.dataDir, {
                            operationId: journalCtx?.operationId ?? 'console-reinstall',
                            environmentFingerprint: recovery.recoveryEnvFingerprint,
                            previousInstalledVersion: previous,
                            requestedTargetSpec: plan.version,
                            createdAt: new Date().toISOString(),
                            recoveryHint: '如需手动恢复此版本：npm install -g @deepseek-ai/dsh@' + previous,
                        });
                        recoveryPointWritten = true;
                    }
                    catch (error) {
                        failed.push({ label: 'program recovery point', command: 'writeReinstallRecoveryPoint', reason: errorText(error) });
                        return;
                    }
                }
                for (const step of plan.steps) {
                    try {
                        await exec(step.command);
                        executed.push(step.label);
                    }
                    catch (error) {
                        failed.push({ label: step.label, command: step.command, reason: errorText(error) });
                    }
                }
            };
            if (lockCtx !== null) {
                await recovery.runExternalIntent({
                    operationType: 'console-reinstall', lockCtx,
                    intent: { adapter: 'dsh', ref: 'program', kind: 'Reinstall' }, fn: runAll,
                });
            }
            else {
                await runAll();
            }
        });
        return {
            ok: failed.length === 0,
            code: failed.length === 0 ? 'reinstalled' : 'partial',
            message: failed.length === 0 ? '重装完成。' : '重装完成但有 ' + String(failed.length) + ' 步失败。',
            executed, failed, recoveryPointWritten,
        };
    }
    catch (error) {
        if (error instanceof EnvironmentLockUnavailableError) {
            return { ok: false, code: 'locked', message: '拒绝执行：' + error.message };
        }
        return { ok: false, code: 'reinstall-failed', message: errorText(error) };
    }
}
/** 与 CLI 的 SAFE MODE 门同源（fail-closed：读不到也算阻断）。 */
function checkSafeModeBlockedLocal(controlRoots) {
    if (controlRoots.length === 0) {
        return '无法确定插件数据目录（控制面根），出于安全考虑拒绝执行。';
    }
    for (const root of controlRoots) {
        const state = readSafeModeMarkerSync(root);
        if (state === 'blocked')
            return 'SAFE MODE 已激活（存在未结案的配置 transaction）：先处理恢复事项再重装。';
        if (state === 'unknown')
            return 'SAFE MODE 标记无法判定（按最保守口径处理）：先人工核对标记文件。';
    }
    return null;
}
//# sourceMappingURL=actions.js.map