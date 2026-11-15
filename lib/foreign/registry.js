/**
 * 外部 agent 来源注册表 —— **契约冻结**（t12，2026-10-04）。
 *
 * 这一层只做三件事：
 *  ① 冻结来源 id 的运行期词表（FOREIGN_SOURCE_IDS）与来源接口（ForeignSource）；
 *  ② 提供注册 / 按 id 查找 / **稳定错误**（未知 id、重复 id、形状非法）；
 *  ③ 冻结外部来源单元 id 的命名空间（foreign:<source>:<section>:<unit>）与 DSH 既有单元 id
 *     命名空间的正交判定（sessions:<projectKey>/<目录名> 等既有 id **一字不改**）。
 *
 * 刻意不做的事（**类本身零副作用**；注册动作只发生在显式工厂里）：
 *  - `ForeignSourceRegistry` 类**不注册任何具体来源**：单测只装一个假来源即可。
 *    全部 30 个来源（6 配置类 + 24 会话类）的装配集中在文件末尾的 `builtinForeignSources()` / `createBuiltinForeignSourceRegistry()`
 *    （t22 收口）：GUI 的来源发现路由、CLI 的 `dcm import --from <来源>` 共用同一份定义，
 *    来源清单与 `FOREIGN_SOURCE_IDS` 由测试钉住一致（两处各自维护必然漂移）。
 *  - **不产生用户可见字符串**：错误只给稳定机器码 + 可用来源清单，文案由 UI/CLI 字典映射。
 *  - **不认识就报错**：未知来源 id 一律抛 ForeignSourceError，绝不回退到任一默认来源
 *    （回退会让用户以为导的是 A、实际导的是 B）。
 *
 * 契约正文（六来源路径真值表 / 冲突语义 / 单元 id 向后兼容）见
 * docs/archive/2026-10-04-foreign-import-v1.md §8。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { isSectionId } from '../schema/config.js';
import { convertClaudeCode } from './claude-code.js';
import { convertAntigravity } from './antigravity.js';
import { convertCodex } from './codex.js';
import { convertCopilot } from './copilot.js';
import { convertCursor } from './cursor.js';
import { convertHermes } from './hermes.js';
import { readAntigravity, resolveGeminiHome } from './read-antigravity.js';
import { readClaudeCode } from './read-claude-code.js';
import { readCodex, resolveCodexHome } from './read-codex.js';
import { readCopilot, resolveCopilotHome } from './read-copilot.js';
import { readCursor } from './read-cursor.js';
import { readHermes, resolveHermesHome } from './read-hermes.js';
import { normalizePlatform, roamingAppDataDir, xdgDataHome } from './platform-paths.js';
import { engineMsg } from './messages.js';
import { FOREIGN_TRUTH_TABLES } from './truth-table.js';
/* ---- 档 B 24 个会话类来源的装配点（每一条自带 wiring，经 sessionSourceOf 收口）---- */
import { createChatgptSource } from './chatgpt.js';
import { createClineSource } from './cline.js';
import { createContinueSource } from './continue.js';
import { createCrushSource } from './crush.js';
import { createDsh4Source } from './dsh4.js';
import { createDshSource } from './dsh.js';
import { createGeminiSource } from './gemini.js';
import { createGooseSource } from './goose.js';
import { createGrokbuildSource } from './grokbuild.js';
import { createKilocodeSource } from './kilocode.js';
import { createKimiSource } from './kimi.js';
import { createMimocodeSource } from './mimocode.js';
import { createOpenclawSource } from './openclaw.js';
import { createOpencodeSource } from './opencode.js';
import { createPiSource } from './pi.js';
import { createQoderSource } from './qoder.js';
import { createQwenSource } from './qwen.js';
import { createReasonixSource } from './reasonix.js';
import { createTeleagentSource } from './teleagent.js';
import { createTraeSource } from './trae.js';
import { createVibeSource } from './vibe.js';
import { createWorkbuddySource } from './workbuddy.js';
import { createZcodeSource } from './zcode.js';
import { createZedSource } from './zed.js';
/* ---------------- 来源 id 词表 ---------------- */
/**
 * 30 个来源 id（顺序 = §8.2 真值表顺序 = source-modules.ts 的形状表，稳定不变；UI 列表顺序取注册顺序而非此表）。
 *
 * **必须与 `FOREIGN_SOURCE_MODULE_SHAPES` 逐项同序**（file-budget / source-registry 双向断言）——
 * 漏扩这里会让 file-budget 的 C 档把来源模块误报成「未登记共享模块」。
 */
export const FOREIGN_SOURCE_IDS = [
    'claude-code', 'hermes', 'cursor', 'codex', 'copilot', 'antigravity',
    'gemini', 'reasonix', 'opencode', 'mimocode', 'zcode', 'grokbuild', 'openclaw', 'pi',
    'kimi', 'kilocode', 'qoder', 'chatgpt', 'workbuddy', 'qwen', 'continue', 'cline',
    'goose', 'dsh4', 'zed', 'crush', 'teleagent', 'trae', 'vibe', 'dsh',
];
export function isForeignSourceId(v) {
    return FOREIGN_SOURCE_IDS.includes(v);
}
export class ForeignSourceError extends Error {
    code;
    /** 相关来源 id（unknown 时 = 用户给的那个字符串） */
    sourceId;
    /** 当前已注册 id 清单（按注册顺序）；CLI/宿主据此给出「可用来源」提示 */
    available;
    constructor(code, sourceId, available) {
        super(describeForeignSourceError(code, sourceId, available));
        this.name = 'ForeignSourceError';
        this.code = code;
        this.sourceId = sourceId;
        this.available = [...available];
    }
}
/** 稳定文案：机器码在前、人可读补充在后（调用方只应消费 code，不应解析 message） */
function describeForeignSourceError(code, sourceId, available) {
    const list = available.length > 0 ? available.join(', ') : engineMsg('foreign.availableSourcesEmpty');
    if (code === 'duplicate-source')
        return engineMsg('foreign.duplicateSourceId', { id: sourceId, available: list });
    if (code === 'unknown-source')
        return engineMsg('foreign.unknownSourceId', { id: sourceId, available: list });
    return engineMsg('foreign.invalidSourceDefinition', { id: sourceId, available: list });
}
/* ---------------- 注册表 ---------------- */
export class ForeignSourceRegistry {
    sources = new Map();
    constructor(initial = []) {
        for (const s of initial)
            this.register(s);
    }
    register(source) {
        const ids = this.ids();
        assertValidSource(source, ids);
        const id = source.id;
        if (this.sources.has(id))
            throw new ForeignSourceError('duplicate-source', id, ids);
        this.sources.set(id, source);
        return this;
    }
    has(id) {
        return this.sources.has(id);
    }
    /** 按 id 查找；未知 id 抛稳定错误（绝不返回 undefined，也绝不回退到默认来源） */
    get(id) {
        const found = this.sources.get(id);
        if (found === undefined)
            throw new ForeignSourceError('unknown-source', id, this.ids());
        return found;
    }
    /** 注册顺序（= UI 列表顺序，稳定；与 FOREIGN_SOURCE_IDS 的顺序无关） */
    list() {
        return [...this.sources.values()];
    }
    ids() {
        return [...this.sources.keys()];
    }
    get size() {
        return this.sources.size;
    }
}
export function createForeignSourceRegistry(initial = []) {
    return new ForeignSourceRegistry(initial);
}
function assertValidSource(source, available) {
    const raw = source;
    const id = typeof raw.id === 'string' ? raw.id : '';
    if (!isForeignSourceId(id)) {
        throw new ForeignSourceError('invalid-source', id === '' ? engineMsg('foreign.sourceIdMissing') : id, available);
    }
    if (typeof raw.labelKey !== 'string' || raw.labelKey === '') {
        throw new ForeignSourceError('invalid-source', id, available);
    }
    if (typeof raw.detect !== 'function' || typeof raw.build !== 'function') {
        throw new ForeignSourceError('invalid-source', id, available);
    }
}
/* ---------------- 单元 id 命名空间（契约冻结，§8.3） ---------------- */
/** 外部来源单元 id 的固定首段。**刻意不是** SectionId 的任一取值，见 dshUnitIdNamespaceOf */
export const FOREIGN_UNIT_ID_PREFIX = 'foreign';
/** DSH 既有单元 id 的**非分区**命名空间（src/adapters/units.ts 的 plugin:/patch:/workspace:） */
export const DSH_UNIT_ID_NAMESPACES = ['plugin', 'patch', 'workspace'];
/**
 * 外部来源单元的**来源限定** id：`foreign:<source>:<section>:<unit>`。
 *
 * 用途只有一个：**选择 / 诊断 / 报告**（GUI 与 CLI 需要说清「这条来自哪个来源」）。
 * 它**绝不进入 bundle 相对路径**，也**绝不替换** DSH 既有单元 id —— 目标机适配器仍然
 * 按 `<section>:<unit>` 计算（sessions 单元 = `sessions:<projectKey>/<目录名>`）。
 */
export function foreignUnitId(source, section, unit) {
    return FOREIGN_UNIT_ID_PREFIX + ':' + source + ':' + section + ':' + unit;
}
/**
 * 解析外来源单元 id；**不是**外来源形态一律返回 null（不认识就说不认识，绝不猜）。
 * 未知 source / 未知 section 也返回 null —— 向后兼容靠「additive：旧值不变」，不靠宽松解析。
 */
export function parseForeignUnitId(id) {
    if (!id.startsWith(FOREIGN_UNIT_ID_PREFIX + ':'))
        return null;
    const seg = id.split(':');
    const source = seg[1];
    const section = seg[2];
    if (source === undefined || section === undefined)
        return null;
    if (!isForeignSourceId(source))
        return null;
    if (!isSectionId(section))
        return null;
    const unit = seg.slice(3).join(':');
    if (unit === '')
        return null;
    return { source, section, unit };
}
export function isForeignUnitId(id) {
    return parseForeignUnitId(id) !== null;
}
/**
 * DSH 既有单元 id 的命名空间：分区 id（17 个 SectionId）或 plugin/patch/workspace；
 * 外来源形态（首段 = foreign）与无法识别的前缀一律 **null**。
 *
 * 两个方向都不误判是这条契约的核心（§8.3）：`foreign` 不在 SectionId 词表里、也不等于
 * plugin/patch/workspace，因此两个命名空间按构造互斥，且既有 id 的形态一字未动。
 */
export function dshUnitIdNamespaceOf(id) {
    const i = id.indexOf(':');
    if (i <= 0)
        return null;
    const head = id.slice(0, i);
    if (head === FOREIGN_UNIT_ID_PREFIX)
        return null;
    if (isSectionId(head))
        return head;
    if (DSH_UNIT_ID_NAMESPACES.includes(head))
        return head;
    return null;
}
/* ---------------- 冲突语义（契约冻结，§8.4） ---------------- */
/**
 * 同 id 会话冲突的机器码：**后者不覆盖、跳过并报码**（用户决策）。
 * 类型标注为 ForeignSkipCode —— 该码被从 types.ts 的 union 里删掉时这里直接编译失败。
 */
export const FOREIGN_SESSION_CONFLICT_CODE = 'session-id-conflict';
/** 外部来源导入唯一的冲突策略；语义上不存在覆盖分支（见 types.ts 的 ForeignConflictPolicy） */
export const FOREIGN_CONFLICT_POLICY = 'skip-no-overwrite';
/**
 * 只 stat、绝不读内容：检测层不需要任何配置值，也就不该有机会泄露它。
 *
 * `labelPrefix` 让「探测根」与「回给用户的位置标签」解耦（如项目级作用域：磁盘路径是
 * `<项目>/.cursor/mcp.json`，而标签是相对用户 home 的 `project/.cursor/mcp.json`）。
 */
async function probeTree(root, specs, labelPrefix = '') {
    const paths = [];
    const skipped = [];
    for (const spec of specs) {
        let st;
        try {
            st = await fs.stat(path.join(root, spec.rel));
        }
        catch {
            continue; // 不存在是正常状态，不是错误
        }
        if (spec.dir === true) {
            if (!st.isDirectory())
                continue;
        }
        else if (!st.isFile() && !st.isDirectory()) {
            continue;
        }
        paths.push(labelPrefix + spec.rel);
        // 0 字节如实报（实测 Antigravity 的两个 mcp_config.json 就是 0 字节）；仍算「命中」
        if (st.isFile() && st.size === 0)
            skipped.push({ code: 'source-empty-file', origin: labelPrefix + spec.rel });
    }
    return { paths, skipped };
}
/* ---------------- 真值表派生（evidence / probePaths 的单一事实源） ---------------- */
/**
 * 按 id 取真值表条目。**找不到就装配期炸**（与 ForeignSourceError 同口径：宁可炸，
 * 也不让某个来源悄悄少一份取证声明）。
 */
function truthEntryOf(id) {
    const found = FOREIGN_TRUTH_TABLES.find((entry) => entry.id === id);
    if (found === undefined) {
        throw new Error(engineMsg('foreign.truthTableMissingSourceDetailed', { id }));
    }
    return found;
}
/** 该来源的取证强度（如实体现在真值表里；此处只取用，不再判断一次） */
function evidenceOf(id) {
    return truthEntryOf(id).evidence;
}
/**
 * 该来源的静态探测位置：真值表的令牌模板按 `opts` 的平台真值展开。
 *
 * 与 `truth-table.ts` 的 `expandTruthTemplate` 的区别：那个用**合成探测值**（护栏离线比对
 * 用），这个用宿主给的真值（homeDir / env / platform）。两者在 `TRUTH_PROBES` 那组合成
 * 输入上给出**逐字相同**的结果 —— 这正是真值表护栏能拿 probePaths 交叉核对的前提。
 * 未识别的令牌原样保留（护栏随即变红，绝不静默给出错路径）。
 */
function probePathsOf(id) {
    const entry = truthEntryOf(id);
    return (opts) => {
        const platform = normalizePlatform(opts.platform);
        const appdata = roamingAppDataDir(platform, opts.homeDir, opts.env);
        const xdgdata = xdgDataHome(platform, opts.homeDir, opts.env);
        return entry.defaults[platform].map((template) => template
            .split('<home>').join(opts.homeDir)
            .split('<appdata>').join(appdata)
            .split('<xdgdata>').join(xdgdata));
    };
}
/**
 * 30 个内置来源（顺序 = §8.2 真值表顺序 = `source-modules.ts` 的形状表；
 * 每调用一次返回一份新定义，注册表逐次装配）。前 6 个配置类内联定义，后 24 个会话类调各自工厂。
 */
export function builtinForeignSources() {
    return [
        /* ------------------------------------------------ Claude Code（~/.claude） */
        {
            id: 'claude-code',
            labelKey: 'foreign.source.claude-code',
            // 取证强度与静态探测位置一律取自真值表（`truth-table.ts`）——不在这里再抄一份路径清单
            evidence: evidenceOf('claude-code'),
            probePaths: probePathsOf('claude-code'),
            async detect(ctx) {
                const probed = await probeTree(ctx.homeDir, [
                    { rel: '.claude', dir: true },
                    { rel: '.claude.json' },
                    { rel: '.claude/settings.json' },
                    { rel: '.claude/CLAUDE.md' },
                    { rel: '.claude/skills', dir: true },
                    { rel: '.claude/commands', dir: true },
                    { rel: '.claude/projects', dir: true },
                    // 2026-10-18 补齐：插件目录 / 子代理定义 / 规则目录（本机实测存在 .claude/plugins 与 .claude/hooks）
                    { rel: '.claude/plugins', dir: true },
                    { rel: '.claude/agents', dir: true },
                    { rel: '.claude/rules', dir: true },
                ]);
                const paths = [...probed.paths];
                const skipped = [...probed.skipped];
                // CLAUDE_CONFIG_DIR 整体替换配置目录（文档取证：code.claude.com/docs/en/settings）。
                // **不改既有 home 相对标签**（那会动 UI 文案与既有断言），只在覆盖生效时**追加**一组
                // 带前缀的标签；真正的读取与 source-location-overridden 报码由读盘层负责。
                const override = ctx.env['CLAUDE_CONFIG_DIR'];
                if (override !== undefined && override.trim() !== '') {
                    const alt = await probeTree(override, [
                        { rel: 'settings.json' },
                        { rel: 'CLAUDE.md' },
                        { rel: 'skills', dir: true },
                    ], 'CLAUDE_CONFIG_DIR/');
                    paths.push(...alt.paths);
                    skipped.push(...alt.skipped);
                }
                return { found: paths.length > 0, paths, skipped };
            },
            async build(ctx) {
                const read = await readClaudeCode({
                    homeDir: ctx.homeDir,
                    env: ctx.env,
                    ...(ctx.limits !== undefined ? { limits: ctx.limits } : {}),
                });
                // 会话转码版本必须由宿主解析后传入（绝不猜）；缺省 = 一条都不转并整批报码
                if (ctx.targetSessionFormatVersion !== undefined) {
                    read.input.targetSessionFormatVersion = ctx.targetSessionFormatVersion;
                }
                const result = convertClaudeCode(read.input);
                // Claude 读盘层的发现是**独立返回**的（其余来源放在 input.readFindings 里）→ 在此并入
                return { ...result, skipped: [...read.skipped, ...result.skipped] };
            },
        },
        /* ------------------------------------------------ Hermes（%LOCALAPPDATA%\Hermes / ~/.hermes） */
        {
            id: 'hermes',
            labelKey: 'foreign.source.hermes',
            // 取证强度与静态探测位置一律取自真值表（`truth-table.ts`）——不在这里再抄一份路径清单
            evidence: evidenceOf('hermes'),
            probePaths: probePathsOf('hermes'),
            async detect(ctx) {
                const resolved = resolveHermesHome({ homeDir: ctx.homeDir, env: ctx.env });
                const skipped = [];
                if (resolved.overridden)
                    skipped.push({ code: 'source-location-overridden', origin: 'HERMES_HOME' });
                const probed = await probeTree(resolved.home, [
                    { rel: 'config.yaml' },
                    { rel: 'SOUL.md' },
                    { rel: 'skills', dir: true },
                    { rel: 'memories', dir: true },
                    { rel: '.env' },
                    { rel: 'state.db' },
                    // 会话回退布局（state.db 缺失时的 sessions/*.jsonl）：存在即算命中
                    { rel: 'sessions', dir: true },
                ]);
                return {
                    found: probed.paths.length > 0,
                    paths: probed.paths,
                    skipped: [...skipped, ...probed.skipped],
                };
            },
            async build(ctx) {
                const read = await readHermes({ homeDir: ctx.homeDir, env: ctx.env, ...(ctx.limits !== undefined ? { limits: ctx.limits } : {}) });
                // 会话转码版本必须由宿主解析后传入（绝不猜）；缺省 = 一条都不转并整批报码
                if (ctx.targetSessionFormatVersion !== undefined) {
                    read.input.targetSessionFormatVersion = ctx.targetSessionFormatVersion;
                }
                return convertHermes(read.input);
            },
        },
        /* ------------------------------------------------ Cursor（~/.cursor + 可选 <项目>/.cursor） */
        {
            id: 'cursor',
            labelKey: 'foreign.source.cursor',
            // 取证强度与静态探测位置一律取自真值表（`truth-table.ts`）——不在这里再抄一份路径清单
            evidence: evidenceOf('cursor'),
            probePaths: probePathsOf('cursor'),
            async detect(ctx) {
                // 用户级（契约 §8.2 标注「文档未列出/未取证」：存在即读、不存在即跳过）
                const userProbed = await probeTree(ctx.homeDir, [
                    { rel: '.cursor/mcp.json' },
                    { rel: '.cursor/rules', dir: true },
                    { rel: '.cursor/skills', dir: true },
                    { rel: '.cursorrules' },
                    // 会话根（只有会话、没有 mcp.json 的机器也要能命中）
                    { rel: '.cursor/projects', dir: true },
                ]);
                const paths = [...userProbed.paths];
                const skipped = [...userProbed.skipped];
                if (ctx.projectDir !== undefined && ctx.projectDir !== '') {
                    // 契约 §8.2 规定的主位置是项目级 —— 只有显式给了 projectDir 才探测，绝不猜「项目 = cwd」。
                    // 磁盘根 = projectDir，标签 = 相对用户 home 的 project/.cursor/...
                    const projectProbed = await probeTree(ctx.projectDir, [
                        { rel: '.cursor/mcp.json' },
                        { rel: '.cursor/rules', dir: true },
                        { rel: '.cursor/skills', dir: true },
                        { rel: '.cursorrules' },
                    ], 'project/');
                    paths.push(...projectProbed.paths);
                    skipped.push(...projectProbed.skipped);
                }
                return { found: paths.length > 0, paths, skipped };
            },
            async build(ctx) {
                const read = await readCursor({
                    homeDir: ctx.homeDir,
                    ...(ctx.projectDir !== undefined ? { projectDir: ctx.projectDir } : {}),
                    ...(ctx.limits !== undefined ? { limits: ctx.limits } : {}),
                });
                // 会话转码版本必须由宿主解析后传入（绝不猜）；缺省 = 一条都不转并整批报码
                if (ctx.targetSessionFormatVersion !== undefined) {
                    read.input.targetSessionFormatVersion = ctx.targetSessionFormatVersion;
                }
                return convertCursor(read.input);
            },
        },
        /* ------------------------------------------------ Codex CLI（CODEX_HOME > ~/.codex） */
        {
            id: 'codex',
            labelKey: 'foreign.source.codex',
            // 取证强度与静态探测位置一律取自真值表（`truth-table.ts`）——不在这里再抄一份路径清单
            evidence: evidenceOf('codex'),
            probePaths: probePathsOf('codex'),
            async detect(ctx) {
                const resolved = resolveCodexHome({ homeDir: ctx.homeDir, env: ctx.env });
                const skipped = [];
                if (resolved.overridden)
                    skipped.push({ code: 'source-location-overridden', origin: 'CODEX_HOME' });
                const homeProbed = await probeTree(resolved.home, [
                    { rel: 'config.toml' },
                    { rel: 'AGENTS.override.md' },
                    { rel: 'AGENTS.md' },
                    // 会话双根（只有会话、没有 config.toml 的机器也要能命中）
                    { rel: 'sessions', dir: true },
                    { rel: 'archived_sessions', dir: true },
                ]);
                // 技能是**跨来源共用**的 ~/.agents/skills（相对用户 home，不是 CODEX_HOME）
                const skillsProbed = await probeTree(ctx.homeDir, [{ rel: '.agents/skills', dir: true }]);
                return {
                    found: homeProbed.paths.length > 0 || skillsProbed.paths.length > 0,
                    paths: [...homeProbed.paths, ...skillsProbed.paths],
                    skipped: [...skipped, ...homeProbed.skipped, ...skillsProbed.skipped],
                };
            },
            async build(ctx) {
                const read = await readCodex({ homeDir: ctx.homeDir, env: ctx.env, ...(ctx.limits !== undefined ? { limits: ctx.limits } : {}) });
                // 会话转码版本必须由宿主解析后传入（绝不猜）；缺省 = 一条都不转并整批报码
                if (ctx.targetSessionFormatVersion !== undefined) {
                    read.input.targetSessionFormatVersion = ctx.targetSessionFormatVersion;
                }
                return convertCodex(read.input);
            },
        },
        /* ------------------------------------------------ GitHub Copilot CLI（COPILOT_HOME > ~/.copilot） */
        {
            id: 'copilot',
            labelKey: 'foreign.source.copilot',
            // 取证强度与静态探测位置一律取自真值表（`truth-table.ts`）——不在这里再抄一份路径清单
            evidence: evidenceOf('copilot'),
            probePaths: probePathsOf('copilot'),
            async detect(ctx) {
                const resolved = resolveCopilotHome({ homeDir: ctx.homeDir, env: ctx.env });
                const skipped = [];
                if (resolved.overridden)
                    skipped.push({ code: 'source-location-overridden', origin: 'COPILOT_HOME' });
                const probed = await probeTree(resolved.home, [
                    { rel: 'mcp-config.json' },
                    { rel: 'copilot-instructions.md' },
                    { rel: 'instructions', dir: true },
                    { rel: 'skills', dir: true },
                ]);
                return {
                    found: probed.paths.length > 0,
                    paths: probed.paths,
                    skipped: [...skipped, ...probed.skipped],
                };
            },
            async build(ctx) {
                const read = await readCopilot({ homeDir: ctx.homeDir, env: ctx.env, ...(ctx.limits !== undefined ? { limits: ctx.limits } : {}) });
                return convertCopilot(read.input);
            },
        },
        /* ------------------------------------------------ Google Antigravity（~/.gemini） */
        {
            id: 'antigravity',
            labelKey: 'foreign.source.antigravity',
            // 取证强度与静态探测位置一律取自真值表（`truth-table.ts`）——不在这里再抄一份路径清单
            evidence: evidenceOf('antigravity'),
            probePaths: probePathsOf('antigravity'),
            async detect(ctx) {
                // 路径标签按 §8.2 的真值表写成相对用户 home 的 .gemini/<...>（读盘层同口径）
                const probed = await probeTree(ctx.homeDir, [
                    { rel: '.gemini/config/mcp_config.json' },
                    { rel: '.gemini/antigravity/mcp_config.json' },
                    // 凭据文件：只 stat（可能 0 字节），值绝不读
                    { rel: '.gemini/antigravity/mcp_oauth_tokens.json' },
                    // 会话根（三根并列）：mcp_config.json 是 0 字节时，这里才是「本机确实装过」的证据
                    { rel: '.gemini/antigravity/brain', dir: true },
                    { rel: '.gemini/antigravity-cli/brain', dir: true },
                    { rel: '.gemini/antigravity-ide/brain', dir: true },
                ]);
                return { found: probed.paths.length > 0, paths: probed.paths, skipped: probed.skipped };
            },
            async build(ctx) {
                const geminiDir = resolveGeminiHome({ homeDir: ctx.homeDir }).dir;
                const read = await readAntigravity({
                    geminiDir,
                    ...(ctx.limits !== undefined ? { limits: ctx.limits } : {}),
                });
                // 会话转码版本必须由宿主解析后传入（绝不猜）；缺省 = 一条都不转并整批报码
                if (ctx.targetSessionFormatVersion !== undefined) {
                    read.input.targetSessionFormatVersion = ctx.targetSessionFormatVersion;
                }
                return convertAntigravity(read.input);
            },
        },
        /* ---------------- 档 B 24 个会话类来源（顺序 = source-modules.ts 的形状表） ----------------
         * 每一条的 detect / build / probePaths / evidence 都由它自己的 wiring 经 sessionSourceOf 收口，
         * **不在这里重抄路径清单或证据档**。dsh / dsh4 是手写 detect/build（字节直通经不了草稿→IR→合成），
         * 但复用同一份 kernel.collectSessionSections。
         */
        createGeminiSource(),
        createReasonixSource(),
        createOpencodeSource(),
        createMimocodeSource(),
        createZcodeSource(),
        createGrokbuildSource(),
        createOpenclawSource(),
        createPiSource(),
        createKimiSource(),
        createKilocodeSource(),
        createQoderSource(),
        createChatgptSource(),
        createWorkbuddySource(),
        createQwenSource(),
        createContinueSource(),
        createClineSource(),
        createGooseSource(),
        createDsh4Source(),
        createZedSource(),
        createCrushSource(),
        createTeleagentSource(),
        createTraeSource(),
        createVibeSource(),
        createDshSource(),
    ];
}
/** 30 个内置来源的注册表（宿主路由与 CLI 的**唯一**装配点） */
export function createBuiltinForeignSourceRegistry() {
    return createForeignSourceRegistry(builtinForeignSources());
}
/**
 * 逐来源检测（**绝不抛**）：单来源探测失败只影响它自己，其余来源照常返回。
 * 失败时如实给一条 source-unreadable（origin = 来源 id），绝不静默把它当成「未安装」。
 */
export async function detectForeignSources(registry, ctx) {
    const out = [];
    for (const source of registry.list()) {
        try {
            const det = await source.detect(ctx);
            out.push({
                id: source.id,
                labelKey: source.labelKey,
                found: det.found,
                paths: [...det.paths],
                skipped: [...(det.skipped ?? [])],
            });
        }
        catch {
            out.push({
                id: source.id,
                labelKey: source.labelKey,
                found: false,
                paths: [],
                skipped: [{ code: 'source-unreadable', origin: source.id }],
            });
        }
    }
    return out;
}
//# sourceMappingURL=registry.js.map