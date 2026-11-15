import { importRoutes } from './import.js';
import { snapshotRoutes } from './snapshots.js';
import { profileRoutes } from './profiles.js';
import { backupRoutes } from './backup.js';
import { consultRoutes } from './consult.js';
import { foreignRoutes } from './foreign.js';
import { syncRoutes } from './sync.js';
import { prefsRoutes } from './prefs.js';
import { marketRoutes } from './market.js';
import { meRoutes } from './me.js';
import { historyRoutes } from './history.js';
import { recoveryRoutes } from './recovery.js';
import { sessionExportRoutes } from './session-export.js';
import { pathBrowseRoutes } from './path-browse.js';
export function buildRoutes(env) {
    return [
        ...importRoutes(env),
        ...snapshotRoutes(env),
        ...profileRoutes(env),
        ...backupRoutes(env),
        ...consultRoutes(env),
        ...foreignRoutes(env),
        ...syncRoutes(env),
        ...prefsRoutes(env),
        ...marketRoutes(env),
        ...meRoutes(env),
        ...historyRoutes(env),
        ...recoveryRoutes(env),
        ...sessionExportRoutes(env),
        ...pathBrowseRoutes(env),
    ];
}
//# sourceMappingURL=index.js.map