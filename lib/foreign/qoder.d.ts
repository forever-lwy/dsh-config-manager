import type { ForeignSource } from './registry.ts';
/** 写进 DSH `request/header` 的 provider 名（源侧概念，稳定机器标识） */
export declare const QODER_PROVIDER = "qoder";
/**
 * 装配 Qoder 来源（**每次调用返回一份新定义**，与 `builtinForeignSources()` 同语义）。
 * 注册动作由 registrar 统一做 —— 本模块不碰 registry.ts 的清单。
 */
export declare function createQoderSource(): ForeignSource;
/** 同一份定义的实例（宿主路由 / 单测可直接用；语义与 `createQoderSource()` 完全相同） */
export declare const qoderSource: ForeignSource;
