import type { PathMappingRule } from '../core/path-mapping.ts';
/** CLI 输出通道（可注入供测试）。 */
export interface SessionsRepairIo {
    log: (line: string) => void;
    error: (line: string) => void;
}
export interface SessionsRepairOptions {
    /** DSH home（--home；缺省由调用方解析 $DSH_HOME） */
    home: string;
    /** --fix：真的落盘（缺省 dry-run 只报告） */
    fix: boolean;
    /** --keep <dir>：重复 id 时保留哪一份 */
    keep?: string;
    /** --map old=new（可重复） */
    maps: readonly string[];
    /** --json：机器可读输出 */
    json: boolean;
}
/** 解析 --map old=new（必须在第一个 = 处切分，Windows 路径里也有盘符冒号但不会有 =）。 */
export declare function parseRepairMaps(maps: readonly string[]): {
    mappings: PathMappingRule[];
    errors: string[];
};
/**
 * 执行修复（dry-run 时零写入）。返回进程退出码：dry-run 恒 0（只报告）；
 * --fix 时只要有失败/冲突/回滚就返回 1。
 */
export declare function runSessionsRepair(options: SessionsRepairOptions, io: SessionsRepairIo): Promise<number>;
