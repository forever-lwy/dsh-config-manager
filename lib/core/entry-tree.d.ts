/** The host only treats config as an entry tree when group is explicitly enabled. */
export interface EntryTreeRow {
    id?: unknown;
    name?: unknown;
    group?: unknown;
    config?: unknown;
}
export declare const MISSING_ENTRY_ID = "<missing-id>";
export declare function entryTreeRows(entries: readonly unknown[]): EntryTreeRow[];
/** Counts allow a writer to distinguish existing defects from newly introduced ones. */
export declare function entryTreeIssues(entries: readonly unknown[]): Map<string, number>;
