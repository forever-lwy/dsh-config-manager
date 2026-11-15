import type { WebRoute } from './kit.ts';
import type { RoutesEnv } from './context.ts';
/**
 * 该来源当前版本读不了会话（不猜版本）时的稳定提示。
 *
 * 为什么宿主侧要显式传 `targetSessionFormatVersion`：会话转码必须知道目标机的格式版本，
 * 缺省时内核逐条报 session-format-version-unknown 且**不产出 sessions 分区**（绝不猜）。
 * 宿主能读到真实版本（`host.sessionFormatVersion`），所以 GUI 路径用它 —— 这与离线 CLI
 * 不同：CLI 拿不到版本，只能如实报码。
 */
export declare function foreignRoutes(env: RoutesEnv): WebRoute[];
