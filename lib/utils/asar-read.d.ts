/** 缺省缓存根（系统临时目录下），可用选项覆盖。 */
export declare const DEFAULT_ASAR_CACHE_DIR_NAME = "dsh-cm-asar-codec";
/** 缺省解析起点（asar 内哪个目录当作 node_modules 根）。 */
export declare const DEFAULT_ASAR_RESOLVE_FROM = "dsh/node_modules";
/** 机器可读失败码（调用方据此写 detail，绝不拼绝对路径）。 */
export type AsarErrorCode = 
/** 容器不存在 / 不是普通文件 */
'not-found'
/** 头 pickle 结构或 JSON 目录表不合法 */
 | 'malformed-header'
/** 文件被截断（不足 8 字节 / 头长度越界 / 条目超出文件尾） */
 | 'truncated'
/** 越界或非普通条目（\`..\` / 绝对路径 / 反斜杠 / 符号链接） */
 | 'unsafe-entry'
/** 解析不到请求的包（或它的 package.json） */
 | 'unresolved-package'
/** 读写失败（权限 / 占用 / 磁盘） */
 | 'io-error'
/** 缓存目录发布失败 */
 | 'cache-failed';
/** 读取失败：调用方**一律当结论**处理（绝不 throw 到用户路径）。 */
export declare class AsarReadError extends Error {
    readonly code: AsarErrorCode;
    constructor(code: AsarErrorCode, detail: string);
}
/** 索引里的一个**普通文件**条目。 */
export interface AsarFileEntry {
    /** asar 内 POSIX 相对路径（相对 asar 根）。 */
    readonly path: string;
    readonly size: number;
    /** 条目数据相对「8 + headerBytes」的字节偏移。 */
    readonly offset: number;
    /** asarUnpack：实体在 \`<asarPath>.unpacked/<path>\`，容器内只有占位。 */
    readonly unpacked: boolean;
}
/** 解析后的 asar 目录表（只含普通文件；目录另存）。 */
export interface AsarIndex {
    readonly asarPath: string;
    readonly fileSize: number;
    readonly mtimeMs: number;
    readonly headerBytes: number;
    readonly files: ReadonlyMap<string, AsarFileEntry>;
    readonly directories: ReadonlySet<string>;
}
/**
 * asar 内相对路径是否安全：拒绝空段 / \`.\` / \`..\` / 绝对路径 / 反斜杠 / 控制字符与 Windows 保留字符。
 * 越界判定不依赖 \`path.resolve\`（跨平台语义不同），逐段白名单更可证。
 */
export declare function isSafeAsarPath(rel: string): boolean;
/** \`<asarPath>.unpacked/<rel>\`（asarUnpack 实体的真实位置）。 */
export declare function asarUnpackedPath(asarPath: string, rel: string): string;
/** 清空进程内索引缓存（测试隔离用）。 */
export declare function clearAsarIndexCache(): void;
/**
 * 解析 asar 目录表（只读 8 字节包长 + 头 pickle，**不读数据区**）。
 * 失败一律抛 \`AsarReadError\`（code 机器可读）；size+mtimeMs 未变时命中进程内缓存。
 */
export declare function readAsarIndex(asarPath: string): Promise<AsarIndex>;
/**
 * 读单个条目字节。条目不存在 / 越界 / 非普通条目 → **undefined**（不抛）；
 * 容器不可读 / 截断 → 抛 \`AsarReadError\`（调用方按结论处理）。
 */
export declare function readAsarEntry(asarPath: string, relPath: string): Promise<Uint8Array | undefined>;
/** 读单个文本条目（UTF-8）；条目不存在 → undefined。 */
export declare function readAsarTextEntry(asarPath: string, relPath: string): Promise<string | undefined>;
/** 缺省缓存根：\`<os.tmpdir()>/dsh-cm-asar-codec\`。 */
export declare function defaultAsarCacheDir(): string;
/** 缓存键：asar 绝对路径 + size + mtimeMs + 解析起点 + 包集合（排序后）。 */
export declare function asarCacheKey(index: Pick<AsarIndex, 'asarPath' | 'fileSize' | 'mtimeMs'>, resolveFrom: string, packages: readonly string[]): string;
export interface AsarExtractOptions {
    /** 源 asar 容器路径（只读）。 */
    asarPath: string;
    /** 要取出的包名（相对 resolveFrom 解析，含 scope 全名）。 */
    packages: readonly string[];
    /** asar 内作为解析起点的 node_modules 根（POSIX 相对路径）；缺省 \`dsh/node_modules\`。 */
    resolveFrom?: string;
    /** 缓存根目录；缺省 \`<os.tmpdir()>/dsh-cm-asar-codec\`。 */
    cacheDir?: string;
    /** true = 忽略已有缓存、强制重新解包（缓存被外部破坏时用）。 */
    refresh?: boolean;
}
export interface AsarExtractOk {
    ok: true;
    /** 解包后的目录根；条目路径与 asar 内相对路径一一对应。 */
    dir: string;
    cached: boolean;
    packages: {
        name: string;
        dir: string;
    }[];
    files: number;
    bytes: number;
    /** 解析不到的传递依赖（不致命：仍交给 import 判定）。 */
    unresolved: string[];
    key: string;
}
export interface AsarExtractFailure {
    ok: false;
    code: AsarErrorCode;
    detail?: string;
}
export type AsarExtractResult = AsarExtractOk | AsarExtractFailure;
/**
 * 把显式包名（及其依赖闭包）从 asar 取出到缓存目录。
 *
 * 语义：源 asar 只读；目标目录原子发布（临时目录 + rename）；size+mtimeMs+包集合命中即复用。
 * 失败一律返回结论（\`ok:false\` + 机器可读 code），**绝不 throw**、绝不写 DSH 安装树。
 */
export declare function extractAsarPackages(rawOptions: AsarExtractOptions): Promise<AsarExtractResult>;
/** 解包目录里的条目路径（\`<dir>/<resolveFrom>/<rel>\`）；调用方判存在后再用。 */
export declare function extractedEntryPath(dir: string, resolveFrom: string, rel: string): string;
/** 缓存根是否已经存在（诊断/测试用；不做写入）。 */
export declare function asarCacheDirExists(cacheDir: string): boolean;
