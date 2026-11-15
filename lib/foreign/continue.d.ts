import type { ForeignSource } from './registry.ts';
/** 写进 DSH request/header 的 provider 名 */
export declare const CONTINUE_PROVIDER = "continue";
/** 装配 Continue 来源（每次调用返回一份新定义；注册动作由 registrar 统一做） */
export declare function createContinueSource(): ForeignSource;
/** 同一份定义的实例（宿主路由 / 单测可直接用） */
export declare const continueSource: ForeignSource;
/** 真值表里声明的默认根（三平台展开；仅用于文档/测试比对，不参与运行时） */
export declare function continueDefaultProbe(platform: string, homeDir: string): readonly string[];
