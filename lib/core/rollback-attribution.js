/**
 * 工具调用的**写入归属台账** —— 「这个路径最后一次是哪个会话的哪次工具调用写的」。
 *
 * 为什么需要（2026-10-17 用户反馈）：回滚点的「工作区态」是**整个工作区**的快照，
 * 回退也按整棵树执行 ⇒ 同一工作区里对话 A 改了文件，对话 B 回退时会把 A 的改动一起撤销。
 * 有了归属，引擎才能在预览里标出「这个文件在留点之后是**别的**会话写的」，
 * 让界面把它默认排除（用户仍可手动勾回来）。
 *
 * 三条不变量（不得放宽）：
 *  ① 采集**尽力而为**：只有能解析出路径的写类工具（write/edit/ops_replace…）才记。
 *     `pwsh` / `run_code` / 外部编辑器写的文件**没有归属** ⇒ 查不到 = **未判定**。
 *  ② **未判定 ≠ 别的会话写的**：只有确知最后写入者是别的会话时才敢标 foreign。
 *     拿不准就按老口径（照常恢复）—— 少标一次，比误判一次安全。
 *  ③ 落盘失败只 warn：台账丢了只让归属退化成「未判定」，绝不参与留点 / 回退的成败判定。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
/** 台账文件名（与回滚点库同目录：dataDir/rollback-points/attribution.json） */
export const ROLLBACK_ATTRIBUTION_FILE_NAME = 'attribution.json';
/** 条目上限（超出按 at 淘汰最旧）—— 台账无界增长会把宿主拖垮（见 issue #89 的教训） */
export const ROLLBACK_ATTRIBUTION_MAX_ENTRIES = 20000;
/**
 * 认得的**写类**工具名。
 *
 * 为什么用白名单而不是「参数里有 path 就算写」：`read` / `grep` / `ops_inspect_local_file`
 * 的参数里也有 path —— 把它们当写入者会让**读**污染归属，进而让回退误跳过本该恢复的文件。
 */
export const ROLLBACK_WRITE_TOOL_NAMES = [
    'write',
    'edit',
    'ops_replace',
    'ops_edit',
    'write_file',
    'str_replace',
    'multi_edit',
    'apply_patch',
];
/** 写类工具里代表「目标路径」的参数名（DSH 官方 write/edit 用 file_path；本插件工具用 path） */
const WRITE_PATH_ARG_KEYS = ['file_path', 'path', 'filePath'];
/** 路径比较键（与 `rollback-point.ts` 的 pathKey 同一口径：resolve + win32 折叠大小写） */
function attributionPathKey(value) {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
/**
 * 从一次 `tool/call` 事件载荷里抽出**会被写的路径**。
 *
 * `arguments` 在 DSH 的事件里是 **JSON 字符串**（不是对象）——两种形态都收，
 * 解不出来就返回空数组（= 未判定），绝不抛错。
 */
export function toolCallWritePaths(name, argumentsValue) {
    if (typeof name !== 'string' || !ROLLBACK_WRITE_TOOL_NAMES.includes(name))
        return [];
    let parsed = argumentsValue;
    if (typeof argumentsValue === 'string') {
        try {
            parsed = JSON.parse(argumentsValue);
        }
        catch {
            return [];
        }
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
        return [];
    const record = parsed;
    const out = [];
    for (const key of WRITE_PATH_ARG_KEYS) {
        const value = record[key];
        if (typeof value === 'string' && value.trim() !== '')
            out.push(value);
    }
    // 同一个调用里两个键指向同一路径是常见的（别名）⇒ 去重，避免同一路径记两次
    return [...new Set(out)];
}
function readFact(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return null;
    const record = value;
    const sessionId = record.sessionId;
    const at = record.at;
    if (typeof sessionId !== 'string' || sessionId === '')
        return null;
    if (typeof at !== 'number' || !Number.isFinite(at))
        return null;
    return {
        sessionId,
        at,
        tool: typeof record.tool === 'string' ? record.tool : '',
        callId: typeof record.callId === 'string' ? record.callId : '',
        turn: typeof record.turn === 'number' && Number.isFinite(record.turn) ? record.turn : null,
    };
}
/**
 * 内存台账 + best-effort 落盘。
 *
 * 落盘的作用只有一个：**进程重启后**打开旧会话回退时，归属还在。
 * 因此写入是延迟合并的（一次 tool/call 一行，立即落盘会把 I/O 打成筛子）。
 */
export class RollbackWriteAttribution {
    entries = new Map();
    file;
    now;
    maxEntries;
    flushDelayMs;
    warn;
    loadPromise = null;
    flushTimer = null;
    writing = null;
    constructor(options) {
        this.file = path.resolve(options.file);
        this.now = options.now ?? (() => Date.now());
        this.maxEntries = Math.max(1, options.maxEntries ?? ROLLBACK_ATTRIBUTION_MAX_ENTRIES);
        this.flushDelayMs = options.flushDelayMs ?? 1000;
        this.warn = options.warn ?? (() => { });
    }
    /** 台账条目数（测试与诊断用） */
    get size() {
        return this.entries.size;
    }
    /** 惰性读盘（幂等；读失败 = 空表，只 warn） */
    async load() {
        if (this.loadPromise === null)
            this.loadPromise = this.read();
        return this.loadPromise;
    }
    async read() {
        try {
            const text = await fs.readFile(this.file, 'utf8');
            const parsed = JSON.parse(text);
            if (parsed.version !== 1 || parsed.entries === null || typeof parsed.entries !== 'object' || Array.isArray(parsed.entries)) {
                this.warn('rollback attribution ignored (shape): ' + this.file);
                return;
            }
            for (const [key, value] of Object.entries(parsed.entries)) {
                const fact = readFact(value);
                // 读盘期间可能已经有本进程新记的条目 ⇒ **新记录优先**（磁盘只是旧快照）
                if (fact !== null && !this.entries.has(key))
                    this.entries.set(key, fact);
            }
        }
        catch (error) {
            const code = error.code;
            // ENOENT = 还没写过台账（正常）；其它错误如实留痕但不抛
            if (code !== 'ENOENT')
                this.warn('rollback attribution unreadable: ' + this.file + ' ' + String(code ?? error));
        }
    }
    /** 记一次 tool/call（返回记录到的路径条数；0 = 不是写类工具或解析不出路径 = 未判定） */
    noteToolCall(sessionId, data) {
        if (typeof sessionId !== 'string' || sessionId === '')
            return 0;
        if (data === null || typeof data !== 'object')
            return 0;
        const record = data;
        const paths = toolCallWritePaths(record.name, record.arguments);
        if (paths.length === 0)
            return 0;
        const fact = {
            sessionId,
            tool: typeof record.name === 'string' ? record.name : '',
            callId: typeof record.callId === 'string' ? record.callId : '',
            at: this.now(),
            turn: typeof record.turn === 'number' && Number.isFinite(record.turn) ? record.turn : null,
        };
        for (const target of paths)
            this.entries.set(attributionPathKey(target), fact);
        if (this.entries.size > this.maxEntries)
            this.evictOldest();
        this.scheduleFlush();
        return paths.length;
    }
    /** 淘汰最旧条目（按 at 升序删到上限内） */
    evictOldest() {
        const sorted = [...this.entries.entries()].sort((a, b) => a[1].at - b[1].at);
        const over = this.entries.size - this.maxEntries;
        for (let i = 0; i < over; i += 1) {
            const item = sorted[i];
            if (item !== undefined)
                this.entries.delete(item[0]);
        }
    }
    writerOf(target) {
        return this.entries.get(attributionPathKey(target));
    }
    /** 延迟落盘（多次调用只落一次） */
    scheduleFlush() {
        if (this.flushDelayMs <= 0 || this.flushTimer !== null)
            return;
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            void this.flush();
        }, this.flushDelayMs);
        this.flushTimer.unref?.();
    }
    /** 立刻落盘（原子：同目录临时文件 + rename；失败只 warn，绝不上抛） */
    async flush() {
        if (this.writing !== null)
            return this.writing;
        this.writing = (async () => {
            try {
                await fs.mkdir(path.dirname(this.file), { recursive: true });
                const entriesSnapshot = Object.fromEntries(this.entries);
                // **写前合并**（2026-10-17 修）：本进程内存里只有自己见过的写入，而同一个工作区可能同时被
                // 另一个 DSH 进程写归属 —— 各自「整体覆盖」会把对方的记录抹掉。真机实测：归属里缺了对方
                // 那次编辑，导致回退时识别不到「别人改过这个文件」，进而把对方的改动静默覆盖掉。
                // 同键取 `at` 较新者：时间戳是这里唯一可信的先后判据。
                try {
                    const existing = JSON.parse(await fs.readFile(this.file, 'utf8'));
                    if (existing.version === 1 && existing.entries !== null && typeof existing.entries === 'object' && !Array.isArray(existing.entries)) {
                        for (const [key, value] of Object.entries(existing.entries)) {
                            const fact = readFact(value);
                            if (fact === null)
                                continue;
                            const mine = entriesSnapshot[key];
                            if (mine === undefined || fact.at > mine.at)
                                entriesSnapshot[key] = fact;
                        }
                    }
                }
                catch { /* 读不到就当没有别人的记录：只写自己这份（绝不因为读失败而放弃落盘） */ }
                const payload = { version: 1, entries: entriesSnapshot };
                const tmp = this.file + '.tmp';
                await fs.writeFile(tmp, JSON.stringify(payload), 'utf8');
                await fs.rename(tmp, this.file);
            }
            catch (error) {
                this.warn('rollback attribution write failed: ' + this.file + ' ' + String(error.code ?? error));
            }
            finally {
                this.writing = null;
            }
        })();
        return this.writing;
    }
}
//# sourceMappingURL=rollback-attribution.js.map