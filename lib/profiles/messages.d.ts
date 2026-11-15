import type { MsgParams } from '../core/msg-types.ts';
export declare const zh: {
    readonly 'profiles.stopFailed': 'stopFailed: pid {pid} 仍在运行';
};
export declare const en: Record<keyof typeof zh, string>;
/** 本域翻译器：key 受目录约束（拼错键 = 编译错误），语言按 engineMsg 的活语言解析。 */
export declare function profilesMsg(key: keyof typeof zh, params?: MsgParams): string;
