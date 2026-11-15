import type { ForeignPlatform } from './platform-paths.ts';
import type { ForeignSkip } from './types.ts';
/** 加密库相对 `<User>` 的路径段（4 个发行版共用同一命名） */
export declare const TRAE_DB_REL_SEGMENTS: readonly string[];
/** SQLCipher 4.x 的页大小（该库固定 4096） */
export declare const TRAE_DB_PAGE_SIZE = 4096;
/** 每页尾保留字节：IV(16) + HMAC-SHA512(64) */
export declare const TRAE_DB_RESERVE_BYTES = 80;
/** IV 长度（AES 块大小） */
export declare const TRAE_DB_IV_BYTES = 16;
/** 第 1 页开头的 salt 长度（不是密文，也不参与解密） */
export declare const TRAE_DB_SALT_BYTES = 16;
/** raw AES-256 密钥长度 */
export declare const TRAE_DB_KEY_BYTES = 32;
/**
 * 缺省密钥：参考实现 xitula/trae-session-export 公开的 raw key 常量。
 *
 * **为什么可以内置**：它是产品级的固定 key（不是用户口令），参考实现公开分发；本插件只读、
 * 且不写回任何 Trae 数据。换版后 key 变化 ⇒ 页头校验失败 ⇒ `trae-db-key-invalid`（可判定）。
 */
export declare const TRAE_DB_DEFAULT_KEY = "3605f6691095a993f03d5009c918352ef5be31ae31e8f000212b81ff058da773";
/** 覆盖密钥的环境变量名（只报键名，绝不回显值） */
export declare const TRAE_DB_KEY_ENV = "DCM_TRAE_DB_KEY";
/**
 * 加密库的体积上限（**按来源独立**，2 GiB 覆盖 1.4 GB 量级；超限走既有 copy-too-large 语义）。
 * 刻意不碰 sqlite.ts 的 `DEFAULT_MAX_COPY_BYTES`（1 GiB，全局兜底）。
 */
export declare const TRAE_DB_MAX_BYTES: number;
/** 会话表（调研确证） */
export declare const TRAE_DB_TABLE_SESSION = "chat_session";
/** 正文表（调研确证：消息在 `messages` 的 `raw_messages[]`） */
export declare const TRAE_DB_TABLE_HISTORY = "history_v2";
/** 表结构**最小**签名：只钉确证过的表与列，其余列按候选自证 */
export declare const TRAE_DB_REQUIRED_SCHEMA: Readonly<Record<string, readonly string[]>>;
/** 会话上限（与 read-trae 的 MAX_SESSIONS 同量级；由调用方再收窄） */
export declare const TRAE_DB_MAX_SESSIONS = 5000;
/** 解密/读表失败的**稳定码**（与 types.ts 的 ForeignSkipCode 一一对应） */
export type TraeDbProblemCode = 'trae-db-key-invalid' | 'trae-db-too-large' | 'trae-db-decrypt-failed' | 'trae-db-schema-mismatch';
/** 失败原因（`detail` 只放可枚举的短标签，绝不放密钥/明文片段） */
export interface TraeDbProblem {
    readonly code: TraeDbProblemCode;
    readonly detail: string;
    readonly count?: number | undefined;
}
/** 读表交出的**中性**会话行（ID 校验与角色映射在 read-trae 里做，口径一处不改） */
export interface TraeDbSession {
    readonly id: string;
    readonly cwd?: string | undefined;
    readonly title?: string | undefined;
    readonly createdAt?: number | undefined;
    readonly items: readonly unknown[];
}
/** 一次加密库读取的结果 */
export interface TraeDbReadOutcome {
    readonly sessions: readonly TraeDbSession[];
    readonly problem?: TraeDbProblem | undefined;
    /** 解密出的页数（明文直读时为 undefined） */
    readonly pages?: number | undefined;
    /** `decrypted` = 走解密；`plaintext` = 库本身已是明文（旧版/已被解密的形态） */
    readonly mode?: 'decrypted' | 'plaintext' | undefined;
    /** 消息单元格解析不出的行数（如实计入，绝不伪造正文） */
    readonly dropped?: number | undefined;
    /** 缺 id 而无法建会话的行数 */
    readonly skipped?: number | undefined;
    /** 会话数触顶（调用方的 maxSessions） */
    readonly truncated?: boolean | undefined;
}
/** 读表选项 */
export interface TraeDbReadOptions {
    readonly env: Readonly<Record<string, string | undefined>>;
    readonly platform: ForeignPlatform;
    /** 体积上限（缺省 `TRAE_DB_MAX_BYTES`；单测用它造超限，不必造 2 GiB 文件） */
    readonly maxBytes?: number | undefined;
    /** 会话数上限（缺省 `TRAE_DB_MAX_SESSIONS`） */
    readonly maxSessions?: number | undefined;
}
/** 密钥解析结果：要么给出 32 字节 raw key，要么给出可判定失败 */
export type TraeDbKeyResolution = {
    readonly key: Buffer;
    readonly source: 'default' | 'env';
} | {
    readonly problem: TraeDbProblem;
};
/** 一个 `<User>` 根下的加密库位置（**绝不硬编码分隔符**） */
export declare function traeDbPathFor(userDir: string, platform: ForeignPlatform): string;
/**
 * 解析密钥：环境变量优先，缺省内置常量。
 *
 * 环境变量**设了但不合法**时直接报 `trae-db-key-invalid`（detail=key-format），
 * 绝不悄悄回落到内置 key —— 那会让「我换了密钥但没生效」变成静默 0 会话。
 */
export declare function resolveTraeDbKey(env: Readonly<Record<string, string | undefined>>): TraeDbKeyResolution;
/**
 * 校验解密出的第 1 页明文（`plain` = 明文页的 `[16, 4016)`，即文件 offset 16 起的 4000 B）。
 *
 * 返回 null = 通过；返回字符串 = 可判定的失败 detail（一律映射成 `trae-db-key-invalid`）。
 */
export declare function validateTraePageOne(plain: Buffer, pages: number | null): string | null;
/**
 * 把一个加密库逐页解密成明文库（**覆盖写 `destPath`**，目标不存在才写）。
 *
 * 只读源库；内存占用恒为一页；失败时返回稳定码，**不留半截明文**（由调用方的临时目录统一清理）。
 */
export declare function decryptTraeDatabase(sourcePath: string, destPath: string, key: Buffer): Promise<{
    ok: true;
    pages: number;
} | {
    ok: false;
    problem: TraeDbProblem;
}>;
/**
 * 探测期的**单页**校验（detect 用）：只解密第 1 页、只读 4 KB，用来抢在 build 之前把
 * 「密钥错 / 截断 / 超限」这三类可判定失败摆到界面上（#134 的第二半）。
 *
 * 返回 null = 没发现问题（或库不存在 / 已是明文）。
 */
export declare function probeTraeEncryptedDatabase(sourcePath: string, options: Pick<TraeDbReadOptions, 'env' | 'maxBytes'>): Promise<TraeDbProblem | null>;
/** 正文容器 → 消息数组（`raw_messages` 第一顺位；数组本身也接受） */
export declare function messageItemsOf(value: unknown): unknown[] | null;
/**
 * 读一个加密库：体积上限 → 密钥 → 解密（或明文直读）→ 只读读表 → 删临时明文。
 *
 * **绝不抛出**：所有失败都收成 `problem`（稳定码 + detail），调用方据此推 skip。
 */
export declare function readTraeEncryptedDatabase(sourcePath: string, options: TraeDbReadOptions): Promise<TraeDbReadOutcome>;
/** problem → skip（origin 固定 'trae'；count 只在有意义时带上） */
export declare function traeDbSkipOf(problem: TraeDbProblem): ForeignSkip;
