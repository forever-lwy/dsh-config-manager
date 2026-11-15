/**
 * 同步严格删除：目标不存在算成功；链接只删链接本身；删不掉抛底层错误；
 * 结束时目标**仍然存在**也抛错（rm 静默失效的兜底判据）。
 */
export declare function removeTreeSync(target: string): void;
/** 异步版本（大批量目录不阻塞事件循环）；语义与 removeTreeSync 完全一致。 */
export declare function removeTree(target: string): Promise<void>;
