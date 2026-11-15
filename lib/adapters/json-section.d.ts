import type { SectionId } from '../schema/types.ts';
import type { MsgFunc, zh } from '../core/messages.ts';
import type { ValidationResult } from '../core/types.ts';
/** 校验问题列表（各 adapter 的形状检查直接 push 到这里，与历史 `issues` 数组同一形状）。 */
export type SectionIssues = ValidationResult['issues'];
/**
 * JSON 分区通用结构校验骨架。
 *
 * 执行顺序（与改造前逐字一致，保证行为等价）：
 *  1. object 守卫：非对象 → **直接返回**单条 `objectMessageKey` 错误（缺省 `adapter.validate.object`；后续检查不再执行）；
 *  2. version 守卫：`version !== sectionMeta(sectionId).dataVersion` → push 一条 `version` 错误，
 *     **不提前返回**（继续做形状检查，与历史实现一致）；
 *  3. `shape` 回调：分区特有的载荷形状检查（可选）。
 *
 * @param sectionId 分区 id —— 同时是 object 错误的默认 subject 与 dataVersion 的查表键
 * @param data 反序列化后的分区载荷（来自不可信备份 → 必须按 unknown 处理）
 * @param msg 文案翻译器（adapter 的 `validate(data, msg = zhMsg)` 原样传入）
 * @param shape 分区特有的形状检查（在 version 守卫之后调用）
 * @param subject object 错误里的显示名；缺省 = sectionId。历史上 credentials 用的是
 *   `'credentials'`（而非分区 id `credentialsStatus`），此参数为保留该原文案而存在 ——
 *   改文案属独立的行为变更，不在本任务射程内。
 * @param objectMessageKey object 错误的**消息键**（t11 新增，可选）；缺省 `adapter.validate.object`
 *   （`'{subject} 数据必须是对象'`）。为什么需要它：文件类分区历史上用的是专用键
 *   `adapter.validate.fileSection`（`'文件分区数据必须是对象'`，**不含** `{subject}` 占位符），
 *   那是**键**级差异 —— `subject` 参数补不了它（把 subject 拼成"文件分区"后中文模板仍多一个空格），
 *   而硬换键会让 skills / agentPresets / agentInstructions / sessions / self 五个分区的用户可见
 *   报错文案一起变。有了这个可选键，那处也能并入骨架而文案逐字不变。
 *   键必须存在于 `src/core/messages.ts` 目录（`MsgFunc` 形参是 string，编译器只能校验到键名集合）。
 */
export declare function validateJsonSection<S extends {
    version?: unknown;
}>(sectionId: SectionId, data: unknown, msg: MsgFunc, shape?: (section: S, issues: SectionIssues) => void, subject?: string, objectMessageKey?: keyof typeof zh): ValidationResult;
