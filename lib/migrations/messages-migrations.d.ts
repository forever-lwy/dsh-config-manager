/**
 * 迁移链领域消息目录（zh 源 / en 镜像）。
 *
 * 为什么不放在 src/core/messages-core.ts：架构边界（tests/architecture-boundaries.test.ts）
 * 规定 src/migrations/** 只允许依赖 node 内置 / 自身 / ../schema / ../utils，
 * **不得 import ../core** —— 迁移链必须保持对 core 零耦合（core 消费它，不能反过来）。
 * 因此本目录自带一份零依赖的消息解析器：语言源由 core 侧接线（core → migrations 是允许方向，
 * 见 src/core/messages-core.ts 的 setMigrationLanguageSource），未接线时 = zh
 * （与迁移链改造前的行为逐字一致）。
 *
 * 纪律：
 *  - zh 值 = 改造前的中文字面量原样（逐字不变，既有测试断言依赖它）；
 *  - en 值类型 Record<keyof typeof zh, string>（缺键/多键即编译错误），必须纯英文；
 *  - 动态明细（版本号、from/to）一律以 {param} 插值传入。
 */
export declare const zh: {
    'migrations.stepConflict': string;
    'migrations.schemaTooNew': string;
    'migrations.schemaTooOld': string;
    'migrations.noPath': string;
    'migrations.stepNotAdvanced': string;
};
export declare const en: Record<keyof typeof zh, string>;
export type MigrationMessageKey = keyof typeof zh;
export type MigrationMessageParams = Readonly<Record<string, string | number>>;
/** core 侧接线：让迁移链文案跟随引擎语言（core → migrations 是允许方向）。 */
export declare function setMigrationLanguageSource(resolve: () => 'zh' | 'en'): void;
/**
 * 迁移链的活翻译器：每次调用解析当前语言（默认 zh，绝不抛错），未知键回落键名。
 * 与 src/core/engine-locale.ts 的 engineMsg 同口径，只是不依赖 core。
 */
export declare function migMsg(key: MigrationMessageKey, params?: MigrationMessageParams): string;
