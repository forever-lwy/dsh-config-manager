export { ENCRYPTED_CONTAINER_CODE } from '../utils/shared-constants.ts';
/** 备份容器形态。 */
export type BackupContainerKind = 'zip' | 'encrypted';
/** 判定所需的最小字节数（DCA1 magic 长度）。 */
export declare const CONTAINER_MAGIC_BYTES = 4;
/** 字节 → 容器形态（head 至少含前 4 字节；不足按明文处理）。 */
export declare function containerKindOfBytes(head: Uint8Array): BackupContainerKind;
/**
 * 文件 → 容器形态（只读前 4 字节）。
 *
 * 读不到（ENOENT / 权限 / 目录 / 空文件）一律返回 `'zip'`：交给下游 ZIP 解析器
 * 给出它自己的精确错误，而不是在这里编造「这是个加密备份」的结论。判不出形态
 * 只说明「按老行为（明文路径）走」，老行为即既有语义。
 */
export declare function readContainerKind(filePath: string): Promise<BackupContainerKind>;
