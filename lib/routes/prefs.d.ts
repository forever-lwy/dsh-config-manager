/**
 * 路由组：插件自身信息（Star 引导 / 版本更新内容弹窗状态；复用 ui-prefs.json）
 * 与**版本更新检查 / 自更新**（检查只读探测 npm registry，见 `core/update-check.ts` 的四条硬边界；
 * 自更新 = 用户显式点「立即更新」后的 `POST /update-apply`，见 `core/self-update.ts` 的六条硬边界）。
 *
 * W1（host-entry#F-02/#F-03）：路由只在这里声明一次 —— endpoint({ path, methods }, handler) 的
 * path/methods 就是唯一声明处；围栏、方法判定与顶层异常处理由 src/routes/kit.ts 在注册点统一提供。
 */
import type { WebRoute } from './kit.ts';
import type { RoutesEnv } from './context.ts';
export declare function prefsRoutes(env: RoutesEnv): WebRoute[];
