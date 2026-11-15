/** 组装 9 个模型工具所需的依赖；纯映射，无副作用、不读盘、不触网。 */
export function createAgentToolDeps(input) {
    return {
        host: input.host,
        adapters: input.adapters,
        exportsDir: input.exportsDir,
        snapshotsDir: input.snapshotsDir,
        syncDir: input.syncDir,
        makeSyncEngine: input.makeSyncEngine,
        ...(input.exporterVersion === undefined ? {} : { exporterVersion: input.exporterVersion }),
        ...(input.scanner === undefined ? {} : { scanner: input.scanner }),
        syncPassword: async (kind, channel) => await input.resolveSyncPassword(input.syncPasswordRef(kind, channel)),
        optInSections: (channel) => input.selectionOptInSections(channel, true),
        makeImporter: input.makeImporter,
        roots: input.roots,
    };
}
//# sourceMappingURL=model-tools-deps.js.map