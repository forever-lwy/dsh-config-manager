import type { DshPluginResult } from './plugin-cli.ts';
import type { SelfUpdateFailureCode } from '../utils/shared-constants.ts';
/** 目标安装 spec（钉住精确版本；单一拼接点，界面命令与 argv 恒等）。 */
export declare function selfUpdateSpec(version: string): string;
/** 计划输入（全部来自宿主：当前版本、检查结果、运行档案、profile 清单里的依赖 spec）。 */
export interface SelfUpdatePlanInput {
    /** 当前运行的插件版本（PLUGIN_VERSION） */
    current: string;
    /** 目标版本（来自 update-check 的 latest） */
    target: string;
    /** 当前档案名（host.profile） */
    profile: string;
    /** profile package.json 里本插件当前声明的依赖 spec；未安装 / 读不到 → undefined */
    installedSpec?: string | undefined;
}
/** 计划结果：可执行的 argv + 可复制命令，或带码的拒绝原因（码由界面映射本地化文案）。 */
export type SelfUpdatePlan = {
    ok: true;
    version: string;
    argv: string[];
    command: string;
} | {
    ok: false;
    code: SelfUpdateFailureCode;
    error: string;
};
/** 纯函数：校验一次自更新请求（零副作用；不读盘、不起进程）。 */
export declare function planSelfUpdate(input: SelfUpdatePlanInput): SelfUpdatePlan;
/** 注入式 runner（生产 = core/plugin-cli.ts 的 runDshPlugin；测试用桩，不真起子进程）。 */
export type SelfUpdateRunner = (profileDir: string, profile: string, pluginArgs: readonly string[], timeoutMs?: number, signal?: AbortSignal) => Promise<DshPluginResult>;
/** 执行依赖：runner + 目标 profile 目录（宿主注入，路由不自己拼路径）。 */
export interface SelfUpdateDeps {
    runner: SelfUpdateRunner;
    profileDir: string;
    profile: string;
    signal?: AbortSignal;
}
/** 执行结果：成功（需重启）/ 失败（带码 + 可读原因）。 */
export type SelfUpdateOutcome = {
    ok: true;
    version: string;
    command: string;
    needsRestart: true;
} | {
    ok: false;
    code: SelfUpdateFailureCode;
    error: string;
};
/** 执行已通过校验的计划：官方 CLI 通道安装，失败按 installErrorFor 归类（绝不静默）。 */
export declare function runSelfUpdate(plan: Extract<SelfUpdatePlan, {
    ok: true;
}>, deps: SelfUpdateDeps): Promise<SelfUpdateOutcome>;
