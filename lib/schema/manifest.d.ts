import type { Manifest, ManifestForeignOrigin, Platform, SectionId } from './types.ts';
export declare const MANIFEST_FILE = "manifest.json";
export declare const CHECKSUMS_FILE = "integrity/checksums.json";
export declare const EXPORTER_NAME = "DSH Config Manager";
export interface BuildManifestInput {
    exporterVersion: string;
    dshVersion: string;
    platform: Platform;
    arch: string;
    sections: Record<SectionId, boolean>;
    containsSecrets: boolean;
    encrypted: boolean;
    encryption: Manifest['security']['encryption'];
    exportedAt?: string;
    /** 导出机的 DSH home（可选；见 Manifest.sourceHome，用于跨机基础路径重定基） */
    sourceHome?: string;
    /**
     * 外部来源包的溯源块（可选；见 Manifest.foreign）。
     * **只有显式传入时才写入** —— 缺省不产生该键，DSH 自产备份与旧包逐字不变。
     */
    foreign?: ManifestForeignOrigin;
}
/** 构造 manifest（schemaVersion 恒为当前版本，集中于此） */
export declare function buildManifest(input: BuildManifestInput): Manifest;
/** 序列化（pretty JSON，供 ZIP 内 manifest.json） */
export declare function serializeManifest(manifest: Manifest): string;
/** 解析 + 结构校验；非法输入抛错（导入第一道闸之一） */
export declare function parseManifest(raw: string): Manifest;
export interface ManifestIssue {
    path: string;
    message: string;
    severity: 'error' | 'warning';
}
/** 结构校验：字段类型 / sections 键集合 / security 形状 */
export declare function validateManifest(m: unknown): ManifestIssue[];
