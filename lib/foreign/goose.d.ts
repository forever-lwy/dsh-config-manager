import type { RootProbeOptions, SessionDraft } from './session-source.ts';
import type { ForeignSource } from './registry.ts';
import type { SqliteSessionFile } from './read-opencode.ts';
/** 静态探测位置（只 stat；真值表函数显式收 platform，绝不读运行平台） */
export declare function gooseProbePaths(opts: RootProbeOptions): readonly string[];
/** 归一记录 → 草稿（唯一出口；provider = 来源 id） */
export declare function gooseDraftOf(file: SqliteSessionFile): SessionDraft;
/** 装配成注册表可用的 `ForeignSource`（detect 只 stat 真值表位置；build 走 sqlite.ts 的能力探测） */
export declare function createGooseSource(): ForeignSource;
/** 模块级单例（无状态；每个进程一份即可，注册表按引用装配） */
export declare const gooseSource: ForeignSource;
