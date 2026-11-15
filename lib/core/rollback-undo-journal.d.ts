/** 索引文件名：JSONL，一行一条记录 */
export declare const UNDO_JOURNAL_FILE_NAME = "journal.jsonl";
/** 完成标记文件名（原子写入）；存在 = 这次回退的前像已**完整**落盘 */
export declare const UNDO_DONE_FILE_NAME = "done";
/** journal 里一条记录：索引（path/after 镜像）+ 前像引用（bin/bytes/sha256） */
export interface UndoJournalEntry {
    /** 本进程内的记录序号（0 起，一次 record 一条；bin 名 = `<seq>.bin`） */
    seq: number;
    /** 回退动作作用的**绝对**路径 */
    path: string;
    /** 前像文件名（相对 undo 目录）；null = 回退前该路径不存在 */
    bin: string | null;
    /** 前像字节数 */
    bytes: number;
    /** 前像 sha256；bin === null 时恒 null */
    sha256: string | null;
    /**
     * **回退动作写入**的内容 sha256（删除动作为 null）。
     * 重放的唯一安全判据：当前内容 sha256 === 该值才敢写回。
     */
    afterSha256: string | null;
    /** true = 该路径被回退动作删除（重放要求「当前仍不存在」） */
    afterDeleted: boolean;
    /** 记录时间戳（注入的 now()） */
    at: number;
}
export interface UndoJournalSnapshot {
    entries: UndoJournalEntry[];
    /** true = 文件最后一段是崩溃写了一半的行（已丢弃，绝不因此抛错） */
    truncatedTail: boolean;
}
export interface InterruptedUndo {
    dir: string;
    pid: number;
    entries: UndoJournalEntry[];
    truncatedTail: boolean;
}
/** 回退动作的 after 镜像：写入了某内容 / 删除了该路径 */
export type UndoAfter = {
    sha256: string;
} | {
    deleted: true;
};
export interface ReplayHooks {
    /** 读当前内容；返回 null = 该路径当前不存在（缺省用 fs.readFile，ENOENT 视为 null） */
    readCurrent?: (target: string) => Promise<Uint8Array | null>;
    /** 写回前像 */
    write: (target: string, bytes: Uint8Array) => Promise<void>;
}
export interface UndoJournalWriterOptions {
    /** 时间戳来源（测试可注入；缺省 Date.now） */
    now?: () => number;
}
/**
 * 前像 journal 写入端。
 *
 * 生命周期：`create()` → 逐条 `record()` →（全部落盘）`finish()` 写完成标记 → `dispose()` 关句柄。
 * 中断（未 finish）留在盘上的目录就是崩溃证据；调用方用 `findInterruptedUndos` + `replayUndoJournal` 收尾。
 */
export declare class UndoJournalWriter {
    /** 前像目录（`<root>/undo/<pid>-<ts36>-<8hex>`） */
    readonly dir: string;
    private readonly journalPath;
    private readonly now;
    private handle;
    private seq;
    /** 已成功 fsync 的 journal 字节数：写失败时回截到这里，保证不留半行 */
    private committedBytes;
    private disposed;
    private constructor();
    /**
     * 打开（或续写）一个前像目录。目录建不出来 / journal 打不开 ⇒ 抛错，调用方必须**零写入失败**。
     */
    static create(dir: string, options?: UndoJournalWriterOptions): Promise<UndoJournalWriter>;
    /**
     * 记一条：先落前像 bin、再 append 索引行并 fsync。
     *
     * @param before 前像字节；null = 回退前该路径**不存在**
     * @param after  回退动作的 after 镜像（写入了什么 / 删除了）
     */
    record(targetPath: string, before: Uint8Array | null, after: UndoAfter): Promise<void>;
    /** 条目全部落盘后写 done 标记（原子 rename）：标记存在 = 这份前像完整，崩溃清理不得当残留删掉。 */
    finish(): Promise<void>;
    /** 关句柄（幂等 + best-effort）；**不删目录** —— 删不删由调用方按 done/重放结果决定。 */
    dispose(): Promise<void>;
    private requireHandle;
    /** 回截到 length（best-effort）：只用于「append + fsync 失败」后的自愈，绝不掩盖原始写错误。 */
    private truncateTo;
}
/**
 * 读回 journal 快照。`null` = 该目录**本来就没有** journal（ENOENT）。
 *
 * 崩溃容忍：文件最后一段（可能是写了一半的行）解析失败 ⇒ 丢弃它、`truncatedTail = true`，
 * **绝不抛异常**。中间段坏掉不是 append 能造成的形状（篡改/损坏）⇒ 跳过且不算截断。
 */
export declare function readUndoJournal(dir: string): Promise<UndoJournalSnapshot | null>;
/**
 * 找中断的回退前像目录。
 *
 * @param root 既可以是**暂存根目录**（其直接子目录就是 `<pid>-<ts36>-<8hex>`），
 *             也可以是上层 dataRoot（此时会自动再看 `<root>/undo`）；两种调用口径都支持。
 * @param isAlive 进程存活探测（可注入，便于测试）；缺省 `process.kill(pid, 0)`。
 *
 * 判据（严格）：目录名形态匹配 + **有 journal** + **无 done** + **pid 已死**。
 * 读不出 journal 的目录跳过（判不准就不报，绝不猜）；结果按 dir 升序稳定排序。
 */
export declare function findInterruptedUndos(root: string, isAlive?: (pid: number) => boolean): Promise<InterruptedUndo[]>;
/**
 * 重放一份中断的前像（**逆序**：同一路径被记两次时，最后写的是最早状态）。
 *
 * 安全判据（**没有证明就绝不写盘**）：
 *  - `afterDeleted` ⇒ 目标当前必须不存在（`readCurrent` 返回 null），否则 skipped；
 *  - 否则 `sha256(current)` 必须 === `afterSha256`，否则 skipped；
 *  - after 信息缺失/不可判（老行/损坏行，`afterSha256 === null`）⇒ skipped。
 *
 * 失败一律逐条进 `failed`（绝不静默）：`unsafe-path` / `unsafe-bin` / `before-checksum-mismatch` /
 * `read-current-failed: …` / 写入或删除的真实错误。读当前态失败属**保守失败**（该条不写）。
 */
export declare function replayUndoJournal(undo: InterruptedUndo, hooks: ReplayHooks): Promise<{
    restored: number;
    skipped: string[];
    failed: string[];
}>;
