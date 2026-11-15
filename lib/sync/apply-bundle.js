import { CURRENT_SCHEMA_VERSION } from '../schema/versions.js';
import { mergeWorkspacesSection } from './workspace-merge.js';
export async function prepareApplyBundle(input) {
    let companion;
    try {
        companion = await companionWorkspaces(input);
    }
    catch {
        companion = undefined;
    }
    const sectionIds = companion === undefined ? [...input.baseIds] : [...input.baseIds, 'workspaces'];
    const sections = {};
    for (const r of input.autoApply) {
        if (r.merged !== undefined)
            sections[r.id] = r.merged;
    }
    if (companion !== undefined)
        sections.workspaces = companion;
    const manifest = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        dshVersion: input.dshVersion,
        platform: input.platform,
        sectionIds: [...sectionIds],
        containsSecrets: false,
        ...(input.sourceHome !== '' ? { sourceHome: input.sourceHome } : {}),
    };
    return {
        sectionIds,
        companion,
        tempSnapshot: {
            id: input.snapshotId,
            createdAt: input.createdAt,
            manifest,
            sections: sections,
        },
    };
}
/** 会话落地时是否/如何带上工作区（口径见文件头；形状不认识就交回远端原样）。 */
async function companionWorkspaces(input) {
    if (!input.baseIds.includes('sessions') || input.baseIds.includes('workspaces'))
        return undefined;
    if (!input.pullAllowsWorkspaces || input.adapter === undefined)
        return undefined;
    const planEntry = input.planEntries.find((r) => r.id === 'workspaces');
    const remote = input.remote ?? planEntry?.merged;
    if (remote === undefined)
        return undefined;
    let local;
    try {
        local = (await input.adapter.export(input.ctx, { includeSecrets: false })).data;
    }
    catch {
        local = undefined; // 读不到本机现值就只带远端（畸形载荷交给 analyzeImport/validate 如实报错）
    }
    if (local === undefined)
        return remote;
    const merged = mergeWorkspacesSection(local, remote, input.ancestor);
    return merged === undefined ? remote : merged.merged;
}
//# sourceMappingURL=apply-bundle.js.map