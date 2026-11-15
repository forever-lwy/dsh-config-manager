import { projectKeyOf } from '../core/session-select.js';
import { encodeZstdFrame } from '../utils/zstd-frame.js';
import { irBump, irEarlier, irMessage, irMessageIdOf, irNum, irSafeTime, irStr, irTextBlock, irTextOfBlocks, irToolCallBlock, irToolResultBlock, isSafeIrId, parseJsonlObjects, synthesizeDshRows, } from './session-ir.js';
/**
 * 本模块已实现行式的 DSH 会话格式版本（其它版本一律拒绝，不猜）。
 *
 * **v3 与 v4 的行式是同一套**：`synthesizeDshRows` 产出的行在两代 DSH 自己的真 codec 上逐条复验过
 * （v3 档 = 本机 CLI 档案树的 dsh-session；v4 档 = 桌面端 0.2.0-rc.2，均 `equivalentToReadPath`）。
 * 所以**按目标机的版本写**：目标是 v3 就写 v3、是 v4 就写 v4。两条反向都不行 —— 一律写最高版本
 * 会让 v3 主机读不了（反向不可读）；只认 v3 则让 v4 目标整批被跳过（2026-10-08 真机事故：
 * 桌面端 v4 目标下每一条会话都被 `session-format-unsupported` 拒掉，产出的包里没有 sessions 分区）。
 */
export const SUPPORTED_DSH_SESSION_FORMAT_VERSIONS = [3, 4];
/** 单帧的软上限（字节）：把多条事件行合并进一帧，避免「一行一帧」产生上千个帧 */
const FRAME_TARGET_BYTES = 64 * 1024;
/** 该会话的请求头能力声明（从重构前的内联字面量原样搬出，取值一字未改） */
const CLAUDE_PROVIDER = 'claude-code';
const CLAUDE_REASONING_EFFORT = 'medium';
const CLAUDE_MAX_TOKENS = 8192;
/** `message.usage` 的一个字段（对象外一律 undefined —— 形态不符是「没这回事」，不是「0 用量」） */
function usageField(usage, key) {
    return typeof usage === 'object' && usage !== null ? usage[key] : undefined;
}
/**
 * 推理块的类型名 = Claude Code **自己**写的两种：`thinking` 与 `redacted_thinking`。
 *
 * 为什么必须按类型名判定：`thinking` 块的正文在 **`thinking` 键**里（没有 `text` 字段），旧实现
 * 沿「对象带 text 才算文本」的兜底把它变成一个**空文本块** —— 内容静默丢失，且那个空块还会多插入
 * 一个换行。本仓其余 20+ 来源一律「推理不伪装成正文、只计数」（read-crush / read-opencode /
 * read-qwen / read-pi / read-openclaw …），这里对齐同一口径；共享 IR 无 reasoning 承载位这件事
 * 记在 docs/known-issues/known-gaps.md 的 F-01。
 *
 * **为什么不把 `{type:'reasoning', text:'…'}` 一并纳入**（如实记明，别当成漏掉）：
 *  ① Claude Code 不写这种块（它是别的导出器的归一命名，各来源自己的解析器已各自计报）；
 *  ② 共享 IR 的文本兜底分支（**对象带 `text` 就当文本块**）是**被逐字节回归钉住的既有行为**
 *     （见 `blocksOf` 的注释），而这个块恰好命中它 —— 一并丢掉会让
 *     `claude-sessions-bytes.test.ts` 的 `timestamps-numeric-and-unparsable` 一案从 728 字节
 *     变成 722 字节（正文少一段 'r'）。那是**用户可见**的正文变化，按本轮的硬约束（既有语料
 *     逐字一致）不由「修推理块静默丢弃」顺手引入。
 *  ③ 要一并计报，改这一个数组即可，并同步更新该案基线（现行行为已被
 *     `claude-sessions.test.ts` 的「reasoning 形状」用例显式钉住）。
 */
const REASONING_BLOCK_TYPES = ['thinking', 'redacted_thinking'];
/** 推理块的占位（字段一律空：它不进 IR，只需被识别出来计数） */
function reasoningBlock() {
    return { kind: 'thinking', text: '', id: '', name: '', input: undefined, isError: false };
}
function blockOf(raw) {
    const rec = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : undefined;
    if (rec === undefined) {
        return { kind: 'other', text: '', id: '', name: '', input: undefined, isError: false };
    }
    const rawType = irStr(rec['type']) ?? '';
    if (REASONING_BLOCK_TYPES.includes(rawType))
        return reasoningBlock();
    const id = irStr(rec['id']) ?? '';
    const name = irStr(rec['name']);
    const isText = rawType === 'text' || typeof rec['text'] === 'string';
    if (isText) {
        return {
            kind: 'text',
            text: typeof rec['text'] === 'string' ? rec['text'] : '',
            id, name: '', input: undefined, isError: false,
        };
    }
    if (rawType === 'tool_use' && name !== undefined) {
        return { kind: 'call', text: '', id, name, input: rec['input'], isError: false };
    }
    // 工具结果的配对键是 Claude 的 `tool_use_id`（不是块 id）；**空串照抄**（源没给就保持空，
    // 不伪造 —— 伪造会让 tool_result 与 tool/call 的 callId 对不上）
    if (rawType === 'tool_result') {
        const key = irStr(rec['tool_use_id']);
        if (key !== undefined) {
            return { kind: 'result', text: '', id: key, name: '', input: undefined, isError: rec['is_error'] === true };
        }
    }
    return { kind: 'other', text: '', id, name: '', input: undefined, isError: false };
}
/**
 * 内容块抽取：字符串正文 / 数组正文 / 对象正文（含 `text` 字段）。
 *
 * 注意第三条分支（数组里的**对象**且带 text）会被当作文本块 —— 这是重构前的**既有行为**，
 * 逐字节回归钉住了它；改它会改变产物（用户在会话里看到多余/缺失的文本块）。
 */
function blocksOf(message) {
    const msg = typeof message === 'object' && message !== null && !Array.isArray(message)
        ? message
        : undefined;
    if (msg === undefined)
        return [];
    const content = msg['content'];
    if (typeof content === 'string') {
        return [{ kind: 'text', text: content, id: '', name: '', input: undefined, isError: false }];
    }
    // 唯一口径：**每个元素都走同一个块解析器**（重构前对数组元素逐个判 type，与 blockOf 的
    // 「类文本 / tool_use / tool_result」三分支同解；逐字节回归钉住这一等价性）
    if (!Array.isArray(content))
        return [];
    const out = [];
    for (const raw of content)
        out.push(blockOf(raw));
    return out;
}
/** 块 → IR（工具结果在此拍平成文本；其它块保持文本投影） */
function irBlockOf(block) {
    if (block.kind === 'call')
        return irToolCallBlock(block.id, block.name, block.input);
    if (block.kind === 'result')
        return irToolResultBlock(block.id, block.text, block.isError);
    return irTextBlock(block.text);
}
/** 一条 Claude 记录 → IR 消息；`undefined` = 该记录不产出消息（未迁移的类型） */
function irMessageOf(rec, parsed, index) {
    const type = irStr(rec['type']) ?? 'unknown';
    const uuid = rec['uuid'];
    if (type === 'assistant') {
        const msg = typeof rec['message'] === 'object' && rec['message'] !== null
            ? rec['message']
            : undefined;
        const usage = msg === undefined ? undefined : msg['usage'];
        return irMessage(irMessageIdOf(uuid, index), 'assistant', parsed.map(irBlockOf), {
            source: { model: irStr(msg?.['model']) ?? '' },
            usage: {
                inputTokens: irNum(usageField(usage, 'input_tokens')),
                outputTokens: irNum(usageField(usage, 'output_tokens')),
                cacheReadTokens: irNum(usageField(usage, 'cache_read_input_tokens')),
            },
            time: irSafeTime(rec['timestamp']),
        });
    }
    if (type === 'user') {
        return irMessage(irMessageIdOf(uuid, index), 'user', parsed.map(irBlockOf), {
            time: irSafeTime(rec['timestamp']),
        });
    }
    return undefined;
}
/**
 * Claude 会话原文 → IR（**纯函数，不读盘**）。
 *
 * 反应：坏行不抛、计数上报（`stats.unparsable`）；缺 cwd 时**不产出会话**（由调用方转成 skip 码），
 * 因为 DSH 会按 cwd 的目录键归位，猜一个 cwd 等于把会话放到错误的项目里。
 */
export function parseClaudeSession(file, options, stats) {
    const parsed = parseClaudeSessionText(file, options);
    if (stats !== undefined) {
        stats.records = parsed.records.length;
        stats.unparsable = parsed.unparsable;
    }
    return parsed.records.length === 0 ? undefined : parsed.session;
}
function typeOf(rec) {
    return irStr(rec['type']) ?? 'unknown';
}
/**
 * 墙钟回落的**唯一**来源（缺陷 1 的修复）。
 *
 * 为什么必须只有一处：会话产物的字节里带 createdAt / 各行各列的时间；只要有一次 `Date.now()`
 * 参与，同一来源两次转码的字节就必然不同 ⇒ DSH 侧「同内容 → Skip」永不成立、重复导入恒判
 * Conflict。旧实现 parse 与 synthesize **各调一次** `Date.now()`（返回值还可能是两个不同的毫秒）。
 *
 * 回落链（前三级都是确定性的：同一输入 → 同一产物）：
 *  ① `options.now`（调用方/测试显式给定；**保持最高优先级**，既有字节回归靠它稳定）；
 *  ② 记录自身的最早可解析时间戳（会话文件里最权威的确定性来源）；
 *  ③ `input.createdAtMs`（读盘层给的回落值：最早可解析记录时间，没有就给文件 mtime）；
 *  ④ 都没有 → `Date.now()`，并**如实记账**（`timestampsFallback`）。
 *
 * 非法值（非安全整数 / 非有限数）一律当「没给」：DSH 对时间字段要求安全整数，宁可继续回落也
 * 不写出一条会被拒读的行。
 */
function resolveWallClock(file, options, earliest) {
    const explicit = irSafeTime(options.now);
    if (explicit !== undefined)
        return { now: explicit, fallback: false };
    if (earliest !== undefined)
        return { now: earliest, fallback: false };
    const given = irSafeTime(file.createdAtMs);
    if (given !== undefined)
        return { now: given, fallback: false };
    return { now: Date.now(), fallback: true };
}
/**
 * 解析入口：**只走一遍 JSON.parse**，把「记录 / cwd / 最早时间 / IR 消息 / 标题」一次算齐。
 *
 * 为什么必须只走一遍：文本解析是这里唯一的热点（长会话可达数 MB），重构前也只解析一次；
 * 分成「解析 IR」+「再解析原始记录取标题」两遍会让大文件成本翻倍。
 */
function parseClaudeSessionText(file, options) {
    const stats = { records: 0, unparsable: 0, issues: [] };
    const records = parseJsonlObjects(file.text, stats);
    let cwd;
    let createdAt;
    let sidechain = 0;
    for (const r of records) {
        // 子代理记录（真实 Claude 的子代理对话就是 type=user/assistant + isSidechain:true）：
        // 它们**不是父对话的回合**，混进来会静默改写父对话正文（设计文档 2026-10-04-foreign-import-v1.md:89
        // 「不迁移 isSidechain 的子代理会话」，而旧实现连计数都没有）。
        // 它们仍参与 cwd / 最早时间：子代理与父对话同属一份日志文件，cwd 与时间线是**文件级**事实。
        if (r['isSidechain'] === true)
            sidechain++;
        if (cwd === undefined)
            cwd = irStr(r['cwd']);
        createdAt = irEarlier(createdAt, irSafeTime(r['timestamp']));
    }
    // 墙钟回落**只在这里解析一次**，转码入口复用 `now`（同一输入一次调用内不可能出现两个 Date.now()）
    const wall = resolveWallClock(file, options, createdAt);
    const messages = [];
    let messageIndex = 0;
    let thinking = 0;
    let firstUserText = '';
    for (const rec of records) {
        const type = typeOf(rec);
        if (type !== 'user' && type !== 'assistant')
            continue;
        if (rec['isSidechain'] === true)
            continue;
        const blocks = blocksOf(rec['message']);
        // 推理块：先逐条计数，再**整块丢掉**（既不进 IR，也不留空文本块 —— 空块还会污染正文的换行串联）
        thinking += blocks.filter((b) => b.kind === 'thinking').length;
        const carried = blocks.filter((b) => b.kind !== 'thinking');
        const message = irMessageOf(rec, carried, messageIndex);
        if (message === undefined)
            continue;
        messages.push(message);
        // 消息 id 的兜底序 = 「第几条已知消息」（重构前的序号语义，逐字节回归钉住）
        messageIndex++;
        if (type === 'user' && firstUserText === '') {
            const text = irTextOfBlocks(carried.map(irBlockOf));
            if (text.trim() !== '')
                firstUserText = text;
        }
    }
    return {
        session: {
            id: file.id,
            cwd: cwd ?? '',
            createdAt: createdAt ?? wall.now,
            records: records.length,
            messages,
        },
        records,
        cwd,
        unparsable: stats.unparsable,
        title: titleOf(records, firstUserText),
        sidechain,
        thinking,
        now: wall.now,
        wallClockFallback: wall.fallback,
    };
}
/* ---------------- ② ③ 合成 + 编码 ---------------- */
/** 标题：Claude 的 summary 记录优先，否则首条用户文本前 80 字（折叠空白） */
function titleOf(records, firstUserText) {
    for (const r of records) {
        if (irStr(r['type']) === 'summary') {
            const s = irStr(r['summary']);
            if (s !== undefined)
                return s.slice(0, 200);
        }
    }
    return firstUserText.replace(/\s+/g, ' ').trim().slice(0, 80);
}
/** 日志文件名（与 DSH 的 generation 命名一致：v0 无后缀，vN 带 .vN） */
export function dshSessionLogName(version) {
    return version === 0 ? 'session.jsonl.zstd' : 'session.v' + version + '.jsonl.zstd';
}
export function transcodeClaudeSession(file, options) {
    /**
     * 非致命发现（会话照样产出）：记录里的 sessionId 与文件名 stem 不一致时**如实报码**，
     * 但会话 id 仍以文件名 stem 为准（DSH 按「目录名 / 文件名」定位会话）。读盘层没给
     * `recordSessionId`（老调用方）就什么都不报 —— 不猜。
     */
    const findings = [];
    const recordSessionId = irStr(file.recordSessionId);
    if (recordSessionId !== undefined && recordSessionId !== file.id) {
        findings.push({ code: 'session-id-mismatch', origin: file.id });
    }
    if (!SUPPORTED_DSH_SESSION_FORMAT_VERSIONS.includes(options.formatVersion)) {
        return { skip: { code: 'session-format-unsupported', detail: String(options.formatVersion) }, findings };
    }
    if (!isSafeIrId(file.id))
        return { skip: { code: 'session-unsafe-id', detail: file.id }, findings };
    const parsed = parseClaudeSessionText(file, options);
    if (parsed.records.length === 0)
        return { skip: { code: 'session-empty' }, findings };
    if (parsed.cwd === undefined)
        return { skip: { code: 'session-missing-cwd', detail: file.id }, findings };
    // 有内容但一行都解析不出来：如实区分「空文件」与「解析不了」（诊断更准，不新增码 —— 两者
    // 在下游都是「这条会话没有产出」，区别只在忽略计数里可见）
    if (parsed.session.messages.length === 0 && parsed.unparsable > 0) {
        return { skip: { code: 'session-unparsable', detail: file.id }, findings };
    }
    // 时间兜底**只有一处**（parseClaudeSessionText 里解析过一次）：这里绝不再调 Date.now()
    const now = parsed.now;
    const stats = {
        ignored: {},
        userMessages: 0,
        assistantMessages: 0,
        toolCalls: 0,
        toolResults: 0,
    };
    if (parsed.unparsable > 0)
        irBump(stats.ignored, 'unparsable', parsed.unparsable);
    // 推理块：共享 IR 没有承载位 → 计报，绝不伪装成正文（与其余 20+ 来源同口径）
    if (parsed.thinking > 0)
        irBump(stats.ignored, 'thinking', parsed.thinking);
    // 子代理记录：不进 IR → 整类计报（detail 固定为 isSidechain）
    if (parsed.sidechain > 0)
        irBump(stats.ignored, 'isSidechain', parsed.sidechain);
    // 未迁移的记录类型**逐类计数**（attachment / queue-operation / system …）——
    // IR 只承载 user/assistant 消息，所以这里按原始记录把其余类型补进忽略计数。
    // isSidechain 记录已整类记账（上一步），不在这里重复计数。
    for (const rec of parsed.records) {
        if (rec['isSidechain'] === true)
            continue;
        const type = typeOf(rec);
        if (type === 'user' || type === 'assistant')
            continue;
        irBump(stats.ignored, type);
    }
    const rows = synthesizeDshRows(parsed.session, {
        title: parsed.title,
        titleSource: { kind: 'fallback' },
        emptyBlocks: [],
        provider: CLAUDE_PROVIDER,
        reasoningEffort: CLAUDE_REASONING_EFFORT,
        maxTokens: CLAUDE_MAX_TOKENS,
    }, stats, now);
    if (rows.length === 0)
        return { skip: { code: 'session-empty' }, findings };
    const header = {
        type: 'session',
        version: options.formatVersion,
        id: file.id,
        createdAt: parsed.session.createdAt,
        cwd: parsed.cwd,
        isSeeded: false,
        delegationDepth: 0,
    };
    const data = encodeDshSessionLog(header, rows);
    // 结算类记账（与 ignored 分开放：ignored 的键会被下游翻成 unsupported-session-record 码）。
    // 0 也写出来：调用方一眼能看出「这次转码是否确定性」，不需要靠键的有无去猜。
    const counts = {
        timestampsFallback: parsed.wallClockFallback ? 1 : 0,
    };
    return {
        session: {
            id: file.id,
            cwd: parsed.cwd,
            relativePath: projectKeyOf(parsed.cwd) + '/' + file.id + '/' + dshSessionLogName(options.formatVersion),
            data,
            info: {
                records: parsed.records.length,
                userMessages: stats.userMessages,
                assistantMessages: stats.assistantMessages,
                toolCalls: stats.toolCalls,
                toolResults: stats.toolResults,
                ignored: stats.ignored,
                counts,
            },
        },
        findings,
    };
}
/** 帧拼接：首帧 = header 单行 JSON，之后每批事件一帧（与 DSH 的物理编码一致，帧带内容校验和） */
export function encodeDshSessionLog(header, rows) {
    const encoder = new TextEncoder();
    const frames = [encodeZstdFrame(encoder.encode(JSON.stringify(header) + '\n'))];
    let batch = [];
    let bytes = 0;
    const flush = () => {
        if (batch.length === 0)
            return;
        frames.push(encodeZstdFrame(encoder.encode(batch.join('\n') + '\n')));
        batch = [];
        bytes = 0;
    };
    for (const row of rows) {
        const line = JSON.stringify(row);
        batch.push(line);
        bytes += line.length + 1;
        if (bytes >= FRAME_TARGET_BYTES)
            flush();
    }
    flush();
    let total = 0;
    for (const f of frames)
        total += f.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const f of frames) {
        out.set(f, offset);
        offset += f.length;
    }
    return out;
}
//# sourceMappingURL=claude-sessions.js.map