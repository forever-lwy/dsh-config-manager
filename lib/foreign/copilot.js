/**
 * GitHub Copilot CLI（~/.copilot）→ DSH bundle 分区的**纯**翻译层。
 *
 * 输入 = 已经读好的 Copilot 数据（读盘层 read-copilot.ts，纯数据、不含凭据剥离结果）；
 * 输出 = ForeignImportResult（分区载荷 + 未迁移项 + 凭据引用名）。
 *
 * 位置与结构真值见契约 §8.2（**文档取证**：docs.github.com 的 GitHub Copilot CLI configuration
 * directory；**本机无 ~/.copilot** —— 未经真机验证，取证强度如实标注）：
 *  - mcp-config.json：用户级 MCP（名字 → 定义）
 *  - copilot-instructions.md / instructions/*.instructions.md：官方 CLI 配置目录表里**没有列出**
 *    （那是 VS Code / 项目级约定）→ 存在即读、不存在不报错、绝不凭空造分区
 *  - skills/<名>/SKILL.md（个人技能，一层；手工嵌套按同一判据压平）
 *  - config.json / permissions-config.json / agents / hooks / logs / session-state /
 *    session-store.db / installed-plugins / ide：**不在本期范围**（契约 §8.2 未冻结），不读不报，
 *    绝不产出 sessions/workspaces 分区
 *
 * 公共口径（MCP 映射与凭据剥离、SKILL.md frontmatter 校验、路径/名字安全、技能装配）全部走
 * 共享内核 kernel.ts —— 与 Claude Code / Hermes / Codex 同一份实现，口径不可能分叉。
 */
import { isRecord } from '../utils/guards.js';
import { collectSkills, instructionsSection, mcpSectionFromEntries } from './kernel.js';
/** 「名字 → 定义」容器的候选键（按顺序取第一个是映射的） */
const MCP_CONTAINER_KEYS = ['mcpServers', 'servers'];
/**
 * 合并指令源：DSH **只读一个全局指令文件**（契约 §8.6-4），所以多份指令必须在转换期合并，
 * 并逐份报 instructions-merged（合并是信息重排，必须可见）。
 *
 * 顺序：copilot-instructions.md 在前，instructions/*.instructions.md 按文件名紧随其后 ——
 * 顺序确定（不依赖目录遍历顺序），文件之间用一行注释分隔（来源名来自文件名，不含任何配置值）。
 */
function mergedInstructions(input, skipped) {
    const parts = [];
    const base = typeof input.instructions === 'string' ? input.instructions : '';
    if (base.trim() !== '')
        parts.push(base);
    for (const f of input.instructionFiles ?? []) {
        if (f.text.trim() === '')
            continue;
        parts.push('<!-- instructions/' + f.name + ' -->' + String.fromCharCode(10) + f.text);
    }
    if (parts.length > 1) {
        skipped.push({ code: 'instructions-merged', count: parts.length });
    }
    return parts.join(String.fromCharCode(10, 10));
}
export function convertCopilot(input) {
    // 读盘层的发现排在前面：它们解释「为什么读到的少了」（与 convertHermes / convertCodex 同口径）
    const skipped = [...(input.readFindings ?? [])];
    const sections = [];
    const credentialRefs = [];
    const counts = {};
    let mcpEntries = [];
    if (isRecord(input.mcpConfig)) {
        const containerKey = MCP_CONTAINER_KEYS.find((k) => isRecord(input.mcpConfig !== undefined ? input.mcpConfig[k] : undefined) || Array.isArray(input.mcpConfig[k]));
        if (containerKey === undefined) {
            // 形态对不上就如实报（绝不静默少一片）：真值形态是「顶层含 mcpServers / servers 映射」
            skipped.push({ code: 'mcp-server-empty', origin: 'mcp-config.json', detail: 'no-servers-container' });
        }
        else {
            const raw = input.mcpConfig[containerKey];
            // 数组形态（部分版本可能给出 [{name, command}]）与映射形态都接受：名字取自条目的 name 字段
            if (Array.isArray(raw)) {
                for (const item of raw) {
                    if (!isRecord(item))
                        continue;
                    const name = item['name'];
                    if (typeof name !== 'string' || name === '')
                        continue;
                    mcpEntries.push([name, item]);
                }
            }
            else if (isRecord(raw)) {
                mcpEntries = Object.entries(raw);
            }
        }
    }
    const mcp = mcpSectionFromEntries(mcpEntries, credentialRefs, skipped);
    if (mcp !== null) {
        sections.push({ sectionId: 'mcp', data: mcp });
        counts['mcp.servers'] = mcp.servers.length;
    }
    const skillFiles = [];
    collectSkills(input.skills ?? [], skillFiles, skipped);
    if (skillFiles.length > 0) {
        sections.push({ sectionId: 'skills', files: skillFiles });
        counts['skills.files'] = skillFiles.length;
    }
    const instructions = instructionsSection(mergedInstructions(input, skipped));
    if (instructions !== null) {
        sections.push(instructions);
        counts['agentInstructions.files'] = 1;
    }
    return { source: 'copilot', sections, skipped, credentialRefs, counts };
}
//# sourceMappingURL=copilot.js.map