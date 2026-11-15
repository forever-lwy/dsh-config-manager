/**
 * 会话类来源的**共享装配层**（档 B 24 个来源共用；纯函数，零 I/O）。
 *
 * 三段式的第三段与第二段在这里收口（第一段「源格式 → 归一记录」在各来源自己的 `<id>.ts` 里）：
 *
 *   源原文 --(各来源 parse)--> TranscriptRecord[] --(本模块)--> IR --(synthesizeDshRows)--> DSH 行
 *          --(encodeDshSessionLog)--> 字节 --(kernel.collectSessionSections)--> sessions+workspaces 分区
 *
 * 为什么必须收口：这四步里有三处**宿主硬不变量**（DSH codec 强校验 seq / surfaceOp / 工具闭合）与
 * 一处**契约硬约束**（同一 DSH 会话 id 只允许出现一次、必须连 workspaces 一起产出）。
 * 24 个来源各写一遍 = 24 个地方可能写错，且错法是「导入全绿但对话不出现」。
 *
 * 与 `claude-sessions.ts` 的关系：**字节出口只有一份实现**（本模块复用它的 `encodeDshSessionLog`
 * 与 `dshSessionLogName`），Claude 自己的解析路径**一字未改**（逐字节回归仍然钉住它）。
 */
import { projectKeyOf } from '../core/session-select.js';
import { dshSessionLogName, encodeDshSessionLog, SUPPORTED_DSH_SESSION_FORMAT_VERSIONS } from './claude-sessions.js';
import { collectSessionSections } from './kernel.js';
import { foreignSourceLabelKey } from './source-modules.js';
import { probeConfiguredPaths } from './session-read.js';
import { envValue } from './platform-paths.js';
import { irBump, irEarlier, irFallbackMessageId, irMessage, irSafeTime, irTextBlock, irTextOfBlocks, irToolCallBlock, irToolResultBlock, isSafeIrId, synthesizeDshRows, } from './session-ir.js';
import { isRecord } from '../utils/guards.js';
/** 归一记录 → SessionDraft（各来源统一走这一处，不自己拼 IrMessage） */
export function draftFromTranscript(id, parsed, provider) {
    const messages = [];
    let index = 0;
    for (const rec of parsed.records) {
        const passthrough = {};
        if (rec.time !== undefined)
            passthrough['time'] = rec.time;
        if (rec.usage !== undefined)
            passthrough['usage'] = rec.usage;
        if (rec.role === 'assistant')
            passthrough['source'] = { model: rec.model ?? '' };
        const messageId = rec.id !== undefined && isSafeIrId(rec.id) ? rec.id : irFallbackMessageId(index);
        messages.push(irMessage(messageId, rec.role, rec.blocks, passthrough));
        index += 1;
    }
    return {
        id,
        cwd: parsed.cwd,
        createdAt: parsed.createdAt,
        title: parsed.title,
        messages,
        records: parsed.raw,
        provider,
        ignored: parsed.ignored,
        unparsable: parsed.bad,
    };
}
/**
 * 骨架的三段判定 + 合成 + 编码（**所有会话类来源的唯一出口**）。
 *
 * 判定顺序与 `transcodeClaudeSession` 逐条对齐（版本 → id → 空 → 缺 cwd → 解析不出 → 合成空）：
 * 顺序变了，用户看到的 skip 码就会变（同一个坏文件从 session-missing-cwd 变成 session-empty）。
 */
export function transcodeSessionDraft(draft, options) {
    if (!SUPPORTED_DSH_SESSION_FORMAT_VERSIONS.includes(options.formatVersion)) {
        return { skip: { code: 'session-format-unsupported', detail: String(options.formatVersion) } };
    }
    if (!isSafeIrId(draft.id))
        return { skip: { code: 'session-unsafe-id', detail: draft.id } };
    if (draft.records === 0)
        return { skip: { code: 'session-empty' } };
    if (draft.cwd === undefined || draft.cwd === '')
        return { skip: { code: 'session-missing-cwd', detail: draft.id } };
    if (draft.messages.length === 0 && (draft.unparsable ?? 0) > 0) {
        return { skip: { code: 'session-unparsable', detail: draft.id } };
    }
    const now = options.now ?? Date.now();
    const stats = { ignored: {}, userMessages: 0, assistantMessages: 0, toolCalls: 0, toolResults: 0 };
    if ((draft.unparsable ?? 0) > 0)
        irBump(stats.ignored, 'unparsable', draft.unparsable ?? 0);
    for (const [kind, count] of Object.entries(draft.ignored ?? {})) {
        if (count > 0)
            irBump(stats.ignored, kind, count);
    }
    const createdAt = draft.createdAt ?? now;
    const rows = synthesizeDshRows({ id: draft.id, cwd: draft.cwd, createdAt, records: draft.records, messages: draft.messages }, {
        title: draft.title,
        titleSource: { kind: 'fallback' },
        emptyBlocks: draft.emptyBlocks ?? [],
        provider: draft.provider,
        reasoningEffort: 'medium',
        maxTokens: 8192,
    }, stats, now);
    if (rows.length === 0)
        return { skip: { code: 'session-empty' } };
    const header = {
        type: 'session',
        version: options.formatVersion,
        id: draft.id,
        createdAt,
        cwd: draft.cwd,
        isSeeded: false,
        delegationDepth: 0,
    };
    return {
        session: {
            id: draft.id,
            cwd: draft.cwd,
            relativePath: projectKeyOf(draft.cwd) + '/' + draft.id + '/' + dshSessionLogName(options.formatVersion),
            data: encodeDshSessionLog(header, rows),
            info: { ignored: stats.ignored },
        },
    };
}
/**
 * 会话类来源的**统一出口**：草稿 → sessions + workspaces 分区 → ForeignImportResult。
 *
 * 走 `kernel.collectSessionSections`（与 Claude 同一份实现）而不是自己拼，理由有三：
 *  ① 冲突语义（同 DSH 会话 id 只允许出现一次）只有一处实现；
 *  ② workspaces 必须与会话同源产出（只给会话不给工作区 = 目标机上一条对话都看不见）；
 *  ③ 「未迁移记录逐类计数」只有一处实现。
 */
export function buildSessionSourceResult(source, opts) {
    const sections = [];
    const skipped = [...(opts.readFindings ?? []), ...(opts.extraSkips ?? [])];
    const counts = { ...(opts.extraCounts ?? {}) };
    const formatVersion = opts.targetFormatVersion ?? -1;
    collectSessionSections({
        files: opts.files,
        targetFormatVersion: opts.targetFormatVersion,
        transcode: (file) => {
            const draft = opts.draftOf(file);
            if ('skip' in draft)
                return { skip: draft.skip };
            return transcodeSessionDraft(draft, { formatVersion });
        },
        workspaceIdPrefix: opts.workspaceIdPrefix,
        sections,
        skipped,
        counts,
    });
    return { source, sections, skipped, credentialRefs: [], counts };
}
/* ---------------- ④ 通用内容块 / 记录映射（各来源共用的兜底口径） ---------------- */
/** 文本投影：字符串原样；数组逐项拼；对象取 text/content/message；其余 → ''（绝不 JSON.stringify 进正文） */
export function flattenText(value, unknown, key = 'block') {
    if (typeof value === 'string')
        return value;
    if (Array.isArray(value)) {
        const parts = [];
        for (const item of value)
            parts.push(flattenText(item, unknown, key));
        return parts.join(String.fromCharCode(10));
    }
    if (isRecord(value)) {
        for (const candidate of ['text', 'content', 'message']) {
            if (value[candidate] !== undefined)
                return flattenText(value[candidate], unknown, key);
        }
        if (unknown !== undefined)
            irBump(unknown, key + ':unmapped');
        return '';
    }
    return '';
}
const TOOL_CALL_TYPES = ['tool_use', 'tool_call', 'function_call', 'tool-call', 'tool-invocation'];
const TOOL_RESULT_TYPES = ['tool_result', 'tool_response', 'function_call_output', 'tool-result'];
const TEXT_TYPES = ['text', 'input_text', 'output_text', 'message'];
function firstString(rec, keys) {
    for (const key of keys) {
        const v = rec[key];
        if (typeof v === 'string' && v !== '')
            return v;
    }
    return undefined;
}
/** 工具入参：字符串若是 JSON 就解析（源侧两种形态并存），否则原样字符串 */
function toolInputOf(raw) {
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
                return JSON.parse(trimmed);
            }
            catch {
                return raw;
            }
        }
    }
    return raw;
}
/**
 * 通用内容块映射（绝大多数来源的 `content` / `parts` 都能被它覆盖）。
 *
 * 覆盖四种形态：字符串、块数组（text / tool_use / tool_result）、单块对象、
 * 以及把整段对话描述成 `{type:'text',text}` 的形态。**不认识的块逐类计数**（绝不静默丢）。
 */
export function genericBlocksOf(content, unknown, key = 'block') {
    if (typeof content === 'string')
        return [irTextBlock(content)];
    if (Array.isArray(content)) {
        const out = [];
        for (const item of content)
            out.push(...genericBlocksOf(item, unknown, key));
        return out;
    }
    if (!isRecord(content))
        return [];
    const type = typeof content['type'] === 'string' ? content['type'] : '';
    const lower = type.toLowerCase();
    if (TOOL_CALL_TYPES.includes(lower)) {
        const name = firstString(content, ['name', 'tool', 'toolName', 'tool_name']) ?? '';
        const id = firstString(content, ['id', 'tool_call_id', 'callId', 'call_id']) ?? '';
        const input = content['input'] ?? content['arguments'] ?? content['args'] ?? content['parameters'];
        return [irToolCallBlock(id, name, toolInputOf(input))];
    }
    if (TOOL_RESULT_TYPES.includes(lower)) {
        const id = firstString(content, ['tool_use_id', 'tool_call_id', 'call_id', 'id']) ?? '';
        const body = content['content'] ?? content['output'] ?? content['result'] ?? content['text'];
        const text = flattenText(body, unknown, key);
        const isError = content['is_error'] === true || content['isError'] === true || content['error'] === true;
        return [irToolResultBlock(id, text, isError)];
    }
    if (lower === '' || TEXT_TYPES.includes(lower)) {
        const text = content['text'] !== undefined ? content['text'] : content['content'];
        if (typeof text === 'string')
            return [irTextBlock(text)];
        if (Array.isArray(text))
            return genericBlocksOf(text, unknown, key);
        if (typeof content['content'] === 'string')
            return [irTextBlock(content['content'])];
    }
    if (unknown !== undefined)
        irBump(unknown, key + ':' + (lower === '' ? 'unmapped' : lower));
    return [];
}
/** 主形态（Claude / Codex / 多数 JSONL 工具的共同结构：{type|role, message|content,…}） */
export const GENERIC_TRANSCRIPT_SHAPE = {
    roleKeys: ['role', 'type', 'kind', 'sender'],
    contentKeys: ['message', 'content', 'parts', 'text', 'data'],
    typeKey: 'type',
    userValues: ['user', 'human', 'user_message', 'user-message', 'prompt'],
    assistantValues: ['assistant', 'ai', 'model', 'gemini', 'assistant_message', 'assistant-message', 'completion'],
    timeKeys: ['timestamp', 'time', 'createdAt', 'created_at', 'ts', 'date'],
    idKeys: ['id', 'uuid', 'messageId', 'message_id'],
    cwdKeys: ['cwd', 'workdir', 'working_directory', 'workingDir', 'directory'],
    titleKeys: ['title', 'summary', 'name'],
    modelKeys: ['model', 'modelId', 'model_id'],
    textKeys: [],
};
/** 取第一条可用的内容字段值（message 是对象时下钻一层到它的 content） */
function contentOf(rec, shape) {
    for (const key of shape.contentKeys) {
        const raw = rec[key];
        if (raw === undefined || raw === null)
            continue;
        if (isRecord(raw)) {
            for (const inner of ['content', 'text', 'parts', 'blocks']) {
                if (raw[inner] !== undefined)
                    return raw[inner];
            }
            return raw;
        }
        return raw;
    }
    return undefined;
}
/** 在**一个**记录里按 roleKeys 找角色（找不到返回 undefined） */
function roleIn(rec, shape) {
    for (const key of shape.roleKeys) {
        const raw = rec[key];
        if (typeof raw !== 'string' || raw === '')
            continue;
        const lower = raw.toLowerCase();
        if (shape.userValues.includes(lower))
            return 'user';
        if (shape.assistantValues.includes(lower))
            return 'assistant';
        return 'unsupported:' + lower;
    }
    return undefined;
}
/**
 * 角色归一：命中 userValues → user，命中 assistantValues → assistant，其余 undefined（调用方计数）。
 *
 * **一层包装的回退**（2026-10-06）：事件流形态的源把角色放在 `{type:'message', message:{role,…}}` 的
 * 内层对象里（Pi / OpenClaw 等）。顶层**完全取不到**角色时才下钻一层 —— 顶层能取到就照旧，
 * 既有 24 个来源的判定因此逐字不变（回归由各自单测钉住）。
 */
function roleOf(rec, shape) {
    const direct = roleIn(rec, shape);
    if (direct !== undefined)
        return direct;
    const inner = rec['message'];
    if (isRecord(inner))
        return roleIn(inner, shape);
    return undefined;
}
/**
 * 通用 JSONL 解析：**一行一条 JSON 对象**，按 shape 映射成归一记录。
 *
 * 三条纪律（与竞品 `parseJsonlLines` 的记账口径同源，但**明细不设 200 上限**）：
 *  ① 坏行不抛，只计入 `bad`；② 未迁移记录类型逐类计入 `ignored`；③ cwd 取**第一个**有值的记录。
 */
export function parseGenericJsonl(text, shape = GENERIC_TRANSCRIPT_SHAPE) {
    const records = [];
    const ignored = {};
    let raw = 0;
    let bad = 0;
    let cwd;
    let createdAt;
    let title = '';
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
        if (cwd === undefined)
            cwd = firstString(parsed, shape.cwdKeys);
        const typeValue = parsed[shape.typeKey];
        const typeName = typeof typeValue === 'string' && typeValue !== '' ? typeValue : 'unknown';
        if (title === '') {
            const candidate = firstString(parsed, shape.titleKeys);
            if (candidate !== undefined && shape.titleKeys.indexOf(shape.typeKey) < 0)
                title = candidate;
        }
        const time = firstTime(parsed, shape.timeKeys);
        createdAt = irEarlier(createdAt, time);
        const role = roleOf(parsed, shape);
        if (role === undefined || role.startsWith('unsupported:')) {
            irBump(ignored, role === undefined ? typeName : role.slice('unsupported:'.length));
            continue;
        }
        if (shape.textKeys.length > 0) {
            let handled = false;
            for (const key of shape.textKeys) {
                const v = parsed[key];
                if (typeof v === 'string' && v !== '') {
                    records.push({ role: role, blocks: [irTextBlock(v)], time });
                    handled = true;
                    break;
                }
            }
            if (handled)
                continue;
        }
        const blocks = genericBlocksOf(contentOf(parsed, shape), ignored);
        if (blocks.length === 0) {
            irBump(ignored, typeName + ':no-content');
            continue;
        }
        records.push({
            role: role,
            blocks,
            time,
            id: firstString(parsed, shape.idKeys),
            model: firstString(parsed, shape.modelKeys),
            usage: isRecord(parsed['usage']) ? parsed['usage'] : undefined,
        });
    }
    if (title === '')
        title = firstUserText(records);
    return { records, cwd, createdAt, title, raw, bad, ignored };
}
function firstTime(rec, keys) {
    for (const key of keys) {
        const t = irSafeTime(rec[key]);
        if (t !== undefined)
            return t;
    }
    return undefined;
}
/** 首条用户文本前 80 字（折叠空白）——标题兜底口径与 Claude 一致 */
export function firstUserText(records) {
    for (const rec of records) {
        if (rec.role !== 'user')
            continue;
        const text = irTextOfBlocks(rec.blocks);
        if (text.trim() !== '')
            return text.replace(/\s+/g, ' ').trim().slice(0, 80);
    }
    return '';
}
/** 取源给的会话标题字段（空串表示没有） */
export function titleFromRecord(rec, keys) {
    if (!isRecord(rec))
        return '';
    const v = firstString(rec, keys);
    return v === undefined ? '' : v.slice(0, 200);
}
/** 归一记录的 id 兜底（源没给合法 id 时用会话内序号铸稳定伪 uuid） */
export function recordIdOf(raw, index) {
    return raw !== undefined && isSafeIrId(raw) ? raw : irFallbackMessageId(index);
}
/**
 * 把一个会话来源装配成 `ForeignSource`。
 *
 * **detect 默认只 stat 真值表里的位置**（绝不读内容、绝不枚举会话）—— 界面对 30 个来源各调一次
 * detect，任何一处读全文都会把面板拖慢；真正的枚举发生在 build。唯一例外是来源在 `probeSkips`
 * 里显式声明的**有界轻量探测**（trae：加密库只解密第 1 页、旧库只读 key 列），因为它们要回答的
 * 正是「为什么这里没有会话」，而这件事只有看内容才知道。
 *
 * platform 的兜底只在**这一处**：`ctx.platform ?? process.platform`（装配层碰运行平台是允许的，
 * 真值表函数本身一律显式收参）。
 */
export function sessionSourceOf(wiring) {
    return {
        id: wiring.id,
        labelKey: foreignSourceLabelKey(wiring.id),
        evidence: wiring.evidence,
        probePaths: wiring.probePaths,
        async detect(ctx) {
            const opts = {
                homeDir: ctx.homeDir,
                env: ctx.env,
                platform: ctx.platform ?? process.platform,
                ...(ctx.projectDir !== undefined ? { projectDir: ctx.projectDir } : {}),
            };
            const probed = await probeConfiguredPaths(wiring.probePaths(opts), ctx.homeDir);
            const skipped = [...probed.skipped];
            for (const key of wiring.probeEnvKeys ?? []) {
                if (envValue(ctx.env, key) !== undefined)
                    skipped.push({ code: 'source-location-overridden', origin: key });
            }
            skipped.push(...((await wiring.probeSkips?.(opts, probed.paths)) ?? []));
            return { found: probed.paths.length > 0, paths: [...probed.paths], skipped };
        },
        async build(ctx) {
            const read = await wiring.read({
                homeDir: ctx.homeDir,
                env: ctx.env,
                platform: ctx.platform ?? process.platform,
                ...(ctx.projectDir !== undefined ? { projectDir: ctx.projectDir } : {}),
                targetFormatVersion: ctx.targetSessionFormatVersion,
                // t36：上下文里的可选上限**原样**透传（不再固定只传 5 个字段）；不给就一个键都不加
                ...(ctx.limits !== undefined ? { limits: ctx.limits } : {}),
            });
            return buildSessionSourceResult(wiring.id, {
                files: read.files,
                targetFormatVersion: ctx.targetSessionFormatVersion,
                workspaceIdPrefix: wiring.workspaceIdPrefix ?? wiring.id,
                draftOf: wiring.draftOf,
                readFindings: read.readFindings,
                extraSkips: read.extraSkips,
                extraCounts: read.extraCounts,
            });
        },
    };
}
//# sourceMappingURL=session-source.js.map