/**
 * m-sync-transport：散文件目录布局。
 * 快照根目录 = manifest.json + 按 SECTION_JSON_PATHS 平铺的 JSON 分区
 *            + 按 SECTION_FILE_PREFIXES 的文件类分区目录（skills 等真实文件）。
 * 分区集合 / ZIP 路径表 / 文件类前缀一律来自 src/schema/section-registry.ts（唯一权威，不再抄写分区名；
 * t32 起本文件直接从注册表派生，不经 schema/config.ts 的中转再导出）。
 * 核心逻辑经 SnapshotFs 注入（默认 node:fs/promises）。
 */
import path from 'node:path';
import { engineMsg } from './messages.js';
import { parseJsonSafe, stringifyJsonSafe } from '../utils/json.js';
import { sha256Hex } from '../utils/hashing.js';
import { filePrefixOf, jsonPathOf, SECTION_FILE_PREFIXES, SECTION_IDS, SECTION_JSON_PATHS, } from '../schema/section-registry.js';
import { createSnapshotFs, joinFs } from './fs.js';
import { BLOB_SECTIONS, isBlobRefsSection, refsToSection, sectionToBlobRefs } from './blob-store.js';
import { hashSection } from './sync-state.js';
import { isEncryptedSections } from './transport.js';
export const SNAPSHOT_MANIFEST_FILE = 'manifest.json';
/**
 * 空文件类分区的 git 占位文件（git 不跟踪空目录）：
 * 上传方（GitTransport.upload）给 files 为空的文件类分区目录写入本占位文件，
 * 保证远端仓库保留该目录；读回时仅当「文件名 + 内容」同时匹配才过滤，
 * 避免吞掉用户真实同名文件。占位文件不参与 sectionHashes（基于传入数据计算）。
 * 注意：占位内容不得含换行 —— Windows core.autocrlf 会把 LF 转 CRLF，内容校验会失败。
 */
export const SNAPSHOT_KEEP_FILE = '.gitkeep';
/**
 * 内容寻址外置（P1-4）：文件类分区若走 blob 仓，快照目录里用本文件记录引用
 * （`<section>.blobs.json`），不再写 `<prefix>/**` 的字节。
 */
export const SNAPSHOT_BLOB_REFS_SUFFIX = '.blobs.json';
export function blobRefsFile(sid) {
    return `${sid}${SNAPSHOT_BLOB_REFS_SUFFIX}`;
}
export const SNAPSHOT_KEEP_CONTENT = 'DSH Config Manager sync placeholder (keep empty section dir)';
const SNAPSHOT_KEEP_BYTES = new TextEncoder().encode(SNAPSHOT_KEEP_CONTENT);
function isKeepFile(rel, data) {
    if (rel !== SNAPSHOT_KEEP_FILE)
        return false;
    if (data.length !== SNAPSHOT_KEEP_BYTES.length)
        return false;
    for (let i = 0; i < data.length; i++) {
        if (data[i] !== SNAPSHOT_KEEP_BYTES[i])
            return false;
    }
    return true;
}
/**
 * 布局支持的分区 = 有 JSON 载荷（jsonPathOf）或有文件类前缀（filePrefixOf）的分区；
 * secrets（payload.kind='none'，走独立加密容器）不在内。
 *
 * 从**注册表**派生（不再抄写分区名），且与历史表达式
 * `[...Object.keys(SECTION_JSON_PATHS), ...Object.keys(SECTION_FILE_PREFIXES)]` **逐项同序**
 * （JSON 分区在前、文件类在后，组内保持注册表 applyOrder）—— 键顺序是行为的一部分，
 * 派生式已按该顺序实测比对（t32）。成员判定（includes）本身与顺序无关，但保持一致以免误读。
 */
const LAYOUT_SECTION_IDS = [
    ...SECTION_IDS.filter((id) => jsonPathOf(id) !== null),
    ...SECTION_IDS.filter((id) => filePrefixOf(id) !== null),
];
/**
 * 文件相对路径安全检查：拒绝空/'.'/'..'、绝对路径、Windows 盘符、反斜杠、
 * 含 '..' 或 '.' 片段（防穿越快照根目录）。
 */
export function isSafeRelPath(rel) {
    if (rel === '' || rel === '.' || rel === '..')
        return false;
    if (rel.startsWith('/') || /^[A-Za-z]:[\\/]/.test(rel))
        return false;
    if (rel.includes('\\'))
        return false;
    const parts = rel.split('/');
    if (parts.some((p) => p === '' || p === '.' || p === '..'))
        return false;
    return true;
}
/** 递归列出 dir 下的全部文件（相对 dir 的正斜杠路径，字典序）；目录不存在 → [] */
export async function listSnapshotFiles(fsx, dir) {
    const out = [];
    const walk = async (abs, rel) => {
        const names = await fsx.readdir(abs);
        for (const name of names) {
            if (name === '' || name === '.' || name === '..')
                continue; // 防御异常/恶意 fs
            const childAbs = joinFs(abs, name);
            const childRel = rel === '' ? name : `${rel}/${name}`;
            if (await fsx.isDir(childAbs)) {
                await walk(childAbs, childRel);
            }
            else {
                out.push(childRel);
            }
        }
    };
    await walk(dir, '');
    return out.sort();
}
/**
 * 将快照写入散文件目录。
 * 非法输入（不支持的子分区 / 穿越路径）在任何写入发生前抛错，不留半成品目录。
 */
export async function writeSnapshotToDir(snapshot, dir, fsx = createSnapshotFs(), opts = {}) {
    // 加密快照不写散文件目录（本地不落盘：密文/明文都不落；远端已存密文）
    if (isEncryptedSections(snapshot.sections)) {
        throw new Error(engineMsg('sync.layoutEncryptedDirUnsupported'));
    }
    // issue #38：凭据载荷只随加密快照的密文单文件布局传输。散文件布局无法承载它，
    // 静默丢弃 = 「勾了导出密钥却什么也没导」，因此这里显式拒绝（调用方本不该走到这里）。
    if (snapshot.credentials !== undefined) {
        throw new Error(engineMsg('sync.layoutCredentialsNeedEncryptedLayout'));
    }
    const sectionHashes = {};
    for (const [id, data] of Object.entries(snapshot.sections)) {
        const sid = id;
        if (!LAYOUT_SECTION_IDS.includes(sid)) {
            throw new Error(engineMsg('sync.layoutSectionUnsupported', { section: sid }));
        }
        sectionHashes[sid] = hashSection(data);
    }
    // 预校验全部文件相对路径（不合法 → 抛错且零写入）
    for (const [sid, data] of Object.entries(snapshot.sections)) {
        if (!(sid in SECTION_FILE_PREFIXES))
            continue;
        for (const file of data.files) {
            if (!isSafeRelPath(file.relativePath)) {
                throw new Error(engineMsg('sync.layoutFileRelPathInvalid', { path: file.relativePath, section: sid }));
            }
        }
    }
    await fsx.mkdir(dir);
    const manifest = {
        id: snapshot.id,
        createdAt: snapshot.createdAt,
        manifest: snapshot.manifest,
        sectionHashes,
    };
    await fsx.writeFile(joinFs(dir, SNAPSHOT_MANIFEST_FILE), new TextEncoder().encode(stringifyJsonSafe(manifest, { space: 2 })));
    // JSON 分区：按 SECTION_JSON_PATHS 平铺
    for (const [sid, rel] of Object.entries(SECTION_JSON_PATHS)) {
        const data = snapshot.sections[sid];
        if (data === undefined)
            continue;
        const abs = joinFs(dir, rel);
        await fsx.mkdir(path.dirname(abs));
        await fsx.writeFile(abs, new TextEncoder().encode(stringifyJsonSafe(data, { space: 2 })));
    }
    // 文件类分区：目录前缀 + 真实文件；走外置的分区只写引用文件（字节进 blob 仓）
    const blobSections = new Set(opts.sections ?? BLOB_SECTIONS);
    const blobs = opts.blobs;
    for (const [sid, prefix] of Object.entries(SECTION_FILE_PREFIXES)) {
        const data = snapshot.sections[sid];
        if (data === undefined)
            continue;
        if (blobs !== undefined && blobSections.has(sid)) {
            // sectionHashes 仍按**明文分区**计算（上面已算完）——读回侧才能在不解包的情况下比较
            const refs = await sectionToBlobRefs(data, blobs);
            const refsAbs = joinFs(dir, blobRefsFile(sid));
            await fsx.writeFile(refsAbs, new TextEncoder().encode(stringifyJsonSafe(refs, { space: 2 })));
            continue;
        }
        const baseAbs = joinFs(dir, prefix);
        await fsx.mkdir(baseAbs); // 空文件类分区也保留目录（读回可还原空 files）
        for (const file of data.files) {
            const abs = joinFs(baseAbs, file.relativePath);
            await fsx.mkdir(path.dirname(abs));
            await fsx.writeFile(abs, file.data);
        }
    }
    return manifest;
}
/**
 * 从散文件目录读回快照。
 * manifest 声明的分区必须可解析：JSON 分区文件缺失 / 文件分区目录缺失 → 抛错（不静默降级），
 * 但 opts.missingFileDir='empty' 时文件分区目录缺失降级为空分区
 * （git 通道专用：git 不跟踪空目录，目录缺失 = 空文件分区；提交原子性保证非空目录不会缺失）。
 * 读回时过滤 git 占位文件（SNAPSHOT_KEEP_FILE），使 files 与上传方数据一致。
 */
export async function readSnapshotFromDir(dir, fsx = createSnapshotFs(), opts = {}) {
    const manifestAbs = joinFs(dir, SNAPSHOT_MANIFEST_FILE);
    if (!(await fsx.exists(manifestAbs))) {
        throw new Error(engineMsg('sync.layoutManifestMissing', { file: SNAPSHOT_MANIFEST_FILE, dir }));
    }
    const parsed = parseJsonSafe(Buffer.from(await fsx.readFile(manifestAbs)).toString('utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error(engineMsg('sync.layoutManifestNotObject'));
    }
    const m = parsed;
    if (typeof m['id'] !== 'string' || typeof m['createdAt'] !== 'string'
        || m['manifest'] === null || typeof m['manifest'] !== 'object'
        || m['sectionHashes'] === null || typeof m['sectionHashes'] !== 'object') {
        throw new Error(engineMsg('sync.layoutManifestMissingFields'));
    }
    const manifest = parsed;
    const sections = {};
    const declared = Object.keys(manifest.sectionHashes);
    for (const sid of declared) {
        if (!LAYOUT_SECTION_IDS.includes(sid)) {
            throw new Error(engineMsg('sync.layoutManifestSectionUnsupported', { section: sid }));
        }
    }
    // JSON 分区
    for (const [sid, rel] of Object.entries(SECTION_JSON_PATHS)) {
        if (!(sid in manifest.sectionHashes))
            continue;
        const abs = joinFs(dir, rel);
        if (!(await fsx.exists(abs))) {
            throw new Error(engineMsg('sync.layoutJsonSectionMissing', { path: rel, section: sid }));
        }
        sections[sid] = parseJsonSafe(Buffer.from(await fsx.readFile(abs)).toString('utf8'));
    }
    // 文件类分区
    for (const [sid, prefix] of Object.entries(SECTION_FILE_PREFIXES)) {
        if (!(sid in manifest.sectionHashes))
            continue;
        // 外置引用形态（P1-4）：从 blob 仓取回字节；仓缺失/引用损坏一律硬失败（绝不降级为空分区）
        const refsAbs = joinFs(dir, blobRefsFile(sid));
        if (await fsx.exists(refsAbs)) {
            const parsedRefs = parseJsonSafe(Buffer.from(await fsx.readFile(refsAbs)).toString('utf8'));
            if (!isBlobRefsSection(parsedRefs)) {
                throw new Error(engineMsg('sync.layoutBlobRefsInvalid', { file: blobRefsFile(sid) }));
            }
            if (opts.blobs === undefined) {
                throw new Error(engineMsg('sync.layoutBlobRefsNoSink', { section: sid }));
            }
            sections[sid] = await refsToSection(parsedRefs, opts.blobs);
            continue;
        }
        const baseAbs = joinFs(dir, prefix);
        if (!(await fsx.isDir(baseAbs))) {
            if (opts.missingFileDir === 'empty') {
                // git 通道降级：目录缺失 = 空文件分区（git 不跟踪空目录，详见函数注释）
                sections[sid] = { version: 1, files: [] };
                continue;
            }
            throw new Error(engineMsg('sync.layoutFileSectionDirMissing', { prefix, section: sid }));
        }
        const rels = await listSnapshotFiles(fsx, baseAbs);
        const files = [];
        for (const rel of rels) {
            const data = await fsx.readFile(joinFs(baseAbs, rel));
            // 过滤 git 占位文件（名 + 内容同时匹配才过滤，避免吞用户真实同名文件）
            if (isKeepFile(rel, data))
                continue;
            files.push({ relativePath: rel, data, contentHash: sha256Hex(data) });
        }
        sections[sid] = { version: 1, files };
    }
    return { id: manifest.id, createdAt: manifest.createdAt, manifest: manifest.manifest, sections };
}
//# sourceMappingURL=layout.js.map