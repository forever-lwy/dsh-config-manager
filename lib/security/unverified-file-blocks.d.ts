import type { ChecksumVerifyResult } from '../utils/hashing.ts';
import type { MsgFunc } from '../core/msg-types.ts';
/**
 * 本模块需要的计划项字段（结构子集）。刻意不 import `core/types.ts` 的 `PlanItem`：
 * 值依赖方向是 core → security，security 只描述契约。
 */
export interface UnverifiedBlockableItem {
    adapter: string;
    kind: string;
    severity?: string;
    detail?: string;
    description?: string;
    target?: {
        ref?: string;
    } | undefined;
}
export declare function unverifiedFileEntryText(text: MsgFunc, names: readonly string[]): string;
/**
 * 未覆盖条目的**唯一**一条告警（RV1-F11：同一事实只发一次，不再与 `import.extraEntries` 并存）。
 *
 * 键按「到底拦没拦」选，避免文案自称做了没做的事：
 *  - 真拦下了（blocked > 0）⇒ 专属键 `import.unverifiedFileEntry`（「已逐条阻断写入」）；
 *  - 一个都没拦（豁免分区 / 不在任何文件分区前缀下的散落条目，守 INT-01）⇒ 中性口径 `import.extraEntries`。
 */
export declare function unverifiedNoticeText(text: MsgFunc, names: readonly string[], blocked: number): string;
/**
 * 校验表**覆盖不到**的条目（反向覆盖）。
 *
 * - 表存在且非空：表里没登记的条目（`unverifiedEntries` 的判据，正向校验看不到它们）；
 * - 表**缺失/为空**：一个条目都没被校验 ⇒ 文件分区前缀下的条目一律视为未覆盖。
 *   这是 RV1-F1 抓到的绕过：删掉 `integrity/checksums.json`（或置 `{}`）就等于把 SEC-05 关掉。
 *   口径选「逐条 fail-closed」而非整包拒：旧包/手工包的非文件分区（settings 等）照常导入，
 *   被拦下的只是「按归档名原样落盘、完整性声明又完全管不到」的那部分。
 *
 * 文案不在这里出（RV1-F11）：同一事实只由 `analyzeImport` 发一条 `import.unverifiedFileEntry`。
 */
export declare function scanUnverifiedEntries(names: readonly string[], table: Record<string, string> | null): string[];
/**
 * 把命中「表外 + 会写盘」的文件分区计划项升级为 Error。
 *
 * 为什么必须拦：文件集合分区按归档名原样落盘（`adapters/file-collection.ts` 的 applyItem 只看
 * `target.ref`），而 `verifyAgainstTable` 只正向校验表里登记的条目 —— 表外文件一路绿灯。
 * 拦在执行之前、拦在计划项上（kind:'Error'）：`applyOne` 遇到 Error 直接记 failed、绝不写目标，
 * 用户也能在预览里看到「为什么这条没导」。
 *
 * @returns 被阻断的归档条目名（按计划项顺序，供调用方汇总一条提示）
 */
export declare function applyUnverifiedFileBlocks(unverified: readonly string[], items: UnverifiedBlockableItem[], fileSections: ReadonlySet<string>, exemptSections: readonly string[], text: MsgFunc): string[];
/** ZIP 归档读取子集（结构子集：`ZipArchive` 可赋值）；本模块不 import core 的 ZIP 解析。 */
export interface IntegrityArchive {
    has(name: string): boolean;
    names(): string[];
    readEntryText(name: string): string;
    readEntryAsync(name: string): Promise<Uint8Array>;
}
export interface ArchiveIntegrityScan {
    checksums: ChecksumVerifyResult;
    /** 表外条目（反向覆盖）；校验表缺失/为空时 = 文件分区前缀下的全部条目（见 scanUnverifiedEntries） */
    unverified: string[];
    /** 要挂进 zipWarnings 的文案（目前只有「校验表缺失」；反向覆盖文案由 analyzeImport 统一发一条） */
    warnings: string[];
    /** 完整性不符时的错误文案；undefined = 通过（调用方自己 throw，文案由注入的 msg 决定） */
    failure?: string;
}
/**
 * 归档完整性扫描：正向（表内每条必须存在且 SHA-256 一致）+ 反向（ZIP 有、表里没登记）。
 *
 * 正向用 `utils/hashing.ts` 的 `verifyChecksums` —— 与 `import-planning.ts` 里的同名判据逐字等价，
 * 是同一份语义的规范实现，此处不再复制第二遍。
 * 判定却必须与导入阻断共用（`scanUnverifiedEntries` / `unverifiedEntries`），否则「告警说的表外条目」
 * 与「真正被拦下的条目」会分叉。
 */
export declare function scanArchiveIntegrity(archive: IntegrityArchive, text: MsgFunc): Promise<ArchiveIntegrityScan>;
