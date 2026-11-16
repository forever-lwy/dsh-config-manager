// 「文件类分区」的判定只取注册表这一份权威（t29）——不得在这里另抄一份分区清单
// （section-registry 是零依赖模块，client bundle 侧的 ui/export-flow.ts 已在用）。
import { isFileSection, isSectionId } from '../schema/section-registry.js';
/* ------------------------------------------------------------------ 码 → 字典键 */
/**
 * 未迁移机器码 → 字典键（**全量**，不是 Partial）。
 *
 * 为什么用 `Record<ForeignSkipCode, UiTextKey>` 而不是 `Record<string, UiTextKey>`：
 * src/foreign/types.ts 的 ForeignSkipCode 是**冻结 union**，用全量 Record 让「新增码但忘了
 * 配文案」变成**编译期错误**。t16 已把冻结码的 zh/en 文案都写进两本字典（档 B 新增两条
 * 同步补上），这里只是索引。
 */
export const FOREIGN_SKIP_KEY = {
    'unsupported-hooks': 'foreign.skip.unsupported-hooks',
    'unsupported-commands': 'foreign.skip.unsupported-commands',
    'credentials-not-migrated': 'foreign.skip.credentials-not-migrated',
    'skill-missing-file': 'foreign.skip.skill-missing-file',
    'skill-invalid-frontmatter': 'foreign.skip.skill-invalid-frontmatter',
    'skill-invalid-name': 'foreign.skip.skill-invalid-name',
    'mcp-server-empty': 'foreign.skip.mcp-server-empty',
    'mcp-type-sse-coerced': 'foreign.skip.mcp-type-sse-coerced',
    'mcp-credential-redacted': 'foreign.skip.mcp-credential-redacted',
    'source-unreadable': 'foreign.skip.source-unreadable',
    'session-format-version-unknown': 'foreign.skip.session-format-version-unknown',
    'session-format-unsupported': 'foreign.skip.session-format-unsupported',
    'session-missing-cwd': 'foreign.skip.session-missing-cwd',
    'session-unsafe-id': 'foreign.skip.session-unsafe-id',
    'session-empty': 'foreign.skip.session-empty',
    'session-unparsable': 'foreign.skip.session-unparsable',
    'unsupported-session-record': 'foreign.skip.unsupported-session-record',
    'session-id-conflict': 'foreign.skip.session-id-conflict',
    'skill-id-conflict': 'foreign.skip.skill-id-conflict',
    'sessions-not-migrated': 'foreign.skip.sessions-not-migrated',
    'memory-report-only': 'foreign.skip.memory-report-only',
    'skill-category-flattened': 'foreign.skip.skill-category-flattened',
    'legacy-rules-file': 'foreign.skip.legacy-rules-file',
    'instructions-merged': 'foreign.skip.instructions-merged',
    'instructions-override-selected': 'foreign.skip.instructions-override-selected',
    'source-empty-file': 'foreign.skip.source-empty-file',
    'source-location-overridden': 'foreign.skip.source-location-overridden',
    // 档 B（t6）新增两条：把「推导出的 cwd」与「没有自动根」也变成可见事实，绝不静默
    'session-cwd-derived': 'foreign.skip.session-cwd-derived',
    'source-needs-explicit-path': 'foreign.skip.source-needs-explicit-path',
    // 2026-10-18（8 个新冻结码）：Claude Code 项目级 / 插件 / 权限 / 设置键诊断 + 会话 id 不一致 +
    // MCP 同名 + 项目扫描触顶 —— 仍用全量 Record 兜住：新增码而没配文案 = 编译失败。
    'unsupported-permissions': 'foreign.skip.unsupported-permissions',
    'unsupported-settings-keys': 'foreign.skip.unsupported-settings-keys',
    'unsupported-agents': 'foreign.skip.unsupported-agents',
    'unsupported-rules': 'foreign.skip.unsupported-rules',
    'unsupported-plugins': 'foreign.skip.unsupported-plugins',
    'session-id-mismatch': 'foreign.skip.session-id-mismatch',
    'mcp-server-id-conflict': 'foreign.skip.mcp-server-id-conflict',
    'project-scan-truncated': 'foreign.skip.project-scan-truncated',
    // 2026-11-12（#134）：Trae 2.3.x 加密会话库的四条可判定失败 —— 同样是全量 Record 保底
    'trae-db-key-invalid': 'foreign.skip.trae-db-key-invalid',
    'trae-db-too-large': 'foreign.skip.trae-db-too-large',
    'trae-db-decrypt-failed': 'foreign.skip.trae-db-decrypt-failed',
    'trae-db-schema-mismatch': 'foreign.skip.trae-db-schema-mismatch',
};
/**
 * 机器码 → 字典键。**未知码（未来版本 / 第三方宿主）回退键名本身**，
 * 界面仍显示原始码 —— 这比编一个解释诚实（用户可据此搜索/上报）。
 *
 * 注意：本函数返回**键**而不是文案，翻译由调用方注入的 `t` 完成 ——
 * 视图模型不持有字典，测试才能逐键断言。
 */
export function foreignSkipKey(code) {
    return 'foreign.skip.' + code;
}
/**
 * 来源 id → 显示名字典键。**全量覆盖 `ForeignSourceId` union**（配置类 6 + 会话类 24；
 * `registry.ts` 的 `FOREIGN_SOURCE_IDS` 当前只列配置类，词表收敛见 `source-modules.ts`）——
 * 全量 Record 让「新增来源但忘了配文案」变成编译期错误；不在词表内 → null（调用方走
 * 「未识别的来源」，绝不硬套某个来源的名字）。
 */
const SOURCE_LABEL_KEY = {
    'claude-code': 'foreign.source.claude-code',
    hermes: 'foreign.source.hermes',
    cursor: 'foreign.source.cursor',
    codex: 'foreign.source.codex',
    copilot: 'foreign.source.copilot',
    antigravity: 'foreign.source.antigravity',
    // 会话类（档 B 一次补齐 dsh-chat-import 的 FORMATS 清单；顺序 = types.ts 的 ForeignSourceId union）
    gemini: 'foreign.source.gemini',
    reasonix: 'foreign.source.reasonix',
    opencode: 'foreign.source.opencode',
    mimocode: 'foreign.source.mimocode',
    zcode: 'foreign.source.zcode',
    grokbuild: 'foreign.source.grokbuild',
    openclaw: 'foreign.source.openclaw',
    pi: 'foreign.source.pi',
    kimi: 'foreign.source.kimi',
    kilocode: 'foreign.source.kilocode',
    qoder: 'foreign.source.qoder',
    chatgpt: 'foreign.source.chatgpt',
    workbuddy: 'foreign.source.workbuddy',
    qwen: 'foreign.source.qwen',
    continue: 'foreign.source.continue',
    cline: 'foreign.source.cline',
    goose: 'foreign.source.goose',
    dsh4: 'foreign.source.dsh4',
    zed: 'foreign.source.zed',
    crush: 'foreign.source.crush',
    teleagent: 'foreign.source.teleagent',
    trae: 'foreign.source.trae',
    vibe: 'foreign.source.vibe',
    dsh: 'foreign.source.dsh',
};
/** 来源 id 是否在本插件的冻结词表内。 */
export function isKnownForeignSource(id) {
    return Object.prototype.hasOwnProperty.call(SOURCE_LABEL_KEY, id);
}
/* ------------------------------------------------------------------ 行构造 */
/** 单条 skip → 可渲染行（码 + 已翻译说明 + 来源/条数） */
export function foreignSkipLine(skip, t) {
    const key = foreignSkipKey(skip.code);
    const line = {
        code: skip.code,
        // 已知码走冻结映射（类型层保证键存在）；未知码回退 'foreign.skip.<code>'，
        // UiT 对未注册键**原样返回键名**（见 src/ui/i18n.ts 的 makeUiT），因此界面
        // 不会显示 undefined，而是显示一个可搜索的稳定标识。
        key: (isKnownSkipCode(skip.code) ? FOREIGN_SKIP_KEY[skip.code] : key),
        text: t((isKnownSkipCode(skip.code) ? FOREIGN_SKIP_KEY[skip.code] : key)),
    };
    if (skip.origin !== undefined && skip.origin !== '')
        line.origin = skip.origin;
    if (skip.count !== undefined && skip.count > 0)
        line.count = skip.count;
    return line;
}
/** 码是否在冻结词表内（运行期判定；类型层用 FOREIGN_SKIP_KEY 全量 Record 兜住新增） */
function isKnownSkipCode(code) {
    return Object.prototype.hasOwnProperty.call(FOREIGN_SKIP_KEY, code);
}
/**
 * 检测结果 → 一行来源。
 *
 * 徽章语义三分（**未检测到不是错误**，这条最容易被写成红色）：
 *  · found=false            → info（正常状态：没装这个工具）
 *  · found=true  且 有 skip → warn（能导，但有东西没搬过来，用户需要知道）
 *  · found=true  且 无 skip → ok
 *
 * `empty` = found 但**一条路径都没命中**（宿主理论上不会这么回，但第三方实现可能）——
 * 界面据此禁用「导入」，避免用户点进一个必然空手的流程。
 */
export function foreignSourceRow(source, t) {
    // 直接对 id 做类型守卫（不先存 boolean 变量）：`const known = isKnown(…) ` 之后
    // tsc 不会跨该布尔变量窄化 source.id，索引 Record<ForeignSourceId, …> 会报 TS7053。
    const knownId = isKnownForeignSource(source.id) ? source.id : null;
    const known = knownId !== null;
    const label = knownId !== null
        ? t(SOURCE_LABEL_KEY[knownId])
        : t('foreign.source.unknownWithId', { id: source.id });
    const skips = (source.skipped ?? []).map((s) => foreignSkipLine(s, t));
    const paths = [...source.paths];
    const badge = !source.found ? 'info' : skips.length > 0 ? 'warn' : 'ok';
    return {
        id: source.id,
        label,
        found: source.found,
        known,
        badge,
        statusText: source.found ? t('foreign.found.yes') : t('foreign.found.no'),
        paths,
        skips,
        // 未检测到时 empty 恒 false：真正的空是「装了但读不到任何东西」，与「没装」是两回事
        empty: source.found && paths.length === 0,
    };
}
/** 命中位置的一行文本（无命中时给明确的「没有命中」而不是空白）。 */
export function foreignPathsText(row, t) {
    if (row.paths.length === 0)
        return t('foreign.pathsNone');
    return t('foreign.paths', { paths: row.paths.join(' · ') });
}
/* ------------------------------------------------------------------ 展示顺序 */
/**
 * 显示名排序器：大小写不敏感（`base`）、数字按数值（`Foo 2` 在 `Foo 10` 之前）。
 * 词典序按**运行环境的默认语言**解析 —— 用户看到的就是他母语的字母/拼音序；
 * 同名的两条保持宿主回传的相对顺序（`Array#sort` 稳定）。
 */
const ROW_LABEL_COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
/**
 * 两条来源行的展示顺序（**界面唯一权威**，两处判据只有这一份）：
 *  ① **命中的在前**（`found` 降序）—— 装了却没排在最上面，用户得先读完一屏「未检测到」；
 *  ② 同组内按**显示名**升序。
 *
 * 为什么按显示名而不是 id：列表上用户读到的是 label（`Google Antigravity`），
 * 按 id 排会把它顶到 A 开头，与眼睛看到的字母序不符（`copilot` → 「GitHub Copilot CLI」同理）。
 * 这条规则对「全未命中」自然退化为**纯名称序**，也就是用户要的「默认按名称排序」。
 */
function compareForeignSourceRows(a, b) {
    if (a.found !== b.found)
        return a.found ? -1 : 1;
    return ROW_LABEL_COLLATOR.compare(a.label, b.label);
}
/**
 * 响应 → 整表展示模型（组件只摆放）。
 *
 * `?projectDir=` 的项目级作用域如实透传（`projectScoped`）—— 界面把它显示出来，
 * 否则用户会以为「本机没装 Cursor」而实际上是「项目级配置没被扫」。
 *
 * 行顺序由 compareForeignSourceRows 决定（命中优先 + 显示名升序），**只排新数组**：
 * 宿主回传的 `response.sources` 一个元素都不动。
 */
export function foreignSourcesViewModel(response, t) {
    if (response === null)
        return null;
    const rows = response.sources.map((s) => foreignSourceRow(s, t)).sort(compareForeignSourceRows);
    return {
        rows,
        anyFound: rows.some((r) => r.found),
        conflictPolicy: response.conflictPolicy !== undefined && response.conflictPolicy !== ''
            ? response.conflictPolicy
            : null,
    };
}
const LOSSY_TITLE_KEY = {
    'file-section-secrets': 'foreign.lossy.file-section-secrets.title',
    'entry-backslash': 'foreign.lossy.entry-backslash.title',
    'prompt-persona-reshape': 'foreign.lossy.prompt-persona-reshape.title',
};
const LOSSY_DETAIL_KEY = {
    'file-section-secrets': 'foreign.lossy.file-section-secrets.detail',
    'entry-backslash': 'foreign.lossy.entry-backslash.detail',
    'prompt-persona-reshape': 'foreign.lossy.prompt-persona-reshape.detail',
};
const LOSSY_SEVERITY = {
    'file-section-secrets': 'warn',
    'entry-backslash': 'warn',
    'prompt-persona-reshape': 'info',
};
/** 渲染顺序（固定，不随调用方漂移） */
export const FOREIGN_LOSSY_KINDS = [
    'file-section-secrets',
    'entry-backslash',
    'prompt-persona-reshape',
];
/**
 * 三类有损 → 可渲染行（组件只摆放）。
 *
 * `sections` = 刚产出的包内分区（`ForeignImportResponse.sections`），尚未产包时传 `null`：
 *  · **文件类分区**（`isFileSection`，注册表是唯一权威）→ 内容不做秘密剥离（G-09 边界）；
 *  · **条目名中段反斜杠**（G-11）→ 浏览器只看得到分区与计数、看不到条目名，因此只要产了包
 *    就**如实提示**（宁可多说一句，也不谎称「本包不涉及」）；
 *  · **`prompts` 分区** → `systemPrompt` 由字符串写成 `{ persona }` 对象（bundle-format §7.3）。
 */
export function foreignLossyRows(sections, t) {
    const hasFileSection = sections !== null && sections.some((id) => isSectionId(id) && isFileSection(id));
    const hasPrompts = sections !== null && sections.indexOf('prompts') >= 0;
    const applicable = {
        'file-section-secrets': sections === null ? null : hasFileSection,
        'entry-backslash': sections === null ? null : true,
        'prompt-persona-reshape': sections === null ? null : hasPrompts,
    };
    return FOREIGN_LOSSY_KINDS.map((kind) => ({
        kind,
        severity: LOSSY_SEVERITY[kind],
        title: t(LOSSY_TITLE_KEY[kind]),
        detail: t(LOSSY_DETAIL_KEY[kind]),
        applicable: applicable[kind],
    }));
}
/**
 * 非 skip 词表、但同样会作为 400 码出现的导入失败（与 `src/routes/foreign.ts` 同源）：
 * `nothing-to-import` 是路由层的码，不在 `ForeignSkipCode` union 里，故单独映射。
 */
const IMPORT_FAILURE_KEYS = {
    'nothing-to-import': 'foreign.importNothing',
};
/** 失败载荷的构造（未知码 → 原样返回 message，绝不猜语义） */
export function foreignImportFailure(err, t) {
    const source = typeof err === 'object' && err !== null ? err : null;
    const rawCode = source?.code;
    const code = typeof rawCode === 'string' && rawCode !== '' ? rawCode : null;
    const rawMessage = source?.message;
    const message = typeof rawMessage === 'string' && rawMessage !== '' ? rawMessage : String(err);
    if (code === null)
        return { code, message, text: message };
    const mapped = IMPORT_FAILURE_KEYS[code] ?? (isKnownSkipCode(code) ? FOREIGN_SKIP_KEY[code] : undefined);
    return { code, message, text: mapped === undefined ? message : t(mapped) };
}
/* ------------------------------------------------ 产包跳过 & Agent Prompt */
/** 产包阶段的跳过项（POST /foreign-import 的 skipped）→ 可渲染行。 */
export function foreignProducedSkips(skipped, t) {
    if (!skipped || skipped.length === 0)
        return [];
    return skipped.map((s) => foreignSkipLine(s, t));
}
/**
 * 把「检测路径 + 未自动迁移项 + 可选失败原因」组织成可直接贴进对话的 Agent 转换 Prompt。
 * 既没有 skip 也没有 failure 时返回空串，避免渲染出一个空提示词复制动作。
 */
export function foreignAgentPrompt(input, t) {
    if (input.skips.length === 0 && (input.failure === undefined || input.failure === null))
        return '';
    const lines = [t('foreign.prompt.header', { source: input.label })];
    if (input.paths.length > 0) {
        lines.push(t('foreign.prompt.paths', { paths: input.paths.join(', ') }));
    }
    if (input.failure !== undefined && input.failure !== null) {
        const reason = input.failure.code !== null
            ? `${input.failure.code}: ${input.failure.text}`
            : input.failure.text;
        lines.push(t('foreign.prompt.failure', { reason }));
    }
    if (input.skips.length > 0) {
        lines.push(t('foreign.prompt.skips'));
        for (const s of input.skips) {
            const origin = s.origin !== undefined && s.origin !== '' ? ` (${s.origin})` : '';
            const count = s.count !== undefined && s.count > 1 ? ` ×${String(s.count)}` : '';
            lines.push(`- [${s.code}]${origin}${count} ${s.text}`);
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=foreign-view.js.map