/** 复验结论里的失败原因（机器可读；文案由调用方输出层决定）。 */
export type SessionVerifyReason = 
/** 能力不可用：没有 zstd / 找不到可信 catalog / import 失败 / 代际对不上 / 缺子会话事实 */
'unavailable'
/** 首帧不是「恰好一行 header」（官方 assertZstdHeaderFrame / parseHeaderRecord），或容器结构性不合法（撕裂/魔数/保留位） */
 | 'invalid-header'
/** createRestore 或某一行 decodeRow 失败（含官方迁移拒绝） */
 | 'decode-failed'
/** 全部行都喂完之后 finish() 失败 */
 | 'finish-failed';
export declare const SESSION_VERIFY_REASONS: readonly SessionVerifyReason[];
/** 解析台账里的旧字段用（台账记录来自 JSON 反序列化，形状不可信）。 */
export declare function isSessionVerifyReason(value: unknown): value is SessionVerifyReason;
/** 官方 restore 句柄（只用得到这两个方法）。 */
export interface SessionVerifyRestore {
    decodeRow(row: unknown): void;
    finish(): unknown;
}
/** 官方 catalog 的最小接口（判定口径固定为 strict + transformed / current）。 */
export interface SessionVerifyCatalog {
    createRestore(header: unknown, options: {
        recovery: 'strict';
        validation: 'transformed' | 'current';
    }): SessionVerifyRestore;
    /** 该 catalog 的现役代际（官方 createSessionFormatCatalog 装配时给；判定 equivalentToReadPath 要用）。 */
    currentVersion?: unknown;
}
export interface SessionVerifyOptions {
    /**
     * 显式 @deepseek-ai/dsh/package.json 候选（顺序即真伪顺序；给了就**只**试它，标签 anchor）。
     * 给了它 = 调用方声明「这就是本机权威候选清单」⇒「已装版本」也从它解析（不回落 profile 树）。
     */
    dshPackageJsonCandidates?: readonly string[];
    /**
     * 拉起本宿主的运行时锚（= src/index.ts 的 `profileContext.installAnchor`，优先级最高）。
     * 宿主侧拿到 profileContext 时必须传它：「已装版本」的权威解析第一顺位（V2-F2）。
     */
    installAnchor?: string;
    /** 显式直接子会话事实；缺省 = []（显式声明没有子会话）。 */
    children?: readonly unknown[];
    /** 注入 catalog（测试用）。传 null = 直接判 unavailable（不探测）。 */
    catalog?: SessionVerifyCatalog | null;
    /** asar 解包缓存根（可选注入）；缺省 `<os.tmpdir()>/dsh-cm-asar-codec`。 */
    asarCacheDir?: string;
    /** 缺省探测时的 home（给 <home>/profiles/** 候选）；缺省取 DSH_HOME 环境变量。 */
    homeDir?: string;
    /** 与 homeDir 搭配的档案名（有则插在 hoisted 树之前）。 */
    profile?: string;
}
/**
 * 复验结论。
 *
 * equivalentToReadPath 的语义（**不许曲解**）：true 当且仅当
 * header.version === catalog.currentVersion === 已装 DSH SESSION_FORMAT_VERSION ——
 * 即「DSH 的现役读盘路径此刻就能直接读它」。pre-v4 日志经迁移链还原成功时 verified:true 但
 * equivalentToReadPath:false（官方 resolveCurrentLog 对 < 本代返回 undefined）。未验证时恒 false
 * （含义是「没有任何可声称的现役等价」，不是「已证明不等价」）。
 * verified:true 时 strong/strongDetail 也只是额外信息，不参与判定。
 */
export type SessionVerifyResult = {
    verified: true;
    events: number;
    strong: boolean;
    strongDetail?: string;
    equivalentToReadPath: boolean;
    via?: 'asar-extract';
} | {
    verified: false;
    reason: SessionVerifyReason;
    detail?: string;
    equivalentToReadPath: false;
};
/**
 * 候选 @deepseek-ai/dsh/package.json → 待探测的 node_modules 根。
 *
 * 与 utils/session-format.ts 的 `sessionFormatRoots` **同一份实现**（单一事实源）：hoisted 同级 →
 * dsh/node_modules 嵌套 → pnpm 隔离 store（issue #74）。这里解的是同树 dsh-session-format-catalog，
 * 那里解的是同树 dsh-session 的格式常量 —— 布局推导只能有一处，否则同一个坑会换个入口复发。
 */
export declare function nodeModulesRootsFor(dshPackageJsonCandidates: readonly string[]): string[];
/**
 * 锚点候选清单（**公开视图**）：env-anchor（`DSH_CM_DSH_INSTALL`）→ runtime-anchor（拉起本进程的 runtime）
 * → profiles-tree（本机档案树）。与 `anchorPlans()` 的**同一份来源、同一顺序**。
 *
 * 调用关系（写清楚，避免「注释承诺 > 实际防线」）：缺省路径**不调用本函数** —— `resolveCatalog` 与
 * `resolveAuthoritativeVersion` 都直接吃 `anchorPlans()` 那张（标签 + 候选）计划表；本函数是同一份来源的
 * 扁平清单，供**需要显式传 `dshPackageJsonCandidates` 的调用方与诊断**使用（显式传它等于把整条锚点链
 * 换成这一份清单，标签统一为 `anchor`）。
 *
 *  ① env-anchor：<DSH_CM_DSH_INSTALL>/resources/app.asar/dsh/node_modules/…（用户显式给出的安装根）。
 *  ② runtime-anchor：<process.resourcesPath>/app.asar|app.asar.unpacked|app 下的 dsh/node_modules
 *     —— profileContext.installAnchor 在服务层（拿不到 profileContext 的地方）的进程内等价物。
 *  ③ profiles-tree：与 src/index.ts 的 dshPackageJsonCandidates 第 ②③ 条逐字同款：<home>/profiles/<profile>/、
 *     <home>/profiles/、<home>/profiles/web/。
 *
 * 顺序就是真伪顺序：真机实测「profile hoisted 树」是 web 档案装出来的旧副本（本机 0.1.5-rc.2），
 * 桌面端实际跑的是 app.asar 里的 0.2.0-rc.2 —— 所以锚点必须排在前面。
 */
export declare function defaultDshPackageJsonCandidates(homeDir?: string, profile?: string): string[];
/** 清空进程内缓存（测试隔离用）。 */
export declare function clearSessionVerifyCache(): void;
/**
 * 把「可能位于 asar 容器内的路径」拆成 <容器路径> + <容器内相对前缀>（POSIX）。
 * 只认以 `.asar` 结尾的路径段 —— `app.asar.unpacked` 不匹配（它的实体是普通目录）。
 */
export declare function splitAsarPath(p: string): {
    asarPath: string;
    innerPrefix: string;
} | undefined;
/**
 * 复验一份会话日志字节：**本机 DSH 的官方 codec 能不能把它读到底**。
 *
 * 判定口径固定 { recovery: 'strict', validation: 'transformed' }（= 官方现役读盘口径，选择 + 源码证据见文件头）；
 * validation: 'current' 只作为结果里的 strong / strongDetail 增强信息，**绝不影响判定**。
 * 任何能力缺失（没有 zstd / 找不到可信 catalog / 代际对不上 / 缺子会话事实）→ unavailable：
 * **绝不 throw，绝不宣称通过**。
 */
export declare function verifySessionLogBytes(bytes: Uint8Array, options?: SessionVerifyOptions): Promise<SessionVerifyResult>;
