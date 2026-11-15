/**
 * 宿主斜杠命令 /rollback（别名 /rw）—— 不打开设置面板也能回退（对齐 dsh-rewind 的 /rewind、/undo）。
 *
 * 语义（用户 2026-10-12 确认方案 A）：
 *   /rollback            → 当前**会话**的可回退点列表（回合号 / 时间 / 类型 / 状态 / 可回退性）
 *   /rollback <id>       → 回退到该点，走**与 HTTP 路由同源**的那道写入门：
 *                          runWithMutationLock（= SAFE MODE 门 + 跨进程/跨 kind 环境锁）
 *                          → 引擎 preview（零写入）→ 引擎 rewind（userConfirmed=true）
 *   引擎回的 confirmation-required / protected-point / record-incomplete 一律翻成可读错误结果，
 *   **绝不绕过**（命令入口没有「确认按钮」，用户敲下 id 就是那次确认；其余门照旧全量生效）。
 *
 * 纪律（与 src/core/model-tools.ts 的 registerModelTools 同口径）：
 *  · 命令服务**惰取**：一律 ctx.get('commands')，绝不属性访问 ctx.commands、绝不放进 inject ——
 *    未组合该服务的部署必须照常启动（命令是可选能力，不是硬依赖）；
 *    **读的时机是装配期一次**（见 registerRollbackCommand）：Cordis 的 ctx.get 在 apply 期只能拿到
 *    **已 apply** 的服务，所以 `commands` 行晚于本插件时 `/rollback` 不会注册（只 warn 一行、无重试入口）。
 *    DSH 内置插件与本插件的实际 apply 顺序**未坐实**（asar 不可直接读、本机 profile 无相关行）；
 *    要彻底消除这个窗口需要 `ctx.inject(['commands'])` 式的「服务就绪再注册」回调 —— 未做，如实记在这里。
 *  · 注册失败只 warn：命令挂不上不得影响其它装配（宿主启动 = blocker）；
 *  · 用户可见文案一律走宿主字典 engineMsg（key: command.rollback.*），**取文案那一刻**解析语言；
 *  · 本模块不 import @deepseek-ai/dsh-commands 的运行时值（只做结构化窄化），core 保持与 DSH 解耦。
 */
import type { MutationLockPort } from '../utils/env-lock.ts';
import type { RollbackPointSummary, RollbackRewindResult } from './rollback-point.ts';
/**
 * 命令结果（与 @deepseek-ai/dsh-commands 的 `CommandResult` **逐字同形**）。
 *
 * 为什么在这里自己声明而不是 import 那门包的类型：`src/core/**` 的架构边界（tests/architecture-boundaries.test.ts
 * 的 core allow 表）只允许 node 内置 / core 内部 / schema / utils / security / migrations / js-yaml ——
 * `@deepseek-ai/*` 仅允许出现在 `src/index.ts` 与 `src/client/`。core 必须保持与 DSH 解耦，
 * 所以这里做**结构化窄化**；两边一旦漂移，`command-rollback.test.ts` 的编译期断言会红。
 */
export type CommandResult = {
    readonly kind: 'success';
    readonly text?: string;
} | {
    readonly kind: 'error';
    readonly text: string;
};
/** 命令名（无前导斜杠）与别名。 */
export declare const ROLLBACK_COMMAND_NAME = "rollback";
export declare const ROLLBACK_COMMAND_ALIAS = "rw";
/**
 * 命令定义 id：/rw 别名是**第二条定义** —— 同一个 definitionId（客户端按 definitionId 做身份化行为，
 * 别名与主名必须被视作同一条命令）。
 */
export declare const ROLLBACK_COMMAND_DEFINITION_ID = "dsh-config-manager/rollback";
/** 命令服务惰取回调（调用期读 ctx.get('commands')；未组合返回 undefined）。 */
export type CommandServiceReader = () => CommandServiceLike | undefined | null;
/** 一条已注册命令的最小形状（避免把 DSH 类型变成本插件的硬依赖）。 */
export interface CommandDefinitionLike {
    readonly name: string;
    readonly description: string;
    readonly definitionId?: string;
    readonly input?: {
        readonly hint: string;
        readonly attachments?: boolean;
    };
    readonly handler: (invocation: CommandInvocationLike) => CommandResult | Promise<CommandResult>;
}
/** 一次命令调用的最小形状（只读用到的字段）。 */
export interface CommandInvocationLike {
    readonly agent: unknown;
    /** 命令名之后的原文（含分隔空白）。 */
    readonly rawInput: string;
    /** 派发 UI 持有的取消信号（透传给回退执行）。 */
    readonly signal?: AbortSignal;
}
/** 命令服务的最小形状（ctx.get('commands') 的结构化窄化）。 */
export interface CommandServiceLike {
    register(definition: CommandDefinitionLike): unknown;
}
/** 宿主提供的回退能力（由 src/index.ts 装配；测试用假的实现即可）。 */
export interface RollbackCommandHost {
    /** 当前 agent 所属会话（拿不准则 ok:false —— 绝不猜）。 */
    agentSession(agent: unknown): AgentSessionFacts;
    /** 列出该会话的回退点（含存储栈状态；只读）。 */
    list(sessionId: string): Promise<RollbackCommandListResult>;
    /**
     * 执行回退：runWithMutationLock → SAFE MODE → 引擎 preview → 引擎 rewind。
     *
     * 被 SAFE MODE / 环境锁挡住时**抛 EnvironmentLockUnavailableError**（与 HTTP 路由同口径），
     * 由本模块翻成可读错误结果。
     */
    rewind(input: RollbackRewindExecution): Promise<RollbackRewindResult>;
}
/**
 * 回退执行入参。
 *
 * 只带 id + 取消信号：引擎 `rewind({ id, userConfirmed: true })` 的**写入面**已经由该点的记录
 * 决定（不是调用方临时指定路径），多传会话/分块只会制造「两处口径」；会话事实只供只读列表过滤用。
 */
export interface RollbackRewindExecution {
    readonly id: string;
    readonly signal?: AbortSignal;
}
/** 列表结果（引擎 RollbackListResult 的可测子集）。 */
export interface RollbackCommandListResult {
    ok: boolean;
    storage: {
        available: boolean;
        root: string;
        detail?: string;
    };
    points: readonly RollbackPointSummary[];
    error?: string;
}
/** 当前 agent 的会话事实（宽进严出：形状不符即 ok:false）。 */
export type AgentSessionFacts = {
    ok: true;
    sessionId: string;
    chunks: readonly string[];
} | {
    ok: false;
    detail: string;
};
/** 绝对路径判定（win32 盘符 + POSIX 前缀 + UNC；纯函数，不引 node:path）。 */
export declare function isAbsolutePath(value: string): boolean;
/**
 * 从 agent 窄化会话事实。
 *
 * **不猜**：agent.session.id 读不出来就退回 agent.id（DSH 的 Agent.id 就是会话 id）；
 * 两者都读不出 → ok:false（命令如实报「拿不到当前会话」，而不是列全网的点）。
 * 工作区分块只认**绝对路径**的 cwd（与 rollbackSessionBindingOf 同一口径）。
 */
export declare function agentSessionFactsOf(agent: unknown): AgentSessionFacts;
/** 解析结果：空输入 = 只读列表；单个 token = 目标点 id；其余 = invalid。 */
export type RollbackCommandInput = {
    kind: 'list';
} | {
    kind: 'rewind';
    id: string;
} | {
    kind: 'invalid';
    detail: string;
};
/**
 * 解析 rawInput（命令名之后的原文，含分隔空白）。
 * 语法只有两种：空 = 列表；单个非空 token = 目标 id。多 token 一律 invalid。
 */
export declare function parseRollbackCommand(rawInput: string): RollbackCommandInput;
/** 渲染只读列表（本会话没有点时给「本会话没有」，绝不冒充「全库为空」）。 */
export declare function renderRollbackList(result: RollbackCommandListResult, sessionId: string): CommandResult;
/** 把引擎结果翻成命令结果（失败一律带机器码 + 技术细节；processed 的段事实不隐藏）。 */
export declare function renderRewindResult(result: RollbackRewindResult, id: string): CommandResult;
/** 命令依赖（index.ts 装配；测试直接构造）。 */
export interface RollbackCommandDeps {
    readonly host: RollbackCommandHost;
    /** mutation lock 端口（index.ts 传 host.mutationLock；测试可传 undefined 或假端口）。 */
    readonly mutationLock?: MutationLockPort;
    /** SAFE MODE 同步谓词（与 HTTP 路由同一份 host.safeModeIsBlocked）。 */
    readonly isBlocked?: () => boolean;
}
/**
 * 构造命令处理器（**纯编排**：不注册、不读 ctx）。
 *
 * 带参数时：parser → agentSession（只用于「这次是不是列表」的会话判定）→ host.rewind。
 * host.rewind 内部才是那道门：runWithMutationLock → SAFE MODE → 引擎 preview → 引擎 rewind
 * EnvironmentLockUnavailableError（SAFE MODE / 环境锁被挡）在此翻成可读错误结果。
 * 任何未预期异常也翻成错误结果 —— 命令处理器抛异常会让整条命令生命周期报泛化失败，
 * UI 只看到一句「失败」；这里如实把原因说清楚。
 */
export declare function makeRollbackCommandHandler(deps: RollbackCommandDeps): (invocation: CommandInvocationLike) => Promise<CommandResult>;
/** 注册所需的依赖面（命令服务惰取回调 + 宿主日志 + 命令依赖）。 */
export interface RollbackCommandRegistrationOptions {
    /** 惰取命令服务：实现必须是「调用期」的 ctx.get('commands')（绝不属性访问、绝不进 inject）。 */
    readonly readCommands: CommandServiceReader;
    readonly deps: RollbackCommandDeps;
    /** 只 warn：注册失败/服务缺失不得影响其它装配。 */
    readonly log?: {
        warn(message: string, meta?: unknown): void;
    };
}
/**
 * 注册 /rollback 与 /rw（两条定义 = 同一 definitionId）。
 *
 * 服务缺失 → warn 后**安静返回**（未组合 commands 的部署照常启动、不抛错）；
 * 服务存在但 register 抛错 → warn（其余装配不受影响）。
 * @returns 反注册函数（重复调用安全）。
 */
export declare function registerRollbackCommand(options: RollbackCommandRegistrationOptions): () => void;
