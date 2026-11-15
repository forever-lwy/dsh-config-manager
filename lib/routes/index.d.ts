/**
 * 路由表装配点（W1）：把按域拆分的组文件拼成一张路由表。
 *
 * 顺序对匹配无影响：DSH webServer 的契约是「命名路由必须互不相同，注册顺序不影响请求」
 * （见 @deepseek-ai/dsh-host-webserver 的 WebServer 文档）。src/index.ts 保留的 7 条被源码级
 * 守卫按文件窗口钉住，其余 75 条在这里组装（总数 82：含 path-browse）。
 */
import type { WebRoute } from './kit.ts';
import type { RoutesEnv } from './context.ts';
export declare function buildRoutes(env: RoutesEnv): WebRoute[];
