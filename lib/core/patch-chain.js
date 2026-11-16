/**
 * 生效 patch 链（issue #144）。
 *
 * DSH 启动时把**多层** patch 合并到同一份 plugin 树上（dsh-app-boot 的 readProfilePatches）：
 *   bundle 层（各 bundle 的 `dsh.bundle.patch`，按 `dsh.profile.bundles` 顺序）
 *   → profile 层（`profiles/<profile>/cordis.patch.yml`）
 *   → home 层（`cordis.patch.yml`）→ overlays。
 *
 * 同一个 id 只能有**一份**「新增」来源：两处 `- insert:` 成员会把同一条目插两次，宿主
 * composeEntries 之后拿到的 config 变成数组 / 取到没有 config 的那份，于是插件自己的
 * ConfigEditor 落盘时报
 * `Configuration for "X" is overridden by a home patch or command-line overlay` —— 报错把原因
 * 说反了（真正的原因是「我们插了第二份」，issue #144）。
 *
 * 于是「这个 id 存在吗」必须按**整条链**判定，而不是只看两个 patch 文件（issue #144 之前的
 * 判据只覆盖 home/profile 两层，见 `patchLayerRels`）：
 *   - 链上已存在 ⇒ 只能写**顶层覆盖行**（`- id: X`，带 config；写 name 时必须与既有条目一致，
 *     否则宿主 `patch: name mismatch … skipping` 整行跳过）；
 *   - 链上不存在 ⇒ 只能写 `- insert:` 成员（顶层行会被 `patch: entry not found` 丢弃）。
 *
 * 本模块只做**纯计算**（core 层零依赖、不碰 YAML / IO）：各层文档由宿主门面读好交进来。
 * 三个消费点共用同一份索引 —— 导入判定（计划项 Create / Update）、写前降级（insert → 覆盖行）、
 * 覆盖行孤儿守卫（整链没人提供该 id ⇒ 拒写）。
 */
import { patchDocumentEntries } from './patch-document.js';
/** 把整条链折成 id → 层/形态索引（顺序 = 宿主合并序，先出现者优先记 name）。 */
export function patchChainIndex(read) {
    const index = new Map();
    for (const source of read.sources) {
        for (const entry of patchDocumentEntries(source.doc)) {
            const known = index.get(entry.id);
            if (known === undefined) {
                const fresh = { id: entry.id, layers: [source.file], insertLayers: [] };
                if (entry.name !== undefined)
                    fresh.name = entry.name;
                if (entry.inInsert)
                    fresh.insertLayers.push(source.file);
                index.set(entry.id, fresh);
                continue;
            }
            if (!known.layers.includes(source.file))
                known.layers.push(source.file);
            if (entry.inInsert && !known.insertLayers.includes(source.file))
                known.insertLayers.push(source.file);
            // name 取**第一个**声明它的层：宿主按既有条目的 name 校验覆盖行，低优先级层的同名条目最终也会被覆盖
            if (known.name === undefined && entry.name !== undefined)
                known.name = entry.name;
        }
    }
    return index;
}
/** 链上「**本文件之外**的层」提供的 id（写这一层时的判据）。 */
export function providedByOtherLayers(index, file) {
    const out = new Map();
    for (const [id, entry] of index) {
        if (entry.layers.some((layer) => layer !== file))
            out.set(id, entry);
    }
    return out;
}
/**
 * 把待写的**顶层行**里的 `name` 校正成链上既有条目的 name（issue #144 的验收标准之一）。
 *
 * 为什么必须校正：宿主对覆盖行做 `name === target.name` 校验，不一致就
 * `patch: name mismatch … skipping` 把整行丢掉 —— 快照来自另一台机器（裸名）而目标机由
 * bundle 提供（scoped 名）时，导入会报「成功」但一个字节都没生效，原报错照旧。
 * `insert` 块成员不动（那是新增，name 由来源决定）。
 */
export function alignOverrideNames(items, index) {
    return items.map((item) => {
        if (item === null || typeof item !== 'object' || Array.isArray(item))
            return item;
        const obj = item;
        if ('insert' in obj)
            return item;
        const id = obj['id'];
        if (typeof id !== 'string' || id === '')
            return item;
        const wanted = index.get(id)?.name;
        if (wanted === undefined || obj['name'] === wanted)
            return item;
        return { ...obj, name: wanted };
    });
}
/**
 * 读整条链并折成索引。门面没实现 `readPatchChain`、或读链本身抛错 → `index: null`
 * （判定退化为两层 patch 文件，绝不因为链读失败阻断写入）。
 */
export async function readPatchChainIndex(patchFile) {
    if (patchFile.readPatchChain === undefined)
        return { index: null, failures: [] };
    try {
        const read = await patchFile.readPatchChain();
        return { index: patchChainIndex(read), failures: read.failures };
    }
    catch (err) {
        return { index: null, failures: [{ file: 'patch-chain', reason: err instanceof Error ? err.message : String(err) }] };
    }
}
//# sourceMappingURL=patch-chain.js.map