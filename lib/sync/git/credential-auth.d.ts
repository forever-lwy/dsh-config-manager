/** 这条 git 失败是不是「credential helper 根本没能执行」（→ 值得改用 HTTP 认证头重试）。 */
export declare function isCredentialExecFailure(text: string): boolean;
/** 目录是否为空（读不到 = 非空：拿不准时绝不删东西，见 runGit 的 clone 重试）。 */
export declare function isEmptyDir(dir: string): Promise<boolean>;
/** 清空目录内容但保留目录本身（只用于「命令开跑前确认为空」的 clone 重试路径）。 */
export declare function clearDirContents(dir: string): Promise<void>;
/**
 * 构造「用 HTTP 认证头代替 credential helper」的子进程环境变量。
 *
 * - 顺带把 `credential.helper` 置空：否则全局 `.gitconfig` 里配的 helper 仍会被调用并再次 cannot exec。
 * - 明文 http 常被远端重定向到 https，而 git 是按**每条请求的 URL** 匹配配置的 → 两个前缀都挂一份。
 * - 返回空对象 = 注入不了（repoUrl 不是合法 URL，或令牌为空），调用方保持原有失败路径。
 */
export declare function credentialHeaderEnv(repoUrl: string, username: string, token: string): Record<string, string>;
