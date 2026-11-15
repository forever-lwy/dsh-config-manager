/**
 * agentPresets 分区 adapter（设计 §3.3）：
 * 数据源 = ~/.dsh/.agent-presets/（用户可写目录，每预设一个目录：agent.cordis.yml + preset.yml）。
 * system 预设（安装目录）只记引用不复制（本 adapter 只读用户目录）。
 */
import { FileCollectionAdapter } from './file-collection.js';
import { sectionMeta } from '../schema/section-registry.js';
export class AgentPresetsAdapter extends FileCollectionAdapter {
    id = 'agentPresets';
    // 元数据唯一来源 = 注册表（t31）：不再与 ui/export-flow.ts 的导出目录各写一份
    displayName = sectionMeta('agentPresets').displayName;
    defaultIncluded = sectionMeta('agentPresets').defaultIncluded;
    portability = sectionMeta('agentPresets').portability;
    baseDir = '.agent-presets';
}
//# sourceMappingURL=agent-presets.js.map