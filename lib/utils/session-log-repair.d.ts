/** 修复失败原因（机器可读；文案由调用方输出层决定）。 */
export type SessionRepairFailure = 
/** 运行时缺 zstd 能力 */
'unavailable'
/** 读不到文件 / 不是普通文件 */
 | 'unreadable'
/** 容器不是合法 zstd 多帧流（保留位 / 保留块类型 / 魔数 / 解不开的帧） */
 | 'corrupt-container'
/** 末尾有撕裂帧（DSH 自愈，无需修复） */
 | 'torn-tail'
/** 首帧 header 不是单行 JSON 对象（应用内不重建 header —— 那是发明数据） */
 | 'invalid-header'
/** 没有发现任何可零损失修复的问题 */
 | 'nothing-to-fix'
/** 行跨度**不可判定**（packed 行形状不合法 / 无 seq 且非 packed 行）—— refuse 而不是猜 */
 | 'undecidable'
/** 引用完整性：本次动作会让保留行引用到的 seq 失去承载行或被改指（fail-closed） */
 | 'dropped-ref'
/** 只有有损修复可用（截断），但调用方没有显式放行 */
 | 'lossy-required'
/** 写前校验不过（**拒绝修复**） */
 | 'verification-refused'
/** 临时文件写入 / 备份 / rename 失败 */
 | 'write-failed'
/** 写后复验不过（临时文件已删除，原文件未动） */
 | 'postcheck-failed'
/** 回滚：备份名/位置不合规，或备份内容自身校验不过（**拒绝**，零写入） */
 | 'backup-invalid';
/** 计划里的一步修复动作（界面/CLI 据此逐条说明「将要做什么」）。 */
export type SessionRepairActionCode = 'drop-duplicate-rows' | 'drop-synthetic-closer' | 'truncate-tail';
export interface SessionRepairAction {
    code: SessionRepairActionCode;
    /** 人类可读的事实（中文技术描述；不含路径） */
    detail: string;
    /** 有损（会真的丢掉无法恢复的事件）—— 应用期必须显式放行 */
    lossy: boolean;
    /** 这一步影响的行数 */
    rows: number;
}
/** 单次修复的结果（ok=false 时 reason 为机器可读原因）。 */
export interface SessionLogRepairOutcome {
    ok: boolean;
    reason?: SessionRepairFailure;
    /** 丢弃的行数（含重复行/合成收尾块/被截断的尾部） */
    droppedRows?: number;
    /** 保留的行数 */
    keptRows?: number;
    /** 时间戳备份的绝对路径（**只有真的落盘才有**） */
    backupPath?: string;
    /** 修复前后字节数（供报告） */
    bytesBefore?: number;
    bytesAfter?: number;
    /** 计划里的动作清单（预览时也回传，界面据此说明「将要做什么」） */
    actions?: SessionRepairAction[];
    /** 计划里有有损动作（应用期必须显式 allowLossy） */
    lossy?: boolean;
    /** 可见告警（例如先前就存在的悬空引用）——**不影响 ok**，只是让调用方如实汇报 */
    warnings?: string[];
}
/**
 * 写前校验：**连续性 + 引用完整性**（设计稿 §10.3 第 1 条）—— 严格档，用作**写后复验**。
 *
 * 能证明的两件事：
 *  - **连续性**：帧结构自洽（无撕裂帧、无非法帧）、首帧是单行 JSON 对象；
 *  - **引用完整性**：逐行 JSON 可解析且 seq **不倒退**（回退的 seq 正是重放族要处理的对象）。
 * 证明不了的一律返回 false（宁可不发布）。
 */
export declare function sessionLogSelfCheck(bytes: Uint8Array): {
    ok: boolean;
    reason?: SessionRepairFailure;
    rows?: {
        raw: string;
        seq?: number;
    }[];
};
/**
 * 找出**字节相同 + seq 相同**的重复行（重放族里零损失的那一类）。
 *
 * 只认「完全相同」：seq 重复但内容不同说明是真实的分叉，属于「检测 ≠ 发明」的范畴 —— 只报告。
 */
export declare function duplicateRowIndexes(rows: readonly {
    raw: string;
    seq?: number;
}[]): number[];
/** 修复计划（**纯函数**，不碰文件系统；预览与应用共用同一份判定）。 */
export interface SessionLogRepairPlan {
    ok: boolean;
    reason?: SessionRepairFailure;
    actions: SessionRepairAction[];
    /** 计划里有有损动作 */
    lossy: boolean;
    /** 保留的行（ok=true 才有） */
    keptLines?: string[];
    headerText?: string;
    droppedRows?: number;
    keptRows?: number;
    /** 可见告警（先前就存在的悬空引用等）—— 不影响 ok */
    warnings?: string[];
    /** 帧级最小写计划（ok=true 才有）—— 未触及帧按原字节区间逐字节复用 */
    frames?: SessionRepairFramePlan[];
}
/**
 * 一帧的写入计划（**帧级最小写**）。
 *
 * header 帧永不重写；未被本次改动触及（帧内无被丢弃行）的帧 `reuse=true`，调用方直接拷贝
 * 原容器里的 `[start, end)` 字节；其余帧用 `chunks`（每项 ≤ SESSION_REPAIR_MAX_ROWS_PER_FRAME 行）重编码。
 */
export interface SessionRepairFramePlan {
    /** 原容器内的帧字节区间（半开）；reuse=true 时逐字节拷贝这段 */
    start: number;
    end: number;
    /** true = 逐字节复用原帧字节；false = 用 chunks 重新编码 */
    reuse: boolean;
    /** reuse=false 时：每个元素一帧（行文本按 ≤ 常量 行分组） */
    chunks: string[][];
}
export declare function planSessionLogRepair(bytes: Uint8Array, opts?: {
    allowLossy?: boolean;
}): SessionLogRepairPlan;
/** 重新编码时的**单帧事件行上限**（超过就分批；任何情况下都不得产生「单帧承载全量事件」）。 */
export declare const SESSION_REPAIR_MAX_ROWS_PER_FRAME = 200;
/** 修复备份的扩展名（**唯一事实源**：回滚只接受本模块产生的备份名）。 */
export declare const SESSION_REPAIR_BACKUP_SUFFIX = ".cm-backup-";
/**
 * 解析本模块产生的备份名：<会话日志名>.cm-backup-<时间戳>[-序号]。
 *
 * 判据从严（回滚是一条「用旧内容覆盖新内容」的写路径）：日志名必须是合法会话日志名，
 * 时间戳只允许 [0-9A-Za-z._-] —— 任何不合规的名字一律返回 undefined，调用方据此拒绝。
 */
export declare function parseSessionRepairBackupName(name: string): {
    logName: string;
    stamp: string;
} | undefined;
/**
 * 修复单份会话日志（按 planSessionLogRepair 的计划）。
 *
 * 安全序列见文件头；**任一环节不过都不发布**（临时文件删除，原文件保持原样）。
 * `now` 可注入（测试固定时间戳）；`allowLossy` 缺省 false —— 有损计划一律拒绝（reason='lossy-required'）。
 */
export declare function repairSessionLogFile(absPath: string, opts?: {
    apply: boolean;
    allowLossy?: boolean;
    now?: () => Date;
}): Promise<SessionLogRepairOutcome>;
/**
 * **回滚**一次修复：把备份内容原子换回目标日志。
 *
 * 与修复同一条安全序列（校验 → 临时文件 → 原子换入 → 写后复验），另加两条前置：
 *  - 备份必须是**同一目录下、同一日志名**的本模块备份（parseSessionRepairBackupName）；
 *  - 备份内容必须先通过 sessionLogSelfCheck —— 备份本身不可信就绝不拿它覆盖任何东西。
 */
export declare function rollbackSessionLogFile(absPath: string, backupPath: string): Promise<SessionLogRepairOutcome>;
/** 读一份日志的字节（只读；供 CLI 的 doctor 汇总用）。 */
export declare function readSessionLogBytes(absPath: string): Promise<Buffer | null>;
