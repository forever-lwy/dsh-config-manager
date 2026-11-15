/** 单次列举上限：够翻一个源码目录，又不至于把响应体撑成几 MB。 */
export declare const BROWSE_ENTRY_LIMIT = 500;
/** 盘符/根探测的单项硬超时（ms）：断开的网络盘 stat 会长时间不返回。 */
export declare const ROOT_PROBE_TIMEOUT_MS = 400;
/** 列举失败的原因码（客户端按它选字典键）。 */
export type BrowseErrorCode = 'not-found' | 'denied' | 'failed' | 'not-absolute';
/** 一条条目：目录（可进入）或文件（可选中）。 */
export interface BrowseEntry {
    /** 末段名字（驱动器根即盘符本身，如 `D:\\`）。 */
    name: string;
    /** 绝对路径（客户端原样回填输入框）。 */
    path: string;
    kind: 'dir' | 'file';
}
/** 列举结果。 */
export interface BrowseResult {
    /** 当前列出的目录；空串 = 「此电脑」（Windows 的盘符根列表）。 */
    path: string;
    /** 上一级；已是根时为 null。 */
    parent: string | null;
    /** 用户主目录（界面上的快捷入口；不随 path 变化）。 */
    home: string;
    entries: BrowseEntry[];
    /** 命中 {@link BROWSE_ENTRY_LIMIT} 被截断。 */
    truncated: boolean;
    /** 失败原因码；成功为 null。 */
    error: BrowseErrorCode | null;
}
/**
 * 本机根列表：Windows 上是**探测得到的**盘符根（不硬编码 C:），其余平台是 `/`。
 * 探测逐根 400ms 超时；全部失败时至少给出 `parse(process.cwd()).root`，界面不至于空成白板。
 */
export declare function listRoots(): Promise<BrowseEntry[]>;
/**
 * 列出一个目录（缺省 = 根列表）。
 *
 * `target` 缺省或空串 = 根列表；凡不是绝对路径一律 `not-absolute`（不猜基准目录 —— 猜错就列出别人的东西）。
 * @param options.limit 覆盖 {@link BROWSE_ENTRY_LIMIT}。
 */
export declare function browseDirectory(target: string | undefined, options?: {
    limit?: number;
}): Promise<BrowseResult>;
