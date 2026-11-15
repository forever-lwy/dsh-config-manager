/** 被检查的 npm 包名（= package.json 的 name；单点常量，勿在别处再写一份） */
export declare const PLUGIN_NPM_PACKAGE = "@forever-lwy/dsh-config-manager";
/** registry 的 latest 端点（体积约数 KB，只取版本号） */
export declare const NPM_LATEST_URL = "https://raw.githubusercontent.com/forever-lwy/dsh-config-manager/release/package.json";
/** 网络超时（ms）：界面在等，宁可快速失败也不让按钮长时间转圈 */
export declare const UPDATE_CHECK_TIMEOUT_MS = 5000;
/** 进程内缓存时长（ms）：10 分钟 */
export declare const UPDATE_CHECK_CACHE_MS: number;
/** 响应体上限（字节）：latest 端点实测约 3 KB，超过一律视为异常（不把 registry 的大响应读进内存） */
export declare const UPDATE_CHECK_MAX_BYTES: number;
/** 检查成功的结果（无敏感字段；全部来自 npm 公开元数据） */
export interface PluginUpdateInfo {
    /** 当前运行的插件版本（PLUGIN_VERSION） */
    current: string;
    /** npm 上的 latest */
    latest: string;
    /** latest > current（严格大于；相同或更旧均为 false） */
    updateAvailable: boolean;
    /** 本次结论的时间戳（ms；缓存命中时为首次检查的时间） */
    checkedAt: number;
}
/** 检查结果：成功 / 失败（失败必须带原因，绝不静默当作最新） */
export type PluginUpdateResult = {
    ok: true;
    info: PluginUpdateInfo;
    cached: boolean;
} | {
    ok: false;
    current: string;
    error: string;
};
/**
 * 解析 registry 的 latest 响应体（只认 `{ version: 'x.y.z' }`）。
 * 畸形 / 缺字段 / 版本号不是 semver 形态 → null（调用方据此报「响应异常」，不猜）。
 */
export declare function parseLatestVersion(payload: unknown): string | null;
/**
 * 请求 URL 是否要求**绕过缓存**（`?force=1`）。
 *
 * 抽在这里而不是写在路由 handler 里：路由组文件会 import 宿主入口（拿 PLUGIN_VERSION），
 * 单测不宜把它整个拖进来；这个判定是纯字符串处理，放 core 可直接 node 测。
 * 只认精确的 `force=1`（`force=true`/`force=0` 一律不算，避免「随便带个参数就绕过缓存」）。
 */
export declare function wantsForcedUpdateCheck(url: string | undefined): boolean;
/** 一次网络探测的注入面（测试用桩；生产用全局 fetch 与 Date.now） */
export interface UpdateCheckDeps {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    cacheMs?: number;
    now?: () => number;
}
/** 探测结果（内部用）：成功给版本号，失败给原因 */
type ProbeResult = {
    ok: true;
    version: string;
} | {
    ok: false;
    error: string;
};
/**
 * 探测 npm latest（无缓存、无状态）。任何异常都被收成 `{ ok:false, error }`：
 * 网络错误 / 超时 / 非 2xx / 体积超限 / JSON 畸形 / 版本号形态不认识。
 */
export declare function probeLatestVersion(deps?: UpdateCheckDeps): Promise<ProbeResult>;
/**
 * 带进程内缓存的检查器（宿主侧单例；每次请求复用同一个实例）。
 *
 * 为什么要用类而不是模块级变量：route 组文件在注册时构造一次，测试可注入 `fetchImpl`/`now`
 * 独立驱动；模块级可变状态会让并发测试互相污染。
 */
export declare class UpdateChecker {
    private cached;
    private readonly current;
    private readonly deps;
    constructor(current: string, deps?: UpdateCheckDeps);
    /** 检查更新（缺省读缓存；`force` 绕过缓存重新探测） */
    check(opts?: {
        force?: boolean;
    }): Promise<PluginUpdateResult>;
}
export {};
