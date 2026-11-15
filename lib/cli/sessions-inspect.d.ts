/** 输出通道（可注入供测试）。 */
export interface SessionsInspectIo {
    log: (line: string) => void;
    error: (line: string) => void;
}
export interface SessionsInspectOptions {
    /** DSH home（会话根 = <home>/sessions） */
    home: string;
    /** 'list' = 只列会话；'doctor' = 体检并按严重级分组 */
    action: 'list' | 'doctor';
    json: boolean;
}
/**
 * 执行只读检查。**退出码**：0 = 无阻断级问题；1 = 存在 blocksStartup / unloadable
 * （DSH 可能起不来，或这些会话根本读不出来）；2 = 会话根不存在。
 */
export declare function runSessionsInspect(options: SessionsInspectOptions, io: SessionsInspectIo): Promise<number>;
