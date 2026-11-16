/**
 * patch 行写回守卫（issue #136 A + C）。
 *
 * 背景：导出侧 SecretScanner 会把命中字段名/值形状的字符串叶子替换成空串（占位符），语义是
 * 「需补录」。同步/导入落盘时，若照抄这个空串，就会**静默**抹掉本机同一行里用户手写的明文
 * —— 行是整行写回的，行内没有粒度。
 *
 * 本模块是那条「最后一个能拒绝写入」的纯逻辑：比对导入值与本机当前行，把「被脱敏剥空」的
 * 叶子换回本机值；声明过脱敏或名称属于密钥字段的叶子始终保留；其它未知空值仍可逐行确认清空。
 *
 * 两条分支（issue #136 C 的载荷字段决定）：
 *  - `redactedPaths` 存在（新载荷）：只保护**声明过的**路径，精确、可解释；
 *  - 缺省（旧载荷 / 未知）：保守口径 —— 导入值为空串且本机同叶子非空即保留本机值。
 *    绝不反过来假定「空值一定来自用户主动清空」（旧载荷没有能力区分剥空与真空）。
 *
 * 纯函数：不读盘、不打日志、不抛错；返回值不含任何值本身（只有路径），可直接进报告。
 */
import { isSensitiveFieldName } from '../security/secret-scanner.js';
/** 解析扫描器路径语法（`a.b[0].c`）→ 路径段；语法不认识返回 null（宁可放过，不误判）。 */
export function parsePath(path) {
    const segs = [];
    let rest = path;
    while (rest !== '') {
        const m = /^([^.[\]]+)((?:\[\d+\])*)/.exec(rest);
        if (m === null)
            return null;
        const head = m[1];
        const tail = m[2] ?? '';
        if (head === undefined)
            return null;
        segs.push(head);
        for (const hit of tail.matchAll(/\[(\d+)\]/g)) {
            const idx = hit[1];
            if (idx !== undefined)
                segs.push(Number(idx));
        }
        rest = rest.slice(m[0].length);
        if (rest === '')
            break;
        if (!rest.startsWith('.'))
            return null;
        rest = rest.slice(1);
    }
    return segs.length > 0 ? segs : null;
}
/** 路径段 → 展示用相对路径（与扫描器语法同形，如 `raw.mcp.args.token`）。 */
function formatPath(segs) {
    let out = '';
    for (const seg of segs) {
        if (typeof seg === 'number')
            out += `[${seg}]`;
        else
            out += out === '' ? seg : `.${seg}`;
    }
    return out;
}
function getAt(root, segs) {
    let cur = root;
    for (const seg of segs) {
        if (typeof seg === 'number') {
            if (!Array.isArray(cur))
                return undefined;
            cur = cur[seg];
        }
        else {
            if (cur === null || typeof cur !== 'object' || Array.isArray(cur))
                return undefined;
            cur = cur[seg];
        }
    }
    return cur;
}
/** 深拷贝后按路径写回（只在确有保护项时调用，避免无谓的整行拷贝）。 */
function setAt(root, segs, value) {
    if (segs.length === 0)
        return value;
    const clone = structuredClone(root);
    let cur = clone;
    for (let i = 0; i < segs.length - 1; i++) {
        const next = Array.isArray(cur)
            ? cur[segs[i]]
            : cur[segs[i]];
        if (next === null || typeof next !== 'object')
            return clone; // 形状不符 → 不猜，原样返回
        cur = next;
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(cur))
        cur[last] = value;
    else
        cur[last] = value;
    return clone;
}
/** 本机值是否「非空」：只有非空字符串算（脱敏占位符恒为空串，故此判据与载荷同口径）。 */
function isNonEmptyLocal(value) {
    return typeof value === 'string' && value !== '';
}
/** 保守分支：逐叶子找出「导入空串 + 本机非空」的路径（旧载荷没有剥空信息时的唯一线索）。 */
function collectSuspects(imported, local, segs, out) {
    if (imported === null || typeof imported !== 'object') {
        if (imported === '' && isNonEmptyLocal(local))
            out.push([...segs]);
        return;
    }
    if (Array.isArray(imported)) {
        for (let i = 0; i < imported.length; i++) {
            collectSuspects(imported[i], Array.isArray(local) ? local[i] : undefined, [...segs, i], out);
        }
        return;
    }
    const obj = imported;
    const localObj = local !== null && typeof local === 'object' && !Array.isArray(local)
        ? local
        : undefined;
    for (const [k, v] of Object.entries(obj))
        collectSuspects(v, localObj?.[k], [...segs, k], out);
}
export function applyPatchSecretGuard(input) {
    const { importedRaw, localRaw, redactedPaths, confirmed } = input;
    // 本机没有这一行 → 没有可覆盖的东西（Create 语义），原样返回。
    if (localRaw === undefined)
        return { raw: importedRaw, kept: [], cleared: [], conservative: false };
    const conservative = redactedPaths === undefined || redactedPaths.length === 0;
    /** 候选：相对路径段（不含 `raw` 前缀；空数组 = 整行值本身）。 */
    const candidates = [];
    if (conservative) {
        const found = [];
        collectSuspects(importedRaw, localRaw, [], found);
        for (const segs of found)
            candidates.push({ segs, declared: false });
    }
    else {
        for (const path of redactedPaths) {
            const segs = parsePath(path);
            if (segs === null)
                continue;
            // 载荷里的路径是相对**行对象**（`{ file, lineId, raw }`）的；行内相对只剩 `raw` 之后的部分。
            const rel = segs[0] === 'raw' ? segs.slice(1) : segs;
            candidates.push({ segs: rel, declared: true });
        }
        // An incomplete redaction list must not turn an empty secret field into a deletion.
        const found = [];
        collectSuspects(importedRaw, localRaw, [], found);
        const known = new Set(candidates.map((candidate) => formatPath(candidate.segs)));
        for (const segs of found) {
            if (!known.has(formatPath(segs)) && segs.some((seg) => typeof seg === 'string' && isSensitiveFieldName(seg))) {
                candidates.push({ segs, declared: false });
            }
        }
    }
    const kept = [];
    const cleared = [];
    let raw = importedRaw;
    for (const cand of candidates) {
        const localVal = getAt(localRaw, cand.segs);
        if (!isNonEmptyLocal(localVal))
            continue;
        const importedVal = getAt(importedRaw, cand.segs);
        // 声明路径上出现了非空导入值 = 载荷自相矛盾（或值形状命中后被上游改回）：以导入值为准，
        // 绝不因为声明了路径就把远端真实新值挡掉（issue #136 验收 3）。
        if (importedVal === '' || importedVal === undefined) {
            const rel = formatPath(['raw', ...cand.segs]);
            // A known redaction is an absent secret, even when the rest of the row is accepted.
            const secretField = cand.segs.some((seg) => typeof seg === 'string' && isSensitiveFieldName(seg));
            if (confirmed && !cand.declared && !secretField)
                cleared.push(rel);
            else {
                kept.push(rel);
                raw = setAt(raw, cand.segs, localVal);
            }
        }
    }
    return { raw, kept, cleared, conservative };
}
export const __test = { parsePath, formatPath };
//# sourceMappingURL=patch-secret-guard.js.map