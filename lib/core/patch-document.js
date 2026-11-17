/** 计划会把 insert 成员提升成顶层行：调用方必须放弃这次写入（零写入）。 */
export class PatchPromoteRefusedError extends Error {
    ids;
    constructor(ids) {
        super('patch rebuild would promote insert members to top-level rows: ' + ids.join(', '));
        this.name = 'PatchPromoteRefusedError';
        this.ids = ids;
    }
}
/** The candidate was rejected before writing; other import items may still proceed. */
export class PatchStartupInvalidError extends Error {
    constructor(message) { super(message); this.name = 'PatchStartupInvalidError'; }
}
function entryId(value) {
    if (value === null || typeof value !== 'object')
        return null;
    const id = value['id'];
    return typeof id === 'string' && id !== '' ? id : null;
}
function blockMembers(value) {
    if (value === null || typeof value !== 'object')
        return null;
    const insert = value['insert'];
    if (!Array.isArray(insert))
        return null;
    return insert.filter((entry) => entry !== null && typeof entry === 'object');
}
/** 读出文档里的全部条目（不判重、保持文档顺序）。 */
export function patchDocumentEntries(doc, recursive = true) {
    const entries = [];
    const ancestors = new Set();
    const add = (raw, inInsert) => {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw) || ancestors.has(raw))
            return;
        const obj = raw;
        const id = entryId(obj);
        if (id !== null)
            entries.push(typeof obj['name'] === 'string' ? { id, name: obj['name'], inInsert } : { id, inInsert });
        if (recursive && obj['group'] === true && Array.isArray(obj['config'])) {
            ancestors.add(raw);
            for (const child of obj['config'])
                add(child, inInsert);
            ancestors.delete(raw);
        }
    };
    if (!Array.isArray(doc))
        return entries;
    for (const item of doc) {
        const members = blockMembers(item);
        if (members !== null) {
            for (const member of members) {
                add(member, true);
            }
            continue;
        }
        add(item, false);
    }
    return entries;
}
/** 读出文档里的 insert 成员 id 与顶层行 id（自检与测试共用；不判重、保持文档顺序）。 */
export function describePatchDocument(doc) {
    const insertIds = [];
    const topLevelIds = [];
    for (const entry of patchDocumentEntries(doc, false)) {
        if (entry.inInsert)
            insertIds.push(entry.id);
        else
            topLevelIds.push(entry.id);
    }
    return { insertIds, topLevelIds };
}
/**
 * 重建成 patch 文档条目。
 *
 * `doc` 是已解析的原文档（非数组视为空文档）；顺序按原布局保留，新增项追加在尾部。
 */
export function planPatchDocument(doc, changes, inheritedIds = new Set()) {
    const state = new Map();
    const layout = [];
    if (Array.isArray(doc)) {
        for (const item of doc) {
            const members = blockMembers(item);
            if (members !== null) {
                const ids = [];
                for (const member of members) {
                    const id = entryId(member);
                    if (id === null)
                        continue;
                    ids.push(id);
                    if (!state.has(id))
                        state.set(id, { raw: member, inInsert: true });
                }
                if (ids.length > 0)
                    layout.push({ kind: 'block', ids });
                continue;
            }
            const id = entryId(item);
            if (id === null)
                continue;
            layout.push({ kind: 'row', id });
            if (!state.has(id))
                state.set(id, { raw: item, inInsert: false });
        }
    }
    for (const change of changes) {
        if (change.action === 'remove') {
            state.delete(change.lineId);
            continue;
        }
        const previous = state.get(change.lineId);
        // 归属默认由**原文档**决定：更新一条既有 insert 成员不会把它搬到顶层；新增才按动作分流。
        // forceTopLevel 是唯一例外（#144 存量：本层旧 insert 成员 + 别层也 insert 同一 id）。
        const inInsert = change.forceTopLevel === true || inheritedIds.has(change.lineId)
            ? false
            : previous !== undefined ? previous.inInsert : change.action === 'insert';
        state.set(change.lineId, { raw: change.raw, inInsert });
    }
    const items = [];
    const insertIds = [];
    const topLevelIds = [];
    const emitted = new Set();
    const emitRow = (id) => {
        const slot = state.get(id);
        if (slot === undefined || emitted.has(id))
            return;
        emitted.add(id);
        items.push(slot.raw);
        topLevelIds.push(id);
    };
    const emitBlock = (ids) => {
        const members = ids.filter((id) => {
            const slot = state.get(id);
            return slot !== undefined && slot.inInsert && !emitted.has(id);
        });
        if (members.length === 0)
            return;
        for (const id of members)
            emitted.add(id);
        items.push({ insert: members.map((id) => state.get(id).raw) });
        insertIds.push(...members);
    };
    for (const slot of layout) {
        if (slot.kind === 'row') {
            if (!state.get(slot.id)?.inInsert)
                emitRow(slot.id);
        }
        else {
            emitBlock(slot.ids);
            for (const id of slot.ids)
                if (state.get(id)?.inInsert === false)
                    emitRow(id);
        }
    }
    // 新写入、且原文档布局里没有的 id：insert 动作进块，update 动作保持旧的 upsert 语义（顶层行）
    for (const [id, slot] of state) {
        if (emitted.has(id))
            continue;
        if (slot.inInsert)
            continue;
        emitRow(id);
    }
    emitBlock([...state.keys()].filter((id) => !emitted.has(id)));
    // 不变量③：同一 id 不得两种身份并存（正常路径不可达；坏了就拒写，别写出一份语义分裂的文件）
    const promoted = insertIds.filter((id) => topLevelIds.includes(id));
    if (promoted.length > 0)
        throw new PatchPromoteRefusedError(promoted);
    return { items, insertIds, topLevelIds };
}
/**
 * 计划布局与观察到的布局是否一致（写后自检用，issue #133）。
 * 一致返回 `null`；不一致返回一句可直接进错误文案的差异说明（只含 id，不含值）。
 */
export function describePatchLayoutDrift(planned, observed) {
    const same = planned.insertIds.length === observed.insertIds.length
        && planned.topLevelIds.length === observed.topLevelIds.length
        && planned.insertIds.every((id, i) => id === observed.insertIds[i])
        && planned.topLevelIds.every((id, i) => id === observed.topLevelIds[i]);
    if (same)
        return null;
    const fmt = (label, ids) => label + '=[' + ids.join(', ') + ']';
    return 'planned ' + fmt('insert', planned.insertIds) + ' ' + fmt('top-level', planned.topLevelIds)
        + '; got ' + fmt('insert', observed.insertIds) + ' ' + fmt('top-level', observed.topLevelIds);
}
/**
 * 覆盖行孤儿检查（issue #133 起、issue #144 改判到「整条生效链」口径）。
 *
 * 宿主对顶层行只做**覆盖**：`entryMap` 查不到该 id ⇒ `patch: entry %C not found` 整行丢弃。
 * 所以真正值得拒绝的只有一种：**任何一层都没有提供这个 id**。旧判据反过来拒绝「别的层用
 * `- insert:` 提供过它」—— 那恰恰是条目已经存在、覆盖**合法**的情形，#144 里 bundle 层提供的
 * 6 个 id 正是被这条旧判据误拒的（写进去就是重复条目）。
 *
 * `docs` = 判定依据的层文档（生效链 + 本文件写入前的文档；读不出来的层由调用方自行丢弃 ——
 * 守卫只做加强，绝不因为兄弟层损坏而永久阻塞写入）。
 */
export function unprovidedTopLevelIds(docs, topLevelIds) {
    if (topLevelIds.length === 0)
        return [];
    const provided = new Set();
    for (const doc of docs) {
        for (const entry of patchDocumentEntries(doc))
            provided.add(entry.id);
    }
    return topLevelIds.filter((id) => !provided.has(id));
}
//# sourceMappingURL=patch-document.js.map