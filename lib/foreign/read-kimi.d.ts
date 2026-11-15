import type { ParsedTranscript, RootProbeOptions, SessionReadOutcome } from './session-source.ts';
/** 位置标签前缀（回给 GUI/CLI 的**只允许路径**） */
export declare const KIMI_SESSIONS_REL = ".kimi/sessions";
export declare const KIMI_CODE_SESSIONS_REL = ".kimi-code/sessions";
/** 伴生文件名（真值表 truth-table.ts 的 kimi 行里逐字列出） */
export declare const KIMI_WORK_DIRS_NAME = "kimi.json";
export declare const KIMI_CODE_WORKSPACES_NAME = "workspaces.json";
export declare const KIMI_WIRE_NAME = "wire.jsonl";
export declare const KIMI_STATE_NAME = "state.json";
/** 旧 Kimi CLI 的 sessions 根 */
export declare function kimiLegacySessionsDir(opts: RootProbeOptions): string;
/** 旧 Kimi CLI 的 workdir 映射表路径 */
export declare function kimiWorkDirsPath(opts: RootProbeOptions): string;
/** 新 Kimi Code 的 sessions 根 */
export declare function kimiCodeSessionsDir(opts: RootProbeOptions): string;
/** 新 Kimi Code 的 workspaces 表路径 */
export declare function kimiCodeWorkspacesPath(opts: RootProbeOptions): string;
/** 一条已解析的 Kimi 会话 */
export interface KimiSessionFile {
    readonly id: string;
    readonly parsed: ParsedTranscript;
}
export interface KimiReadOptions extends RootProbeOptions {
    readonly maxFileBytes?: number | undefined;
    readonly maxSessionFiles?: number | undefined;
}
/** md5 十六进制（旧代次的目录名 = md5(workdir)；这只是**反查用的哈希**，不是凭据） */
export declare function md5Hex(text: string): string;
/**
 * kimi.json 的 work_dirs[] → 目录名 → cwd。
 *
 * 目录名 = <kaos>_ + md5(path)（kaos 为**非本地**时才有前缀）。「本地」的判据是
 * kaos 缺失 / 空串 / local（大小写不敏感）；认不出的取值按**非本地**处理 —— 保守方向：
 * 宁可不匹配，也不把远端前缀当成 md5 的一部分去反解。
 */
export declare function workDirMapOf(kimiJson: unknown): Map<string, string>;
/**
 * workspaces.json → workspaceId → cwd（对象映射 / 数组两种形态都认；认不出就空表）。
 *
 * 条目形态：字符串，或 {path} / {root}（新代次真实写法是 root；对照
 * import-variants.mjs 的 kimiCodeWorkDirById）。
 */
export declare function workspaceMapOf(workspacesJson: unknown): Map<string, string>;
/** 状态文件里的 cwd（cwd / workDir；**权威**优先于目录名反查） */
export declare function cwdOfState(stateJson: unknown): string | undefined;
/**
 * 状态文件里的权威标题：custom_title（重命名）> isCustomTitle === true 时的 title。
 * 对照 import-variants.mjs 的 kimiDeriveArgs。
 */
export declare function titleOfState(stateJson: unknown): string | undefined;
/** 归一化事件类型：小写、去掉 . 与 _（turn.prompt → turnprompt） */
export declare function normalizeEventType(raw: string): string;
/**
 * 用户输入 → 文本：字符串原样；ContentPart 数组取 text 片段**直接相接**（分隔符 ''），
 * 结果去首尾空白。对照 convert/kimi.mjs 的 kimiUserInputText。
 */
export declare function kimiUserInputText(value: unknown): string;
/**
 * wire.jsonl → 归一记录（**两代词汇共用一处**）。旧代次每行是
 * {timestamp, message:{type,payload}}、新代次每行直接是 {type,…}，按行自动识别。
 */
export declare function parseKimiWire(text: string): ParsedTranscript;
export declare function readKimiSessions(opts: KimiReadOptions): Promise<SessionReadOutcome<KimiSessionFile>>;
