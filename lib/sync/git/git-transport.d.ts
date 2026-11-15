import { SyncTransportError } from '../transport.ts';
import type { SyncProbeResult, SyncRetryOptions, SyncSnapshot, SyncSnapshotMeta, SyncTransport, SyncTransportErrorOptions } from '../transport.ts';
import type { MsgFunc } from '../../core/messages.ts';
/** git 命令执行结果（code ≠ 0 = git 命令失败/退出非零） */
export interface GitExecResult {
    stdout: string;
    stderr: string;
    code: number;
}
/** 可注入的 git 执行器（测试 mock 用）；默认实现 = child_process.spawn promise 封装（超时杀进程树） */
export type GitExecFn = (cmd: string, args: string[], opts: {
    cwd?: string;
    timeoutMs?: number;
    env?: Record<string, string>;
}) => Promise<GitExecResult>;
/** 工作副本自检事实（issue #79）：origin 是否已跟随配置地址、有无未上行的本地提交。 */
export interface GitWorkDirFacts {
    /** 工作副本路径（本地路径，可回显） */
    path: string;
    /** `.git` 是否存在（false = 尚未 clone，或该目录不是 git 仓库） */
    exists: boolean;
    /** 当前 origin（读不出 → null） */
    origin: string | null;
    /** 单独配置的 push URL（未单独配置 → null） */
    pushUrl: string | null;
    /** fetch / push 地址是否都已跟随 repoUrl（读不出 origin → false） */
    match: boolean;
    /** 领先全部远端跟踪引用的本地提交数（读不出 → null） */
    ahead: number | null;
    /** 工作树是否有未提交改动（读不出 → null） */
    dirty: boolean | null;
    /**
     * 远端跟踪分支上的快照数（issue #104 建议 3）：`snapshots/` 与 `snapshots-encrypted/`
     * 下的直接子项数（目录，或加密通道的 <id>.json 文件）。它和 `ahead` 一起回答
     * 「本地领先 N 个提交、可远端从来没收到过快照吗」—— 那正是 issue #104 里
     * 远端两周一个字节都没收到、用户却以为在正常备份的现场。
     * 只有 detail 自检时给出；无远端跟踪分支 / 读不出 → null。
     */
    remoteSnapshots: number | null;
}
/** 清空自检缓存（测试隔离用；生产路径由 `withWorkdir` 逐 key 失效）。 */
export declare function clearInspectFactsCache(): void;
/** 凭据提供者：token 只从这里读取，绝不在任何地方持久化 */
export interface GitCredentialProvider {
    getToken(): Promise<string>;
}
export interface GitAuthor {
    name: string;
    email: string;
}
export interface GitTransportOptions {
    /** 远端私有仓库地址（https/ssh/本地路径）；token 绝不拼入此 URL */
    repoUrl: string;
    /**
     * 仓库内子目录前缀（issue #131，可缺省）：快照布局落在 `<subdir>/snapshots`、
     * `<subdir>/snapshots-encrypted`、`<subdir>/blobs`；空串/缺省 = 仓库根（历史行为）。
     * 多工具共用同一个私有备份仓库时，每个工具各占一个子目录。
     */
    subdir?: string;
    /** 本地 git 工作副本目录（不存在则创建；已 clone 则复用） */
    workDir: string;
    /** token 提供者（http(s) 远端必填；本地/ssh 远端不会被调用） */
    credentials: GitCredentialProvider;
    /** 单条 git 命令超时 ms；缺省 = 两条通道共用的 DEFAULT_SYNC_TIMEOUT_MS（120000，只放宽不收紧） */
    timeoutMs?: number;
    /** 幂等读操作（list/download 的 clone/pull）的网络重试参数；缺省 attempts=3、250ms 起指数退避 */
    retry?: SyncRetryOptions;
    /** 注入 exec（测试 mock 用）；缺省 = spawn 封装（超时杀进程树） */
    exec?: GitExecFn;
    /** 提交作者（写入远端历史），默认 DSH Config Sync <sync@dsh.local> */
    author?: GitAuthor;
    /** credential 用户名（GitHub PAT 用 oauth2），默认 'oauth2' */
    credentialUsername?: string;
    /** 消息翻译器（缺省 zh） */
    msg?: MsgFunc;
}
/**
 * git 通道错误：继承统一错误基类（kind / retryable / status 分类对上层可见）。
 * 分类口径见 transport.ts 的 classifyNetworkErrorText / classifyHttpStatus。
 */
export declare class GitTransportError extends SyncTransportError {
    constructor(message: string, opts?: SyncTransportErrorOptions);
}
/**
 * 默认 git 执行器：spawn + **进程树** kill（issue #122）。
 *
 * 为什么不再用 execFile：它的 timeout 只对 git.exe 自己发 SIGTERM，而真正在下包的是 git.exe 的子进程
 * （git-remote-https / git index-pack）。父进程被杀、孙进程继续写 tmp_pack_*，管道不关闭 ⇒ execFile 的
 * promise 连超时错误都可能不返回 ⇒ 上层「正在检查远端变更...」永久挂起，下一轮重试再起一份，最终 N 份
 * 并发下载同一个 pack。
 * 这里改为：POSIX 上 detached 起独立进程组，超时对**整组**发 SIGKILL；Windows 上 `taskkill /T /F`；
 * 无论 kill 是否成功，宽限期到点都带着已收集输出收尾 —— 绝不把「管道没关」变成上层无限等待。
 *
 * 导出仅供测试直接验证「超时 + 进程树 kill + 有界收尾」（issue #122 的验收面）。
 */
export declare const defaultGitExec: GitExecFn;
/** 实现 SyncTransport 的 git 通道。所有操作前 ensureRepo() 保证工作副本就绪，网络命令带凭据。 */
export declare class GitTransport implements SyncTransport {
    readonly type = "git";
    private readonly o;
    private repoReady;
    /** 该工作副本是否 partial clone（remote.origin.promisor）；null = 尚未判定（issue #122） */
    private partialClone;
    /**
     * 工作副本锁的可重入深度：list/upload/download/delete 都会经 ensureRepo → reconcileOrigin，
     * rebuildWorkDir → adoptRemoteHistory 也各自嵌套；外层入口持锁，内层直接跑。
     */
    private workdirLockDepth;
    private privateHint;
    /**
     * 最近一次 list() 里**读不出/解析失败**的密文快照文件与原因（issue #59）。
     *
     * 为什么不能只 console 或只吞掉：这份「跳过」正是用户看到的「推送成功但远端列表为空」
     * 的唯一线索。列表接口把它如实回传，让状态自洽（绝不静默失败）。
     */
    private readErrors;
    /** 存量工作副本的 sparse cone 是否已确认包含 latest/（issue #141；只补一次，不每次同步都重设） */
    private sparseConeCoversLatest;
    private readonly msg;
    /** repoUrl 是否为网络地址（本地目录仓库 == false）：决定要不要额外禁 file 传输（SEC-12）。 */
    private readonly networkRepo;
    /** 仓库内子目录前缀（'' = 仓库根）：快照布局、sparse 面与 adopt 判据都从它派生（issue #131）。 */
    private readonly subdir;
    constructor(options: GitTransportOptions);
    /** 最近一次 checkIsPrivate() 的结果；null = 尚未检查 */
    get isPrivateHint(): boolean | null;
    /** 最近一次列表里读不出来的远端快照（含原因）；供上层如实呈现，绝不静默 */
    get unreadableSnapshots(): readonly {
        file: string;
        reason: string;
    }[];
    /** 列出远端已有快照（按 createdAt 升序）。读取工作副本 snapshots/（明文散文件）
     *  与 snapshots-encrypted/（密文单文件）两个目录（先 pull 同步远端）。 */
    list(): Promise<SyncSnapshotMeta[]>;
    /** list 的实体；**调用方必须已持有工作副本锁** */
    private listLocked;
    /**
     * 上传快照：写散文件目录（明文）或密文单文件（加密）→ add → commit → push；
     * 同 id 覆盖；内容无变化时幂等（不产生 commit）。
     * 双形态互斥：同 id 从一种形态切到另一种时先清掉旧形态残留，保证工作副本/远端布局自洽。
     */
    upload(snapshot: SyncSnapshot): Promise<SyncSnapshotMeta>;
    /** upload 的实体；**调用方必须已持有工作副本锁** */
    private uploadLocked;
    /**
     * 空文件类分区的 git 占位文件（git 不跟踪空目录）：
     * 占位文件不参与 manifest.sectionHashes（基于传入数据计算）；读回时按名+内容过滤。
     */
    private writeEmptyFileSectionPlaceholders;
    /**
     * 写 `latest/` 派生视图（issue #141）：与 `snapshots/<id>/` 逐文件同布局，manifest 里保留**真实快照 id**
     * （反向识别用）。返回本轮是否真的重建 —— false = 远端已有更新的视图，保持不动。
     *
     * 为什么按整份快照重写而不是拷目录：布局只有 layout.ts 一处权威，重写不会漏掉新增/删除的分区与占位文件；
     * 外置分区只写引用文件（字节在共享 blobs/ 里按内容寻址，不重复落盘、不重复上传）。
     */
    private writeLatestMirror;
    /**
     * 存量工作副本的 sparse-checkout 面是**旧版本**建的（不含 `latest/`）：cone 之外的路径 `git add` 会
     * 拒绝入索引（"outside of your sparse-checkout definition"）⇒ 派生视图永远推不上去。
     * 首次写 latest/ 前把 cone 补齐一次（克隆时 syncDirs() 已含它，新副本不会走到这里）。
     *
     * 非 sparse 副本（老 git 回落全量 clone）无需处理；读不出配置一律按「无需处理」走，绝不因优化失败。
     */
    private ensureSparseConeCoversLatest;
    /** 下载快照完整载荷。明文 → 读回散文件目录；加密 → 读回密文单文件。不存在的 id 必须抛错（契约）。 */
    download(id: string): Promise<SyncSnapshot>;
    /** download 的实体；**调用方必须已持有工作副本锁** */
    private downloadLocked;
    /** 删除远端快照（明文散文件目录或密文单文件；不存在视为成功，契约）。 */
    delete(id: string): Promise<void>;
    /** delete 的实体；**调用方必须已持有工作副本锁** */
    private deleteLocked;
    /**
     * 私有仓库可见性探测（结果缓存于 isPrivateHint）：
     * 匿名 ls-remote 成功 → 公开；匿名失败 + 凭据探测成功 → 私有；两者都失败 → 抛错。
     * UI 层可用 isPrivateHint 提示「私有仓库推荐」；公开仓库也可用（内容需自行评估）。
     */
    checkIsPrivate(): Promise<boolean>;
    /**
     * 连通性探针（cloud-sync 借鉴项 ②）：只读自检「远端可达 + 凭据可用」。
     *
     * 为什么复用 ls-remote：它不需要工作副本、不写任何本地状态，而且正是 clone/fetch 之前的那一步 ——
     * 远端不可达 / 令牌失效 / SSH 主机密钥不信任都会在这里显式失败（checkIsPrivate 抛可操作文案），
     * 因此结论与随后真正同步时的成败**同源**。
     * 刻意**不**统计远端快照数：那要先 fetch 工作副本（对本地有写入），超出「只读自检」的范围 ——
     * 宁可不报，也不报一个会误导的 0。
     */
    probe(): Promise<SyncProbeResult>;
    /**
     * 在「工作副本锁」下执行 fn（同一 sync/work 的 git 操作串行化；跨进程同理）。
     *
     * 为什么：并发驱动同一个工作副本会让 `git pull --ff-only` 在 FETCH_HEAD 里留下多行 for-merge
     * 记录，随后每个 pull 都以 `fatal: Cannot fast-forward to multiple branches.` 失败 ——
     * 该失败在自动同步里落在 intent journal 内 ⇒ durable SAFE MODE（真机 incident，2026-10-23）。
     * 并发 add/commit 还会撞 index.lock。锁的实现与理由见 ../../utils/workdir-lock.ts。
     *
     * 可重入：内层（ensureRepo/pullFromRemote/adoptRemoteHistory 等）不重复取锁。
     */
    private withWorkdir;
    private ensureRepo;
    /**
     * 补写工作副本的提交身份（best-effort；只补**缺失**的键，绝不覆盖用户自己配的值）。
     *
     * 为什么需要：git 的提交身份是「仓库级 or 全局」二选一，本插件只写仓库级（不改用户全局配置）。
     * 一旦这个工作副本被别人重建、被 relink、或在没配全局身份的机器上首次同步，仓库级键就没了 ——
     * 之后每次 commit 都 exit 128，而错误面在用户那里只剩一句「备份已跳过」。
     *
     * 纪律：探测（git config --get）失败 → 当作「不知道」而不写（不拿猜测覆盖用户配置）；
     * 写入失败 → 静默放过（不是同步失败）。真缺身份时下一条 commit 仍会以 kind='config'
     * 的可操作文案失败，并且**不再升级 SAFE MODE**（见 raiseGitFailure 的 localOnly 标记）。
     */
    private ensureCommitIdentity;
    /**
     * 工作副本是按哪个子目录前缀建的（issue #131）：读 git 本地配置 `dsh.syncSubdir`。
     * null = 键不存在 ⇒ 本功能上线前建的工作副本，布局 = 仓库根（历史行为）。
     */
    private readStoredSubdir;
    /** 写入布局身份标记（issue #131）：git 本地配置 + 同步更新进程内缓存。 */
    private writeLayoutMarker;
    /**
     * 布局身份校验（issue #131）：工作副本建好时的前缀必须与当前配置一致。
     *
     * 为什么必须显式报错而不是「照常同步」：sparse-checkout 只在首次 clone 生效 —— 前缀换了以后，
     * 旧工作副本里根本没有 `<新前缀>/` 这棵树，pull 成功、list 读空，用户看到的是
     * 「远端没有快照」。这条错误把出口指回既有的「重建工作副本（重新克隆）」。
     */
    private assertLayoutMatches;
    /**
     * 首次 clone（issue #122）：partial clone + sparse-checkout，只落地同步内容。
     *
     * 为什么：同步仓库可能比同步内容大几个数量级（报告者现场 1.8 GB 仓库 / 6 MB 内容）。此前 `git clone`
     * 全量落地，之后每次 fetch 还要拉完整对象图 ⇒ 一次「检查远端变更」就下几百 MB。
     * `--filter=blob:none` 只取 commit+tree，`--no-checkout` 先不落地任何文件，
     * `sparse-checkout set --cone <三个目录>` 之后 checkout 只 materialize 这三个目录的 blob。
     *
     * 老 git 不认这些选项（unknown option）时回落全量 clone —— 行为与修复前完全一致，绝不因优化失败。
     */
    private cloneIntoWorkDir;
    /**
     * 该工作副本是不是 partial clone（`remote.origin.promisor=true`）。
     *
     * 只有 partial clone 才能给 fetch 加 `--filter=blob:none`：对普通全量副本加过滤会让后续 checkout
     * 拿到缺失的 blob。存量副本（1.8 GB 那种）因此只受益于 ls-remote 短路与 `--no-tags`，不会被改坏。
     */
    private isPartialClone;
    /** 拉取姿态：partial clone 保持 blob 过滤；同步仓库不需要 tag（issue #122） */
    private fetchOptionFlags;
    /** 远端分支当前的 sha（ls-remote 只取一行 refs）；读不到 → null（短路是优化，失败一律回落正常 fetch） */
    private lsRemoteBranchSha;
    /** 解析引用指向的 sha；读不到 / 不是 sha → null */
    private revParseSha;
    /**
     * 让工作副本的 origin 与配置的 repoUrl 保持一致（issue #79）。
     *
     * 幂等：地址已一致时**一条写命令都不发**（只读 get-url）。三条边界：
     *  - 读不出 origin（无该 remote）→ `remote add origin`，否则 `push -u origin` 永远失败；
     *  - 读得出但为空串 → 视为「读不到」，**不改写**（不拿不确定的读取结果去覆盖用户的仓库配置）；
     *  - push URL 可被单独配置（`git remote set-url --push`）→ 不一致时一并跟随，否则推送仍走旧地址。
     */
    private reconcileOrigin;
    /**
     * ssh 远端的主机提示（issue #79 主机密钥错误文案用）；非 ssh 或解析不出 → 空串。
     * 只回传 host[:port]（不含用户名与仓库路径），地址由调用方经 mask() 处理。
     */
    private sshHostHint;
    /**
     * 工作副本自检（issue #79，只读）：origin / push URL 是否已跟随 repoUrl。
     *
     * **默认只做 2 条本地只读命令**（get-url ×2，毫秒级）——它挂在 `GET /sync/status` 上，
     * 每次打开面板都会跑；`rev-list`/`status` 在大工作副本（会话 blob 上千文件）上会明显变慢，
     * 因此放进 `detail: true`（供「重建工作副本」前评估数据量等场景显式索取）。
     */
    inspectWorkDir(opts?: {
        detail?: boolean;
    }): Promise<GitWorkDirFacts>;
    private inspectWorkDirLocked;
    /**
     * 重建工作副本（issue #79 / #104 的自救入口）：
     *  - `relink`：只把 origin / push URL 重新指向 repoUrl（**非破坏性**：不碰工作树与本地提交）；
     *  - `adopt`：把远端分支**合并进**现有工作副本（issue #104：换成另一个仓库、或远端历史被重写后，
     *    两条历史不相交，`pull --ff-only` 永远失败；这里合并后本地提交一条都不丢，可 revert）；
     *  - `reclone`：删除工作副本目录后重新 clone（**丢弃未上行的本地提交**；调用方必须先让用户确认）。
     *
     * 安全边界：`reclone` 只在目录**确实是 git 工作副本**（有 .git）时才删；目录非空且无 .git
     * 一律拒绝（与 ensureRepo 同一句 workDirNotRepo）—— 绝不删来路不明的目录。
     */
    rebuildWorkDir(mode: 'relink' | 'adopt' | 'reclone'): Promise<void>;
    private rebuildWorkDirLocked;
    /**
     * 采纳远端历史（issue #104）：把远端分支合并进现有工作副本，解开「换了仓库 / 远端历史被重写」
     * 之后 `pull --ff-only` 的死结（真机形态：`+ 8e87c0c...dc69fc7 main (forced update)` 后
     * `fatal: Not possible to fast-forward, aborting.`）。
     *
     * 为什么 merge 而不是 issue 里建议的 `rebase --root --onto`：
     *  - rebase 会**改写本地提交**（sha 全变），出问题时无法 revert，中途失败还留下 detached HEAD
     *    与 .git/rebase-merge 目录，状态比失败前更难收拾；
     *  - merge 只多一个 merge commit，`git revert -m 1` 可原路退回，冲突时 `merge --abort`
     *    能干净回到起点（真机裸仓验证：冲突 abort 后无 MERGE_HEAD、工作树零改动）。
     *
     * 三条安全边界（宁可不做，也不把别人的仓库合进来）：
     *  ① 工作树必须干净 —— 有未提交改动时合并会把用户改动卡在冲突里；
     *  ② 远端分支顶层只允许快照布局（snapshots / snapshots-encrypted / blobs）—— 否则这是个
     *     「另有用途的仓库」，合并等于把它整个搬进工作副本；
     *  ③ 远端必须存在同名分支 —— 远端是空仓库（没有任何分支）时视为没什么可采纳，正常返回
     *     （后续 push 会自己建分支）；有分支但名字对不上则拒绝猜，把远端分支名列出来。
     */
    private adoptRemoteHistory;
    /**
     * adopt 合并冲突里只放行 latest/（issue #141）：派生视图两侧内容不同不算真冲突 ——
     * 以远端的版本收敛（合并方向 origin/<branch> 即 theirs），其它路径一律不放行。
     * 返回 false 表示冲突面不止 latest/，调用方必须 abort。
     */
    private resolveLatestOnlyMergeConflict;
    /**
     * pull --ff-only 同步远端；无本地提交（全新仓库）或无 upstream 时静默跳过。
     * opts.retryable=true（仅 list / download 等**幂等读**路径传）：瞬时网络故障走有限指数退避重试。
     * 写路径（upload / delete）不传 → 一次即止（push 有远端副作用，重试可能造成重复写入）。
     */
    private pullFromRemote;
    /** 当前分支名；detached HEAD 返回 ''（此时不存在 upstream 语义）。 */
    private currentBranch;
    /**
     * 把 fetch / merge 的失败归一成可操作错误（与旧 pull 的归类逐条对齐）：
     * 主机密钥 → 教用户怎么信任主机；历史分叉 → 给「改回地址 / 重建工作副本」出口；其余交给统一分类器。
     */
    private throwPullFailure;
    /**
     * 执行 git 命令；withCredential=true 时注入 credential helper（token 不进 argv），失败时错误消息脱敏。
     *
     * opts.requirePushToken：这条命令是**推送**，http(s) 远端必须有令牌 —— 在发起 git 之前就给出可操作错误。
     * 为什么必须预检（真机）：公开仓库的 fetch 可以匿名完成（**拉取成功**），而 push 必须认证 —— 没配令牌时
     * 用户拿到的是 git 的 exit 128「Invalid username or token」，既分不清「没配令牌」还是「令牌失效」，
     * 还会在本地留下一个已提交却推不上去的快照。
     */
    private runGit;
    /**
     * 把「git 退出非零」归一成可操作错误（runGit 与 clone 回落共用同一套文案与分类）。
     * token 只用于脱敏，绝不进 message。
     */
    private raiseGitFailure;
    /**
     * 为网络命令构造 credential helper 参数：
     * 仅 http(s) 远端需要 token；本地路径 / ssh 走 git 原生认证（密钥），不调用 provider。
     * token 写入 os.tmpdir() 下临时 store 文件（权限 0600），命令后立即删除 —— 永不落工作副本/远端。
     */
    private buildCredentialArgs;
    /** 从 repoUrl 提取 credential 匹配用的 host[:port] */
    private repoHost;
    /** 读取一次 token（错误消息脱敏用）；非 http(s) 场景返回空 */
    private readTokenOnce;
    /**
     * 回传体里的地址（工作副本自检的 origin / pushUrl）脱敏：只剥「凭据段」，其余原样保留。
     *
     * 为什么不整串换占位符：状态面板要显示「工作副本现在指向哪个远端」，用户靠 host/path 判断是否
     * 已跟随配置。为什么不一律剥 userinfo：`ssh://git@host` 里的 `git` 是 ssh 登录名（标准写法），
     * 剥掉会让用户认不出自己的远端 —— 与 validateRepoUrl 的口径保持一致（只有 password 位是凭据）。
     */
    private bareUrl;
    /** 错误/日志脱敏：token（原文与 URL 编码两种形态）与 repoUrl 一律替换 */
    private mask;
    /**
     * SSH 主机密钥失败的**可操作**文案（issue #79）。有 host 提示时带上 host[:port]；
     * 解析不出主机（异常地址）走无主机变体，绝不把解析失败的地址硬塞进文案。
     */
    private hostKeyMessage;
    /** 子目录前缀下的同步布局相对路径（'' 前缀 = 历史布局，逐字不变）。 */
    private relDir;
    /**
     * 四个同步根目录（带前缀，含只读派生视图 latest/）：sparse 面、add 路径、adopt 判据都从这里取 ——
     * 任何一处漏加前缀都会让「写入 A、读取 B」（issue #131 的失败面）。
     */
    private syncDirs;
    private blobsDir;
    /**
     * git 通道的 blob 仓实现：工作树内 `blobs/<sha256>`（跨快照共享、按内容寻址）。
     * put 幂等（已存在即跳过）—— 这正是「未变会话不再重传/重写」的落点。
     */
    private blobSink;
    /**
     * blob 仓 GC（P1-4）：扫描**仍存在**的快照目录里的 <section>.blobs.json，删除无人引用且
     * 超过保护窗口的 blob。任何引用文件读不出来 → **本轮直接放弃**（宁可留垃圾，不可删在用的）。
     * best-effort：失败不影响调用方（删除快照本身已成功）。
     */
    private gcBlobStore;
    private assertSafeId;
    private snapshotDir;
    private snapshotsDir;
    /** 明文最新快照的只读派生视图目录（<workDir>/latest/；配了前缀则在 <subdir>/latest/） */
    private latestDir;
    /** 加密快照密文单文件目录（<workDir>/snapshots-encrypted/；配了前缀则在 <subdir>/ 下） */
    private encryptedSnapshotsDir;
    /** 加密快照密文单文件路径（<id>.json） */
    private encryptedSnapshotFile;
    /**
     * 读密文单文件快照（解析失败 → null，调用方跳过，不静默失败整体 list）。
     *
     * issue #59：解析失败**必须留下原因**。此前 catch 把一切吞掉，`list()` 再静默 `continue`，
     * 于是「push 报成功 + 远端列表为空 + download 报损坏」这种自相矛盾状态用户无从自查。
     * 现在把原因记进 `readErrors`，由路由层回传（列表里同时给出 currentSnapshotId 的语境）。
     */
    private readEncryptedSnapshotFile;
    /** 读快照目录 manifest.json（结构不合法 → null，调用方跳过） */
    private readDirManifest;
}
