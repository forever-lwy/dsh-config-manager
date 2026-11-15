/** CLI 侧只依赖这个最小 IO 形状（与 src/cli/index.ts 的 CliIo 结构等价，避免循环 import） */
export interface ImportIo {
    log: (s: string) => void;
    error: (s: string) => void;
}
export interface ImportSourceOptions {
    /** 外部来源 id（六个之一；未知 → 打印可用清单并退出 1） */
    from: string;
    /** 只打印计划，零写入 */
    dryRun: boolean;
    /** 输出 ZIP 路径（缺省写入 exportsDir 下自动命名，且绝不覆盖既有文件） */
    out?: string;
    /** 项目目录（契约 §8.2 的项目级路径；缺省 = 进程 cwd） */
    cwd?: string;
    /** 缺省导出目录（由 CLI 的 resolveExportsDir 解析后传入，本模块不做 --data-dir 语义） */
    exportsDir: string;
    /** manifest.exporter.version（缺省中性占位，绝不谎报版本） */
    exporterVersion?: string;
    /** manifest.source.dshVersion（缺省 cli-offline：离线 CLI 探测不到真实 DSH 版本） */
    dshVersion?: string;
}
export interface ImportSourceDeps {
    /** 用户 home（缺省 os.homedir()，由 foreignSourceContext 回退；测试注入临时目录，绝不依赖真机 home） */
    userHome?: string;
}
/**
 * 执行 `import --from`。
 *
 * `projectDir` 语义：`--cwd` 显式给出时用它；缺省 = 进程 cwd（「我现在在哪个项目里」就是
 * Cursor/Codex 项目级配置的含义）。宿主路由走 `?projectDir=`，缺省不猜（不扫 DSH 自己的 cwd）。
 */
export declare function runImportSource(options: ImportSourceOptions, io: ImportIo, env?: Record<string, string | undefined>, deps?: ImportSourceDeps): Promise<number>;
