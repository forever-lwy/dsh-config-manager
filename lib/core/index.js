/**
 * 核心引擎公共出口：m5（适配器）、m6（UI）、m7（测试）与宿主插件统一从这里引用。
 */
export { Exporter, defaultSecretScanner, EXPORTER_INFO, } from './exporter.js';
export { Importer, } from './importer.js';
export { Analyzer, } from './analyzer.js';
export { createSnapshot, FileSnapshotStore, resolveFileTarget, verifySnapshot, } from './backup.js';
export { rollback } from './rollback.js';
export { planRestore, restore, listSnapshots, } from './restore.js';
/* —— 快照恢复的 git 风格改动预览（只读：变更状态 / 行数统计 / 逐行 hunks） —— */
export { snapshotFileDiff, summarizeRestoreChanges, SNAPSHOT_DIFF_LIMITS, } from './snapshot-diff.js';
export { computeCompatibility, describeCompatibility, describeSchemaStatus, validateSections, } from './validator.js';
export { ImportNotConfirmedError, ImportFailedError, } from './types.js';
/* —— 会话路径映射（issue #45：一条映射同时作用于 workspace.path 与会话首帧 cwd） —— */
export { applyPathMapping } from './path-mapping.js';
export { planSessionRepair, sessionRepairNeedsAttention, } from './session-repair.js';
/* —— 迁移历史引擎（Phase 6） —— */
export { MigrationStore, sanitizeEntry, queryHistory, summarizeHistory, renderExport, parseHistoryQuery, isValidMigrationKind, redactHistoryText, makeHistoryFilename, isHistoryBasename, MIGRATION_HISTORY_DIR, DEFAULT_MIGRATION_RETENTION, MIGRATION_HISTORY_SCHEMA_VERSION, HISTORY_RETENTION_MIN, HISTORY_RETENTION_MAX, isValidHistoryRetention, resolveHistoryRetention, } from './migration-history.js';
//# sourceMappingURL=index.js.map