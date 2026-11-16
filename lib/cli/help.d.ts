/**
 * 离线 CLI 帮助文案的单一事实源（2026-10 整理）。
 *
 * 帮助分两层，都由本文件渲染，**绝不在 index.ts 里再散写一遍文案**：
 *  - 速查页（`dcm help`）：按风险分组的命令表 + 通用选项，目标是「30 行内扫一眼就知道用哪个」；
 *  - 详情页（`dcm <命令> --help` / `dcm help <命令>`）：说明 / 选项 / 退出码 / 示例。
 *
 * 两条渲染约定（改文案前先读）：
 *  1. 速查页的「用法」列**只用 ASCII**（占位符写 `<file|path>` 而不是 `<文件|路径>`）：
 *     CJK 是双宽字符，混进 padEnd 对齐的一列会让整页参差。
 *  2. 退出码必须与实现一致 —— 判定逻辑在各 run* 函数里，这里只是结论；改了行为要同步改这里。
 */
export declare const IMPORT_SOURCE_IDS: readonly string[];
/** 详情页里的一个「左列 + 右列」条目（选项 / 退出码 / 子命令都用它） */
export interface HelpEntry {
    /** 左列，只用 ASCII */
    readonly flag: string;
    /** 右列说明（中文） */
    readonly desc: string;
}
export interface HelpSection {
    readonly title: string;
    readonly entries: readonly HelpEntry[];
}
export interface CommandHelp {
    /** 命令名（`dcm <name> --help` 与 `dcm help <name>` 的键） */
    readonly name: string;
    /** 详情页首行：`<name> — <title>` */
    readonly title: string;
    /** 速查页里那一行的用法片段（ASCII only、尽量短） */
    readonly usage: string;
    /** 速查页里那一行的摘要（中文、一行） */
    readonly summary: string;
    /** 详情页「用法」段（不含 `dcm` 前缀，每项一行） */
    readonly usageLines: readonly string[];
    /** 详情页「说明」段（每项一行） */
    readonly description: readonly string[];
    /** 详情页的键值段，按声明顺序渲染 */
    readonly sections: readonly HelpSection[];
    /** 详情页「示例」 */
    readonly examples: readonly string[];
}
export interface HelpRow {
    /** 用法片段（ASCII only） */
    readonly usage: string;
    /** 一行摘要 */
    readonly summary: string;
    /** 该行指向的详情页（CommandHelp.name；`sessions` 有三行指向同一页） */
    readonly help: string;
}
export interface HelpGroup {
    readonly title: string;
    readonly rows: readonly HelpRow[];
}
/** 通用选项（所有命令共有）——范围仅限少数命令的参数（如 --home 仅用于 web/sessions）写在各自详情页 */
export declare const GENERAL_OPTIONS: readonly HelpEntry[];
/** 分组顺序 = 推荐阅读顺序：先诊断、再备份、再修复、最后才是危险的重装 */
export declare const HELP_GROUPS: readonly HelpGroup[];
export declare const COMMAND_HELP: readonly CommandHelp[];
/** 速查页「用法」列的宽度（全表统一，保证摘要起始列一致） */
export declare function usageColumnWidth(): number;
/** 速查页（`dcm help`）：分组命令表 + 通用选项 + 上手顺序 */
export declare function renderOverview(version: string): string[];
/** 单命令详情页；不认识的名字返回 null（调用方决定怎么报错） */
export declare function renderCommandHelp(name: string, version: string): string[] | null;
