import type { MsgFunc } from '../core/msg-types.ts';
export declare const zh: {
    readonly 'foreign.truthTableMissingSource': '真值表缺少来源定义: {id}';
    readonly 'foreign.truthTableMissingSourceDetailed': '真值表缺少来源定义: {id}（truth-table.ts 是 evidence/probePaths 的单一事实源）';
    readonly 'foreign.availableSourcesEmpty': '(空)';
    readonly 'foreign.duplicateSourceId': '外部来源 id 重复注册: {id}；可用: {available}';
    readonly 'foreign.unknownSourceId': '未知外部来源 id: {id}；可用: {available}';
    readonly 'foreign.invalidSourceDefinition': '外部来源定义非法: {id}；可用: {available}';
    readonly 'foreign.sourceIdMissing': '(无 id)';
    readonly 'foreign.bundleFileSectionPrefixMissing': '外部导入：文件类分区缺少 ZIP 前缀 {section}';
    readonly 'foreign.bundleJsonSectionPathMissing': '外部导入：JSON 类分区缺少 ZIP 路径 {section}';
};
export declare const en: Record<keyof typeof zh, string>;
/** 本域活翻译器（与 core 的 engineMsg 同一实现；导入本模块即完成目录注册）。 */
export declare const engineMsg: MsgFunc;
