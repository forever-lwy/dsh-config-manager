import type { SessionSourceWiring } from './session-source.ts';
import type { GrokSessionFile } from './read-grokbuild.ts';
import type { ForeignSource } from './registry.ts';
/** 一个来源的装配输入（probePaths 与读盘层**共用同一份**路径函数，杜绝两处真值分叉） */
export declare const grokbuildWiring: SessionSourceWiring<GrokSessionFile>;
export declare function createGrokbuildSource(): ForeignSource;
/** 注册表装配点直接用这一个（与既有六来源同形：`<id>Source` 常量） */
export declare const grokbuildSource: ForeignSource;
