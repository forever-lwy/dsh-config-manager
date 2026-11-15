import type { Context } from '@deepseek-ai/cordis';
import type { JsonValue } from '../utils/json.ts';
import type { SyncEngine } from '../sync/sync-engine.ts';
import type { SectionId } from '../schema/types.ts';
import type { SyncConfig, SyncTransportType } from '../sync/sync-config.ts';
import type { ConfigAdapter, HostContext, SecretScanner } from './types.ts';
import type { Importer } from './importer.ts';
import { ModelPlanStore } from './model-tool-plans.ts';
/** 模型工具所需依赖（与 host 路由同一来源闭包）。 */
export interface ModelToolsDeps {
    /** HostContext 门面（homeDir / profile / msg / log） */
    host: HostContext;
    /** 全部分区适配器 */
    adapters: ConfigAdapter[];
    /** 导出 ZIP 落盘目录（$DSH_HOME/dsh-config-manager/exports） */
    exportsDir: string;
    /** 回滚快照目录（$DSH_HOME/dsh-config-manager/snapshots） */
    snapshotsDir: string;
    /** 同步状态目录（$DSH_HOME/dsh-config-manager/sync） */
    syncDir: string;
    /**
     * SyncEngine 工厂（git/webdav 按配置分支构造传输；与 host 路由同一来源）。
     * D5：agent 侧按工具决定 optInSections —— 推送 / 拉取 / 预览 / 合并一律带用户放行的 'auto' 档，
     * 再剔除 sessions（与 docs/architecture/agent-tools.md 的工具面口径同一份事实）。
     */
    makeSyncEngine: (cfg: SyncConfig, opts?: {
        optInSections?: readonly SectionId[];
    }) => SyncEngine;
    /** 插件版本（manifest.exporter.version） */
    exporterVersion?: string;
    /**
     * F2 强化 Secret 扫描器（含部署者 personalPatterns 个人规则；G-09 文件类分区文本级扫描）。
     * 必须与 HTTP 导出路由注入的是同一来源（src/index.ts 的 secretScanner 单一实例），
     * 否则两条导出路径的扫描档位不一致（个人规则 / 文件类分区凭据告警）。
     * 可选：缺省落回 Exporter 的 defaultSecretScanner()（无 scanText → 文件类分区不扫描，与修复前一致）。
     */
    scanner?: SecretScanner;
    /**
     * D3：按 DSH credentials 槽位读同步密码（ENCRYPT / DECRYPT + 通道）。
     * 值只在宿主内存里交给引擎，绝不进工具返回 / render / 日志。缺省 = 未接凭据服务。
     */
    syncPassword?: (kind: 'ENCRYPT' | 'DECRYPT', channel: SyncTransportType) => Promise<string | undefined>;
    /**
     * D5：用户逐分区放行的可选分区（宿主 = selectionOptInSections(channel, true) 的 'auto' 档）。
     * 缺省 = 空集；agent 侧永远再剔除 sessions（会话内容不受工具调用摆布）。
     */
    optInSections?: (channel: SyncTransportType) => readonly SectionId[];
    /** D6：导入引擎工厂（与 HTTP 导入路由同一来源）。缺省 = 导入类工具返回 import-unavailable。 */
    makeImporter?: () => Importer;
    /**
     * D6：受控路径根（导入 ZIP 必须落在其中；与 /analyze、/plan 同一判据 isControlledPath）。
     * 缺省 = 一律拒绝（fail-closed：宁可让用户走 GUI，也不让 agent 把任意路径交给解析器）。
     */
    roots?: readonly string[];
    /** 计划句柄表（单测可注入假时钟；缺省每次 createModelTools 新建一个进程内表）。 */
    planStore?: ModelPlanStore;
}
/**
 * 工具失败的统一形状：模型据此判断「能不能重试、下一步做什么」，不需要解析自然语言。
 * 成功路径保留各自业务字段（含 ok:true）。
 */
export interface ModelToolFailure extends Record<string, JsonValue> {
    ok: false;
    code: string;
    message: string;
    retryable: boolean;
    nextAction: string;
}
/** 9 个工具的纯编排实现（可独立测试，不依赖 Cordis ctx）。所有返回均为 JsonValue（可序列化、无 undefined）。 */
export declare function createModelTools(deps: ModelToolsDeps): {
    /** 全量备份到 exports 目录（默认不含 secret；password 可选加密，仅内存）。 */
    backup(input: {
        only?: SectionId[];
        password?: string;
    }): Promise<JsonValue>;
    /** 列出本地回滚快照（非敏感 meta，按 createdAt 倒序）。 */
    listSnapshots(): Promise<JsonValue>;
    /**
     * 恢复到指定快照。缺省只 planRestore（零写入）预览并**返回 planId**；
     * 真实执行必须 confirm:true 且带回预览给的 planId —— 计划在预览后变了就拒绝（零写入）。
     */
    restore(input: {
        snapshotId: string;
        planId?: string;
        confirm?: boolean;
    }): Promise<JsonValue>;
    /**
     * 手动推送同步（写远端）。密钥绝不明文进通道：
     * D4 起 includeSecrets 恒 false —— agent 传 true 直接拒绝（模型无权让凭据值上行）。
     */
    syncPush(input: {
        channel?: SyncTransportType;
        sections?: SectionId[];
        encrypt?: boolean;
        includeSecrets?: boolean;
        password?: string;
        force?: boolean;
    }): Promise<JsonValue>;
    /** 拉取差异预览（零写入：只下载 + analyze + plan 出差异报告）。解密密码同样优先取已存槽位（D3）。 */
    syncPull(input: {
        channel?: SyncTransportType;
        snapshotId?: string;
        strategy?: 'merge' | 'replace' | 'skipExisting';
        password?: string;
    }): Promise<JsonValue>;
    /**
     * 三方合并预览（只读）：下载远端快照 + 分类 + 出裁决清单，零写入。
     * 返回的 planId 是这份预览的指纹：config_sync_apply 必须带回来，落地前在锁内重跑预览比对。
     * 刻意不下发 localPreview / remotePreview / ancestorPreview —— 那是 GUI 逐键对比用的分段文本。
     */
    syncPreview(input: {
        channel?: SyncTransportType;
        snapshotId?: string;
        password?: string;
    }): Promise<JsonValue>;
    /**
     * 落地三方合并：必须带 config_sync_preview 返回的 planId（缺失/过期 → plan-*，零写入）。
     * 锁内重跑预览比对指纹 —— 预览后远端或本机变了就拒绝，不把旧裁决硬套到新盘面。
     */
    syncApply(input: {
        planId: string;
        resolutions: {
            id: string;
            action: string;
        }[];
        password?: string;
    }): Promise<JsonValue>;
    /**
     * 生成导入计划（只读）：分析归档 + 合并冲突决策 / 路径映射，零写入。
     * 加密归档直接拒绝 —— 解密需要密码，而密码不进 agent 面（该场景走 GUI 导入）。
     */
    importPlan(input: {
        zipPath: string;
        strategy?: 'merge' | 'replace' | 'skipExisting';
        resolutions?: Record<string, JsonValue>;
        pathMappings?: readonly {
            oldPrefix: string;
            newPrefix: string;
            appliesTo?: readonly string[];
        }[];
    }): Promise<JsonValue>;
    /**
     * 执行导入计划：必须带 config_import_plan 返回的 planId + confirm:true。
     * 执行前按存档决策重算计划比对指纹（归档被换 / 本机状态变了 → 拒绝，零写入）。
     */
    importApply(input: {
        planId: string;
        confirm?: boolean;
        rollbackOnError?: boolean;
    }): Promise<JsonValue>;
};
/** 把 9 个模型工具注册进 ctx.tools；tools 服务未组合时静默跳过（不崩溃）。 */
export declare function registerModelTools(ctx: Context, deps: ModelToolsDeps): void;
