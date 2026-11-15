/** 只扫日志前这么多字节（标题通常在开头几回合内写入；更大的日志只扫前缀，读不到就回落 id）。 */
export declare const SESSION_TITLE_SCAN_BYTES: number;
/** 一次请求最多为几个会话做日志兜底（按 unitId 去重之后）。 */
export declare const SESSION_TITLE_MAX_READS = 24;
/** 清空缓存（单测用；宿主进程内长期有效是刻意的）。 */
export declare function clearSessionTitleCache(): void;
/**
 * 从会话日志里读这条会话自己的名字（`session/title` 事件）。
 *
 * @param sessionsDir 会话根目录（`<homeDir>/sessions`）。
 * @param unitId 台账里的会话单元 id（`<projectKey>/<sessionId>`；缺了就返回 null）。
 * @returns 标题；读不到 / 没有标题事件 / 形状不符 → null（界面回落显示会话 id）。
 */
export declare function readSessionTitleFromLog(sessionsDir: string, unitId: string): Promise<string | null>;
/**
 * 给一批台账行补标题：**已有标题的不动**，缺标题的按 `unitId` 去重后走日志兜底。
 *
 * 只读、有界（见 {@link SESSION_TITLE_MAX_READS}）、失败一律原样返回（界面回落显示会话 id）。
 */
export declare function applySessionLogTitles<T extends {
    sessionId?: string | null;
    unitId?: string | null;
    title?: string;
}>(rows: readonly T[], sessionsDir: string, options?: {
    maxReads?: number;
}): Promise<(T & {
    title?: string;
})[]>;
