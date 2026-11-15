import type { Manifest, SectionId } from '../schema/types.ts';
import type { Tombstone, TombstoneKind } from '../schema/tombstones.ts';
import type { MsgFunc } from './messages.ts';
import type { PathIssue, PathMapping, PlanItem, SkippedTombstone, TransactionSnapshotContext } from './types.ts';
export declare function reportRollbackToJournal(binding: TransactionSnapshotContext | undefined, report: {
    full: boolean;
    failed: readonly string[];
}): Promise<void>;
/**
 * G-06：执行 schema 迁移链并把迁移结果重新校验为合法 manifest。
 *
 * `migrateToCurrent` 此前在 `src/` 内零引用（迁移链有定义、有单测、从不执行）；
 * `loadBundle` 只用 isSupported 做判定就直接把旧文档当新格式使用。本函数是迁移链的
 * **真实接线点**：沿链迁移 → 重新校验结果是合法 manifest（不合法则抛明确错误，
 * 绝不把半迁移文档当合法 manifest 继续）→ 每个已应用步骤翻译成用户可见告警。
 *
 * 显式传入 from/target 使「链式迁移真的被执行」可被直接单测：当前
 * `MIN_SUPPORTED_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION = 1`，`needsMigration` 恒假，
 * 因此该分支在真实导入中结构上不可达（loadBundle 仍按 needsMigration 调用本函数）。
 */
export declare function runSchemaMigration(doc: unknown, fromVersion: number, targetVersion: number, msg: MsgFunc): {
    manifest: Manifest;
    warnings: string[];
};
export declare function verifyAgainstTable(entries: Map<string, Uint8Array>, table: Record<string, string>): Promise<{
    ok: boolean;
    mismatches: string[];
    missing: string[];
}>;
/**
 * 冲突决策（applyItemResolution）已抽到 `./conflict-decisions.ts`：
 * 与恢复/回放路径共用同一份语义（回放侧随灾备快照线下线，语义仍是同一条）。
 */
/**
 * 基础路径重定基规则：导出机 DSH home → 本机 DSH home（issue #45 用户补充）。
 *
 * 只在「两边的规范化路径都是绝对路径、且不相同」时生成；两侧都去掉尾部分隔符后比较，
 * 避免 /opt/.dsh/ 与 /opt/.dsh 被判成不同而白跑一次全量替换。前缀匹配仍由 applyPrefixMappings
 * 负责（必须落在段边界），所以 /opt/.dsh 不会误伤 /opt/.dsh-extra。
 *
 * @returns 映射规则；不需要重定基（缺 sourceHome / 相同 / 相对路径）→ undefined
 */
export declare function rebaseMapping(sourceHome: string | undefined, localHome: string): PathMapping | undefined;
/**
 * 会话单元版本查询：探针的单元键（`projectKey/会话目录`）与计划项单元 id
 * （`sessions:projectKey/会话目录`）是两个键空间，必须两种形态都试。
 *
 * 为什么不在探针里直接带上适配器前缀：探针只认「分区内的相对路径」，它不知道也不该知道
 * 哪个适配器在消费它（core 也不得 import 会话字节工具）。键空间对齐因此落在计划生成期。
 */
export declare function sessionUnitVersion(byUnit: ReadonlyMap<string, number>, unitId: string): number | undefined;
/** 路径映射合并：只保留「已解析」（newPrefix 非空）的映射用于执行期数据改写；
 * 未解决项（newPrefix 空）保留在 plan.items 里供 UI 提示，但不参与数据映射。 */
export declare function mergePathMappings(items: PlanItem[], userMappings: PathMapping[]): PathMapping[];
/**
 * 把映射应用到分区数据（PathMapper 先行：只替换匹配前缀的字符串叶值）。
 *
 * `fileCollectionIds` 里的分区一律跳过：`FileCollectionAdapter` 把 `relativePath` 当落盘路径用，
 * 它必须逐字保留（issue #45 ④：改写会话文件的相对路径会让目标机下次启动直接报
 * `corrupt session log`；pluginFiles/skills 等同理——丢位置等于丢归属）。
 * 映射在这些分区上**没有任何合法作用**：文件内容存的是字节（`Uint8Array` 叶子），不会被改。
 */
export declare function applyMappingsToSections(sections: Map<SectionId, unknown>, mappings: PathMapping[], fileCollectionIds?: ReadonlySet<string>): void;
/** 路径形态判定：跨平台盘符/UNIX 冲突 → platformMismatch；其余绝对路径 → missing（需映射） */
export declare function detectPathIssues(sourcePlatform: string, targetPlatform: string, sections: Map<SectionId, unknown>): PathIssue[];
export declare function judgePath(p: string, sourcePlatform: string, targetPlatform: string): PathIssue;
/**
 * 凭据计划项（MissingSecret / Skip）在**导入路径**上的唯一生成点。
 *
 * ref 来源取**并集**：① credentialsStatus 里 configured=true 的 ref（源机声明「有」，
 * 但普通备份不带值）；② 宿主解密出的归档 ref（`opts.decryptedCredentials`）——
 * 加密备份携带的是 `.credentials.yaml` **原文**，可能含未被任何 settings namespace 引用的 ref
 * （如其它插件自用的 key），只认 ① 会让这些值静默丢掉（真机反馈：导入密钥没生效）。
 *
 * 规则（与同步侧 sync-engine.appendCredentialPlanItems 同口径：**值的有无**优先于本机状态）：
 *  - **有值** → MissingSecret「随加密备份恢复」：用户显式勾了「导出密钥」，导入即写回；
 *    **不因本机已有而跳过**（跳过 = 用户以为密钥导入了、其实没写）。
 *  - **无值**（只有 ref 名）→ 本机已配置 → Skip（保留本机值、不再索要补录，用户报告
 *    「已有的重复密钥也会提示」）；本机没有 → MissingSecret「需要补录」。
 *
 * 凭据值不可回读，因此无值分支一律不覆盖本机已有值。
 *
 * @param decrypted 归档里解出的 ref→值（仅内存；undefined = 未提供密码/无凭据载荷）
 * @param isConfiguredLocally 目标机是否已配置该 ref（读不到 → false，保守按需补录处理）
 */
/**
 * 凭据值「可用」的**唯一判据**（t14 / core-F2 修）：必须是非空字符串。
 *
 * 此前三处各判各的 —— 计划期用 `Map.has()`（空串也算「有值」）、执行期用 `value !== ''`、
 * 结果期又用 `Map.has()`。于是「归档里该 ref 的值为空串」时：计划项说「随加密备份恢复」，
 * 执行静默跳过，结果既不报缺失还把该 ref 算成「已从归档写回」—— 用户看到「导入完成」，
 * 密钥其实没写进去（静默 no-op）。三处必须同源，否则该缺陷会再次以另一种形态复发。
 */
export declare function usableSecretValue(decrypted: ReadonlyMap<string, string> | undefined, inputs: Record<string, string> | undefined, ref: string): boolean;
export declare function buildCredentialPlanItems(items: PlanItem[], sections: Map<SectionId, unknown>, decrypted: Map<string, string> | undefined, msg: MsgFunc, isConfiguredLocally: (ref: string) => Promise<boolean>): Promise<void>;
/**
 * 按删除墓碑过滤计划项（F4）：
 *  - 条目级：插件（Install/Update/Conflict）、技能（skills 文件）、文件类条目（agentPresets 等）命中墓碑 → 剔除；
 *  - 分区级：墓碑 kind='section' 且 id=分区 id → 整分区跳过（仅记一条 skipped）。
 * 返回过滤后的 items 与被跳过清单（纯函数：不读文件、不改入参）。
 */
export declare function applyTombstoneFilter(items: PlanItem[], tombstones: Tombstone[]): {
    items: PlanItem[];
    skipped: SkippedTombstone[];
};
/** PlanItem → 墓碑键（{kind,id}）映射；非「将写入」的条目（Skip 等）与配置类项返回 null 不过滤 */
export declare function tombstoneKeyForItem(item: PlanItem): {
    kind: TombstoneKind;
    id: string;
} | null;
