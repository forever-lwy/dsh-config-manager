import { type ProcessControlDeps } from './process-control.ts';
import type { DshProfileStopResult } from './dsh-profile-launcher.ts';
/** 心跳目录名（`<dataDir>/running`）。 */
export declare const RUNTIME_DIR_NAME = "running";
/** 心跳文件 schema 版本（改结构时递增；解析端只认自己认识的版本）。 */
export declare const RUNTIME_SCHEMA_VERSION = 1;
/** 心跳刷新间隔（20s；判死阈值是它的 3 倍）。 */
export declare const RUNTIME_REFRESH_MS = 20000;
/** 心跳过期阈值（超时即视为死实例——进程被硬杀时没人来删文件）。 */
export declare const RUNTIME_STALE_MS = 60000;
/** `<dataDir>/running/<profile>.json` 的内容。 */
export interface DshProfileRuntimeRecord {
    schemaVersion: number;
    /** profile 名 */
    name: string;
    /** 该实例的进程 pid（判活 + 停止都靠它） */
    pid: number;
    /** 该实例的 web 端口（无 webServer 的部署为 null；**不含 token**） */
    port: number | null;
    /** 启动时刻（ISO，展示用） */
    startedAt: string;
    /** 上次心跳时刻（epoch ms；判死用） */
    updatedAt: number;
}
/** 容错解析心跳文件（坏 JSON / 版本不符 / 字段缺失 → null，绝不抛）。 */
export declare function parseRuntimeRecord(text: string): DshProfileRuntimeRecord | null;
/** 心跳是否代表一个活着的实例：pid 存活 **且** 未过期（两者缺一不可）。 */
export declare function runtimeRecordLive(record: DshProfileRuntimeRecord, opts: {
    isAlivePid: (pid: number) => boolean;
    now: number;
    staleMs?: number;
}): boolean;
export interface DshProfileRuntimeOptions {
    /** 插件 dataDir（心跳落在 <dataDir>/running/） */
    dataDir: string;
    /** 本实例跑的 profile 名 */
    name: string;
    /** 自己的 web 端口（惰性；webServer 还没就绪时为 undefined → null） */
    port?: () => number | null;
    /** 自己的 pid（缺省 process.pid；测试可注入） */
    pid?: number;
    deps?: ProcessControlDeps;
    staleMs?: number;
    refreshMs?: number;
    /** 定时器注入（测试用；返回取消函数） */
    schedule?: (fn: () => void, ms: number) => () => void;
}
/** 心跳注册表：announce（自报）/ withdraw（自撤）/ listActive（看别人）/ stopExternal（停别人）。 */
export declare class DshProfileRuntimeRegistry {
    private readonly dataDir;
    private readonly name;
    private readonly pid;
    private readonly port;
    private readonly staleMs;
    private readonly refreshMs;
    private readonly schedule;
    private readonly proc;
    private readonly startedAt;
    constructor(options: DshProfileRuntimeOptions);
    /** 心跳目录（`<dataDir>/running`） */
    dir(): string;
    /** 某个 profile 的心跳文件绝对路径（名字哈希保证唯一，见 runtimeFileName） */
    fileFor(name: string): string;
    /** 旧版心跳文件（升级清理用：名字清洗多对一，旧文件可能已被别的 profile 覆盖过） */
    private legacyFileFor;
    /** 删掉自己那份旧版心跳（升级后不留双份；不碰别人的文件） */
    private dropLegacyHeartbeat;
    /** 自报/刷新心跳（幂等；apply 时写一次，之后由 startHeartbeat 定期刷）。 */
    announce(): DshProfileRuntimeRecord;
    /** 撤回自己的心跳（dispose 时；正常退出的实例不留垃圾文件）。 */
    withdraw(): void;
    /**
     * 定时刷新（返回停止函数；调用方必须用 ctx.effect 绑定生命周期）。
     * 不刷新也不会「变成别人可启动」——只是过期后会被别的实例当成死实例。
     */
    startHeartbeat(): () => void;
    /** 当前活着的实例（含自己；死实例/坏文件的记录顺手清掉）。 */
    listActive(): DshProfileRuntimeRecord[];
    /**
     * 停掉**别的**实例（按它的心跳 pid）。
     *  - 没有活心跳 → notRunning；
     *  - 心跳就是自己 → currentProfile（停自己会死在响应途中，UI 也不给这个按钮）；
     *  - 强杀后仍活着 → stopFailed。
     * 成功后删掉那个心跳文件（对方已死，不会自己撤）。
     */
    stopExternal(name: string): Promise<DshProfileStopResult>;
}
