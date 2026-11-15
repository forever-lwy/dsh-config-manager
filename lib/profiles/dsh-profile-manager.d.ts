import { type AtomicIoSync } from '../utils/atomic-write.ts';
import { type DshProfileCopyMarker, type DshProfileCopyWarning, type DshProfileDetail, type DshProfileErrorCode, type DshProfileIncompleteCopy, type DshProfileMeta } from './dsh-profile-shared.ts';
/** DSH home 下的 profile 根目录名（与 dsh-app-boot 的 PROFILES_DIR 一致）。 */
export declare const PROFILES_DIR = "profiles";
/** profile 的用户 patch 层文件名（与 dsh-app-boot 的 PROFILE_PATCH_FILENAME 一致）。 */
export declare const PROFILE_PATCH_FILENAME = "cordis.patch.yml";
export declare class DshProfileError extends Error {
    readonly code: DshProfileErrorCode;
    constructor(code: DshProfileErrorCode, message?: string);
}
export interface DshProfileManagerOptions {
    /** DSH home（`$DSH_HOME`，宿主 resolveDshHome() 解析） */
    homeDir: string;
    /** 插件 dataDir（保留给调用方复用；本引擎不再落任何状态） */
    /** 当前运行中的 profile 名（惰性读取，宿主注入） */
    currentProfile?: () => string;
    /**
     * 「复制进行中标记」那一次写盘用的可注入同步 io（缺省 undefined = 真实 fs）。
     *
     * 只给单测用：Windows 上造不出「目录建好、标记写不出来」的真实故障（写完立刻腾空间就失败了），
     * 而这条窄缝恰恰会留下既不在 list() 里、remove() 又报 notFound 的空目录。
     */
    markerIo?: AtomicIoSync;
}
/**
 * t89：残留枚举结果 —— `unreadable` 让「枚举失败」与「确实没有残留」可区分；
 * `reason` 仅为诊断码（非用户文案，界面文案走字典键）。
 */
export interface DshProfileIncompleteCopiesScan {
    copies: DshProfileIncompleteCopy[];
    unreadable: boolean;
    reason: string | null;
}
/** t89：profiles 根目录枚举失败的原因码（诊断/日志用）。 */
export declare const PROFILES_ROOT_UNREADABLE = "profiles-root-unreadable";
/**
 * 复制失败时回滚目标目录（cross-F3 收尾 / tech-debt #5）。
 *
 * **顺序即不变量：先删内容，标记留到最后。** 标记（`.dcm-copy-in-progress.json`）是「这个目录是半截副本」
 * 的唯一证据 —— `listIncompleteCopies()` 只认它，`requireManagedDir` 也只认它，没有 package.json
 * 又没有标记的目录既不进列表、删除还报 notFound（孤儿）。
 *
 * 此前 catch 里是一把 `rm(recursive)` 加一句注释：rm 先删掉标记再失败（例如某个只读子目录让它中途放弃），
 * 残留目录恰好落进那个「看不见也删不掉」的形态。这里两道保险：
 *  ① 逐条删顶层内容，标记不参与删除批次 —— 中途失败时标记必然还在；
 *  ② 收尾时若目录仍存在而标记没了（rm 部分生效 / 外部工具删过），**按原样重写标记**再放手。
 *
 * 因此只要返回，残留（若还在）**必然**能被 `listIncompleteCopies()` / `listIncompleteCopiesScan()`
 * 扫到，并能经 `remove()`（UI 的 diskApi.profileDelete）删除。
 *
 * @param remove 删除实现（缺省递归强制删除），仅供测试注入「部分失败」的 fs。
 */
export declare function rollbackCopiedProfileDir(destDir: string, marker: DshProfileCopyMarker, remove?: (target: string) => Promise<void>): Promise<{
    removed: boolean;
    failedEntries: string[];
    markerRestored: boolean;
}>;
/** 「档案」= DSH profile 的读写引擎（同步 fs；profile 数量级为个位数，无需异步）。 */
export declare class DshProfileManager {
    private readonly homeDir;
    private readonly currentProfile;
    /** 见 DshProfileManagerOptions.markerIo：只作用于「复制进行中标记」的写入 */
    private readonly markerIo;
    constructor(options: DshProfileManagerOptions);
    /** profiles 根目录（`$DSH_HOME/profiles`） */
    profilesRoot(): string;
    /** 列出全部可管理的 profile（有 package.json 的目录），按名字排序。 */
    list(): DshProfileMeta[];
    /** 单个 profile 的详情（含 package.json / cordis.patch.yml 原文）。 */
    detail(name: string): DshProfileDetail;
    /** 新建 profile（等价 dsh-app-boot 的 initProfile：三个脚手架文件）。 */
    create(name: string, templateId?: string): DshProfileMeta;
    /**
     * 复制档案：把 `<home>/profiles/<name>` 整份拷成 `<home>/profiles/<newName>`（清单 + patch 层 + pnpm 锁文件…），
     * package.json 的 name 字段改写为新档案名。
     *
     * 为什么是「目录级复制」而不是「按模板新建」：档案的全部差异（bundles 声明、patch 层、pnpm 锁文件、
     * 树外插件依赖）只存在于磁盘目录里 —— 按模板建出来的新档案与源档案毫无关系，而用户复制档案的
     * 真实意图是「拿一份可改的等价副本」。
     *
     * includeNodeModules（缺省 true）决定要不要一并拷 node_modules：
     *  - true  = 副本**立刻可用**（bundles 里的树外插件解析得到），代价是与源档案同体积且耗时
     *            （实测 285 MB / 1.7 万文件 ≈ 30 s）；
     *  - false = 秒级完成，但副本启动时会 `cannot resolve profile bundle`（DSH 自己的报错指向
     *            `dsh plugin --profile <名> install`）→ 返回 warning depsNotInstalled，调用方必须如实转达。
     *
     * 实现要点（都是实测踩出来的）：
     *  - 用 async `fs.promises.cp` 而不是 cpSync：整档案上万个文件，同步拷贝会把宿主事件循环卡住
     *    二十多秒（DSH 界面整个冻结）；async 版让拷贝期间服务器仍能响应其它请求；
     *  - `verbatimSymlinks: true`：保持相对符号链接仍是相对（副本内自解），而不是被解析成指向源档案的
     *    绝对路径；但 **cp 不会展开 junction**（实测：cpSync 会、promises.cp 不会）—— 它留下的是指向
     *    **源档案**的链接，所以复制后必须跑一遍 `relinkCopiedTree` 把「指向源档案内部」的链接重指向副本自身
     *    （否则用户删掉源档案，副本就会缺包）；指向源档案**之外**的链接（如 `link:` 依赖指向用户仓库）
     *    一律原样保留 —— 那本来就是「共享外部目录」的语义；
     *  - 链接重指向只碰链接本身（unlink + 重建 junction，不需要管理员权限）：实测副本 285 MB / 1.7 万条目里
     *    只有 48 个链接，且用 `readdir(withFileTypes)` 判链接无需逐条 lstat，代价可忽略；
     *  - includeNodeModules=false 时**同时跳过 node_modules 与 `.dsh-module-fallback`**：后者是 DSH 按
     *    node_modules 投影出来的派生目录，只搬它只会留下一堆悬空链接（DSH 启动时会自行重建）；
     *  - 其余顶层条目一律照搬（cordis.patch.yml / cordis.yml / pnpm-lock.yaml / 各种 .bak 备份都在里面）；
     *  - 中途失败**回滚目标目录**：留一个「看起来正常、实则缺文件」的半套档案比不复制更危险。
     */
    copy(name: string, newName: string, opts?: {
        includeNodeModules?: boolean;
    }): Promise<{
        meta: DshProfileMeta;
        warnings: DshProfileCopyWarning[];
        durationMs: number;
    }>;
    /** 重命名（目录级移动；同步修正 package.json 的 name 字段）。 */
    rename(name: string, newName: string): DshProfileMeta;
    /**
     * 把副本里「指向源档案内部」的链接重指向副本自身的对应路径。
     *
     * 为什么必须做：`fs.promises.cp` 把 junction 当链接照抄（目标仍是源档案的绝对路径）—— 源档案一旦被删，
     * 副本就会缺包（实测：拷完删掉源档案，副本 node_modules 里被链接的包直接 ENOENT）。指向源档案之外的
     * 链接（`link:` 依赖指向用户仓库、DSH 从安装目录投影出来的 fallback）保持原样：那是共享语义，不是缺陷。
     */
    private relinkCopiedTree;
    /** 单个链接的重指向（失败保持原样：源档案还在时仍旧可用，不让整次复制失败）。 */
    private relinkCopiedEntry;
    /**
     * 物理删除 profile 目录（removeTreeSync；目录内 junction 只删链接本身，删不干净报 deleteFailed）。
     * 当前运行中的 profile 需要 allowCurrent=true 显式确认（删除会让重启后的实例直接失败）。
     *
     * Desktop 独占档案（desktop）**一律拒绝**（连 allowCurrent 也不行）：它由桌面端应用自己
     * 初始化与维护，删掉之后桌面端要么起不来、要么按 web 模板重建一个空档案（插件全丢）。
     *
     * cross-F3：**中断的复制残留**（有进行中标记、无 package.json）也接受删除 —— 它此前既不在
     * `list()` 里、`requireProfile` 又报 notFound，成了「查不到也删不掉」的孤儿目录。
     */
    remove(name: string, opts?: {
        allowCurrent?: boolean;
    }): void;
    /**
     * remove() 的异步版本：语义、护栏、错误码完全一致，只是不阻塞事件循环（审计 P11-9）。
     *
     * 为什么需要两份：档案目录是整仓里最大的一棵树（含 node_modules，真机 2 万文件）。实测
     * removeTreeSync 删 2 万文件耗 15.5 s，期间宿主 20 ms 定时器 0/776 次触发 —— 心跳、实例
     * 存活探测、同步定时器全停摆，面板表现成「后端卡死」。HTTP 删除走这里；只有确实同步
     * 上下文（脚本、收尾清理）才用 remove()，且必须是自己知道很小的树。
     */
    removeAsync(name: string, opts?: {
        allowCurrent?: boolean;
    }): Promise<void>;
    /**
     * cross-F3：目标目录 = **正常 profile（有 package.json）** 或 **中断的复制残留（有进行中标记）**；
     * 两者都没有 → notFound。残余标记的目录必须能被定位与删除，否则就是孤儿。
     */
    private requireManagedDir;
    /**
     * 落「复制进行中标记」（cross-F3 的唯一凭据）。
     *
     * 单独抽出来只为把注入点收窄到这一处写入：调用方（copy）据此保证「标记写失败 ⇒ 目录一起回滚」。
     */
    private writeCopyMarker;
    /** 复制进行中标记的路径。 */
    private copyMarkerPath;
    /**
     * 读「复制进行中标记」。**只判存在性**：内容坏掉（手工改过 / 写盘中断）仍算半截副本 ——
     * 宁可多报一个可疑残留，也绝不把孤儿目录重新变成「查不到也删不掉」。
     */
    private readCopyMarker;
    /**
     * cross-F3：把「中断的复制残留」渲染成一个可列出、可删除的条目。
     *
     * 形态恒为 `generic` ⇒ `isLaunchableShape('generic')` 为假：半截副本**绝不能**给出启动按钮
     * （没有 package.json，spawn 出去只会得到一个起不来的实例）。
     */
    private incompleteMeta;
    /**
     * cross-F3：列出全部**中断的档案复制**残留（有标记、无 package.json），含目标绝对路径。
     *
     * 与 `list()` 共用同一份判定（标记存在即残留），避免「列表说没有、这里说有」的分叉；
     * 档案列表消费 `list()` 里的 `incomplete` 条目，恢复面板消费本方法。
     */
    listIncompleteCopies(): DshProfileIncompleteCopy[];
    /**
     * t89（FINAL-SWEEP-2 S2-3）：与 `listIncompleteCopies()` **同源**的枚举结果，额外区分
     * 「枚举失败」与「确实没有残留」。
     *
     * 此前读目录失败直接回落 `[]`（t54 的**有意**选择：残留枚举失败不得让 /recovery/status 整页 500），
     * 但调用方因此无法把「读不到」与「没有」分开 —— 而更深的 `markerReadable` 已经诚实过一次，
     * 说明本仓库口径本应区分这两者。本方法保持**不抛**（t54 口径不变），只把失败这一事实交给调用方。
     *
     * 判据只有一条：`readdirSync` 失败 = unreadable。根目录**本来不存在**（`!existsSync`）不算失败 ——
     * 那是「新装机器还没有 profiles 目录」，与「读不动」是两件事。
     */
    listIncompleteCopiesScan(): DshProfileIncompleteCopiesScan;
    /** 解析 profile 目录（不存在 → notFound；**只认正常 profile**，半截副本走 requireManagedDir）。 */
    private requireProfile;
    /** 目录判定：普通目录，或指向目录的符号链接/junction。 */
    private isProfileDir;
    /** package.json 解析为对象（不可读 / 非对象 = null）。 */
    private readManifestObject;
    /** 组装列表行数据（损坏项不抛，标 issue 后照常返回）。 */
    /** 该档案依赖树里的 `@deepseek-ai/dsh` 版本；读不到/不是非空字符串 → null。 */
    private readProfileDshVersion;
    private readMeta;
}
