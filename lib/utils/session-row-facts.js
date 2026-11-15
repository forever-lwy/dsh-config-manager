/**
 * 会话事件的**行级事实**与「合成收尾块」判定 —— 宿主侧唯一实现（体检扫描与修复计划共用）。
 *
 * 为什么必须共用：体检说「这条可修」与执行器「真的去修」必须是同一份判据。
 * 两处各写一份必然分叉 —— 界面给按钮、执行器却拒绝（或反过来静默不改），用户看到的是自相矛盾。
 *
 * 分层纪律：本模块只解析**已经解压出来的行文本**，不碰容器字节（那是 utils/zstd-frame.ts），
 * 也不写任何字节；core 禁止 import。
 */
/**
 * v0 的**打包行**类型（官方 `decodePackedRun`）：一行承载 payload.length 个连续事件，
 * 展开后 seq = seq0 .. seq0+len-1。**这种行没有 `seq`** —— 只看 `seq` 的判据会把它当空气，
 * 于是「打包行之后的第一条标量 seq 行」被误判成空洞（真机 407/1194 份 v0 日志因此被判有损）。
 */
export const SESSION_PACKED_TYPES = new Set(['text-chunks', 'reasoning-chunks', 'tool-call-chunks']);
/** packed 行载荷的字段名（按官方 decodePackedRun：tool-call-chunks 用 args，其余用 texts）。 */
function packedPayloadField(type) {
    return type === 'tool-call-chunks' ? 'args' : 'texts';
}
/**
 * 判定 packed 行的展开**跨度**（官方 v0 released 行形状的逐条照抄）。
 *
 * 合法形状（全部满足才是「可判定」）：
 *  - 顶层键集**严格等于** `{type, seq0, time0, data}`（官方 assertReleasedV0Keys 的严格判据）；
 *  - `seq0` 是安全非负整数；
 *  - `data.texts` / `data.args` 是**非空字符串数组**；
 *  - `data.dt` 长度 = 载荷长度 - 1。
 * 任一条件不满足 → `'opaque'`（**不可判定**：调用方不得跨越它下任何连续性/截断结论，只能 refuse）。
 *
 * 为什么必须这么严（R1 对抗样本 ADV-1/3/4）：`'abcdef'.length === 6`、`[].length === 0`、
 * 多带一个 `seq` 成员 —— 任何一条放宽都会把「DSH 拒读的非法行」当成「已知跨度」，
 * 从误报（现状）变成**漏报**（把坏日志报成 nothing-to-fix），那是更危险的回归。
 */
export function packedRowSpan(rec) {
    const type = rec['type'];
    if (typeof type !== 'string' || !SESSION_PACKED_TYPES.has(type))
        return 'opaque';
    const keys = Object.keys(rec).sort();
    if (keys.length !== 4 || keys[0] !== 'data' || keys[1] !== 'seq0' || keys[2] !== 'time0' || keys[3] !== 'type')
        return 'opaque';
    const seq0 = rec['seq0'];
    if (typeof seq0 !== 'number' || !Number.isSafeInteger(seq0) || seq0 < 0)
        return 'opaque';
    const data = rec['data'];
    if (data === null || typeof data !== 'object' || Array.isArray(data))
        return 'opaque';
    const payload = data[packedPayloadField(type)];
    if (!Array.isArray(payload) || payload.length === 0)
        return 'opaque';
    for (const item of payload)
        if (typeof item !== 'string')
            return 'opaque';
    const dt = data['dt'];
    if (!Array.isArray(dt) || dt.length !== payload.length - 1)
        return 'opaque';
    return payload.length;
}
/**
 * 解析一行 JSON；不是对象 / 解析失败 → null（不猜，交给调用方记成「不可解析」事实）。
 */
export function parseSessionRowFacts(line) {
    try {
        const parsed = JSON.parse(line);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
            return null;
        const rec = parsed;
        const out = {};
        if (typeof rec['type'] === 'string' && rec['type'] !== '')
            out.type = rec['type'];
        const seq = rec['seq'];
        if (typeof seq === 'number' && Number.isSafeInteger(seq) && seq >= 0)
            out.seq = seq;
        const data = rec['data'];
        if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
            const turn = data['turn'];
            if (typeof turn === 'number' && Number.isSafeInteger(turn) && turn >= 0)
                out.turn = turn;
        }
        if (out.type !== undefined && SESSION_PACKED_TYPES.has(out.type)) {
            const seq0 = rec['seq0'];
            if (typeof seq0 === 'number' && Number.isSafeInteger(seq0) && seq0 >= 0)
                out.packedSeq0 = seq0;
            out.packedSpan = packedRowSpan(rec);
        }
        return out;
    }
    catch {
        return null;
    }
}
/** 收尾类型（设计稿 §10.2 的 closer 形状判据）。 */
export const SESSION_CLOSER_TYPES = new Set([
    'tool/result',
    'step/end',
    'turn/end',
    'session/end-seed',
]);
/** 收尾块的形态上限：≤8 行（超长的收尾块不是崩溃恢复补出来的样子）。 */
export const SESSION_MAX_CLOSER_ROWS = 8;
/** 可证明的合成收尾块（要丢弃的行区间为 [start, end)）。 */
/**
 * 「续写事件」类型白名单：只有这些类型出现在收尾块之后，才算「回合结束后**还在继续对话**」。
 *
 * 为什么必须有它（真机证据）：`turn/end#824` 之后紧跟 `workspace/changes#825`（同属 turn 17）——
 * 那是**回合正常结束后的收尾元数据**，不是续写。旧判据只看 `data.turn` 相等，于是把这种正常会话
 * 判成「合成收尾块撞上真实续写」，进而拒绝修复（用户看到「写前校验未通过，已拒绝修复」）。
 * 白名单只收真正代表「还在说话/干活」的事件：消息、流式块、工具调用/结果、回合与步骤的开始。
 */
export const SESSION_CONTINUATION_TYPES = new Set([
    'user/message',
    'assistant/message',
    'assistant/chunk',
    'tool/call',
    'tool/result',
    'step/start',
    'turn/start',
]);
/**
 * 找出**可证明是崩溃恢复补写**的合成收尾块（设计稿 §10.2）。
 *
 * 形状判据（≤8 行收尾类型、含 `turn/end`）只是**必要条件**：任何一次正常的「回合结束 → 下个回合开始」
 * 都满足它。真机实测（2026-10-04）：只看形状会把同一台机器上 86 条健康会话误报成崩溃残留。
 *
 * 所以必须再证明「撞上真实续写」：收尾块之后、下一个 `turn/start` 之前，**同一个 turn 还在继续**
 * （有行带相同的 `data.turn`）—— 回合已经结束却还在续写，那个 closer 才是合成块。
 * 证明不了 = undefined（绝不猜：宁可漏报，也不把健康会话标红、更不拿它去改字节）。
 */
export function findSyntheticCloserRun(rows) {
    for (let i = 0; i < rows.length; i += 1) {
        const first = rows[i];
        if (first?.type !== 'tool/result' && first?.type !== 'step/end' && first?.type !== 'turn/end')
            continue;
        let j = i;
        let hasTurnEnd = false;
        let closedTurn;
        while (j < rows.length && j - i < SESSION_MAX_CLOSER_ROWS) {
            const row = rows[j];
            const type = row?.type;
            if (type === undefined || !SESSION_CLOSER_TYPES.has(type))
                break;
            if (type === 'turn/end')
                hasTurnEnd = true;
            if (row?.turn !== undefined)
                closedTurn = row.turn;
            j += 1;
        }
        // 末尾的收尾块 = 正常的会话结尾（后面没有任何东西可以撞）→ 不报
        if (!hasTurnEnd || closedTurn === undefined || j <= i || j >= rows.length)
            continue;
        for (let k = j; k < rows.length; k += 1) {
            const row = rows[k];
            if (row?.type === 'turn/start')
                break;
            // 必须同时是「续写事件」类型：只有元数据行（workspace/changes / session/title…）不算续写
            if (row?.turn === closedTurn && row.type !== undefined && SESSION_CONTINUATION_TYPES.has(row.type)) {
                return { start: i, end: j, turn: closedTurn };
            }
        }
    }
    return undefined;
}
/**
 * 逐个 seq 走查「事件计数是否致密」（官方 scanRows 的同一份跨度模型）。
 *
 * 规则（对齐官方 `decodePackedRun` / `scanRows`；R1 §3.1 的规范形状 1–5）：
 *  1. `next` 从 0 起（等价于官方 eventCount）；
 *  2. 标量行：`seq` 是安全非负整数时要求 `seq === next`，随后 `next = seq + 1`；
 *  3. packed 行：要求 `seq0 === next`，随后 `next = seq0 + 跨度`（跨度见 packedRowSpan）；
 *  4. 形状不合法（含无 seq 且非 packed 的行）→ **不可判定**（opaque）；
 *  5. 不可解析行（facts === null）按**异常**处理（与旧判据一致）。
 *
 * 「不可判定」不是「没问题」：调用方遇到 `firstOpaqueIndex >= 0` 必须 refuse，
 * 绝不跨越它继续下「连续 / 该截断」的结论（refuse 而不是猜）。
 */
export function walkSessionRowContinuity(facts) {
    let next = 0;
    for (let i = 0; i < facts.length; i += 1) {
        const fact = facts[i];
        if (fact === null || fact === undefined)
            return { firstAnomalyIndex: i, firstOpaqueIndex: -1 };
        if (fact.packedSpan !== undefined) {
            if (fact.packedSpan === 'opaque' || fact.packedSeq0 === undefined)
                return { firstAnomalyIndex: -1, firstOpaqueIndex: i };
            if (fact.packedSeq0 !== next)
                return { firstAnomalyIndex: i, firstOpaqueIndex: -1 };
            next = fact.packedSeq0 + fact.packedSpan;
            continue;
        }
        const seq = fact.seq;
        if (seq === undefined)
            return { firstAnomalyIndex: -1, firstOpaqueIndex: i };
        if (seq !== next)
            return { firstAnomalyIndex: i, firstOpaqueIndex: -1 };
        next = seq + 1;
    }
    return { firstAnomalyIndex: -1, firstOpaqueIndex: -1 };
}
/** 取值数组形的引用面：`sourceEventSeqs` / `messageSeqs`（官方 decodeSeqRanges 的两种形态）。 */
const REFERENCE_ARRAY_KEYS = new Set(['sourceEventSeqs', 'messageSeqs']);
/** 单点引用面：`surfaceOp.startSeq` / `surfaceOp.endSeq`（以及任何同名键）。 */
const REFERENCE_POINT_KEYS = new Set(['startSeq', 'endSeq']);
/** 对象数组形的引用面：`data.targets[].seq`（image/offload 等）。 */
const REFERENCE_TARGETS_KEY = 'targets';
/**
 * 收集一行原始文本里全部**事件 seq 引用**（递归 walk，覆盖官方已知的三个引用面）：
 *  - `sourceEventSeqs` / `messageSeqs`：数字项 = 单点；两元数组 = 区间（官方 decodeSeqRanges 会展开）；
 *  - `startSeq` / `endSeq`：单点；
 *  - `targets[].seq`：单点。
 * 解析失败 / 非对象 → 空引用（调用方按「无引用」处理，绝不猜）。
 */
export function collectSessionRowReferences(raw) {
    const seqs = new Set();
    const ranges = [];
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return { seqs: [], ranges: [] };
    }
    const addPoint = (value) => {
        if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
            seqs.add(value);
    };
    const addRangeEntry = (value) => {
        if (Array.isArray(value) && value.length === 2) {
            const a = value[0];
            const b = value[1];
            if (typeof a === 'number' && Number.isSafeInteger(a) && a >= 0 && typeof b === 'number' && Number.isSafeInteger(b) && b >= 0) {
                const start = Math.min(a, b);
                const end = Math.max(a, b);
                if (start === end)
                    seqs.add(start);
                else
                    ranges.push({ start, end });
                return;
            }
        }
        addPoint(value);
    };
    const walk = (node) => {
        if (Array.isArray(node)) {
            for (const item of node)
                walk(item);
            return;
        }
        if (node === null || typeof node !== 'object')
            return;
        for (const [key, value] of Object.entries(node)) {
            if (REFERENCE_ARRAY_KEYS.has(key) && Array.isArray(value)) {
                for (const entry of value)
                    addRangeEntry(entry);
            }
            else if (REFERENCE_POINT_KEYS.has(key)) {
                addPoint(value);
            }
            else if (key === REFERENCE_TARGETS_KEY && Array.isArray(value)) {
                for (const target of value) {
                    if (target !== null && typeof target === 'object' && !Array.isArray(target))
                        addPoint(target['seq']);
                }
            }
            if (typeof value === 'object' && value !== null)
                walk(value);
        }
    };
    walk(parsed);
    return {
        seqs: [...seqs].sort((a, b) => a - b),
        ranges: ranges.sort((a, b) => (a.start - b.start) || (a.end - b.end)),
    };
}
/** 该引用集合是否包含某个 seq（区间按成员判定，不展开）。 */
export function referencesContain(refs, seq) {
    for (const single of refs.seqs)
        if (single === seq)
            return true;
    for (const range of refs.ranges)
        if (seq >= range.start && seq <= range.end)
            return true;
    return false;
}
/**
 * 廉价预筛：这行**是否可能**含引用（真正的引用键要么含 `Seq`、要么是 `targets`）。
 * 只用于避免对每一行做 JSON.parse —— 预筛为 false 的行**一定**没有引用（保守方向正确）。
 */
export function sessionRowMayHaveReferences(raw) {
    return raw.includes('Seq') || raw.includes('"targets"');
}
//# sourceMappingURL=session-row-facts.js.map