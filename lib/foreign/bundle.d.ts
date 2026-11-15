import type { Platform, SectionId } from '../schema/types.ts';
import type { ForeignImportResult, ForeignSkip } from './types.ts';
export interface ForeignBundleOptions {
    result: ForeignImportResult;
    /** 目标 ZIP 绝对路径 */
    outPath: string;
    /** 写入 manifest.exporter.version（用本插件版本） */
    exporterVersion: string;
    /** 导入目标机的 DSH 版本（本层不读磁盘，由调用方传入） */
    dshVersion: string;
    platform?: Platform;
    arch?: string;
    /** 测试可注入固定时间 */
    exportedAt?: string;
}
export interface ForeignBundleWritten {
    outPath: string;
    /** 包内条目名（不含 manifest.json / checksums.json），按写入顺序 */
    entryNames: string[];
    /** 实际写入的分区（空分区不会被写入，也不进 manifest.sections） */
    sections: SectionId[];
    skipped: ForeignSkip[];
    credentialRefs: string[];
}
export declare function writeForeignBundle(opts: ForeignBundleOptions): Promise<ForeignBundleWritten>;
