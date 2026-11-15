import type { ForeignSourceContext } from '../foreign/registry.ts';
/** 构造来源上下文的输入（三个调用点各自把自己的「宿主事实」投影成这几项）。 */
export interface ForeignContextInput {
    /**
     * **用户 home**（六来源真值表的基准）。
     *
     * 刻意不接受「宿主 context 的 homeDir」——那个值是 \$DSH_HOME。调用方必须显式传用户 home，
     * 缺省由本函数回退 `os.homedir()`；这样「传错」在类型与命名上都是可见的，而不是静默走空。
     */
    userHome?: string;
    /** 进程环境快照（位置覆盖判定：CLAUDE_CONFIG_DIR / HERMES_HOME / CODEX_HOME / COPILOT_HOME） */
    env?: Readonly<Record<string, string | undefined>>;
    /**
     * 项目级真值位置（Cursor/Codex 的 <项目>/.cursor/**）。
     * **只在调用方明确知道用户的项目时传入**；缺省不传 = 不扫项目级（绝不拿宿主 cwd 当用户的项目）。
     */
    projectDir?: string;
    /** 目标机 DSH 的 SESSION_FORMAT_VERSION；缺省 = 不转码任何会话（内核如实报码，绝不猜版本） */
    targetSessionFormatVersion?: number;
}
/**
 * 唯一的来源上下文构造点（GET / POST / CLI 共用）。
 *
 * 三条纪律：
 *  · `homeDir` 恒为**用户 home**（不是 \$DSH_HOME）；
 *  · `projectDir` 为空串 / 未给 → 该键**不出现**（内核据此不扫项目级，而不是拿 '' 去拼路径）；
 *  · `targetSessionFormatVersion` 未给 → 该键不出现（内核据此逐条报 session-format-version-unknown，
 *    绝不擅自填一个默认版本 —— 那会把「本机读不了」的会话当成能读的写进去）。
 */
export declare function foreignSourceContext(input?: ForeignContextInput): ForeignSourceContext;
/**
 * 产物的**受控目录自检**：写出去的 bundle 必须落在受控暂存根之内。
 *
 * 这条断言的价值不是「防注入」（路径是我们自己拼的），而是把「受控目录约定」变成
 * **运行期不变量**：将来有人把 outPath 改成别的目录，这里立刻红，而不是静默把包写进用户配置区。
 *
 * 用 `+ path.sep` 而不是裸 `startsWith`：后者会让 `/tmp-evil` 通过 `/tmp` 的判定。
 */
export declare function isInsideStaging(outPath: string, roots: readonly string[]): boolean;
/** 来源 id 非法（未知 / 空）时给客户端的稳定码 —— 与 ForeignSourceError 的 code 同域。 */
export declare const FOREIGN_IMPORT_MISSING_SOURCE_CODE = "missing-source";
/** 一个分区都产不出来时的稳定码（绝不静默产空包：自检能过，用户却拿到什么都没有的包）。 */
export declare const FOREIGN_IMPORT_EMPTY_CODE = "nothing-to-import";
