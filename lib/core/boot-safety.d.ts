import type { BundleResolver } from './boot-rescue.ts';
import type { MsgFunc } from './messages.ts';
/** 审计问题 id（稳定；测试与 UI 判定用，展示文本一律走 msg）。 */
export type BootSafetyIssueId = 'bundlesUnresolved' | 'bundlesUnresolvedUnfixed' | 'bundleListUnreadable' | 'criticalFileUnreadable' | 'criticalFileUnparsable' | 'patchFileMissing' | 'extraCheckFailed';
export interface BootSafetyIssue {
    id: BootSafetyIssueId;
    /** error = 可能直接导致 DSH 启动失败；warn = 需要用户知道但不阻断启动。 */
    severity: 'warn' | 'error';
    /** 已本地化的细节文本（非敏感：只有相对路径 / 包名 / 解析错误摘要）。 */
    detail: string;
    /** true = 本次已自动修正（盘面已改变，detail 里说明了改了什么）。 */
    fixed: boolean;
}
export type BootSafetyVerdict = 'safe' | 'repaired' | 'unsafe';
export interface BootSafetyReport {
    verdict: BootSafetyVerdict;
    issues: BootSafetyIssue[];
    /** 被剔除的 bundle（与救援模式同语义；空数组 = 未改动插件清单）。 */
    prunedBundles: {
        name: string;
        reason: string;
    }[];
    /**
     * 未能执行的检查（能力未注入）——如实告知。
     * **不得**把 unchecked 当作通过：verdict=safe 只代表「已执行的检查」全过。
     */
    unchecked: string[];
}
export interface BootSafetyDeps {
    /** 配置档案名（如 'web'）。 */
    profile: string;
    /** 读 home-relative（posix）文件文本；不存在返回 null。 */
    readText: (relPosix: string) => Promise<string | null>;
    /** 写 home-relative（posix）文件文本（仅在修正插件清单时需要）。 */
    writeText: (relPosix: string, text: string) => Promise<void>;
    /** bundle 可解析探测（宿主注入；与救援模式同一实现：只有严格 true 视为可解析）。 */
    resolveBundle: BundleResolver;
    /**
     * YAML 解析器（宿主注入 js-yaml 的 load）。不注入 → 跳过 YAML 可解析性检查并记入
     * unchecked（core 不 import js-yaml：保持引擎层零第三方依赖）。
     */
    parseYaml?: (text: string) => unknown;
    /** 附加检查（宿主可挂会话位置 / 工作区登记等专项检查）；抛错只记 unchecked。 */
    extraChecks?: () => Promise<BootSafetyIssue[]>;
    msg?: MsgFunc;
}
/**
 * 执行启动自洽审计。**绝不抛错**：任何单项失败转成 issue / unchecked。
 */
export declare function auditBootSafety(deps: BootSafetyDeps): Promise<BootSafetyReport>;
