/**
 * `.credentials.yaml` → `Map<ref, value>` 的唯一解析口径（issue #39）。
 *
 * DSH 现行格式（dsh-credentials-local 的 version 1 布局）把凭据值放在顶层 `refs:` 之下：
 *
 *   version: 1
 *   refs:
 *     DEEPSEEK_API_KEY: sk-...
 *   records:                                          # 会话记录，不是凭据 ref
 *     client-connection/browser-session: { kind: grant, payload: { ... } }
 *
 * 预发布版本用的是扁平布局（顶层键即 ref）；DSH 启动时会把旧文件迁移成上面的形状，
 * 但**旧备份包里的原文仍是扁平布局** —— 两种都必须认。只认扁平布局会让「包里明明
 * 带着值」的跨机导入退化成「需人工重填」（issue #39 实测）。
 *
 * `records` / `payload` 等嵌套结构一律忽略：会话秘密不是凭据 ref，混进来只会污染补录清单。
 *
 * 零依赖（不 import node:* / js-yaml）：宿主导入路径（src/index.ts 的 tryDecryptCredentials）
 * 与同步引擎（src/sync/snapshot-crypto.ts 的 credentialsMapFromYaml）共用同一份实现 ——
 * 同一个文件格式，两处解析必须一致。
 */
/**
 * 已 `yaml.load` 的 `.credentials.yaml` 文档 → `Map<ref, value>`。
 * 顶层不是对象（null / 数组 / 标量）→ 空 Map（调用方据此判定「没有可用凭据」并告警，绝不静默写入）。
 */
export declare function collectCredentialRefs(parsed: unknown): Map<string, string>;
