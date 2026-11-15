/**
 * Qoder（~\.qoder/projects）用户目录的**读盘**层（宿主侧，node:fs）。
 *
 * 位置真值（read-chat-import.md §3.1 的 qoder 行；交叉核对 read-movein.md 附录 A 与
 * read-vault.md §10.2 —— 三份报告的**根**与**编码规则**逐字一致，无出入）：
 *  - 根：`<home>/.qoder/projects`（三平台同形，**无环境变量覆盖**）
 *  - 会话：`<projects>/<encoded-project>/<sessionId>.jsonl`（JSONL）
 *  - 目录名 = cwd 的 `/`→`-` 编码（convert/qoder.mjs:3-16）
 *  - 子代理会话在 `<projects>/<encoded-project>/<sessionId>/subagents/*.jsonl`
 *
 * cwd 的来源分两档，**绝不猜**：
 *  ① 记录里有 cwd 字段 → 采信记录（权威）；
 *  ② 没有 → 用目录名的 `/`→`-` 编码**反解**，且**反解结果必须在本机真实存在**（isDirectory）
 *     才落盘，并如实报 `session-cwd-derived`（types.ts 对该码的语义：存在性检查把「猜」变成
 *     「有证据的推断」）。反解不存在 → **不产出**会话（下游按 session-missing-cwd 跳过），
 *     绝不产出一条指向不存在目录的会话。
 *
 * 子代理 transcript（`subagents/*.jsonl`）**本期不迁移**：DSH 侧的子代理会话靠
 * `delegationDepth/origin` 表达，而 IR 层当前的草稿没有承载位（`transcodeSessionDraft`
 * 恒写 delegationDepth: 0）—— 硬导成顶层会话会让用户看到一条「不是自己开的对话」。
 * 因此只逐类计数并报 `unsupported-session-record`（detail=subagent-transcript），**绝不静默**。
 *
 * 取证强度：**fixture**（真值表 truth-table.ts 的 qoder 行）。本机无 ~/.qoder/projects，
 * 夹具 + 单测端到端跑同一份布局 —— **真机未验证，不得标 measured**。
 *
 * 读盘纪律（与 read-claude-code.ts / read-cursor.ts 同口径）：只读固定位置、不跟随符号链接、
 * 单文件有字节上限（超限即**不读**并如实报码，绝不截断）、读不到一律记账不抛、结果排序确定。
 * 路径函数**显式收 platform**（joinFor）——运行时平台的真值只在装配层兜底，绝不在这里读。
 */
import fs from 'node:fs/promises';
import { joinFor, normalizePlatform, sepFor } from './platform-paths.js';
import { DEFAULT_MAX_FILE_BYTES, isDirectory, listDirNames, listFileNames, statOrNull, stemOf } from './session-read.js';
import { GENERIC_TRANSCRIPT_SHAPE, firstUserText, genericBlocksOf } from './session-source.js';
import { irBump, irEarlier, irSafeTime, irStr, irToolResultBlock } from './session-ir.js';
import { isRecord } from '../utils/guards.js';
/** 相对用户 home 的位置标签前缀（回给 GUI/CLI 的**只允许路径**，绝不含用户名/盘符） */
export const QODER_PROJECTS_REL = '.qoder/projects';
/** 会话文件（在该来源里 JSONL 是唯一形态） */
export const QODER_SESSION_FILE_RE = /\.jsonl$/;
/** 单次读盘的会话文件数上限（防病态目录树；与 Claude 读盘层同量级） */
const MAX_SESSION_FILES = 500;
/** Qoder 的项目根（三平台同形；真值表没有为它列任何环境变量覆盖） */
export function qoderProjectsDir(opts) {
    return joinFor(normalizePlatform(opts.platform), opts.homeDir, '.qoder', 'projects');
}
/**
 * 记录形态：与通用 JSONL 同族（`{role|type, message|content, timestamp, id}`）。
 *
 * 两处**收紧**（不是美化，而是避免误取）：
 *  - `titleKeys` 去掉 `name`：JSONL 里的 `name` 常是工具名，拿它当标题会张冠李戴；
 *  - `cwdKeys` 加几个同义键（记录里带 cwd 时优先采信记录，见文件头 ①）。
 */
export const QODER_SHAPE = {
    ...GENERIC_TRANSCRIPT_SHAPE,
    cwdKeys: ['cwd', 'workdir', 'working_directory', 'workingDir', 'directory', 'projectPath', 'project_path', 'workspacePath', 'workspace_path'],
    titleKeys: ['title', 'summary', 'sessionTitle'],
};
/** 读一个文件（大小闸门在前，绝不截断）；空文件 / 超限 / 读失败都变成稳定机器码 */
async function readTextGuarded(p, label, maxBytes, findings) {
    const st = await statOrNull(p);
    if (st === null || !st.isFile())
        return null;
    if (st.size > maxBytes) {
        findings.push({ code: 'source-unreadable', origin: label, detail: 'too-large' });
        return null;
    }
    let text;
    try {
        text = await fs.readFile(p, 'utf8');
    }
    catch {
        findings.push({ code: 'source-unreadable', origin: label, detail: 'read-error' });
        return null;
    }
    if (text.trim() === '') {
        findings.push({ code: 'source-empty-file', origin: label });
        return null;
    }
    return text;
}
/**
 * 目录名（cwd 的 `/`→`-` 编码）→ 本机真实存在的目录；反解不出来就返回 undefined（绝不猜）。
 *
 * 两个候选形态（按平台决定先后，**存在性**是唯一判据）：
 *  - posix 形态：`-home-u-proj` → `/home/u/proj`；
 *  - win32 盘符形态：`C--Users-u-proj` → `C:\Users\u\proj`。
 */
export async function derivedCwdOf(encoded, platform) {
    const sep = sepFor(platform);
    const posix = encoded.split('-').join('/');
    const drive = /^([A-Za-z])--(.*)$/.exec(encoded);
    const driveForm = drive === null ? undefined : drive[1] + ':' + sep + (drive[2] ?? '').split('-').join(sep);
    const candidates = platform === 'win32'
        ? [driveForm, posix]
        : [posix, driveForm];
    for (const candidate of candidates) {
        if (candidate === undefined || candidate === '')
            continue;
        if (await isDirectory(candidate))
            return candidate;
    }
    return undefined;
}
/** 子代理 transcript 的条数（只数不读；正文绝不进内存） */
async function countSubagentTranscripts(sessionDir, platform) {
    const subDir = joinFor(platform, sessionDir, 'subagents');
    if (!(await isDirectory(subDir)))
        return 0;
    return (await listFileNames(subDir, (n) => QODER_SESSION_FILE_RE.test(n))).length;
}
function qoderRoleOf(rec, msg) {
    for (const raw of [irStr(rec['type']), irStr(msg['role']), irStr(rec['role'])]) {
        if (raw === undefined)
            continue;
        const lower = raw.toLowerCase();
        if (QODER_SHAPE.userValues.includes(lower))
            return 'user';
        if (QODER_SHAPE.assistantValues.includes(lower))
            return 'assistant';
    }
    return undefined;
}
function qoderFirstString(rec, keys) {
    for (const key of keys) {
        const v = irStr(rec[key]);
        if (v !== undefined)
            return v;
    }
    return undefined;
}
function qoderFirstTime(rec, keys) {
    for (const key of keys) {
        const t = irSafeTime(rec[key]);
        if (t !== undefined)
            return t;
    }
    return undefined;
}
/**
 * `tool_result` 缺 `tool_use_id` 时按**未决调用顺序**回退配对（参考 unresolved 语义）。
 * 显式带 id 的结果把该 id 从未决队列移除（乱序 / 后置结果）。
 */
function pairQoderToolResults(blocks, unresolved) {
    for (let i = 0; i < blocks.length; i += 1) {
        const block = blocks[i];
        if (block === undefined || block.type !== 'tool_result')
            continue;
        if (block.id !== '') {
            const at = unresolved.indexOf(block.id);
            if (at >= 0)
                unresolved.splice(at, 1);
            continue;
        }
        const fallback = unresolved.shift();
        if (fallback === undefined)
            continue;
        blocks[i] = irToolResultBlock(fallback, block.text, block.isError);
    }
}
/** 一份 Qoder transcript（JSONL）→ 归一记录 + 主体判定（`fileStem` = 文件名去掉 .jsonl） */
export function parseQoderJsonl(text, fileStem = '') {
    const records = [];
    const ignored = {};
    let raw = 0;
    let bad = 0;
    let cwd;
    let createdAt;
    let sessionId;
    let model;
    let aiTitle = '';
    let lastPrompt = '';
    // 未决调用 id（按出现顺序；缺 tool_use_id 的结果按它回退配对）
    const unresolved = [];
    for (const line of text.split(String.fromCharCode(10))) {
        if (line.trim() === '')
            continue;
        let parsed;
        try {
            parsed = JSON.parse(line);
        }
        catch {
            bad += 1;
            continue;
        }
        if (!isRecord(parsed)) {
            bad += 1;
            continue;
        }
        raw += 1;
        if (sessionId === undefined)
            sessionId = irStr(parsed['sessionId']);
        if (cwd === undefined)
            cwd = qoderFirstString(parsed, QODER_SHAPE.cwdKeys);
        createdAt = irEarlier(createdAt, qoderFirstTime(parsed, QODER_SHAPE.timeKeys));
        const msg = isRecord(parsed['message']) ? parsed['message'] : parsed;
        if (model === undefined) {
            model = (isRecord(parsed['message']) ? irStr(parsed['message']['model']) : undefined)
                ?? qoderFirstString(parsed, QODER_SHAPE.modelKeys);
        }
        const type = irStr(parsed['type']);
        if (type === 'ai-title') {
            // 重命名后到者胜：首个非空 ai-title 为准（与参考一致）
            if (aiTitle === '')
                aiTitle = irStr(parsed['aiTitle']) ?? '';
            continue;
        }
        if (type === 'last-prompt') {
            if (lastPrompt === '')
                lastPrompt = irStr(parsed['lastPrompt']) ?? '';
            continue;
        }
        const role = qoderRoleOf(parsed, msg);
        if (role === undefined) {
            irBump(ignored, type === undefined ? 'unknown' : type);
            continue;
        }
        const blocks = genericBlocksOf(msg['content'], ignored, 'block');
        pairQoderToolResults(blocks, unresolved);
        if (role === 'assistant') {
            for (const block of blocks) {
                if (block.type === 'tool_call' && block.id !== '')
                    unresolved.push(block.id);
            }
        }
        if (blocks.length === 0) {
            irBump(ignored, (type ?? role) + ':no-content');
            continue;
        }
        const time = qoderFirstTime(parsed, QODER_SHAPE.timeKeys);
        const id = qoderFirstString(parsed, QODER_SHAPE.idKeys);
        records.push({
            role,
            blocks,
            ...(time !== undefined ? { time } : {}),
            ...(id !== undefined ? { id } : {}),
            ...(role === 'assistant' && model !== undefined ? { model } : {}),
        });
    }
    // 标题：ai-title > last-prompt > 首问兜底（参考 convert/qoder.mjs）
    let title = aiTitle.trim();
    if (title === '')
        title = lastPrompt.trim();
    if (title === '')
        title = firstUserText(records);
    return {
        parsed: { records, cwd, createdAt, title: title.slice(0, 200), raw, bad, ignored },
        ...(sessionId !== undefined ? { sessionId } : {}),
        stemMismatch: sessionId !== undefined && fileStem !== '' && sessionId !== fileStem,
    };
}
export async function readQoderSessions(opts) {
    const platform = normalizePlatform(opts.platform);
    const projectsDir = qoderProjectsDir(opts);
    const maxBytes = opts.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    const maxFiles = opts.maxSessionFiles ?? MAX_SESSION_FILES;
    const findings = [];
    const files = [];
    let subagents = 0;
    let auxiliary = 0;
    if (!(await isDirectory(projectsDir))) {
        return { files, readFindings: findings, extraCounts: { 'sessions.candidates': 0 } };
    }
    // 触顶必须**可见**（audit-foreign F4）。
    let truncated = false;
    for (const project of await listDirNames(projectsDir)) {
        const projectDir = joinFor(platform, projectsDir, project);
        const derivedCwd = await derivedCwdOf(project, platform);
        for (const name of await listFileNames(projectDir, (n) => QODER_SESSION_FILE_RE.test(n))) {
            if (files.length >= maxFiles) {
                truncated = true;
                break;
            }
            const label = QODER_PROJECTS_REL + '/' + project + '/' + name;
            const text = await readTextGuarded(joinFor(platform, projectDir, name), label, maxBytes, findings);
            if (text === null)
                continue;
            const id = stemOf(name);
            const outcome = parseQoderJsonl(text, id);
            if (outcome.stemMismatch) {
                // 主体判定（参考 convert/qoder.mjs）：文件名 stem ≠ 记录 sessionId = 辅助 / 子代理
                // transcript。按它建会话会与主 transcript 撞 id（先到者占会话，主内容被幂等跳过）
                auxiliary += 1;
                continue;
            }
            const base = outcome.parsed;
            if (base.cwd === undefined && derivedCwd !== undefined) {
                files.push({ id, parsed: { ...base, cwd: derivedCwd } });
                findings.push({ code: 'session-cwd-derived', origin: id, detail: 'project-dir-encoding' });
                continue;
            }
            files.push({ id, parsed: base });
        }
        for (const sessionId of await listDirNames(projectDir)) {
            subagents += await countSubagentTranscripts(joinFor(platform, projectDir, sessionId), platform);
        }
    }
    if (truncated)
        findings.push({ code: 'source-unreadable', origin: 'qoder', detail: 'max-sessions-reached', count: maxFiles });
    const extraSkips = [];
    if (subagents > 0) {
        extraSkips.push({ code: 'unsupported-session-record', origin: 'subagents', detail: 'subagent-transcript', count: subagents });
    }
    if (auxiliary > 0) {
        extraSkips.push({ code: 'unsupported-session-record', origin: 'qoder', detail: 'auxiliary-transcript', count: auxiliary });
    }
    return {
        files,
        readFindings: findings,
        extraSkips,
        extraCounts: {
            'sessions.candidates': files.length,
            'qoder.subagentTranscripts': subagents,
            'qoder.auxiliaryTranscripts': auxiliary,
        },
    };
}
//# sourceMappingURL=read-qoder.js.map