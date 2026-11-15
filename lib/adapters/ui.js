import { zhMsg } from '../core/messages.js';
import { engineMsg } from './messages.js';
import { collectNamespaceRecords, planNamespaceItems, applyNamespaceItem, resolveNamespaces } from './settings.js';
import { sectionMeta } from '../schema/section-registry.js';
import { validateJsonSection } from './json-section.js';
import { pickRecord, recordUnits } from './units.js';
/** UI 类 namespace 前缀名单（设计 §4.1；随新插件扩展，只影响「某一 namespace 归哪一边」，不影响数据完整性） */
export const KNOWN_UI_NAMESPACE_PREFIXES = [
    'pet',
    'dsh-better-sidebar',
    'remote-web-ui',
    'ui-onboarding',
    'dsh-client-ui',
    'skin',
    'theme',
    'layout',
    'sidebar',
    'appearance',
];
/** namespace 名是否属于 UI 类（大小写不敏感前缀匹配） */
export function isUiNamespace(name) {
    const lower = name.toLowerCase();
    return KNOWN_UI_NAMESPACE_PREFIXES.some((p) => lower.startsWith(p.toLowerCase()));
}
/**
 * localStorage 等 Host 无通道的 UI 状态说明（纯说明，不含值；研究报告 §2.2/§4.4）。
 *
 * t6（英文界面零中文）：说明行的 `reason` 是用户可见文案 ⇒ 表里只放**目录键**，取文案在导出期现取
 * （`uiMigrationNotes(msg)`）—— 这样导出的说明行跟随界面语言，而不是冻结在装配期语言。
 * （表本身是数据；中文只存在于 adapters 域的追加目录 `src/adapters/messages.ts`。）
 */
const UI_MIGRATION_NOTE_ROWS = [
    { plugin: 'dsh-task-board', storage: 'localStorage', key: 'dsh.taskBoard.v1', migratable: false, reasonKey: 'adapter.uiLocalStorageTaskBoard' },
    { plugin: 'dsh-aionui-panel', storage: 'localStorage', key: 'aionui-panel.*', migratable: false, reasonKey: 'adapter.uiLocalStoragePanel' },
    { plugin: 'dsh-client-ui-*', storage: 'localStorage', key: '*', migratable: false, reasonKey: 'adapter.uiLocalStorageGeneric' },
];
/** UI 迁移说明行（取文案在调用期现取；缺省 = 当前引擎语言的 engineMsg）。 */
export function uiMigrationNotes(msg = engineMsg) {
    return UI_MIGRATION_NOTE_ROWS.map((row) => ({
        plugin: row.plugin,
        storage: row.storage,
        key: row.key,
        migratable: row.migratable,
        reason: msg(row.reasonKey),
    }));
}
export class UiAdapter {
    id = 'ui';
    // 元数据唯一来源 = 注册表（t31）：不再与 ui/export-flow.ts 的导出目录各写一份
    displayName = sectionMeta('ui').displayName;
    defaultIncluded = sectionMeta('ui').defaultIncluded;
    portability = sectionMeta('ui').portability;
    namespaces;
    constructor(namespaces = []) {
        this.namespaces = namespaces;
    }
    async export(ctx, options) {
        const warnings = [];
        const all = await resolveNamespaces(this.namespaces, ctx);
        const uiNames = all.filter((n) => isUiNamespace(n));
        const collected = await collectNamespaceRecords(ctx, uiNames, warnings);
        // 条目级白名单：未勾选的 namespace 整条不带走；迁移说明（纯说明、不含值）与选择无关，始终保留
        const namespaces = pickRecord(collected, options.includeItems?.[this.id], (ns) => this.unitId(ns));
        const notes = uiMigrationNotes(ctx.msg);
        return {
            sectionId: 'ui',
            data: { version: 1, namespaces, uiMigrationNotes: notes },
            counts: { namespaces: Object.keys(namespaces).length, notes: notes.length },
            warnings,
        };
    }
    /** 单元 id：`ui:<namespace>` */
    unitId(namespace) {
        return this.id + ':' + namespace;
    }
    /** 条目级单元清单（零 I/O）：一个 UI namespace = 一个单元 */
    listUnits(section) {
        return recordUnits(this.id, section.data.namespaces ?? {});
    }
    async analyzeImport(data, ctx) {
        return planNamespaceItems(data.namespaces, 'ui', ctx);
    }
    async applyItem(item, ctx) {
        return applyNamespaceItem(item, 'ui', ctx);
    }
    async validate(data, msg = zhMsg) {
        return validateJsonSection('ui', data, msg, (section, issues) => {
            if (section.namespaces === null || typeof section.namespaces !== 'object') {
                issues.push({ path: 'namespaces', message: msg('adapter.validate.missingObject', { subject: 'namespaces' }), severity: 'error' });
            }
            if (section.uiMigrationNotes !== undefined && !Array.isArray(section.uiMigrationNotes)) {
                issues.push({ path: 'uiMigrationNotes', message: msg('adapter.validate.array', { subject: 'uiMigrationNotes' }), severity: 'error' });
            }
        });
    }
}
//# sourceMappingURL=ui.js.map