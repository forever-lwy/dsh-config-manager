import type { WebRoute } from '../../routes/kit.ts';
import { type RescuePaths } from '../actions.ts';
import { renderMessagePage } from './page.ts';
export interface ConsoleContext {
    paths: RescuePaths;
    version: string;
    startedAt: string;
    /** 一次性 action token（POST 时消费；无状态前端靠它拿不到也不需要 cookie 里的额外秘密） */
    actionTokens: Set<string>;
    /** 高危动作的终端确认码（重装用；只在终端打印，绝不渲染进页面） */
    dangerPhrase: string;
}
/** 构造救急台的全部路由（唯一声明处）。 */
export declare function buildConsoleRoutes(context: ConsoleContext): WebRoute[];
export { renderMessagePage };
