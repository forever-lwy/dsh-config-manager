import type { EncryptionInfo, SectionData, SectionId } from '../schema/types.ts';
import type { EncryptedCredentials, EncryptedSections } from './transport.ts';
/**
 * 加密整个明文 sections Record → 密文载荷（info 进 manifest 非秘密参数；data 为 base64 密文）。
 * 序列化经 snapshot-json：文件类分区字节以 base64 进入载荷，解密后还原 Uint8Array
 * （JSON 无法直传 TypedArray，否则解密回来的文件分区被破坏成普通对象）。
 */
export declare function encryptSectionsPayload(sections: Partial<Record<SectionId, SectionData>>, password: string): Promise<EncryptedSections>;
/** 解密密文载荷 → 明文 sections Record（密码错误 / 密文被篡改 → SecurityError）。 */
export declare function decryptSectionsPayload(payload: EncryptedSections['encrypted'], password: string): Promise<Partial<Record<SectionId, SectionData>>>;
/** 从加密载荷提取非秘密的加密参数（展示/诊断用；不含密码）。 */
export declare function encryptionInfoOf(payload: EncryptedSections['encrypted']): EncryptionInfo;
/**
 * 加密 `.credentials.yaml` 原文 → 凭据载荷（与 sections 同密码、独立 salt/iv）。
 * 只在 includeSecrets=true 的加密快照上使用；密码仅内存。
 */
export declare function encryptCredentialsPayload(plaintext: string, password: string): Promise<EncryptedCredentials>;
/** 解密凭据载荷 → `.credentials.yaml` 原文（密码错误 / 密文被篡改 → SecurityError）。 */
export declare function decryptCredentialsPayload(payload: EncryptedCredentials, password: string): Promise<string>;
/**
 * `.credentials.yaml` 原文 → `Map<ref, value>`。
 *
 * 解析口径由 `security/credentials-yaml.ts` 的 `collectCredentialRefs` 独占（DSH v1 的
 * 顶层 `refs:` 块 + 预发布扁平布局都认，`records` 等嵌套结构忽略）——与宿主导入路径的
 * tryDecryptCredentials 同口径：同一个文件格式，两处解析必须一致（issue #39）。
 * 解析失败 / 顶层不是对象 → 空 Map（调用方据此判定「没有可用凭据」并告警，绝不静默写入）。
 */
export declare function credentialsMapFromYaml(text: string): Map<string, string>;
