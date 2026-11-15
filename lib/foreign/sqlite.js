var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
/**
 * SQLite 只读读器（档 B 的 8 个 SQLite 来源共用；动态 import + 能力探测）。
 *
 * **为什么必须动态 import**（t5 实测 + 硬约束）：`node:sqlite` 是 Node 22.5+ 才有的内建，
 * 且在三平台/各小版本上的可用性并不一致（Node 24 可用但打印 ExperimentalWarning；Node 22.19
 * 未验证）。**静态 `import ... from 'node:sqlite'` 会在缺该能力的宿主上把整个插件加载失败**
 * —— 表现是「插件没装」而不是「这一个来源读不到」，用户完全无法定位。
 * ⇒ 一律 `await import(<变量>)`（非字面量，因此打包器/类型检查都不会静态解析它）+ `typeof` 能力探测。
 *
 * **与竞品的三处刻意不同**（read-chat-import §7.2 / read-vault §8.1）：
 *  ① 竞品「打不开 / 表不对 / 锁定」一律 `return null`，用户看到的是**未安装**；本模块把三类
 *     失败分开（能力缺失 / 打不开 / 表结构不符），由调用方映射成 `source-unreadable` 的不同 detail
 *     —— 「读不到」与「没装」必须能区分，否则用户会以为源工具没装。
 *  ② 只读打开仍可能落 `-shm`/`-wal` 伴生文件（t1 警告 → t4 真机确证 → t9 处置）：见下方「零写入」段。
 *  ③ 「读不到返回 null」的约定统一在**每一个**公开方法上（`all` / `tables` / `columns`），
 *     不出现「有的抛、有的返回 null」两种语气。
 *
 * ————————————————————————————————————————————————————————————
 * **t9：只读打开也不许写用户的目录**（本文件的核心不变式）
 *
 * 真机实测（Node v24.13.0，本文件与 sqlite.test.ts 用同一份实现）：
 *  · **回滚日志模式**（库头 header[18]/[19] == 1）：`{ readOnly: true }` 就地打开**零副作用**
 *    （目录/size/mtime 逐字不变，不落任何伴生文件）。
 *  · **WAL 模式且 `-wal` 非空**：就地只读打开会**新建 `<db>-shm`（32768 B）与 `<db>-wal`（0 B）**
 *    且 close 后仍在 —— 不是我们写数据，但**确实往用户的数据目录里写了文件**。
 *  · **`file:<db>?immutable=1` 在 `-wal` 非空时会忽略整条 WAL**：实测 `no such table: t`
 *    （表与数据都还在 WAL 里）⇒ **这个组合会静默丢数据，绝不可用**。
 *  · **WAL 模式但没有 pending `-wal`**（源工具干净关闭后 SQLite 会删掉它）：主库文件自身完整，
 *    `immutable=1` 读到**正确**数据且**零伴生文件**（也实测过）。
 *
 * ⇒ 打开策略是三态计划（`planSqliteOpen`）：
 *   `direct`     回滚日志模式（且无热 `-journal`）→ 就地只读打开（实测零副作用）
 *   `immutable`  WAL 模式且**无 pending `-wal`/`-journal`** → `file:...?immutable=1`（无锁、不建伴生文件）
 *   `copy`       其余（有 pending `-wal` / 热 `-journal`）→ 把 db + 伴生文件**复制到私有临时目录**读副本，close 时清理
 *
 * 三条硬边界：
 *  ① **绝不退回「就地打开」**：`copy` 失败 / 超过字节上限 → 返回结构化 problem（`copy-too-large` /
 *     `copy-failed`），**绝不**为了读到一个库去写用户目录；上层据此报 `source-unreadable`。
 *  ② `copy` 有**字节上限**（`SqliteOpenOptions.maxCopyBytes`，缺省 1 GiB）—— 超限如实报码，
 *     不静默降级、也不部分拷贝（部分拷贝=读到一个坏库）。
 *  ③ `immutable` 的前提是**证明主库完整**（无 pending sidecar）；有并发写入者时它不加锁
 *     （读到的是主库的固定快照），这是刻意换取「零写入」。一旦发现 pending sidecar 即改走 copy，
 *     **绝不拿陈旧数据充数**。
 *
 * **判负层次（第二条实测约束）**：非 SQLite 文本文件的构造是「**惰性成功**」——
 * `new DatabaseSync(<垃圾文件>, { readOnly: true })` 不抛，`tables()` 才返回 null。
 * ⇒ 所有来源的「这不是本来源的库」判定都必须在**表探测处**（`tables()` / `columns()`），
 * **不可依赖构造失败**。`sqlite.test.ts` 有 8 个来源的逐源断言把这条钉死。
 *
 * **分层**：本模块是**宿主侧**模块（t9 起 import `node:fs`/`node:os`/`node:path` —— 复制路线需要
 * 真实文件系统）。它**只会**被 `src/foreign/` 的读盘层 import，绝不能被浏览器半 import。
 * `file-budget.test.ts` 的 fs 白名单应把 `sqlite.ts` 收进名单（与 `session-read.ts` 同批）。
 * ————————————————————————————————————————————————————————————
 */
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
/** copy 路线的缺省上限（1 GiB）：再大就如实报码，不拿「写用户目录」换功能 */
export const DEFAULT_MAX_COPY_BYTES = 1024 * 1024 * 1024;
/**
 * 模块说明符**刻意不是字面量**：
 *  ① 静态字面量会让 tsc 去解析 `node:sqlite` 的类型（@types/node 未覆盖时直接编译失败）；
 *  ② 也会让任何打包器把 `node:sqlite` 当成真实依赖静态内联。
 */
const SQLITE_MODULE_SPECIFIER = 'node:sqlite';
/** SQLite 库头魔数（16 字节 ASCII，含结尾 NUL） */
const SQLITE_MAGIC = 'SQLite format 3';
/** 只读库头的前 100 字节（版本字节在 [18]/[19]，魔数在 [0,16)） */
const HEADER_BYTES = 100;
let probe;
let ctor = null;
function isConstructorLike(v) {
    return typeof v === 'function';
}
async function loadConstructor() {
    if (probe !== undefined)
        return ctor;
    let mod;
    try {
        mod = await import(__rewriteRelativeImportExtension(SQLITE_MODULE_SPECIFIER));
    }
    catch {
        probe = { available: false, reason: 'module-unavailable' };
        ctor = null;
        return null;
    }
    const candidate = mod.DatabaseSync;
    if (!isConstructorLike(candidate)) {
        probe = { available: false, reason: 'api-unavailable' };
        ctor = null;
        return null;
    }
    probe = { available: true };
    ctor = candidate;
    return ctor;
}
/** 本宿主是否具备只读 SQLite 能力（探测结果进程内缓存；探测本身绝不抛） */
export async function sqliteCapability() {
    await loadConstructor();
    return probe ?? { available: false, reason: 'module-unavailable' };
}
function rowsOf(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const item of raw) {
        if (typeof item === 'object' && item !== null && !Array.isArray(item))
            out.push(item);
    }
    return out;
}
async function statSizeOrNull(p) {
    try {
        const st = await fsp.stat(p);
        return st.isFile() ? st.size : null;
    }
    catch {
        return null;
    }
}
/** 只读库头（open + read(100) + close；读不到 → null，绝不 readFile 整库） */
async function readHeaderBytes(file) {
    let fh = null;
    try {
        fh = await fsp.open(file, 'r');
    }
    catch {
        return null;
    }
    try {
        const buf = new Uint8Array(HEADER_BYTES);
        const { bytesRead } = await fh.read(buf, 0, HEADER_BYTES, 0);
        return buf.subarray(0, bytesRead);
    }
    catch {
        return null;
    }
    finally {
        await fh.close().catch(() => undefined);
    }
}
/**
 * 打开计划：靠**只读的库头 + 伴生文件大小**判定，不做任何 SQLite 打开动作。
 *
 * `header[18]/[19]` 是 SQLite 的文件格式读/写版本（1 = 回滚日志 / 2 = WAL）；这是「这个库是不是
 * WAL 模式」在**不打开库**的前提下唯一可靠的证据。魔数不符（非 SQLite / 太短）→ 按 `direct` 处理，
 * 让 SQLite 惰性构造 + 上层的表探测去判负（**判负层次**见文件头）。
 */
async function planSqliteOpen(file) {
    const header = await readHeaderBytes(file);
    const magic = header !== null && header.length >= 16 ? new TextDecoder().decode(header.subarray(0, 16)) : '';
    const isSqlite = magic.startsWith(SQLITE_MAGIC);
    const walMode = isSqlite && header !== null && header.length >= 20 && (header[18] === 2 || header[19] === 2);
    const walBytes = (await statSizeOrNull(file + '-wal')) ?? 0;
    const journalBytes = (await statSizeOrNull(file + '-journal')) ?? 0;
    if (!walMode && journalBytes === 0)
        return { mode: 'direct', walBytes, journalBytes };
    if (walMode && walBytes === 0 && journalBytes === 0)
        return { mode: 'immutable', walBytes, journalBytes };
    return { mode: 'copy', walBytes, journalBytes };
}
/**
 * SQLite URI 形态（`file:<路径>?immutable=1`）。
 *
 * 只编码会破坏 URI 解析的字符（实测：路径含 `#` 时**不编码就打不开** —— `#` 起 fragment；
 * 空格与 Windows 反斜杠实测可原样通过）。**不做百分号以外的“聪明”归一**。
 */
function sqliteUri(file, query) {
    const encoded = file
        .split('%').join('%25')
        .split('#').join('%23')
        .split('?').join('%3F');
    return 'file:' + encoded + '?' + query;
}
/* ---------------- 句柄 ---------------- */
function makeHandle(db) {
    let closed = false;
    const close = () => {
        if (closed)
            return;
        closed = true;
        try {
            db.close();
        }
        catch {
            // 关不掉不影响只读语义；Windows 上句柄会随进程退出释放
        }
    };
    const all = (sql, ...params) => {
        try {
            return rowsOf(db.prepare(sql).all(...params));
        }
        catch {
            return null;
        }
    };
    const tables = () => {
        const rows = all("SELECT name FROM sqlite_master WHERE type = 'table'");
        if (rows === null)
            return null;
        const out = [];
        for (const row of rows) {
            const name = row['name'];
            if (typeof name === 'string' && name !== '')
                out.push(name);
        }
        return out;
    };
    const columns = (table) => {
        // 表名走 PRAGMA，不能参数化绑定 → 只允许调用方给**编译期常量**表名（各来源都是字面量）
        const rows = all('PRAGMA table_info(' + table + ')');
        if (rows === null)
            return null;
        const out = [];
        for (const row of rows) {
            const name = row['name'];
            if (typeof name === 'string' && name !== '')
                out.push(name);
        }
        return out;
    };
    return { all, tables, columns, close };
}
/** copy 模式的句柄：close 时把私有临时副本一并删掉（best-effort；Windows 上必须在句柄关闭之后） */
function handleWithCleanup(inner, tempDir) {
    let closed = false;
    return {
        all: (sql, ...params) => inner.all(sql, ...params),
        tables: () => inner.tables(),
        columns: (table) => inner.columns(table),
        close: () => {
            if (closed)
                return;
            closed = true;
            inner.close();
            void fsp.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
        },
    };
}
async function removeDir(dir) {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}
function construct(Ctor, pathOrUri) {
    try {
        return new Ctor(pathOrUri, { readOnly: true });
    }
    catch {
        return null;
    }
}
/**
 * copy 路线：把库 + 已存在的伴生文件复制到私有临时目录，读副本。
 *
 * 为什么必须连伴生文件一起复制：表/数据可能整段还在 `-wal` 里（实测：只拷 `.db` 会 `no such table`）。
 * 复制期间源库若被写入，副本可能是撕裂的 —— 那时 SQLite 会报损坏、上层按读不到处理（**我们绝不写源**）。
 */
async function copyAndOpen(Ctor, file, plan, options) {
    const dbBytes = (await statSizeOrNull(file)) ?? 0;
    const shmBytes = (await statSizeOrNull(file + '-shm')) ?? 0;
    const total = dbBytes + plan.walBytes + plan.journalBytes + shmBytes;
    const cap = options?.maxCopyBytes ?? DEFAULT_MAX_COPY_BYTES;
    if (total > cap)
        return { db: null, problem: 'copy-too-large' };
    let dir;
    try {
        dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'dcm-sqlite-'));
    }
    catch {
        return { db: null, problem: 'copy-failed' };
    }
    const target = path.join(dir, 'db');
    try {
        await fsp.copyFile(file, target);
        for (const suffix of ['-wal', '-shm', '-journal']) {
            if ((await statSizeOrNull(file + suffix)) !== null)
                await fsp.copyFile(file + suffix, target + suffix);
        }
    }
    catch {
        await removeDir(dir);
        return { db: null, problem: 'copy-failed' };
    }
    const db = construct(Ctor, target);
    if (db === null) {
        await removeDir(dir);
        return { db: null, problem: 'open-failed' };
    }
    return { db: handleWithCleanup(makeHandle(db), dir), mode: 'copy' };
}
/**
 * 只读打开（**带失败原因**）：`missing` / `not-a-file` / `open-failed` / `copy-too-large` / `copy-failed`。
 *
 * **绝不抛**；**绝不写用户目录**（copy 路线失败即放弃，不退回就地打开）。
 */
export async function openSqliteReadOnlyEx(file, options) {
    const Ctor = await loadConstructor();
    if (Ctor === null)
        return { db: null, problem: 'open-failed' };
    const header = await readHeaderBytes(file);
    if (header === null) {
        // 读不到库头：区分「文件不存在 / 不是普通文件」与「存在但读不出（权限等）」
        try {
            const st = await fsp.stat(file);
            if (!st.isFile())
                return { db: null, problem: 'not-a-file' };
        }
        catch {
            return { db: null, problem: 'missing' };
        }
    }
    const plan = await planSqliteOpen(file);
    if (plan.mode === 'direct') {
        const db = construct(Ctor, file);
        return db === null ? { db: null, problem: 'open-failed' } : { db: makeHandle(db), mode: 'direct' };
    }
    if (plan.mode === 'immutable') {
        const db = construct(Ctor, sqliteUri(file, 'immutable=1'));
        // immutable URI 打不开（极老 SQLite / 路径编码边界）→ **绝不退回就地打开**，改走复制
        if (db !== null)
            return { db: makeHandle(db), mode: 'immutable' };
    }
    return await copyAndOpen(Ctor, file, plan, options);
}
/**
 * 只读打开（**兼容签名**：只回句柄，读不到回 null）。
 *
 * 需要区分失败原因时用 `openSqliteReadOnlyEx`；「读不到返回 null」的约定在两者上一致。
 */
export async function openSqliteReadOnly(file, options) {
    return (await openSqliteReadOnlyEx(file, options)).db;
}
/** 表 + 关键列的**签名判定**（竞品同款：不靠文件名，靠结构自证；不符 → 关闭句柄并返回 null） */
export async function openSqliteIfShape(file, required) {
    const db = await openSqliteReadOnly(file);
    if (db === null)
        return null;
    const tables = db.tables();
    if (tables === null) {
        db.close();
        return null;
    }
    for (const [table, cols] of Object.entries(required)) {
        if (!tables.includes(table)) {
            db.close();
            return null;
        }
        const actual = db.columns(table);
        if (actual === null) {
            db.close();
            return null;
        }
        for (const col of cols) {
            if (!actual.includes(col)) {
                db.close();
                return null;
            }
        }
    }
    return db;
}
/** 把一列取值按「首行可用」取出（SQLite 的 NULL 与缺列都归 undefined） */
export function cell(row, key) {
    return row[key];
}
/** 单元格 → 文本（BLOB 与数字按各自约定；null/undefined → undefined，绝不伪造空串） */
export function cellText(row, key) {
    const v = row[key];
    if (typeof v === 'string')
        return v;
    if (typeof v === 'number' && Number.isFinite(v))
        return String(v);
    if (typeof v === 'bigint')
        return v.toString();
    return undefined;
}
/** 单元格 → Uint8Array（TEXT 列也编码成字节；其它类型 → undefined） */
export function cellBytes(row, key) {
    const v = row[key];
    if (v instanceof Uint8Array)
        return v;
    if (typeof v === 'string')
        return new TextEncoder().encode(v);
    return undefined;
}
/** 单元格 → 毫秒时间（安全整数直接采信；ISO 字符串走 Date.parse；其余 undefined） */
export function cellTime(row, key) {
    const v = row[key];
    if (typeof v === 'number' && Number.isSafeInteger(v))
        return v;
    if (typeof v === 'string' && v !== '') {
        const parsed = Date.parse(v);
        return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
}
//# sourceMappingURL=sqlite.js.map