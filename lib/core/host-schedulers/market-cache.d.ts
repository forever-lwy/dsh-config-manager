/**
 * 市场缓存目录布局与暂存 zip 懒 GC（tech-debt #23 下沉）。
 *
 * 这些逻辑原本长在 src/index.ts 的 makeRoutes() 里，只有「装上宿主 + 真的拉过一次市场」
 * 才能验证；抽出来之后目录哈希、条目完整性判定、保留期回收都是可单测的纯行为。
 *
 * 边界：src/core/host-schedulers/* 只能 import 'node:' 与同目录（core 层是 allow 白名单、
 * 按**原始 spec 前缀**判定，'../../utils/hash.ts' 不在白名单里）——
 * 所以 sha256 在这里用 node:crypto 本地算，别去 import utils。
 */
/**
 * 暂存 zip 的保留期：market/download 每次暂存新 zip 前做懒 GC，
 * 保留这段时间内的（供刚下载后立即执行的 /execute 消费），更旧的清掉。
 */
export declare const MARKET_TMP_RETENTION_MS: number;
export interface MarketCacheLayout {
    /** <marketDir>/cache */
    cacheRoot: string;
    /** <marketDir>/work */
    workRoot: string;
    /** 缓存的 index.json（结构校验由调用方做，这里只给路径） */
    cacheIndex(url: string): string;
    /** 条目缓存目录（manifest.json + config.zip） */
    itemDir(url: string): string;
    /** 该仓库的只读 git 工作副本目录（--depth 1，无凭据） */
    workDir(url: string): string;
}
export declare function createMarketCacheLayout(marketDir: string): MarketCacheLayout;
/** 读缓存的 index.json 原始文本（不存在/读不出 → null；解析与结构校验归调用方）。 */
export declare function readMarketCacheIndexText(layout: MarketCacheLayout, url: string): Promise<string | null>;
/** 条目是否已有完整缓存（manifest.json + config.zip 都在才算）。 */
export declare function marketItemCached(layout: MarketCacheLayout, url: string, itemId: string): Promise<boolean>;
/** 写条目缓存（manifest + config.zip）供离线重复查看。内容始终视为不可信。 */
export declare function writeMarketItemCache(layout: MarketCacheLayout, url: string, itemId: string, manifestRaw: string, zipBytes: Uint8Array): Promise<void>;
/**
 * 清理滞留在 tmpDir 的过期市场暂存 zip（market-*.zip 与发布向导的 publish-*.zip）。
 * 一次性尽力而为：任何读取/删除失败都只跳过，不影响主流程。
 * 返回被删掉的文件名（便于单测与诊断；生产调用方可忽略）。
 */
export declare function pruneStagedMarketZips(tmpDir: string, retentionMs?: number, now?: number): Promise<string[]>;
