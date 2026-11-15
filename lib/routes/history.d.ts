/**
 * 路由组：迁移历史审计（只读查询 + 导出）。
 *
 * W1（host-entry#F-02/#F-03）：路由只在这里声明一次 —— endpoint({ path, methods }, handler) 的
 * path/methods 就是唯一声明处；围栏、方法判定与顶层异常处理由 src/routes/kit.ts 在注册点统一提供。
 */
import type { WebRoute } from './kit.ts';
import type { RoutesEnv } from './context.ts';
export declare function historyRoutes(env: RoutesEnv): WebRoute[];
