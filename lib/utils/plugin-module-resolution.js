import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
/** Resolve actual exported modules, including subpaths; never import or execute plugin code. */
export function createPluginModuleResolver(anchors, resolveResource) {
    return (specifier) => {
        let fallback = resolveResource === undefined;
        if (resolveResource !== undefined) {
            for (const anchor of anchors) {
                try {
                    if (existsSync(resolveResource(specifier, pathToFileURL(anchor).href)))
                        return true;
                }
                catch (err) {
                    // Standalone CLI/tests may lack the host's resolver. Missing exports are not this case.
                    if (err instanceof Error && err.message.includes('requires the Node module resolver'))
                        fallback = true;
                }
            }
        }
        if (!fallback)
            return false;
        for (const anchor of anchors) {
            try {
                if (existsSync(createRequire(anchor).resolve(specifier)))
                    return true;
            }
            catch { /* next anchor */ }
        }
        return false;
    };
}
//# sourceMappingURL=plugin-module-resolution.js.map