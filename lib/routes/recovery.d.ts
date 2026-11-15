/**
 * 路由组：Phase 5 recovery 编排（prefix 路由，内部按 path 分发）。
 *
 * W1（host-entry#F-02/#F-03）：路由只在这里声明一次 —— endpoint({ path, methods }, handler) 的
 * path/methods 就是唯一声明处；围栏、方法判定与顶层异常处理由 src/routes/kit.ts 在注册点统一提供。
 */
import type { WebRoute } from './kit.ts';
import type { RoutesEnv } from './context.ts';
import type { RollbackPreviewResult, RollbackRewindResult } from '../core/rollback-point.ts';
/**
 * t8 的硬拒**什么时候该生效**（判定链里的位置，t8 实现说明的选项 ②）。
 *
 * 既有护栏**优先**：确认门没开（`userConfirmed !== true`）、该点本来就不可回退
 * （`preview.ok !== true || preview.canRestore !== true`：protected / record-incomplete /
 * 记录不存在 / 存储不可用）、或 SAFE MODE 正拦着（由锁门给 423）时，**把结论让给引擎自己的
 * 结构化拒绝** —— 那些情形下说「对话正在运行」是误导：用户等多久都退不了。
 * 只有「这次本来能退、只是因为它正在运行而不能动工作区」时，才用 `session-active`。
 *
 * 两道门（R1 预检 / R2 锁内二道保险）共用这一份判据，绝不各写一套。
 */
export declare function sessionActiveGateApplies(preview: RollbackPreviewResult, userConfirmed: boolean, safeModeBlocked: boolean): boolean;
/**
 * 运行中对话的拒绝结果（t8）：**形状与引擎的 rewind 结果同构**，两处（路由预检 / 锁内二道保险）
 * 共用一份，界面照常走「结果 → 文案」那条链。`segments` 恒为空 = 一段都没动（零写入）。
 *
 * 判据来源只有一个：**preview 已算出的 `session.active`**（引擎按会话日志 mtime 静默窗算）——
 * 路由**绝不自己 stat 会话日志**（那会变成第二份判据，两处迟早漂移）。
 */
export declare function sessionActiveDenied(id: string, preview: RollbackPreviewResult): RollbackRewindResult;
export declare function recoveryRoutes(env: RoutesEnv): WebRoute[];
