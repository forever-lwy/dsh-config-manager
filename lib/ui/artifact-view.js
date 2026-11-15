/**
 * 产物库的视图模型（UI v2 §6.3）—— 把**四套来源**合并成一张混合平铺列表。
 *
 * 为什么要合并：v1 把「本机快照 / 备份文件 / 远端快照 / 市场配置」分成四处列表、四套行结构、
 * 四套动作。用户找「我上周那份」时不该先想它落在哪个源里（§1.3）。
 *
 * 三条不变量：
 *  ① **动作由 capabilities 分派，不由 kind 分派**。行只渲染它真正支持的动作 ——
 *     远端快照不能删本机文件，市场条目不能「恢复」只能「安装」。这是「不再每种来源写一套列表」的落点。
 *  ② **未知值不编造**（§3 第三条）：体积只有备份文件有（§6.8 ①），缺失就是 `undefined`，
 *     渲染成「—」而不是 0；作者/版本缺失就不占元数据行的位置；时间缺失排到最后而不是当「最早」。
 *  ③ **本模块不掺 locale**：数字千分位、字节单位、文案全部走 UiT / formatBytes；
 *     时间只以 ISO 字符串流转，本地化格式化留给 React 层（像 `title: {kind:'time'}`）。
 *
 * 输入用**结构类型**而不是 import 四套真实类型：`src/ui` 不该依赖 `src/client/*` 的类型
 * （分层方向是 client → ui）。四个真实对象都比这里声明的更宽，直接传即可。
 */
import { formatBytes } from './report.js';
/* ------------------------------------------------- 字典键（编译期穷尽） */
export const ARTIFACT_KIND_LABEL_KEY = {
    'snapshot': 'library.kind.snapshot',
    'backup-file': 'library.kind.backupFile',
    'remote-snapshot': 'library.kind.remote',
    'market': 'library.kind.market',
};
export const ARTIFACT_BADGE_LABEL_KEY = {
    'pinned': 'library.badge.pinned',
    'current': 'library.badge.current',
    'encrypted': 'library.badge.encrypted',
    'unreadable': 'library.badge.unreadable',
};
export const ARTIFACT_CAPABILITY_LABEL_KEY = {
    'restore': 'library.cap.restore',
    'import': 'library.cap.import',
    'pull': 'library.cap.pull',
    'install': 'library.cap.install',
    'inspect': 'library.cap.inspect',
    'download': 'library.cap.download',
    'consult': 'library.cap.consult',
    'pin': 'library.cap.pin',
    'unpin': 'library.cap.unpin',
    'delete': 'library.cap.delete',
};
/** 数字千分位（固定 en-US：zh 的分组规则与它一致，且测试不依赖运行环境的 ICU 区域设置） */
function group(n) {
    return n.toLocaleString('en-US');
}
/* ------------------------------------------------------------------ 构造 */
/**
 * 四源 → 行。返回**已按时间倒序**（缺时间的排最后）——
 * 面板不必再造一遍序，筛选/排序只覆盖用户的显式选择。
 */
export function toArtifactRows(input, t) {
    const rows = [
        ...(input.snapshots ?? []).map((s) => snapshotRow(s, t)),
        ...(input.backupFiles ?? []).map((f) => backupFileRow(f, t)),
        ...(input.remoteSnapshots ?? []).map((r) => remoteSnapshotRow(r, input, t)),
        ...(input.marketItems ?? []).map((m) => marketRow(m, t)),
    ];
    return sortRows(rows, 'time');
}
function snapshotRow(s, t) {
    const badges = [];
    if (s.pinned === true)
        badges.push('pinned');
    return {
        key: `snapshot:${s.id}`,
        kind: 'snapshot',
        title: { kind: 'time', iso: s.createdAt },
        meta: [
            t('library.meta.entries', { count: group(s.entryCount) }),
            t('library.meta.plugins', { count: group(s.beforePluginCount) }),
        ],
        at: s.createdAt,
        badges,
        // 恢复 = dry-run 计划预览（§6.8 ②）；「查看差异」与它同入口，故不单列
        // 置顶已移除（用户要求）：它只是一个排序偏好，却占了「更多」里的一格，收益不抵成本
        capabilities: ['restore', 'consult', 'delete'],
        ref: { snapshotId: s.id },
        detail: [
            { label: t('library.detail.id'), value: s.id },
            { label: t('library.detail.created'), value: '', iso: s.createdAt },
            { label: t('library.detail.entries'), value: group(s.entryCount) },
            { label: t('library.detail.plugins'), value: group(s.beforePluginCount) },
            { label: t('library.detail.pinned'), value: s.pinned === true ? t('library.value.yes') : t('library.value.no') },
        ],
        // 检索词也属界面文案（按当前语言的用户输入匹配；字面量中文会让英文界面命中中文词）
        searchText: [s.id, 'snapshot', t('library.kind.snapshot')].join(' ').toLowerCase(),
    };
}
function backupFileRow(f, t) {
    const encrypted = f.containerType === 'encrypted';
    const badges = encrypted ? ['encrypted'] : [];
    return {
        key: `backup-file:${f.path}`,
        kind: 'backup-file',
        title: { kind: 'text', value: f.name },
        meta: [
            f.source === 'auto' ? t('library.meta.sourceAuto') : t('library.meta.sourceManual'),
            formatBytes(f.sizeBytes),
        ],
        at: new Date(f.mtimeMs).toISOString(),
        sizeBytes: f.sizeBytes,
        badges,
        capabilities: ['import', 'consult', 'inspect', 'download', 'delete'],
        ref: { path: f.path },
        // 备注可能为空 → 整行不出现（不渲染一个空值行）
        detail: [
            { label: t('library.detail.path'), value: f.path },
            ...(f.note === undefined || f.note === null || f.note === ''
                ? []
                : [{ label: t('library.detail.note'), value: f.note }]),
            { label: t('library.detail.source'), value: f.source === 'auto' ? t('library.meta.sourceAuto') : t('library.meta.sourceManual') },
            { label: t('library.detail.size'), value: formatBytes(f.sizeBytes) },
            { label: t('library.detail.modified'), value: '', iso: new Date(f.mtimeMs).toISOString() },
            { label: t('library.detail.container'), value: encrypted ? t('library.value.encryptedContainer') : t('library.value.plainZip') },
        ],
        searchText: [f.name, f.note ?? '', f.path].join(' ').toLowerCase(),
    };
}
function remoteSnapshotRow(r, input, t) {
    const badges = input.remoteCurrentId === r.id ? ['current'] : [];
    // 通道类型未知 → 该段不渲染（不猜成 Git）
    const channel = input.remoteChannel === 'webdav'
        ? t('library.meta.channelWebdav')
        : input.remoteChannel === 'git' ? t('library.meta.channelGit') : null;
    const meta = [];
    if (channel !== null)
        meta.push(channel);
    meta.push(t('library.meta.sections', { count: group(r.sectionCount) }));
    meta.push(t('library.meta.dshVersion', { version: r.dshVersion }));
    return {
        key: `remote-snapshot:${r.id}`,
        kind: 'remote-snapshot',
        title: { kind: 'time', iso: r.createdAt },
        meta,
        at: r.createdAt,
        badges,
        // 与备份文件**对齐**（2026-10-04 用户要求）：查看与对比 / 下载 / 删除都进 ⋯ 菜单。
        // 「查看与对比」不再受「客户端拿不到分区明细」限制：宿主把该快照落地成本机 ZIP
        // （/sync/download）后走备份文件那条只读分析，于是远端也看得见真实分区与差异。
        // 删除只动**远端那一份**（宿主 /sync/snapshot-delete），本机配置与同步基线都不碰。
        capabilities: ['pull', 'consult', 'inspect', 'download', 'delete'],
        ref: { remoteId: r.id },
        detail: [
            { label: t('library.detail.id'), value: r.id },
            { label: t('library.detail.created'), value: '', iso: r.createdAt },
            { label: t('library.detail.sections'), value: group(r.sectionCount) },
            { label: t('library.detail.platform'), value: r.platform },
            { label: t('library.detail.dsh'), value: r.dshVersion },
        ],
        searchText: [r.id, r.platform, 'remote', t('library.kind.remote')].join(' ').toLowerCase(),
    };
}
function marketRow(m, t) {
    const meta = [];
    if (m.author !== undefined && m.author !== '')
        meta.push(m.author);
    if (m.version !== undefined && m.version !== '')
        meta.push(`v${m.version}`);
    return {
        key: `market:${m.id}`,
        kind: 'market',
        title: { kind: 'text', value: m.name },
        meta,
        at: m.updatedAt ?? null,
        badges: [],
        // 市场条目只有**一个**动作：安装（= 打开「逛市场」流程并直接进入该条目的下载/审阅）。
        // 此前的「查看与对比」与它同入口（都是开市场流程），是重复项 —— 2026-10-04 按用户要求移除。
        // 「打开来源」需要宿主的外链能力，本步不引入。
        capabilities: ['install'],
        ref: { marketId: m.id },
        detail: [
            { label: t('library.detail.id'), value: m.id },
            ...(m.author === undefined || m.author === '' ? [] : [{ label: t('library.detail.author'), value: m.author }]),
            ...(m.version === undefined || m.version === '' ? [] : [{ label: t('library.detail.version'), value: `v${m.version}` }]),
            ...(m.updatedAt === undefined ? [] : [{ label: t('library.detail.updated'), value: '', iso: m.updatedAt }]),
        ],
        searchText: [m.id, m.name, m.author ?? '', 'market', t('library.kind.market')].join(' ').toLowerCase(),
    };
}
/* ------------------------------------------------------------ 落地文件名 */
/**
 * 远端快照的**落地文件名**（「下载」与「拉取即导入」共用）。
 *
 * 为什么需要它：宿主把远端快照落地成 ZIP 时用的是 `snapshotToZip` 的临时名 `snapshot.zip`，
 * 直接落进浏览器「下载」目录会得到一堆同名文件（第二份就变成 `snapshot (1).zip`），
 * 事后也认不出是哪一份快照。这里按创建时间生成 `dsh-config-remote-<YYYYMMDD-HHmmss>.zip`。
 *
 * 两条边界：时间不是 ISO 形态 → 回退到**清洗后的**快照 id；两者都拿不到才用 `snapshot`。
 * 清洗只留 `[A-Za-z0-9._-]` —— 这个名字会进宿主 `path.join(dir, name)`，绝不能带路径分隔符。
 */
export function remoteSnapshotFileName(createdAt, id) {
    const stamp = createdAt.slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
    const safeStamp = /^\d{8}-\d{6}$/.test(stamp) ? stamp : '';
    const safeId = id.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 48);
    const suffix = safeStamp !== '' ? safeStamp : safeId !== '' ? safeId : 'snapshot';
    return `dsh-config-remote-${suffix}.zip`;
}
/* ------------------------------------------------------------------ 排序 */
/** 名称排序键：文本标识直接用；时间标识退化成 ISO（快照/远端快照的「名字」本就是时间） */
export function artifactSortKey(row) {
    return row.title.kind === 'text' ? row.title.value : row.at ?? '';
}
function compareRows(a, b, sort) {
    if (sort === 'name') {
        const byName = artifactSortKey(a).localeCompare(artifactSortKey(b), 'en');
        // 同名时退化为 key，保证排序**稳定且确定**（否则每次渲染顺序可能抖动）
        return byName !== 0 ? byName : a.key.localeCompare(b.key);
    }
    // 时间倒序；**缺时间的排最后**（当作「未知」，绝不当「最早」）
    if (a.at === null && b.at === null)
        return a.key.localeCompare(b.key);
    if (a.at === null)
        return 1;
    if (b.at === null)
        return -1;
    if (a.at !== b.at)
        return a.at < b.at ? 1 : -1;
    return a.key.localeCompare(b.key);
}
function sortRows(rows, sort) {
    return [...rows].sort((a, b) => compareRows(a, b, sort));
}
/* ------------------------------------------------------------------ 筛选 */
/** 来源 + 搜索词 + 排序。空查询 = 原序（恒为时间倒序，或用户选的名称序）。 */
export function filterArtifacts(rows, q) {
    const kind = q.kind ?? null;
    const tokens = (q.text ?? '').trim().toLowerCase().split(/\s+/).filter((token) => token !== '');
    const hits = rows.filter((row) => {
        if (kind !== null && row.kind !== kind)
            return false;
        return tokens.every((token) => row.searchText.includes(token));
    });
    return sortRows(hits, q.sort ?? 'time');
}
/** 各来源条数（筛选条上的计数；**用未筛选的行**算，否则选中一个来源后其余计数会变 0） */
export function countByKind(rows) {
    const counts = { 'snapshot': 0, 'backup-file': 0, 'remote-snapshot': 0, 'market': 0 };
    for (const row of rows)
        counts[row.kind] += 1;
    return counts;
}
export function librarySummary(rows) {
    let encrypted = 0;
    let unknownSize = 0;
    let known = 0;
    for (const row of rows) {
        if (row.badges.includes('encrypted'))
            encrypted += 1;
        if (row.sizeBytes === undefined)
            unknownSize += 1;
        else
            known += row.sizeBytes;
    }
    return {
        count: rows.length,
        counts: countByKind(rows),
        encrypted,
        unknownSize,
        // 只要有一条没体积，合计就是「未知」而不是一个偏小的数字（§6.8 ①）
        bytes: unknownSize === 0 ? known : null,
    };
}
//# sourceMappingURL=artifact-view.js.map