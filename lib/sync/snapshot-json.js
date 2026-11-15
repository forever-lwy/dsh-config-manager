import { MAX_OWN_PAYLOAD_JSON_BYTES, parseJsonSafe, stringifyJsonSafe } from '../utils/json.js';
import { isEncryptedCredentials, isEncryptedSections } from './transport.js';
import { engineMsg } from './messages.js';
/** 二进制数据在 JSON 中的标记对象键（base64 载荷）。 */
const BIN_KEY = '$bin';
/** duck-typing：文件类分区（version===1 + files 数组） */
function isFilesSectionLike(v) {
    if (v === null || typeof v !== 'object')
        return false;
    const o = v;
    return o.version === 1 && Array.isArray(o.files);
}
/** 单个文件分区：Uint8Array → { $bin: base64 }（非二进制原样保留）。 */
function encodeFileData(data) {
    if (data instanceof Uint8Array) {
        return { [BIN_KEY]: Buffer.from(data).toString('base64') };
    }
    return data;
}
/** 单个文件分区：{ $bin: base64 } → Uint8Array（非标记对象原样保留）。 */
function decodeFileData(data) {
    if (data !== null && typeof data === 'object') {
        const bin = data[BIN_KEY];
        if (typeof bin === 'string') {
            // 普通 Uint8Array（非 Buffer 子类）：与内存中文件分区形态一致，深比较等价
            return new Uint8Array(Buffer.from(bin, 'base64'));
        }
    }
    return data;
}
/** 单个分区 JSON 化：文件类分区逐文件转 base64；JSON 分区原样。 */
function sectionToJsonSafe(section) {
    if (!isFilesSectionLike(section))
        return section;
    return {
        version: 1,
        files: section.files.map((f) => ({
            relativePath: f.relativePath,
            data: encodeFileData(f.data),
            ...(f.contentHash !== undefined ? { contentHash: f.contentHash } : {}),
        })),
    };
}
/** 单个分区从 JSON 还原：文件类分区逐文件还原 Uint8Array。 */
function sectionFromJsonSafe(section) {
    if (!isFilesSectionLike(section))
        return section;
    return {
        version: 1,
        files: section.files.map((f) => ({
            relativePath: f.relativePath,
            data: decodeFileData(f.data),
            ...(f.contentHash !== undefined ? { contentHash: f.contentHash } : {}),
        })),
    };
}
/** sections 整体 JSON 化（加密密文载荷原样透传）。 */
export function sectionsToJsonSafe(sections) {
    if (isEncryptedSections(sections))
        return sections;
    const out = {};
    for (const [id, data] of Object.entries(sections)) {
        out[id] = sectionToJsonSafe(data);
    }
    return out;
}
/** sections 从 JSON 还原（加密密文载荷原样透传）。 */
export function sectionsFromJsonSafe(sections) {
    if (isEncryptedSections(sections))
        return sections;
    if (sections === null || typeof sections !== 'object' || Array.isArray(sections)) {
        throw new Error(engineMsg('sync.snapshotSectionsNotObject'));
    }
    const out = {};
    for (const [id, data] of Object.entries(sections)) {
        out[id] = sectionFromJsonSafe(data);
    }
    return out;
}
/** 整份快照序列化为 JSON 字符串（本地不落盘，仅用于传输/加密载荷）。 */
export function serializeSnapshot(snapshot) {
    return stringifyJsonSafe({
        id: snapshot.id,
        createdAt: snapshot.createdAt,
        manifest: snapshot.manifest,
        sections: sectionsToJsonSafe(snapshot.sections),
        // issue #38：加密凭据载荷原样透传（纯字符串 JSON 安全）；缺省不写该字段
        ...(snapshot.credentials !== undefined ? { credentials: snapshot.credentials } : {}),
    });
}
/**
 * 从 JSON 字符串还原快照（形状非法抛错；调用方负责包装成通道错误）。
 *
 * 体积上限刻意**不同于** parseJsonSafe 的缺省 64 MiB（issue #59）：快照是本插件自己写出的
 * 载荷（加密单文件布局经 base64 双膨胀后轻易越界），而缺省上限是给**不可信输入**用的。
 * 读写两侧口径必须一致，否则会产出「自己读不回来」的快照：push 报成功、远端列表为空、
 * 拉取报「快照损坏」。
 */
export function deserializeSnapshot(raw) {
    const parsed = parseJsonSafe(raw, { maxBytes: MAX_OWN_PAYLOAD_JSON_BYTES });
    const snap = parsed;
    const okShape = snap !== null && typeof snap === 'object' && !Array.isArray(snap)
        && typeof snap.id === 'string'
        && typeof snap.createdAt === 'string'
        && typeof snap.manifest === 'object' && snap.manifest !== null
        && typeof snap.sections === 'object' && snap.sections !== null;
    if (!okShape) {
        throw new Error(engineMsg('sync.snapshotJsonInvalid'));
    }
    // issue #38：凭据载荷（形状不合法 → 视为不存在，不让坏数据破坏整份快照解析）
    const rawCredentials = snap.credentials;
    const credentials = isEncryptedCredentials(rawCredentials) ? rawCredentials : undefined;
    return {
        id: snap.id,
        createdAt: snap.createdAt,
        manifest: snap.manifest,
        sections: sectionsFromJsonSafe(snap.sections),
        ...(credentials !== undefined ? { credentials } : {}),
    };
}
//# sourceMappingURL=snapshot-json.js.map