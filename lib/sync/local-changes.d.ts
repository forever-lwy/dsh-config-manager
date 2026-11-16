import type { ConfigAdapter, HostContext, SecretScanner } from '../core/types.ts';
import type { SyncState } from './sync-state.ts';
/**
 * 任一候选分区（= 会进载荷的那一批）的导出 hash ≠ 基线 ⇒ true。
 * - 从未同步（state.sections 为空）→ true；
 * - 基线缺该分区 → true（比不出来的不能当成「没变」）；
 * - 单项导出失败 → 跳过该项（与 push 单项跳过语义一致），绝不当成「有变化」去触发空推。
 * 只读本地导出 + sync-state，不碰远端。
 */
export declare function hasLocalSectionChanges(args: {
    state: SyncState;
    adapters: readonly ConfigAdapter[];
    ctx: HostContext;
    scanner: SecretScanner;
}): Promise<boolean>;
