import { type SessionFormatUnreadableUnit } from '../ui/session-format-disposition.ts';
import type { MsgFunc } from '../core/messages.ts';
import type { ImportPlan, SessionFormatDisposition } from '../core/types.ts';
/**
 * 解析本次请求的处置：请求体 > 插件级配置项（ui-prefs.json）> 缺省 `abort`。
 *
 * 为什么请求体优先：决策权在界面（用户当场选的三选一）；插件级配置项只服务不带该字段的
 * 调用方（脚本 / 第三方客户端 / 老客户端），它读不到时的缺省必须是安全侧的 abort ——
 * 默认放过会让用户在没看清的情况下丢对话。
 */
export declare function resolveSessionFormatDisposition(syncDir: string, raw: unknown): Promise<SessionFormatDisposition>;
/** 阻断响应体（409；`unreadable`/`target` 供界面渲染阻断态，无需再读一遍归档）。 */
export interface SessionFormatAbortBody {
    code: 'sessionFormatUnsupported';
    error: string;
    unreadable: SessionFormatUnreadableUnit[];
    target: number;
}
/**
 * abort 处置的守卫：计划里含「本机读不了的会话」时，**在任何写入之前**返回阻断体。
 *
 * 调用点必须在真正落盘之前（/plan 计划生成后、/execute 执行前、同步 preview/apply 前）：
 * abort 的语义是「零写入」，晚一步拦就等于没拦。
 */
export declare function sessionFormatAbortResponse(plan: ImportPlan, disposition: SessionFormatDisposition, msg: MsgFunc): SessionFormatAbortBody | null;
