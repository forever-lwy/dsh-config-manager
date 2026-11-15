import { isPlanItemExcluded } from './selection-model.js';
/** 全部合法取值（UI 的三选一 radio 直接渲染它，顺序即展示顺序）。 */
export const SESSION_FORMAT_DISPOSITIONS = ['abort', 'skip', 'guide'];
/**
 * 缺省处置 = `abort`（设计稿 §6 方案 A）。
 *
 * 为什么默认阻断而不是默认跳过：「你会丢一批对话」必须是用户显式决定的事；
 * 默认 skip 会让用户在没看清的情况下少导一批对话（盘上少了几百 MB、对话也没了）。
 */
export const DEFAULT_SESSION_FORMAT_DISPOSITION = 'abort';
/** 解析用户/宿主传入的处置值；非法/缺失 → undefined（调用方回退缺省，绝不猜）。 */
export function parseSessionFormatDisposition(raw) {
    return raw === 'abort' || raw === 'skip' || raw === 'guide' ? raw : undefined;
}
/** 会话单元的 plan-item id 前缀（与 file-collection 的 `${adapter.id}:${unit}` 同形）。 */
const SESSION_UNIT_PREFIX = 'sessions:';
/**
 * 探针的单元键（`projectKey/会话目录`，来自分区内的相对路径）→ 计划项单元 id。
 * 两种形态都接受：已经带前缀的原样返回（幂等），便于宿主与浏览器半共用。
 */
export function sessionUnitId(raw) {
    return raw.startsWith(SESSION_UNIT_PREFIX) ? raw : SESSION_UNIT_PREFIX + raw;
}
function factsOf(target, units, inspected, unsampled) {
    if (target === null)
        return null;
    if (units.length === 0)
        return null;
    const seen = new Set();
    const unreadable = [];
    for (const unit of units) {
        const unitId = sessionUnitId(unit.unitId);
        if (seen.has(unitId))
            continue;
        seen.add(unitId);
        unreadable.push({ unitId, version: unit.version });
    }
    return {
        target,
        unreadable,
        ...(inspected !== undefined ? { inspected } : {}),
        ...(unsampled !== undefined ? { unsampled } : {}),
    };
}
/**
 * 分析结果 → 处置事实（浏览器半的主入口；`/analyze` 已回传单元级结论）。
 * 缺字段 / 本机版本未知 / 没有读不了的单元 → null（界面据此**不**渲染处置控件）。
 */
export function sessionFormatFactsFromAnalysis(analysis) {
    const facts = analysis?.sessionFormats;
    if (facts === undefined)
        return null;
    return factsOf(facts.target, facts.unreadable, facts.sampled, facts.skipped);
}
/**
 * 计划项 → 处置事实（宿主 /plan 阶段用：此时只有计划，没有 analysis）。
 *
 * 判据 = 计划项上的 `formatUnsupported` 标记（由 analyzer 在计划生成期打上），
 * 它本身就是「探针结论 ∩ 本次计划」的交集，因此这里不需要再跑一次探针。
 */
export function sessionFormatFactsFromPlan(items) {
    const marked = items.filter((item) => item.formatUnsupported !== undefined);
    if (marked.length === 0)
        return null;
    const units = [];
    let target = null;
    for (const item of marked) {
        const flag = item.formatUnsupported;
        if (flag === undefined)
            continue;
        target = flag.target;
        units.push({ unitId: item.unitId ?? item.id, version: flag.version });
    }
    return factsOf(target, units);
}
/** 最高的「读不了」版本（报告文案用；无条目 → null）。 */
export function sessionFormatNewest(facts) {
    if (facts === null || facts.unreadable.length === 0)
        return null;
    return facts.unreadable.reduce((max, unit) => (unit.version > max ? unit.version : max), 0);
}
/**
 * 本次处置是否**阻断**导入计划生成（宿主据此返回 409；客户端据此渲染阻断态）。
 *
 * 只有 `abort` + 确有读不了的单元 + 本机版本已知才阻断；skip/guide 一律放行（它们在
 * 计划/执行阶段另有语义）。
 */
export function sessionFormatBlocksPlan(facts, disposition) {
    return disposition === 'abort' && facts !== null && facts.unreadable.length > 0;
}
/**
 * `skip` 处置下**默认不勾选**的单元 id（其余处置一律空数组）。
 *
 * 为什么不在宿主侧做过滤：条目级白名单是用户意图的唯一事实（AGENTS.md：引擎不得
 * 替用户做「向下展开」的取舍）。这里只给出「默认不勾」的初值，用户仍可在选择器里
 * 手动勾回来 —— 勾回来就是显式意愿，照常导入。
 */
export function sessionFormatSkipUnits(facts, disposition) {
    if (disposition !== 'skip' || facts === null)
        return [];
    return facts.unreadable.map((unit) => unit.unitId);
}
/**
 * 被处置规则跳过的计划项（`skip` 生效后）：`formatUnsupported` 命中且被选择排除的项。
 *
 * 报告里的「跳过 N 条（v{newer} > 本机 v{target}）」必须与本函数逐条同源 ——
 * 否则界面说的数字与真正没导入的条目会对不上（用户报过的那类「数字自相矛盾」）。
 */
export function sessionFormatSkippedItems(plan, selection) {
    if (plan === null || selection === null)
        return [];
    return plan.items.filter((item) => item.formatUnsupported !== undefined && isPlanItemExcluded(item, selection));
}
/**
 * 离线只读体检命令（可复制）。
 *
 * 为什么给这一条而不是「升级命令」：升级 DSH 的方式随安装形态而变（桌面端在应用内、
 * CLI 用各自包管理器），插件**不知道**也不该猜用户的安装方式（AGENTS.md：绝不猜）；
 * 而本插件自己的 CLI 命令是确定可复制的，且它正是「先看清楚本机到底怎么了」的入口。
 */
export const SESSION_FORMAT_DOCTOR_COMMAND = 'dsh-config-manager sessions doctor';
//# sourceMappingURL=session-format-disposition.js.map