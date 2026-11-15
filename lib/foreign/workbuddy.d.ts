import type { ForeignSource } from './registry.ts';
/** 写进 DSH request/header 的 provider 名 */
export declare const WORKBUDDY_PROVIDER = "workbuddy";
/** 装配 WorkBuddy 来源（每次调用返回一份新定义；注册动作由 registrar 统一做） */
export declare function createWorkbuddySource(): ForeignSource;
/** 同一份定义的实例（宿主路由 / 单测可直接用） */
export declare const workbuddySource: ForeignSource;
