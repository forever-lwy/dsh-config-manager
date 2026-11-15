import type { RescuePaths } from '../actions.ts';
/** 会话 cookie 名（HttpOnly + SameSite=Strict，仅本机回环使用）。 */
export declare const CONSOLE_SESSION_COOKIE = "dcm_rescue_session";
export interface ConsoleServerOptions {
    paths: RescuePaths;
    version: string;
    /** 监听端口；0 = 由内核分配（缺省） */
    port: number;
    /** 启动后是否自动打开浏览器（失败不影响服务） */
    openBrowser: boolean;
    /** 空闲多少毫秒后自动退出；<= 0 = 不自动退出 */
    idleTimeoutMs: number;
    io: {
        log: (line: string) => void;
        error: (line: string) => void;
    };
    /** 测试用：不注册进程信号处理器 */
    handleSignals?: boolean;
    /**
     * 退出方式：true（缺省）= 关服务后 process.exit(0)。
     * 为什么必须有：http server 关掉之后，进程仍持有 stdin/stdout 等句柄 → 事件循环不会排空，
     * 「空闲超时 / Ctrl+C 之后进程还活着、端口还在监听」是不可接受的。测试（进程内）传 false。
     */
    shouldSelfExit?: boolean;
}
export interface ConsoleServerHandle {
    /** 首页地址（不含 token） */
    url: string;
    port: number;
    /** 带一次性 token 的启动地址（只打印给当前终端） */
    bootstrapUrl: string;
    /** 服务关闭后 resolve（runWeb 靠它把进程留住） */
    closed: Promise<void>;
    close: () => Promise<void>;
}
/** 启动救急台并返回句柄（测试可直接用 port: 0）。 */
export declare function startConsoleServer(options: ConsoleServerOptions): Promise<ConsoleServerHandle>;
