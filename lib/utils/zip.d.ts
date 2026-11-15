export interface ZipEntryMeta {
    name: string;
    method: number;
    compressedSize: number;
    uncompressedSize: number;
    crc32: number;
    isDirectory: boolean;
    /** 本地文件头在 ZIP 字节流中的偏移 */
    localOffset: number;
}
export interface ZipSafetyLimits {
    maxEntries?: number;
    maxTotalBytes?: number;
    maxCompressedBytes?: number;
    maxSingleBytes?: number;
    maxRatio?: number;
}
export declare const DEFAULT_ZIP_SAFETY_LIMITS: Required<ZipSafetyLimits>;
export declare class ZipSafetyError extends Error {
    constructor(message: string);
}
export declare function crc32(data: Uint8Array): number;
export interface ZipWriteEntry {
    name: string;
    data: Uint8Array;
}
/**
 * 写出前校验条目数（导出侧上限）。
 * - **写侧上限恒不高于读侧默认上限**（t36）：`limits.maxEntries` 只允许**收紧**，传入更大的值会被
 *   钳到 `DEFAULT_ZIP_SAFETY_LIMITS.maxEntries`。改动前只与 UInt16 物理上限取 min，于是显式传
 *   `maxEntries: 20_000` 的调用方能写出 10001 条的 ZIP —— 而默认读侧解析器（10_000）必然拒绝它，
 *   即「导出成功却导不回」（市场通道的测试此前正是靠这个不对称缺口构造样本）。
 * - 再与 UInt16 物理上限取 min：EOCD 的条目数字段只有 16 位，越过它会落到
 *   `Buffer.writeUInt16LE` 的裸 RangeError（无上下文、非 ZipSafetyError）。当前 10_000 < 0xFFFF，
 *   故该项**恒由读侧上限先行决定** —— 但它**不是死代码，勿删**：保留为防御性第二因子，万一读侧
 *   默认上限被调高到 16 位之上，仍不会写出物理上非法的 ZIP（该大小关系由 zip.test.ts 的
 *   `ZIP_MAX_WRITABLE_ENTRIES > DEFAULT_ZIP_SAFETY_LIMITS.maxEntries` 断言钉住）。
 * - 超限抛 ZipSafetyError（可读文案，含实际条目数与上限）。
 */
export declare function assertZipEntryCount(count: number, limits?: ZipSafetyLimits): void;
/** 组装 ZIP 字节（全部条目 method=8 deflate，UTF-8 文件名，含中央目录与 EOCD）。
 *  `limits.maxEntries` 缺省 = 读侧默认上限（10_000），且**只允许收紧**：传入更大值会被钳到该上限，
 *  确保产物恒能被默认解析器读回（t36）。 */
export declare function zipToBuffer(entries: ZipWriteEntry[], limits?: ZipSafetyLimits): Uint8Array;
/**
 * 写出 ZIP 文件（t46：**流式 + 异步压缩**）。
 *
 * 改动前是 `zipToBuffer(entries) → atomicWriteFile(zipPath, buf)`，两个已复核的问题：
 *  1. **整块驻留**：整个 ZIP（本地头 + 压缩数据 + 中央目录）先拼进内存再落盘 —— 输入 N 字节时
 *     峰值约 3N（entries 本身 + chunks 数组 + Buffer.concat 的成品），大 home 下即「整块载荷同时驻留」；
 *  2. **阻塞事件循环**：deflateRawSync 是全仓唯一的同步压缩点（本机 32MB 夹具实测阻塞 583ms）。
 * 现在：逐条 `await deflateRaw`（libuv 线程池）→ 顺序写入**目标同目录的 tmp 文件**，内存里只留中央目录
 * 与当前这一条；全部写完 fsync 后 rename 原子发布。
 *
 * 原子性与权限语义与改动前的 atomicWriteFile 一致：同目录 tmp → fsync → rename（带重试）→
 * 父目录 best-effort fsync；目标已存在则继承其权限位，并跟随符号链接（等价 symlink:'follow'）。
 * 未直接复用 atomic-write.ts：它不在 t46 inScope，且只接受「整块字节」、不支持流式写入。
 *
 * 限额口径与 zipToBuffer 完全相同（assertZipEntryCount：写侧上限恒 ≤ 读侧上限）。
 */
export declare function writeZip(zipPath: string, entries: ZipWriteEntry[], limits?: ZipSafetyLimits): Promise<void>;
/**
 * 单个 ZIP 的条目数物理上限：EOCD 条目数字段是 UInt16（任何限额都不得越过它）。
 *
 * ⚠ **不要当死代码删除**（t36 复核意见）：读侧默认上限 10_000 < 0xFFFF，故在 assertZipEntryCount
 * 里它当前恒不先于读侧上限生效；它是**防御性第二因子** —— 若将来有人把读侧默认上限调高越过 16 位，
 * 它仍能挡住物理非法的 ZIP。该大小关系由 zip.test.ts 的断言钉住，删它会同时红。
 */
export declare const ZIP_MAX_WRITABLE_ENTRIES = 65535;
/** 内存 ZIP 归档：构造时校验全部条目名与上限；读取时逐条解压 + CRC/尺寸/比预算校验 */
export declare class ZipArchive {
    private readonly buf;
    private readonly metas;
    readonly limits: Required<ZipSafetyLimits>;
    private totalUncompressed;
    constructor(buf: Uint8Array, metas: ZipEntryMeta[], limits: Required<ZipSafetyLimits>);
    names(): string[];
    entries(): ZipEntryMeta[];
    has(name: string): boolean;
    /** 读取并解压单条目（带 CRC32 / 尺寸 / 体积预算 / 压缩比校验） */
    readEntry(name: string): Uint8Array;
    /**
     * `readEntry` 的**异步**版本：同一套判据（本地文件头 / 越界 / 尺寸 / CRC / 预算 / 压缩比），
     * 逐字节同结果，只是解压交给 libuv 线程池。
     *
     * 为什么必须有它：`inflateRawSync` 会整段阻塞事件循环 —— 实测本机 29 MiB 归档全量解压
     * 阻塞 108 ms（导入向导 analyze→plan→execute 会各来一次，大备份就是几秒的界面冻结）。
     * 导入的完整性校验是**唯一**需要逐条解压全部条目的地方，它必须走这条异步路径。
     */
    readEntryAsync(name: string): Promise<Uint8Array>;
    /** 条目元数据查找（不存在 → 抛错）。解压前后的判据由调用方共享。 */
    private metaOf;
    /** 本地文件头校验 + 定位压缩字节区间（越界 → 抛错）。 */
    private rawBytes;
    /** 解压后的验收：尺寸 → CRC32 → 解压总量预算 → 压缩比（zip bomb）。两处解压路径共用同一套判据。 */
    private accept;
    readEntryText(name: string): string;
    /** 读取并深度保护解析 JSON 条目 */
    readEntryJson(name: string): unknown;
}
/**
 * 解析 ZIP —— **默认即最严解析器**（无需调用方注入强化版）。
 * 安全校验：条目名 isPathSafe / 重复条目名 / symlink 条目 / 本地文件头越界 /
 * 条目数与压缩体积上限（DEFAULT_ZIP_SAFETY_LIMITS 唯一来源）。
 * 任何一项不满足即 throw ZipSafetyError（整体拒绝，不部分接受）。
 */
export declare function parseZip(buf: Uint8Array, limits?: ZipSafetyLimits): ZipArchive;
/**
 * 安全解压到受控目录（对齐设计 §13.4 safeExtract 签名）。
 * 返回条目相对路径列表；任何越界/损坏即整体拒绝（不部分落盘）。
 * m4 的 zip-security 可替换/强化本实现。
 */
export declare function safeExtract(zipPath: string, destDir: string, limits?: ZipSafetyLimits): Promise<string[]>;
