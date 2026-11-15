/**
 * 给一个错误打上「本地可修」标记并原样返回（便于 `throw markLocalOnlyExternalFailure(err, 'git-identity')`）。
 * 同一个错误重复标记不报错（后写覆盖先写）。
 */
export declare function markLocalOnlyExternalFailure<T extends Error>(err: T, reason: string): T;
/** 读取标记（无标记/非对象 → null）。 */
export declare function localOnlyFailureReason(err: unknown): string | null;
/** 该失败是否只由本机可修的配置/凭据引起（true 才允许不升 SAFE MODE）。 */
export declare function isLocalOnlyExternalFailure(err: unknown): boolean;
