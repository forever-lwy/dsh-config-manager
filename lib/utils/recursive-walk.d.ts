/** 遍历中跳过的链接（备份必须能说明「哪些内容没进来」） */
export interface SkippedLink {
    /** homeDir 相对路径（链接本身，不是目标） */
    path: string;
    /** loop=指向已遍历目录（自引用/重复）；outside-home=目标越出 homeDir；
     *  broken=断链；unreadable=目标既非文件也非目录（设备/FIFO 等）；too-deep=超过深度上限 */
    reason: 'loop' | 'outside-home' | 'broken' | 'unreadable' | 'too-deep';
}
/**
 * 被整棵跳过的「运行时依赖目录」（任意深度的 `node_modules`，issue #76）。
 *
 * 为什么是硬规则：技能目录自带依赖时，`skills` 分区能被遍历出上万个条目，撞上导出侧的
 * 10 000 条目闸门 → **定时备份永久失败且用户无解**（定时备份与「立即备份」都没有分区范围，
 * `backup-schedule.json` 也没有排除项）。而 `plugins` 分区早就按 `npm pack` 的产物度量
 * （`core/local-plugin-pack.ts` 明写「node_modules 由 npm pack 自身排除」）、宿主的
 * `dirSizeBytes` 也显式跳过它 —— 同一个概念此前在通用递归里缺了同一排除项。
 *
 * 依赖树可由包内保留的 `package.json` / lock 重建，不属于用户配置，故不进备份；
 * 但**必须留痕**（见 RecursiveListing.skippedDepDirs），绝不静默。
 */
export declare const EXCLUDED_DEP_DIR_NAMES: readonly string[];
/** 被跳过的运行时依赖目录（内容未进备份；必须在报告里可见） */
export interface SkippedDepDir {
    /** homeDir 相对路径（被跳过的目录本身） */
    path: string;
    /** 该目录下递归的普通文件数；null = 计数预算耗尽未统计（不猜，也不假装是 0） */
    files: number | null;
}
export interface RecursiveListing {
    /** homeDir 相对、斜杠分隔、已排序的文件路径 */
    paths: string[];
    /** 被跳过的链接（含原因）；空 = 本次遍历无内容缺失 */
    skippedLinks: SkippedLink[];
    /** 因「可重建的运行时依赖」整棵跳过的目录（EXCLUDED_DEP_DIR_NAMES）；空 = 本次没有跳过 */
    skippedDepDirs: SkippedDepDir[];
    /** 成功跟随（内容已收集）的链接数；用于「链接结构不会被还原」的提示 */
    followedLinks: number;
    /** 读取失败的目录（ACL / 竞态删除等）——这些目录下的内容同样没进备份，必须留痕 */
    unreadableDirs: string[];
}
/**
 * 遍历 baseDir 下的所有文件（跟随目录链接）。
 * @param baseDir 绝对路径；不在 homeDir 内则返回空清单（与既有语义一致）
 * @param homeDir 绝对路径；产出相对它，跟随边界也是它
 */
export declare function listRecursiveFollowingLinks(baseDir: string, homeDir: string): Promise<RecursiveListing>;
