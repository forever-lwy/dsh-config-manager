import { sha256Hex } from '../utils/hashing.js';
import { engineMsg } from './messages.js';
/**
 * 走内容寻址外置的分区。
 *
 * 只放 sessions：它单文件可达数十 MB、且连续两次 push 的绝大多数会话字节完全相同，
 * 去重收益最大。skills / pluginFiles 这类分区的条目小且改动频繁，外置只会增加
 * 往返次数而无实际收益（故**不**放进来自动生效）。
 */
export const BLOB_SECTIONS = ['sessions'];
/** duck-typing：是不是外置引用形态（version===1 + blobRefs 数组）。 */
export function isBlobRefsSection(v) {
    if (v === null || typeof v !== 'object')
        return false;
    const o = v;
    return o.version === 1 && Array.isArray(o.blobRefs);
}
/** duck-typing：普通文件分区（version===1 + files 数组）。 */
export function isFilesSectionLike(v) {
    if (v === null || typeof v !== 'object')
        return false;
    const o = v;
    return o.version === 1 && Array.isArray(o.files);
}
/** FilesSection → 外置引用形态（逐个写入 sink；内容不变则 sink 内部幂等跳过）。 */
export async function sectionToBlobRefs(section, sink) {
    const blobRefs = [];
    for (const file of section.files) {
        const hash = file.contentHash !== undefined && file.contentHash !== ''
            ? file.contentHash
            : sha256Hex(file.data);
        await sink.put(hash, file.data);
        blobRefs.push({ relativePath: file.relativePath, blobHash: hash, sizeBytes: file.data.byteLength });
    }
    return { version: 1, blobRefs };
}
/**
 * 外置引用形态 → FilesSection（逐个取回字节）。
 *
 * 任一 blob 取不到 → **抛错**：那说明远端仓被清理坏/被手工删过。静默降级成空分区会
 * 让「同步成功但对话没了」重演（issue #45 的老问题形态），必须硬失败。
 */
export async function refsToSection(refs, sink) {
    const files = [];
    for (const ref of refs.blobRefs) {
        const data = await sink.get(ref.blobHash);
        if (data === null) {
            throw new Error(engineMsg('sync.blobMissing', { hash: ref.blobHash, path: ref.relativePath }));
        }
        // 内容寻址仓的引用自带 sha256（+ 字节数），取回后必须自证（审计 P6-3）。
        // 注释承诺「远端仓被清理坏/被手工删过」必须硬失败，但此前只覆盖「删了」：
        // 内容被改、半截写、base64 传输丢字符都会畅通无阻地把错误字节当成会话原样写回，
        // 而「静默损坏」比「硬失败」更糟 —— 用户看不到任何错误，只发现对话内容变了。
        const actualHash = sha256Hex(data);
        if (actualHash !== ref.blobHash || (ref.sizeBytes !== undefined && data.byteLength !== ref.sizeBytes)) {
            throw new Error(engineMsg('sync.blobCorrupt', {
                hash: ref.blobHash,
                path: ref.relativePath,
                actual: actualHash,
                size: String(data.byteLength),
            }));
        }
        files.push({ relativePath: ref.relativePath, data, contentHash: ref.blobHash });
    }
    return { version: 1, files };
}
/** 从快照载荷收集「被引用的全部 blob 哈希」（GC 用；只认外置形态）。 */
export function referencedBlobHashes(sectionData) {
    const out = new Set();
    if (!isBlobRefsSection(sectionData))
        return out;
    for (const ref of sectionData.blobRefs) {
        if (typeof ref.blobHash === 'string' && ref.blobHash !== '')
            out.add(ref.blobHash);
    }
    return out;
}
/** GC 默认保护窗口：10 分钟内的新 blob 一律不删（避免与并发 push 竞态）。 */
export const BLOB_GC_MIN_AGE_MS = 10 * 60 * 1000;
/**
 * 回收无人引用的 blob（best-effort）：
 *  - 只删「不在 referenced 集合里」且**写入时间早于保护窗口**的 blob；
 *  - 保护窗口是并发安全阀：另一台机器可能正在上传引用该 blob 的快照，删除会让它的下载硬失败；
 *  - 返回被删列表供上层写告警/日志（绝不静默）。
 */
export async function gcBlobs(opts) {
    const minAgeMs = opts.minAgeMs ?? BLOB_GC_MIN_AGE_MS;
    const deleted = [];
    for (const { hash, mtimeMs } of await opts.sink.list()) {
        if (opts.referenced.has(hash))
            continue;
        if (opts.nowMs - mtimeMs < minAgeMs)
            continue;
        await opts.sink.delete(hash);
        deleted.push(hash);
    }
    return deleted;
}
//# sourceMappingURL=blob-store.js.map