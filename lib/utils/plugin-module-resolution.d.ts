/** Resolve actual exported modules, including subpaths; never import or execute plugin code. */
export declare function createPluginModuleResolver(anchors: readonly string[], resolveResource?: (specifier: string, parentURL: string) => string): (specifier: string) => boolean;
