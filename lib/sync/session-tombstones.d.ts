import type { SectionData } from '../schema/types.ts';
import type { SyncSnapshotMeta, SyncTransport } from './transport.ts';
/** 会话单元 id 前缀（与 SessionsAdapter.unitIdOf 同口径：`sessions:<projectKey>/<sessionId>`）。 */
export declare const SESSION_UNIT_PREFIX = "sessions:";
/** 墓碑上限（FIFO 保留最新 N 条）：防止 manifest 无限膨胀（真机会话库 ~660 条，5000 足够宽裕）。 */
export declare const MAX_SESSION_TOMBSTONES = 5000;
/** 相对路径 → 会话单元 id（深度不足 2 段 → null；与 core/session-select 的单元口径一致）。 */
export declare function sessionUnitIdOfPath(relativePath: string): string | null;
/**
 * 计算下一次的墓碑集合。
 *
 * @param previousUnits 上一次推送**实际带走**的会话单元（'' / 缺省 = 无记录 → 本次检测不到删除）
 * @param localUnits    本机**现存**的会话单元（全量枚举，不是本次勾选）
 * @param previousTombstones 此前累积的墓碑
 * @returns tombstones = 新墓碑全集（去重保序、已撤销的剔除、按上限截断）；
 *          deletedNow = 本次新检测到的删除（供报告/告警）
 */
export declare function nextSessionTombstones(input: {
    previousUnits: readonly string[];
    localUnits: readonly string[];
    previousTombstones: readonly string[];
    cap?: number;
}): {
    tombstones: string[];
    deletedNow: string[];
};
/**
 * 把墓碑命中的会话单元从**将要导入的载荷**里剔除。
 *
 * 只认文件类分区的 `{ version: 1, files }` 形态；命中判据是 relativePath 的前两段
 * （= 会话单元），因此一个会话目录下的全部 generation 一起剔除（单元不可拆半）。
 * 没有任何命中 → 原样返回（避免无谓的对象复制）。
 */
export declare function stripTombstonedUnits(section: unknown, tombstones: readonly string[]): {
    section: unknown;
    removed: string[];
};
/** 文件类分区载荷（version 1 + files）→ 其中出现的会话单元 id（去重保序）。 */
export declare function sessionUnitIdsOfSection(section: unknown): string[];
/** 内容哈希（用于报告/去重；调用方需要时可对单元清单取指纹）。 */
export declare function unitSetFingerprint(units: readonly string[]): string;
/**
 * 一次远端 list() 的读取结果。
 *
 * `metas` 为空**且**无 `reason` 才代表「远端确实为空」；有 reason = 读不到（按「看不到远端」
 * 处理，调用方告警后继续，绝不把它当成「远端没东西」而误判）。
 */
export interface RemoteSnapshotIndex {
    metas: SyncSnapshotMeta[];
    reason?: string;
}
/** 读一次远端快照索引（只读、零写入）。push 的「是否被推进」判定与墓碑继承共用这一份。 */
export declare function listRemoteSnapshotIndex(transport: Pick<SyncTransport, 'list'>): Promise<RemoteSnapshotIndex>;
/**
 * 远端最新快照携带的会话删除墓碑（去重、去空、保序）。
 *
 * 只取**最新一份**：manifest.deletedSessions 是累积清单（见文件头），旧快照的墓碑必然被后续
 * 快照包含；把整段历史并起来只会让「已经在别处撤销的墓碑」复活。
 * 远端为空 / 老快照缺字段 → 空数组（行为与改造前逐字一致：不继承任何墓碑）。
 */
export declare function remoteTombstonesOf(metas: readonly SyncSnapshotMeta[]): string[];
/** 一次 push 的会话簿记结果（manifest / baseline / 告警共用这一份）。 */
export interface SessionBookkeepingResult {
    /** false = 本次没有可用的会话枚举（没推 sessions / 适配器不支持 / 枚举失败或为空） */
    tracked: boolean;
    sessionUnits: string[];
    tombstones: string[];
    /** 本次**新**发现的删除（之前推过、这次本机没了） */
    deletedNow: string[];
    /** 从远端继承来的墓碑条数（本机此前没有、且本机也没有实体） */
    inherited: number;
}
/**
 * 墓碑集合的唯一计算点（本机删除 + 远端继承合进同一条累积链）。
 *
 * 去重、FIFO 上限、以及「本机还有实体 ⇒ 撤销墓碑」这条不变量对继承来的墓碑同样适用：
 * 另一台设备删了、本机仍有 → 用户在本机显然没删，绝不把它记成本机删除。
 */
export declare function planSessionBookkeeping(args: {
    previousUnits: readonly string[];
    previousTombstones: readonly string[];
    localUnits: readonly string[];
    exportedSessions: SectionData | undefined;
    remoteTombstones: readonly string[];
}): Omit<SessionBookkeepingResult, 'tracked'>;
/** 按墓碑剔除**将要导入**的会话（旧快照不得复活已删除的对话）。只动载荷，不动本机数据。 */
export declare function stripTombstonedSessionsInPlace<P extends {
    manifest: {
        deletedSessions?: readonly string[];
    };
    sections: unknown;
}>(snapshot: P): string[];
