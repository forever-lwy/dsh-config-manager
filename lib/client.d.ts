window.__ModuleLoader__.load({
	id: "@forever-lwy/dsh-config-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

import { PropsRuntime, SlotCore, TranslateNS } from "@deepseek-ai/dsh-client-ui-slots";
/**
 * 核心领域类型（Export Schema v1 的纯类型定义）。
 *
 * 对齐 Docs/design/architecture.md §13.1 —— m3/m5 的共同契约。
 * 本文件只含与 DSH 运行时无关的纯数据形状；DSH Service 门面类型见 src/core/types.ts。
 */
/** 运行平台（等价 NodeJS.Platform，但保持类型自包含，可在浏览器侧引用） */
type Platform = 'win32' | 'darwin' | 'linux' | 'freebsd' | 'openbsd' | 'aix' | 'sunos' | 'android' | 'cygwin' | 'haiku' | 'netbsd' | 'other';
/**
 * 分区标识，与 ZIP 目录结构、manifest.sections 键一一对应。
 * 明确不实现的分区（keybindings/workflows/commands）不在此列；
 * rules 已由 agentInstructions（~/.dsh/AGENTS.md，dsh-agent-instructions 全局指令）承接。
 */
type SectionId = 'settings' | 'ui' | 'providers' | 'plugins' | 'mcp' | 'prompts' | 'skills' | 'agentPresets' | 'agentInstructions' | 'workspaces' | 'pluginFiles' | 'credentialsStatus' | 'secrets' | 'sessions' | 'self' | 'pluginData' | 'pluginAssets';
/** 加密备份的算法参数（非秘密：salt/iv/authTag 仅用于解密与完整性校验） */
interface EncryptionInfo {
  algorithm: 'aes-256-gcm';
  kdf: 'scrypt';
  kdfParams: {
    N: number;
    r: number;
    p: number;
    keyLength: number;
  };
  salt: string;
  iv: string;
  authTag: string;
  version: number;
}
/**
 * **外部来源包**的溯源块（manifest.foreign，2026-10-18 新增，纯 additive）。
 *
 * 为什么需要它：外部来源（Claude Code / Hermes / …）合成的包是**标准 bundle v1**，
 * 落盘后与 DSH 自产备份**逐字同构** —— 事后无法复核「这包从哪来」。本块把来源标识、
 * 读取位置、项目根、插件元数据与跳过聚合写进 manifest，供用户与界面核对。
 *
 * 三条纪律（与 src/foreign/types.ts 的 ForeignOrigin 同口径）：
 *  ① **只放标识与计数，绝不放值**（凭据只有引用名，诊断只有机器码，无一字配置内容）；
 *  ② 向后兼容：旧包没有该字段 ⇒ 缺省即合法；本字段的存在**绝不能**让旧/新包被拒；
 *  ③ 缺字段即「不知道」，绝不填默认值假装知道。
 */
interface ManifestForeignOrigin {
  /** 来源 agent id（稳定机器标识，如 claude-code / hermes；不随文案变化） */
  agent: string;
  /** 实际读取的位置（相对 home 的 POSIX 路径；不含任何值） */
  locations?: string[];
  /** 来源侧版本标记（读不到即省略） */
  sourceVersion?: string;
  /** 被扫描的项目根绝对路径（仅溯源，供用户核对；绝不进任何分区载荷） */
  projects?: string[];
  /** 插件清单（名称 / 版本 / 市场 / 来源仓库 / ref / 组件种类；**不含凭据**） */
  plugins?: {
    name: string;
    version?: string;
    marketplace?: string;
    repo?: string;
    ref?: string;
    components?: string[];
  }[];
  /** 跳过与诊断汇总（机器码 + 条数，**不含任何值**） */
  skipped?: {
    code: string;
    count: number;
  }[];
  /** 需要用户在目标机补录的凭据引用名（只有名字，**没有任何值**） */
  credentialRefs?: string[];
}
/** 每个导出 ZIP 根部的 manifest.json */
interface Manifest {
  schemaVersion: number;
  exporter: {
    name: string;
    version: string;
  };
  source: {
    dshVersion: string;
    platform: Platform;
    arch: string;
  };
  exportedAt: string;
  /**
   * **导出机的 DSH home 绝对路径**（如 /opt/dsh/.dsh、C:\Users\x\.dsh）；旧包没有这个字段。
   *
   * 用途：跨机导入时**自动重定基** —— 备份里位于「导出机基础路径」之下的绝对路径（会话首帧 cwd、
   * 工作区 path、mcp cwd…）一律改成「本机基础路径 + 同一后缀」。基础路径是机器身份、本机可精确
   * 得知，因此比让用户手填自由前缀映射更安全可控；用户映射仍在其后依次生效（可覆盖本规则）。
   *
   * 宽容读取：非字符串/缺失一律按「未知」处理（不重定基，不报错）。
   */
  sourceHome?: string;
  /**
   * **外部来源包的溯源块**（见 ManifestForeignOrigin）；DSH 自产备份没有该字段。
   *
   * 宽容读取：缺省 = 旧包（合法）；存在但形状/字段类型不对 = 仅 warning（绝不因此拒绝导入）。
   */
  foreign?: ManifestForeignOrigin;
  sections: Record<SectionId, boolean>;
  security: {
    containsSecrets: boolean;
    encrypted: boolean;
    encryption: EncryptionInfo | null;
  };
}
/**
 * 删除墓碑（tombstone）机制（F4）：记录用户明确删除的条目，
 * 导入/恢复时据此过滤，防止「旧备份复活已删条目」。
 *
 * 设计（借鉴 uagent-sync workspace-state-codec）：墓碑按 kind+id 去重，
 * 过滤时把恢复数据里的条目映射为 {kind, id} 键，命中墓碑的条目剔除。
 *
 * 持久化：<dataDir>/tombstones.json（self 分区数据目录 $DSH_HOME/dsh-config-manager/ 下）。
 * 本模块零依赖（不 import node 模块 / 核心层类型），fs 由调用方注入，
 * 纯逻辑可独立测试；dataDir 与文件名形态由调用方保持一致。
 *
 * 安全语义：墓碑文件缺失/损坏一律安全降级为空列表（尽力而为的过滤，
 * 绝不因墓碑文件问题阻塞导入主流程）。
 */
/** 墓碑条目类型：插件 / 技能（skills 分区文件）/ 整个分区 / 其他文件（agentPresets 等文件类分区） */
type TombstoneKind = 'plugin' | 'skill' | 'section' | 'file';
interface ExportOptions {
  /** 是否包含真实秘密（必须配合 encryption 提供者；缺省 false = 只导状态） */
  includeSecrets: boolean;
  /** 仅导出指定分区（缺省 = 全部默认包含分区） */
  only?: SectionId[];
  /**
   * 条目级选择（Phase 1）：分区 → 允许导出的「最小可拆单元」id 白名单。
   *
   * 语义（三分，必须严格区分）：
   *  - 键**缺省** → 该分区全量导出（向后兼容：旧调用方零改动，行为与改造前完全一致）；
   *  - 键存在且为**空数组** → 该分区整体不导出（等价于未勾选该分区；Exporter 在选定阶段即剔除，
   *    不会产出空载荷分区，manifest.sections 相应为 false）；
   *  - 键存在且非空 → 只导出白名单内的单元，其余单元被剔除。
   *
   * 单元 id 由 ConfigAdapter.listUnits() 声明（规则见 adapters/units.ts）——
   * 未实现 listUnits 的分区不可细分，传入白名单一律忽略（保持全量）。
   */
  includeItems?: Partial<Record<SectionId, string[]>>;
  /**
   * 会话分区按数量筛选（issue #39 Feature 1；**键缺省 = 现有行为**，旧调用方零改动）。
   *
   * 语义（档位与宿主界面一致）：
   *  - 键存在且 `limit` 缺省 / 非整数 → 显式选中 sessions 分区，但不施加数量限制（全带）；
   *  - `limit === 0` → 整个 sessions 分区不带（等价于未勾选）；
   *  - `limit < 0` → 全带（并显式选中该分区）；
   *  - `limit > 0` → 只带「最新 N 个会话」。
   *
   * 「最新」= 该会话目录下**会话日志文件**的最新 mtime（不用目录 mtime：增量写入时不可靠）。
   * 单位是**会话目录**（`<projectKey>/<sessionId>`）——同一会话的新旧日志必须一起走；
   * 文件名判据与排序见 `core/session-select.ts`（不写死文件名）。
   */
  sessions?: {
    limit?: number;
  };
  /** 导出文件路径（缺省自动生成 dsh-config-<date>.zip） */
  outPath?: string;
  /** 导出备注（P0-④：host 写入 exports/.backup-notes.json，随 self 分区迁移；非敏感） */
  note?: string;
}
/**
 * 分区内「可单独勾选的最小单元」（Phase 1 条目级导出选择）。
 *
 * 单元是**语义整体、不可再拆**：一个技能目录 bundle、一个会话目录、一个插件包。
 * 由 ConfigAdapter.listUnits() 声明；id 命名空间与导入侧 PlanItem.id 一致，
 * 保证「导出时勾选的单元」将来能直接映射到「导入时排除的条目」。
 */
interface ExportUnit {
  /** 全局唯一 id（`<section>:<单元路径>` / `plugin:<包名>` / `workspace:<id>` …） */
  id: string;
  /** 展示名（包名 / 目录名 / 工作区标题） */
  label: string;
  /** 副标题补充（版本 / 绝对路径等自行格式化的信息；**不要放 UI 文案模板**，文案由 i18n 负责） */
  detail?: string;
  /** 成员文件数（文件类单元用；UI 据此渲染「N 个文件」） */
  fileCount?: number;
  /** 单元体积（字节；文件类 = 成员文件合计） */
  sizeBytes: number;
  /** 原子组：必须与本单元同进同出的其它单元 id（如 pnpm-workspace.yaml ↔ patch 文件） */
  lockedWith?: string[];
  /**
   * 本单元**拥有的会话 id**（工作区单元专用；issue #45）。
   *
   * 用途：勾选联动 —— 勾了会话就自动勾上它所属的工作区，取消工作区就取消它的会话。
   * 取值 = 工作区记录 sessionIds 原样（`session-<uuid>` 形态，与会话单元 id 的末段目录名归一化后配对），
   * 不翻译路径（跨机时路径不可靠）。
   */
  sessionIds?: string[];
  /**
   * 本单元 **path 的 cwd 目录键**（`projectKeyOf(path)`；工作区单元专用；issue #45）。
   *
   * 为什么需要第二判据：DSH 的 `sessionIds` **只登记了一部分会话**（真机实测：一次可选择 570 条会话里
   * 只有 23 条落在 sessionIds 内），而 DSH 自己按「会话 cwd 的目录键 == 工作区 path 的目录键」把会话显示在
   * 工作区下。勾选联动必须与**显示口径**一致，否则用户在界面上看到对话挂在某工作区下、勾它却不联动。
   */
  projectKey?: string;
  /**
   * 分组名（同分区内的二级分组；如 sessions 按工作区聚合——用户要求「按工作区分类对话」）。
   *
   * 语义：**纯展示层分组**，不参与勾选/导出契约（契约只认 id）。缺省 = 该单元按现有方式
   * 平铺渲染（skills / pluginFiles 等分区行为逐像素不变）。分组名是宿主直出的原始字符串
   * （工作区标题 / 项目键），UI 渲染前同样要过 redact()。
   */
  group?: string;
  /**
   * 父对话的会话裸键（`sessionIdKey(目录名)`；**只有 `origin='subagent'` 的子代理会话才有值**）。
   *
   * 用途：导出选择器里的「父 ↔ 子会话」勾选联动（勾父自动勾上它的子代理会话；勾子自动带上父）。
   * 为什么必须由宿主下发：父子关系只存在于 DSH 的会话存储里（`SessionStoreFacade.parentRelations()`），
   * 浏览器侧无从推断 —— 不下发时联动静默失效，界面勾选与包内容就会不一致（用户实测：勾 2 条、
   * 包里 41 条）。非 sessions 分区 / 非子代理会话一律不设该字段（不猜）。
   */
  parentSessionId?: string;
  /**
   * 空白会话（**从未提问过**；只有 sessions 分区的单元可能有值）。
   *
   * 用途：DSH 自己给这类会话的标题就是本地化的「新会话」（`session.new`），没有标题可显示。
   * 只下发**事实**，不下发文案 —— 界面按当前语言显示（与 DSH 同口径），绝不用 uuid 冒充标题。
   */
  blank?: boolean;
  /**
   * 该插件**声明的第三方数据区域**（只有 \`plugin:<包名>\` 单元可能有值；导出选择器「按插件看」用）。
   *
   * 用途：选择器要在**不读任何数据目录**的前提下画出「插件 → 数据目录 / 大文件」的树骨架 ——
   * 区域清单来自来源注册表（内置来源表 + 插件自述 dsh.dataDirs），是静态知识，零额外 I/O；
   * 体积与「实际有没有内容」等该分区的清单到货后再填。
   *
   * 语义：**纯展示**，不参与勾选/导出契约（契约只认 id）。这里是「注册表说它应该在哪儿」，
   * **不是**「磁盘上确实有」—— 界面必须把两者分开渲染（unread / 无内容 / 已读到）。
   */
  relatedAreas?: readonly PluginAreaRef[];
}
/** 插件数据区域引用（pluginData / pluginAssets；只读展示用，不参与勾选契约）。 */
interface PluginAreaRef {
  section: 'pluginData' | 'pluginAssets';
  /** home 相对 POSIX 路径 —— 就是该分区单元的 id 后缀（\`pluginData:.mnemon/runtime\` 的末段） */
  relPath: string;
  role: 'config' | 'assets';
}
type PlanItemKind = 'Create' | 'Update' | 'Skip' | 'Conflict' | 'Install' | 'MissingSecret' | 'MissingDependency' | 'PathMapping' | 'Warning' | 'Error';
type ItemResolution = 'keepCurrent' | 'useImported' | 'review';
type GlobalConflictStrategy = 'merge' | 'replace' | 'skipExisting';
/**
 * 会话格式处置（T1）：导入/同步遇到「本机读不了的会话」时怎么办。
 *
 * 是 client ↔ host 的**线上契约**（请求体字段 `sessionFormatDisposition`），因此登记在 core
 * （与 ItemResolution / GlobalConflictStrategy 同级），由 `src/ui/session-format-disposition.ts`
 * 提供判定与展示逻辑；core 引擎本身不消费它（由路由在计划阶段判定，core 只负责把
 * 「哪条会话读不了」标到 PlanItem.formatUnsupported 上）。
 */
type SessionFormatDisposition = 'abort' | 'skip' | 'guide';
interface ConflictDecision {
  itemId: string;
  resolution: ItemResolution;
  /**
   * 这条裁决是**谁**下的（issue #136 A）：
   * - `'item'`：用户对该计划项逐项决策（`decisions.resolutions[id]`，含导入页的逐行确认）——
   *   适配器可把它当作「我确实要这一行按导入值写」的确认。
   * - `'section'`：由**分区级**裁决换算而来（合并落地 `planMergeApply` 的 second pass 把
   *   「该分区已裁决」逐项注入成 `useImported`）。分区级裁决决定「分区是否应用」，
   *   不构成对某一行值的确认，写回守卫不得据此清空本机明文。
   * - 缺省：未标注来源。写回守卫按**未确认**处理（默认拒绝清空）—— 忘了标注只会少清空，
   *   不会误清空；确认必须显式写明来源。
   */
  decidedBy?: 'item' | 'section';
}
interface PathMapping {
  oldPrefix: string;
  newPrefix: string;
  appliesTo: ('workspaces' | 'mcp' | 'pluginConfig' | 'skills')[];
}
interface PathIssue {
  kind: 'missing' | 'platformMismatch' | 'homeMismatch';
  value: string;
  mappedTo?: string;
  /**
   * 这条路径来自哪个分区（目前只有 workspaces / mcp 会被探测出路径问题）。
   *
   * 为什么要有它：导入向导的路径映射页必须**只问这次真的会写盘的路径** ——
   * 用户没勾「工作区」时不该被要求为工作区路径指定新位置（真机反馈：明明没选工作区，
   * 却被列了 7 条工作区路径）。core 只负责如实标注来源，是否要问由调用方结合本次选择决定。
   * 缺省 = 来源未知（旧宿主未回传该字段）→ 调用方按「保守显示」处理。
   */
  section?: SectionId;
}
interface SnapshotTarget {
  adapter: SectionId;
  ref: string;
  /**
   * patch 行类目标的**所在层**（相对 homeDir 的 POSIX 路径，见 core/patch-layers.ts）。
   *
   * 为什么必须带上：patch 行有两层（home 层 + profile 层），同一 `ref`（lineId）在两层的
   * 原值不同、写入位置也不同。缺省 = 用户层（`cordis.patch.yml`），保持旧调用方行为不变。
   */
  file?: string;
}
interface PlanItem {
  id: string;
  /**
   * 「最小可拆单元」id（Phase 2 条目级导入选择，可选）。
   *
   * 为什么需要它：导入选择器不能按裸计划项勾选 —— skills/sessions 的计划项是**逐文件**的
   * （`skills:bar/SKILL.md`、`skills:bar/ref.md`），而用户心智里是一个技能/一次会话。
   * 由适配器用与导出侧 `listUnits()` **同一套** unitIdOf 规则声明单元 id，两端因此自动对齐
   * （排除 `skills:bar` 即排除其全部成员项），UI 无需猜前缀。
   *
   * 缺省 = 本项自身即一个单元（插件包、工作区记录、patch 行等）。
   */
  unitId?: string;
  /**
   * 单元的**展示名**（可选；宿主在计划生成后填充，如 sessions 的「会话标题」）。
   *
   * 为什么由宿主填：会话标题在 DSH 自己的存储里（`$DSH_HOME/storages/session_projcache.json`），
   * 引擎看不到也不该猜。缺省 = UI 退回用单元 id（会话目录名）显示 —— 用户实测「导入页只显示
   * 文件名」就是这个缺省态。纯展示字段：不参与勾选/执行契约。
   */
  label?: string;
  /** 单元的**二级分组名**（可选，同 `/export-preview` 的 `ExportUnit.group` 语义；纯展示）。 */
  group?: string;
  /** 空白会话（从未提问；同 `ExportUnit.blank`，只下发事实、文案由界面本地化）。 */
  blank?: boolean;
  /** 本项对应的**工作区记录拥有的会话 id**（工作区计划项专用；issue #45 勾选联动）。 */
  sessionIds?: string[];
  /** 本工作区计划项 **path 的 cwd 目录键**（`projectKeyOf(path)`；issue #45 勾选联动第二判据）。 */
  projectKey?: string;
  kind: PlanItemKind;
  adapter: SectionId;
  description: string;
  detail?: string;
  severity: 'info' | 'warning' | 'error';
  /**
   * 本项对应的会话单元**本机读不了**（格式版本高于本机 DSH 支持的版本）。
   *
   * 语义：DSH 读会话时对非本 build 的 `header.version` 直接拒绝，而会话列表静默跳过
   * → 这一项即使写入成功，用户在 DSH 里也看不到这条对话。UI 据此提供「中止 / 跳过 / 引导升级」。
   */
  formatUnsupported?: {
    version: number;
    target: number;
  };
  conflict?: ConflictDecision;
  pathMapping?: PathMapping;
  missingDependency?: string;
  target?: SnapshotTarget;
}
interface ImportAnalysis {
  valid: boolean;
  errors: string[];
  warnings: string[];
  compatibility: 'excellent' | 'good' | 'partial' | 'unsupported';
  /**
   * 兼容性判定的**结构化原因**（可选；旧调用方缺省即不展示 —— 界面按原因解释评分，
   * 见 `CompatibilityReason`）。与 `compatibility` 同源，永不单独维护。
   */
  compatibilityReasons?: CompatibilityReason[];
  /**
   * 备份侧事实（可选）：来源 DSH 版本 / 平台 / schema 版本。
   * 界面用它解释「为什么是部分兼容」（例如跨平台、来源更旧/更新）。
   */
  source?: {
    dshVersion: string;
    platform: string;
    schemaVersion: number;
  };
  /** 本机侧对照（可选）：当前 DSH 版本 / 平台。与 `source` 成对展示，缺省则界面不显示对照行。 */
  target?: {
    dshVersion: string;
    platform: string;
  };
  sectionsInZip: SectionId[];
  /**
   * 备份 manifest 声明启用、但**本版本不认识**的分区 id（不在 `SECTION_IDS` 中）。
   *
   * 语义（G-01/G-02/G-03）：这些分区的数据被跳过、未导入，且**绝不**计入
   * `missingSections` —— 它们并非「备份声明了但文件缺失」，而是「本插件不认识」。
   *
   * 当前用户可见路径是 `warnings` 里的文案键 `import.unsupportedSections`
   * （`ImportWizardView` 直接渲染 `analysis.warnings`）；本字段供第三方实现者与
   * 后续 UI 做结构化展示（例如把「未知分区」与「版本过高」分列）。**尚无 UI 消费点。**
   */
  unsupportedSections: string[];
  /**
   * 已知分区、但其数据 `version` **高于**本版本支持的 1 → 该分区已被跳过（G-05）。
   *
   * 与 `unsupportedSections` 的区别：那个是「本插件不认识这个分区」，这个是
   * 「认识这个分区，但它来自更新的格式」。两者都只告警、不阻断整个 bundle。
   *
   * 当前用户可见路径是 `warnings` 里的文案键 `import.unsupportedSectionVersion`；
   * 本字段供第三方实现者与后续 UI 与 `unsupportedSections` 分列展示。**尚无 UI 消费点。**
   */
  unsupportedVersions: {
    section: SectionId;
    version: number;
  }[];
  pluginSummary: {
    installed: number;
    toInstall: number;
  };
  pathIssues: PathIssue[];
  secretCount: number;
  dependencyIssues: {
    item: string;
    dependency: string;
  }[];
  /** 备份是否加密（manifest.security.encrypted）：加密备份的凭据必须用解密密码恢复 */
  encrypted: boolean;
  /**
   * 会话格式体检摘要（可选；宿主未注入探针 / 本机版本解析不到时为 undefined）。
   *
   * `unreadable` 只含**明确判定读不了**的会话单元（version > 本机支持版本）；
   * `target` 为 null 表示本机版本无法判定（此时不猜、不判读不了）。
   */
  sessionFormats?: {
    target: number | null;
    unreadable: {
      unitId: string;
      version: number;
    }[];
    sampled: number;
    skipped: number;
  };
  /**
   * 凭据可恢复性摘要（issue #39 Feature 2；**可选字段**，旧调用方零改动）。
   *
   * 目的：让宿主不必自己解开 `security/secrets.enc` 再解析 `.credentials.yaml` 才能
   * 判断「包里的凭据能不能自动回填」（那等于把 `.credentials.yaml` 的布局知识复制到
   * 每个宿主，正是 issue #39 的坑）。**只回传 ref 名，永远不回传任何值。**
   *
   *  - `inArchive`：归档声明携带真实凭据值（`manifest.security.containsSecrets`）；
   *  - `refs`：本次分析**实际解出**的凭据 ref 名（宿主未提供解密结果时为 `[]`；
   *    即「包含密码」这一前提不具备时，只能给出 `inArchive=true` 而不能给出名字）；
   *  - `satisfied`：`refs` 中**本机已配置**的子集（无需回填、也无需人工补录）。
   */
  credentials?: {
    inArchive: boolean;
    refs: string[];
    satisfied: string[];
  };
}
interface ImportDecisions {
  strategy: GlobalConflictStrategy;
  resolutions: Record<string, ItemResolution>;
  pathMappings: PathMapping[];
}
interface ImportPlan {
  items: PlanItem[];
  globalStrategy: GlobalConflictStrategy;
  pathMappings: PathMapping[];
  /**
   * 本次**自动**加入的基础路径重定基规则（导出机 DSH home → 本机 DSH home；issue #45）。
   *
   * 只读展示用：它已被并入 pathMappings（排在最前，用户映射随后生效）。缺省 = 两边基础路径相同
   * 或旧包没带 sourceHome（此时不做任何自动改写，行为与改造前一致）。
   */
  automaticMappings?: PathMapping[];
  missingSecrets: {
    ref: string;
    required: boolean;
  }[];
  needsRestart: boolean;
  estimatedActions: Record<SectionId, number>;
  /** F4：被删除墓碑（tombstone）过滤掉的计划项（缺省/空数组 = 无过滤；UI 据此提示用户） */
  skippedTombstoned?: SkippedTombstone[];
}
/** F4：被墓碑过滤的计划项记录（条目级：kind+id；分区级：kind='section'，id=分区 id） */
interface SkippedTombstone {
  kind: TombstoneKind;
  id: string;
  adapter: SectionId;
}
interface ExecutedItem {
  itemId: string;
  /** warning = 未应用但非致命（目标不可达等），不计入失败、不触发回滚 */
  status: 'ok' | 'skipped' | 'warning' | 'failed';
  message?: string;
  /** 用户主动跳过（导入中点击「跳过当前插件」）：status 为 skipped 且此标记为 true。
   * 结果页据此区分「用户跳过」与「引擎跳过」，并提供重试入口。 */
  skippedByUser?: boolean;
}
/**
 * 本次导入「没有生效」的计划项（`status: 'warning'`：非致命失败，未触发回滚也不计入失败）。
 *
 * 为什么必须单独成一个字段（issue #56 的第二条线）：插件安装失败是**刻意**的 warning
 * （一个装不上的插件不该拖垮已成功的其余配置，§34.17），但结果对象里只有 `ok: true` 与
 * 一串 warnings —— 同步/导入的上层据此只报「成功」，用户看到的是「同步完成」，
 * 而**排在它后面的步骤根本没执行**（真机：插件安装排在凭据之前，于是密钥没导进来，
 * 用户是靠事后翻日志才发现）。本字段让「哪一项没生效」成为结果的一部分，
 * 由上层如实展示，而不是埋在告警列表里。
 *
 * `adapter` 是自由字符串（**刻意不声明为 SectionId**）：warning 项也可能来自分区收尾
 * （itemId 形如 `plugins:finalize`），此处只作展示用的分类标签。
 */
interface ImportIneffectiveItem {
  /** 计划项 id（含收尾项 `<adapter>:finalizeImport`） */
  itemId: string;
  /** 分区/步骤分类（展示用） */
  adapter: string;
  /** 如实原因（已含可复制的手动修复提示） */
  message?: string;
}
interface ImportResult {
  ok: boolean;
  executed: ExecutedItem[];
  needsRestart: boolean;
  missingSecrets: string[];
  warnings: string[];
  rollback: RollbackReport | null;
  snapshotId: string | null;
  /**
   * 未生效项（status='warning'；字段只增不改，旧调用方忽略即可）。
   *
   * 与 `ok` 的关系：**不改变** ok 语义（warning 仍不算失败、不触发回滚）——
   * 这里只是把「部分成功」从「一串文字」升级为「可判定的结论」。
   * 空数组时省略该字段（旧行为逐字节不变）。
   */
  ineffective?: ImportIneffectiveItem[];
  /** F4：本次导入被删除墓碑过滤掉的条目（缺省/空 = 无过滤；UI 据此提示用户） */
  skippedTombstoned?: SkippedTombstone[];
  /**
   * issue #39：本次导入**从加密归档内解出并回填本机**的凭据条数（字段只增不改）。
   * 缺省 = 未经归档恢复（普通备份 / 用户手工补录），此时不出现该字段。
   * 只回传条数，绝不回传 ref 名或值——结果会进 run 账并回传浏览器。
   */
  credentialsRestored?: number;
  /**
   * 用户在运行中心终止了本次导入（宿主 /runs/cancel 在**计划项边界**协作式取消）。
   * true 时 executed 只覆盖已尝试的项，且 keptPartial 表明用户如何处置已应用部分。
   */
  cancelled?: boolean;
  /**
   * 终止时用户选择「保留已应用项」（cancelled=true 时才有意义）。
   * 保留 = 在安全点停下 + 跑完分区收尾 + 未执行项在 journal 里显式标 skipped。
   * 此时快照**保持可用**（不标 done / 不标 rolled-back），用户可事后在「备份」页手动回滚。
   */
  keptPartial?: boolean;
  /**
   * keptPartial=true 时的启动自洽审计结论（缺省 = 未审计，UI 必须如实说「未验证」）。
   * 字段只增不改：旧客户端忽略它即可。
   */
  bootSafety?: {
    verdict: 'safe' | 'repaired' | 'unsafe';
    issues: {
      id: string;
      severity: 'warn' | 'error';
      detail: string;
      fixed: boolean;
    }[];
    prunedBundles: {
      name: string;
      reason: string;
    }[];
    unchecked: string[];
  };
}
/** 快照生命周期状态（M1 增强；旧快照无此字段，视为未知/兼容） */
type SnapshotStatus = 'pending' | 'done' | 'rolled-back';
interface RollbackReport {
  full: boolean;
  restored: string[];
  failed: {
    item: string;
    reason: string;
    manualHint?: string;
  }[];
}
/**
 * 兼容性判定的**结构化原因**（2026-09：把「为什么是这个评分」暴露给 UI）。
 *
 * 为什么需要：此前只有一档总分（excellent/good/partial/unsupported），用户看到
 * 「部分兼容」却不知道该处理什么；core 里唯一能解释的 `describeCompatibility()`
 * 是**硬编码中文**的整句（不能进 i18n 字典，界面也不该直接渲染）。
 *
 * 约定：这里只产出**语义 + 数据**，文案由界面按 kind 查字典（zh/en 各自解析）；
 * `sourceDsh`/`targetDsh`/`sourcePlatform`/`targetPlatform` 是给界面填入文案的**原始事实**，
 * 不是可展示文本。
 */
type CompatibilityReason = {
  kind: 'schemaUnsupported';
  schemaVersion: number;
} | {
  kind: 'crossPlatform';
  sourcePlatform: string;
  targetPlatform: string;
} | {
  kind: 'missingSections';
  sections: SectionId[];
} | {
  kind: 'sourceNewer';
  sourceDsh: string;
  targetDsh: string;
} | {
  kind: 'sourceOlder';
  sourceDsh: string;
  targetDsh: string;
};
interface ExportReport {
  included: {
    section: SectionId;
    counts: Record<string, number>;
  }[];
  excluded: SectionId[];
  security: {
    secretsExcluded: boolean;
    containsSecrets: boolean;
    encrypted: boolean;
    redactedHits: number;
    /** 本次导出镜像到本机 vault 的敏感文件数（文件级 vault；0 或缺失 = 未镜像） */
    vaultRefreshed?: number;
  };
  file: {
    name: string;
    sizeBytes: number;
  };
  warnings: string[];
}
type RestoreActionKind = 'hostFileRestore' | 'hostFileRemove' | 'pluginRemove' | 'pluginInstall' | 'fileRestore' | 'fileRemove' | 'credentialHint' | 'skip';
interface RestoreAction {
  kind: RestoreActionKind;
  /** 人类可读描述 */
  description: string;
  /** 目标：相对 $DSH_HOME 的 relPath（hostFile/file 类）或插件名（pluginRemove） */
  target?: string;
  /** hostFileRestore/fileRestore：快照内 blob 相对路径（相对 snapshotDir） */
  blobPath?: string;
  /** pluginRemove / pluginInstall：插件包名 */
  pluginName?: string;
  /** pluginInstall：重装目标（name@version；版本未知时就是裸包名） */
  pluginTarget?: string;
  /** credentialHint：人工提示文本 */
  manualHint?: string;
  /** 附加说明（旧快照缺基线 / 离线无法恢复等） */
  detail?: string;
  /** 该动作是否对应 settings 主文件（settingsPath 解析出的文件） */
  isSettings?: boolean;
}
interface RestorePlan {
  snapshotId: string;
  createdAt: string;
  sourceZip: string;
  actions: RestoreAction[];
  summary: {
    hostFileRestores: number;
    hostFileRemoves: number;
    pluginRemoves: number;
    pluginInstalls: number;
    fileRestores: number;
    fileRemoves: number;
    credentialHints: number;
    skips: number;
  };
  /** beforePlugins 基线是否可用（undefined=旧快照无基线 → 不计划任何插件卸载） */
  pluginBaselineConfirmed: boolean;
  /**
   * 快照记录的来源 DSH 版本（F-4；**可选**：旧快照没有该字段是常态，此时为 undefined）。
   * 只承载事实，判定与展示在调用方（UI/CLI）；恢复绝不因它而拒绝。
   */
  snapshotDshVersion?: string;
  /**
   * 本机当前 DSH 版本（F-4；**可选**：无法判定时不猜，保持 undefined 且不产出版本告警）。
   * 来源优先级：调用方注入的 `RestoreOptions.currentDshVersion`（宿主权威，桌面端取 installAnchor）
   * → profile 依赖树里实际落盘的 `@deepseek-ai/dsh` 版本（离线 best-effort）。
   */
  currentDshVersion?: string;
}
interface RestoreReport {
  snapshotId: string;
  /** 已还原/已删除的目标（相对 $DSH_HOME） */
  restored: string[];
  /** 已卸载的插件名 */
  removedPlugins: string[];
  /** 已按 undo 记录装回的插件目标（name@version；issue #132） */
  installedPlugins: string[];
  /** 需人工处理的提示（凭据补录等） */
  manualHints: string[];
  /** 失败清单 */
  failed: {
    item: string;
    reason: string;
  }[];
  /** 跳过项（无动作 / 离线无法处理） */
  skipped: string[];
  /**
   * 本次执行真正写入的 pre-restore 反悔副本目录（`<snapshotDir>/pre-restore/<attemptDir>/`）。
   * 每次 restore() 新建一个 attempt 目录（D5）⇒ 崩溃后重跑**不会覆盖**上一次的反悔副本；
   * 没有任何文件需要备份时缺省（不建空目录）。
   */
  preRestoreDir?: string;
  /**
   * 幽灵会话（F5 失效归档清理）：快照记录的 sessions 分区会话在磁盘 sessions 目录
   * 已无任何文件（备份有记录、磁盘无文件）。DSH 官方无归档会话 API，降级本地校验，
   * 仅供报告、需人工在 DSH 确认清理；无会话分区/无幽灵时为缺省或空数组。
   */
  ghostSessions?: string[];
}
interface SnapshotMeta {
  id: string;
  createdAt: string;
  sourceZip: string;
  status?: SnapshotStatus;
  entryCount: number;
  hostFileBackupCount: number;
  beforePluginCount: number;
  /**
   * 来源档案（originProfile）：拍这份快照的进程所属 profile 名。
   * 旧快照 / 宿主不暴露 profile 时缺省 —— 界面按「未标注」展示，绝不写 'unknown' 占位。
   */
  originProfile?: string;
  /** 置顶标记（P1-⑧）：置顶快照不参与自动保留清理（最多保留 N 个时的淘汰豁免） */
  pinned?: boolean;
}
/**
 * 行级文本 diff 内核（零依赖纯函数，node 可测）。
 *
 * 用途：为「恢复计划预览」等场景产出**左右双栏对照 / 统一格式**差异所需的
 * 行级编辑脚本（hunks）。只做行级比较（不做词级 / 字符级高亮），不读写文件、
 * 不产出任何文案 —— 文件读取与上限策略在 core 层（src/core/snapshot-diff.ts），
 * 渲染模型在 ui 层（src/ui/diff-view.ts）。
 *
 * 算法：先裁掉公共前缀 / 后缀（配置文件的 diff 通常极小，裁剪后变更区很小），
 * 剩余变更区用 Myers O((N+M)·D) 贪心算法求最短编辑脚本；变更规模超过预算
 * （maxLines / maxD）时**降级为整块替换**（全删 + 全增），保证任何输入都有确定
 * 耗时的输出 —— 大文件不会卡死宿主。
 *
 * 预算怎么定（2026-10-15 真机实测，本仓 rollback-point.ts 的一对版本）：
 *  · 时间是 (N+M)·D 量级：D=4000、两侧合计 ~7500 行时 ≈ 70 ms（D=8000 ≈ 115 ms）；
 *  · 内存是 O(D²)·4B（回溯要逐轮留 V 快照）：D=2000 时 RSS +~30 MB、D=4000 +~100 MB、D=8000 +~175 MB。
 *  ⇒ 缺省取 2000（覆盖「大文件只改了几处」这一大类）；单文件按需查看的调用方可以往上调，
 *    到 4000 仍是一次点击可接受的开销；再大就该换线性空间算法，而不是继续加预算。
 *
 * 行为约定：
 *  - 行尾 \r\n 归一为 \n；文本末尾的换行不产生"空行"（行数 = 换行符语义）。
 *  - 仅空白差异同样是差异（不做 ignoreWhitespace）。
 *  - 完全一致时 hunks 为空、identical=true。
 */
type DiffLineKind = 'context' | 'add' | 'del';
interface DiffLine {
  kind: DiffLineKind;
  /** 行内容（不含行尾换行） */
  text: string;
  /** 旧侧行号（1-based；新增行为 null） */
  oldNo: number | null;
  /** 新侧行号（1-based；删除行为 null） */
  newNo: number | null;
}
/** 连续变更块（含上下文），行号语义与 unified diff 的 @@ 头一致 */
interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}
/** 读取 / 统计上限（常量导出供测试与 UI 文案引用同一口径）。 */
declare const SNAPSHOT_DIFF_LIMITS: {
  /** 完整 diff：单侧参与逐行对比的字节上限（超出 → 只报体积，不逐行对比） */
  readonly maxSideBytes: number;
  /** 列表统计：单侧参与行数统计的字节上限 */
  readonly maxStatSideBytes: number;
  /** 列表统计：所有文件两侧读取的总字节预算 */
  readonly maxStatTotalBytes: number;
  /** 列表统计：最多统计多少个文件（其余标记为未统计） */
  readonly maxStatFiles: 80;
  /** Myers 输入行数上限（超出 → 整块替换降级） */
  readonly maxLines: 6000;
  /** Myers 最大编辑距离 */
  readonly maxD: 400;
  /** 上下文行数 */
  readonly context: 3;
};
/** 变更状态（用户视角的 git status 语义）。 */
type SnapshotChangeStatus = 'modified' | 'added' | 'deleted' | 'plugin' | 'hint' | 'skip';
/** 行数统计未能产出的原因。 */
type ChangeStatSkipReason = 'too-large' | 'binary' | 'unreadable' | 'budget';
/** 列表阶段：单个恢复动作的改动摘要（与 plan.actions 下标一一对应）。 */
interface SnapshotChangeEntry {
  /** plan.actions 下标（前端按此关联） */
  index: number;
  kind: RestoreActionKind;
  status: SnapshotChangeStatus;
  /** homeDir 相对路径（plugin 项 = 插件名；无目标时为 undefined） */
  target?: string;
  description: string;
  detail?: string;
  /** 磁盘现状是否存在 */
  beforeExists: boolean;
  /** 快照内容是否存在 */
  afterExists: boolean;
  beforeBytes?: number;
  afterBytes?: number;
  added?: number;
  removed?: number;
  statSkipped?: ChangeStatSkipReason;
}
interface RestoreChangeSummary {
  entries: SnapshotChangeEntry[];
  /** 成功统计行数的文件数 */
  computed: number;
  /** 因体积 / 预算未统计行数的文件数 */
  skipped: number;
  /** 两侧读取的总字节数（预算口径） */
  totalBytes: number;
  /** 因总预算触顶而提前停止统计 */
  budgetExhausted: boolean;
  /** 统计口径上限（UI 提示用） */
  limits: typeof SNAPSHOT_DIFF_LIMITS;
}
/** 单侧展示信息（供 UI 显示体积 / 行数 / 二进制标记）。 */
interface SnapshotFileDiffSide {
  exists: boolean;
  bytes: number;
  /** 行数；null = 未读取（二进制 / 超限 / 不可读） */
  lines: number | null;
  binary: boolean;
  oversized: boolean;
  unreadable: boolean;
}
type SnapshotFileDiffReason = 'path-escape' | 'missing-blob' | 'binary' | 'too-large' | 'unreadable' | 'no-target' | 'not-diffable';
interface SnapshotFileDiff {
  kind: RestoreActionKind;
  status: SnapshotChangeStatus;
  target?: string;
  before: SnapshotFileDiffSide;
  after: SnapshotFileDiffSide;
  hunks: DiffHunk[];
  added: number;
  removed: number;
  identical: boolean;
  /** 规模超限 → 结果仍是完整替换，只是不是最小编辑脚本 */
  degraded: boolean;
  /** 无法逐行对比的原因（有值时 hunks 为空） */
  reason?: SnapshotFileDiffReason;
  limits: typeof SNAPSHOT_DIFF_LIMITS;
}
/**
 * DSH profile 的**零依赖共享层**（host 与 client 双端复用）。
 *
 * 本文件不得 import 任何 node 模块：`src/client/` 的运行时 import 会把整条依赖链
 * 打进 lib/client.js，一旦带上 node 内置模块依赖，DSH loader 会拒绝加载整个插件。
 * 引擎（`dsh-profile-manager.ts`，用 node fs）与 UI 视图模型/React 壳都只从这里取
 * 类型、常量与纯函数。
 */
/** profile 形态：按 bundles 能力判定，不枚举界面（社区新形态无需改动即可归为 generic）。 */
type DshProfileShape = 'web' | 'headless' | 'generic';
/** patch 层生命周期：live = 监视并热生效；startup = 只在启动时应用一次。 */
type DshProfilePatchReload = 'live' | 'startup';
/** 一个 profile 的非致命问题（列表仍展示，便于用户删除损坏档案）。 */
type DshProfileIssue = 'manifestInvalid' | 'patchTooLarge';
/** 列表行数据（全部非敏感：profile 定义本身不含秘密值）。 */
interface DshProfileMeta {
  /** profile 名（= 目录名 = `dsh --profile <name>`） */
  name: string;
  /** 绝对目录 */
  dir: string;
  /** dsh.profile.bundles（有序 bundle 层） */
  bundles: string[];
  /** package.json dependencies（含 in-box bundle；原样展示） */
  dependencies: Record<string, string>;
  shape: DshProfileShape;
  patchReload: DshProfilePatchReload;
  /** 是否已有 node_modules（树外插件是否装过） */
  hasNodeModules: boolean;
  /** cordis.patch.yml 的 patch 条目数（以 `- ` 开头的行，启发式计数） */
  patchEntryCount: number;
  /** cordis.patch.yml 字节数（不可读 = 0） */
  patchBytes: number;
  /** 是否当前正在运行的 profile */
  isCurrent: boolean;
  /**
   * cross-F3：该条目是**中断的档案复制**留下的半截副本（无 package.json，只有进行中标记）。
   * 界面据此把它渲染成「未完成的副本」并给出去向（`dir`）+ 删除入口，而不是当成正常档案。
   */
  incomplete?: true;
  /** 半截副本的来源档案名（仅 incomplete 时有值） */
  copiedFrom?: string;
  /** 半截副本的复制开始时刻（ISO；仅 incomplete 时有值） */
  copyStartedAt?: string;
  issues: DshProfileIssue[];
  /** package.json 的 mtime（毫秒）；不可读 = null */
  updatedAtMs: number | null;
  /**
   * 该档案依赖树里的 DSH 版本（`node_modules/@deepseek-ai/dsh/package.json`；读不到 = null）。
   *
   * 桌面端档案由 Electron 独占管理、运行时在 `app.asar` 内 —— 读磁盘只会拿到 hoisted 副本，
   * 所以它如实为 null（宁可不显示，也不报一个错的版本号）。
   */
  dshVersion?: string | null;
  /**
   * 该档案 DSH 支持的**会话日志格式版本**（`SESSION_FORMAT_VERSION`；读不到 = null）。
   *
   * 用途：档案页展示 + 「切过去之后对话还看得见吗」。DSH 读不出（更高）的格式会**静默跳过**
   * 那些会话（不报错、不在工作区列表里），所以版本错配必须让用户看见。
   */
  sessionFormatVersion?: number | null;
}
/** 详情：列表字段 + 原始文本（详情弹窗展示；过大时截断为 null）。 */
interface DshProfileDetail extends DshProfileMeta {
  /** package.json 原文（不可读 = null） */
  manifest: string | null;
  /** cordis.patch.yml 原文（不可读或过大 = null） */
  patch: string | null;
}
/**
 * 「用该档案启动」（独立实例）的结果。
 *
 * 为什么需要它：DSH 自身没有「默认 / 下次启动 profile」状态（profile 只由 `--profile` 决定），
 * 所以「切换档案」唯一真正可用的形态是**另起一个实例**——本结构就是那条路径的回执。
 */
interface DshProfileLaunchResult {
  /** 被启动的档案名 */
  name: string;
  /** 目前只支持 web 形态（有浏览器 GUI） */
  mode: 'web';
  /** 新实例监听的端口（自动挑的空闲端口） */
  port: number;
  /** 带进程 token 的认证 URL（从子进程启动日志里抓；没抓到 = null，绝不臆造裸 URL） */
  url: string | null;
  /** 子进程 pid（拿不到 = null） */
  pid: number | null;
  /** 子进程日志文件绝对路径（未就绪时用户据此自查） */
  logFile: string;
  /** HTTP 探活是否已就绪 */
  ready: boolean;
  /** 非致命告警（UI 按码映射文案） */
  warnings: DshProfileLaunchWarning[];
}
/**
 * 「运行中实例」的**合并视图**（UI 唯一消费形状）：台账（本插件启动的） ∪ 心跳（任何在跑的实例）。
 *
 * 为什么必须合并：只认台账时，手动 `dsh web` 起来的实例对插件不可见 → 会在别的档案里被**再次启动**
 * （用户实测：从 web 启动 cmtest 后，在 cmtest 里还能再启动 web，同名多开）。心跳让每个实例互相可见。
 */
interface DshProfileRunningView {
  name: string;
  /** 实例 pid（停止用；缺心跳 pid 时为 null） */
  pid: number | null;
  /** web 端口（心跳/台账里记的；未知 = null） */
  port: number | null;
  /** 带 token 的认证 URL（**只有本插件启动的**才有：别人的 token 绝不落盘/回传） */
  url: string | null;
  startedAt: string;
  /** 本插件启动的（台账里有它）→ 本 UI 负责停止 */
  owned: boolean;
  /** 就是当前正在跑本界面的这个实例（自己不能停自己） */
  current: boolean;
}
/** 停止实例的结果码（gracious = 自己退了 / killed = 强杀 / already-stopped = 早就不在了）。 */
type DshProfileStopOutcome = 'graceful' | 'killed' | 'already-stopped';
/** 启动回执里的非致命告警码。 */
type DshProfileLaunchWarning = 'notReady' | 'urlNotFound';
/** GET /profiles 的响应负载（列表 + 当前运行 + 运行中实例 + 模板清单）。 */
interface DshProfilesSnapshot {
  profiles: DshProfileMeta[];
  /** 当前运行中的 profile 名（宿主从 config/argv 解析） */
  current: string;
  /** 在跑的实例（台账 ∪ 心跳；空数组 = 没有。UI 据此把「启动」换成「停止」/「当前运行」） */
  running: DshProfileRunningView[];
  /** 可选的起步模板（新建档案时用） */
  templates: DshProfileTemplate[];
  /**
   * 当前实例（本宿主）支持的会话格式版本；解析不到 = null，旧宿主不回传 = undefined。
   * UI 用它比较各档案，提示「这个档案产生的对话在本实例里看不到」。
   */
  currentSessionFormatVersion?: number | null;
}
/** 新建 profile 可选的官方模板（与 dsh-app-boot PROFILE_TEMPLATES 对齐，dsh 0.1.5-rc.1）。 */
interface DshProfileTemplate {
  /** 模板 id（= 官方 `--from-default-profile <template>` 名；base = `dsh plugin` 的默认起步） */
  id: string;
  bundles: string[];
  patchReload: DshProfilePatchReload;
}
/** 复制档案的非致命告警码（UI 按码映射文案，绝不静默）。 */
type DshProfileCopyWarning =
/** 副本没有 node_modules 却声明了依赖：直接启动会解析不到 bundle，必须先装依赖 */
'depsNotInstalled';
/**
 * 「复制档案」的回执（UI 横幅用）：副本名 + 是否带 node_modules + 耗时 + 告警。
 *
 * 为什么把 warnings 一路带回前端：includeNodeModules=false 出来的副本**不能直接启动**
 * （bundles 里的树外插件解析不到），这条必须显式告诉用户并给出安装命令 —— 静默成功等于骗人。
 */
interface DshProfileCopyResult {
  /** 副本档案名 */
  name: string;
  /** 源档案名 */
  sourceName: string;
  /** 是否一并复制了 node_modules */
  includeNodeModules: boolean;
  /** 宿主侧实际耗时（毫秒；大档案含 node_modules 时可达数十秒） */
  durationMs: number;
  warnings: DshProfileCopyWarning[];
}
/** run 类型：导出 / 导入 / 自动同步 / 一键同步逐项应用 / 定时备份 / 快照恢复 / 配置档案切换 / recovery 恢复。 */
type RunKind = 'export' | 'import' | 'autosync' | 'sync-apply' | 'backup-schedule' | 'restore' | 'profile-switch' | 'recovery';
/** run 状态：进行中 / 完成 / 失败。 */
type RunStatus = 'running' | 'done' | 'failed';
/** 单个 run 的实时状态（/progress 返回体；纯 JSON 可序列化）。 */
interface RunState {
  /** 不可猜测的 run id（32 hex 字符）。 */
  runId: string;
  kind: RunKind;
  status: RunStatus;
  /** 当前分区（adapter id 或导入阶段名）；无则 null。 */
  section: string | null;
  /** 分区总数（导出 = 选中分区数；导入无此语义 = null）。 */
  sectionTotal: number | null;
  /** 已完成的内部计数（导出 = 当前分区序号；导入 = 已处理计划项数）。 */
  item: number | null;
  /** 内部计数总数（导出 = 分区总数；导入 = 计划项总数）。 */
  itemTotal: number | null;
  /** 非敏感进度摘要（当前分区 / 当前计划项 id）。 */
  detail: string | null;
  /** 执行日志行（导入为逐计划项操作 + 子进程命令；append-only，封顶 MAX_RUN_LOG_LINES）。
   * 只存非敏感文本（命令/操作摘要），绝不写入密钥、密码、秘密补录值。 */
  log: string[];
  /** 完成时的业务结果（仅 JSON 可序列化、不含秘密值）。 */
  result?: unknown;
  /** 失败时的错误消息（非敏感）。 */
  error?: string;
  /**
   * 「已暂停，等待用户决策」（用户终止导入后，宿主等 /runs/cancel/decision）。
   * 非 null 时 UI 必须弹出「回滚 / 保留已应用项」选择；轮询方据此区分
   * 「run 卡住了」与「run 在等人」——没有这个字段，界面只能干等。
   */
  pendingDecision?: 'cancel' | null;
  /**
   * 终止请求到达时刻（毫秒；null/缺省 = 未请求终止）。
   * 终止是**协作式**的：请求先到、真正生效要等当前计划项结束。等多久用户必须看得见 ——
   * 没有这个时间戳，界面只能说一句「完成当前任务后终止」，用户无从判断是「在装插件（正常）」
   * 还是「卡死了（要重启）」。
   */
  cancelRequestedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}
type ConsultSourceType = 'export-zip' | 'local-snapshot' | 'remote-snapshot';
type HealthVerdict = 'healthy' | 'needs-attention' | 'critical';
type Recommendation = 'proceed' | 'review' | 'block';
type ConsultDimensionId = 'compatibility' | 'integrity' | 'sections' | 'consistency' | 'sensitive' | 'migratability';
interface ConsultSourceRef {
  type: ConsultSourceType;
  /** 源标识：ZIP 路径 / snapshotId / 远端快照 id / profile 名 */
  id: string;
  /** 关联 snapshotId（local-snapshot / remote-snapshot） */
  snapshotId?: string;
}
interface ConsultIssue {
  severity: 'info' | 'warning' | 'error';
  /** 稳定问题码（i18n 键后缀；如 'integrity.manifestInvalid'） */
  code: string;
  /** 已 redact 的可读消息（宿主/UI 层负责脱敏） */
  message: string;
  /** 已 redact 的证据（可选） */
  evidence?: string;
}
interface HealthDimension {
  id: ConsultDimensionId;
  /** 0-100 */
  score: number;
  verdict: HealthVerdict;
  issues: ConsultIssue[];
}
interface ConsultWillApply {
  sections: SectionId[];
  itemCount: number;
  conflicts: number;
  risks: number;
  overwritten: number;
  /** 咨询恒为 dry-run（只读分析） */
  dryRun: boolean;
}
interface ConsultReport {
  source: ConsultSourceRef;
  /** 0-100 */
  healthScore: number;
  verdict: HealthVerdict;
  recommendation: Recommendation;
  /**
   * 硬阻断项数（**只有 >0 才会建议 block**）：包不可信 / 照做会失败。
   * UI 用它把「为什么不能继续」与「需要你处理什么」分开显示，不再让一个分数代替结论。
   */
  blockerCount: number;
  /** 需处理项数（warning/error 但非硬阻断）：冲突、缺分区、凭据要补录、敏感提醒等。 */
  attentionCount: number;
  /** 触发项（已 redact；硬阻断在前） */
  recommendationReasons: string[];
  dimensions: HealthDimension[];
  willApply: ConsultWillApply;
  bound: {
    manifest?: Manifest;
    snapshotId?: string;
    sourceId: string;
  };
  generatedAt: string;
}
/**
 * m-retention：保留策略（GFS 分层）纯函数层。
 *
 * 背景：保留策略此前是**三处硬编码 FIFO「保留最近 N 个」**——快照
 * `SNAPSHOT_RETENTION_LIMIT = 10`（core/backup.ts）、定时备份
 * `DEFAULT_BACKUP_RETENTION = 10`（sync/backup-files.ts），用户完全不可调、无分层。
 * 本模块把策略抽成可配置的 GFS 模型（参考 restic `forget --keep-last/--keep-monthly/
 * --keep-yearly`；配置备份场景下「最近几份 + 每月留 1 份」这类分层比纯 FIFO 更合用）。
 *
 * 分层语义（selectRetentionKeepers，**级联 GFS**；分层规则见下，务必精确）：
 *  1) keepLast：按时间倒序取最近 N 个（N<=0 = 关闭该层）；
 *  2) keepMonthly：从新到旧扫描，**每个日历月首次遇见的项即该月代表**（= 该月最新项）；
 *     该月若已被 keepLast 代表，则**不额外追加文件**（避免同月两份），但仍**占用一个额度**；
 *     最多覆盖 keepMonthly 个月（= 字面语义「最多保留 N 个月的代表」）；
 *  3) keepYearly：同口径按日历年，最多覆盖 keepYearly 个年；
 *  4) 结果 = 三层并集（同一候选绝不重复计入）。
 * 即：一个周期（月/年）在同一层内至多贡献 1 份，且月度/年度层覆盖的周期数严格不超过额度。
 *
 * 日历口径统一用 **UTC**（跨时区/跨机器结果一致、测试可确定；产物是天粒度，本地时区与
 * UTC 的差异仅是一天内的时刻偏移，不改变「每月留一份」的意图）。
 *
 * 零依赖（**不 import 任何模块**，尤其不得出现 `node:` 前缀）：本模块被 host（prune 决策）
 * 与 client（设置界面）同时引用——按仓库铁律，跨端运行时 import 会把整条依赖链打进
 * `lib/client.js`，一旦带 `node:` 依赖即致插件整体加载失败。
 */
/** 保留策略（GFS 三层；`0` = 关闭该层） */
interface RetentionPolicy {
  /** 最近保留份数（按时间倒序） */
  keepLast: number;
  /** 每月保留份数（按 UTC 日历月分组，每月至多保留最新 1 份，最多覆盖 N 个月） */
  keepMonthly: number;
  /** 每年保留份数（按 UTC 日历年分组，每年至多保留最新 1 份，最多覆盖 N 年） */
  keepYearly: number;
}
/** 定时备份间隔档位（全量备份无需太频繁；默认 24h）。
 *  - '6h' | '12h' | '24h' | '7d'：固定间隔；
 *  - 'custom'：每周固定时刻（见 customSchedule）。 */
type BackupInterval = '6h' | '12h' | '24h' | '7d' | 'custom';
/**
 * 自定义（每周固定时刻）档配置：
 * - dayOfWeek：0-6（0 = 周日，1 = 周一 … 6 = 周六）；
 * - hour：0-23；
 * - minute：0-59。
 * 语义 = 每周该时刻触发一次全量备份（错过的时间点不补跑——下次排期自然对齐）。
 */
interface BackupWeeklySchedule {
  dayOfWeek: number;
  hour: number;
  minute: number;
}
/** 最近一次定时备份执行状态 */
type BackupRunStatus = 'success' | 'skipped' | 'failed';
interface BackupRunResult {
  status: BackupRunStatus;
  zip?: string;
  sizeBytes?: number;
  sections?: string[];
  skipReason?: string;
  error?: string;
  consecutiveFailures: number;
}
/** 设置草稿（表单编辑态：总开关 + 间隔档位 + 自定义周档 + 保留策略）。 */
interface BackupScheduleDraft {
  enabled: boolean;
  interval: BackupInterval;
  /** custom 档的每周固定时刻（仅 interval='custom' 时校验；其他档位忽略） */
  customSchedule?: BackupWeeklySchedule;
  /** m-retention：备份产物 + 快照的保留策略（GFS 分层）；缺省 = 「最近 10 个」 */
  retention?: RetentionPolicy;
}
/** 定时备份配置的浏览器侧视图（与 sync/backup-schedule-config.ts 的持久化面一致；无敏感字段）。 */
interface BackupScheduleStatus {
  enabled: boolean;
  interval: BackupInterval;
  customSchedule?: BackupWeeklySchedule;
  /** m-retention：保留策略（GFS 分层）；宿主未返回时由组件回退 DEFAULT_RETENTION_POLICY */
  retention?: RetentionPolicy;
  startupMinIntervalMs: number;
  consecutiveFailures: number;
  lastRunAt?: string;
  lastRunStatus?: BackupRunStatus;
  lastRunMessage?: string;
}
/**
 * 插件自更新（POST /update-apply）的失败码（**唯一声明处**：宿主 core/self-update.ts 与
 * 客户端关于页弹窗共用同一份字面量）。
 *
 * 为什么抽到这里：客户端要据码映射**本地化**文案（绝不直接渲染宿主返回的英文细节）；
 * 若两侧各写一份联合类型，「宿主加了码而界面回落成英文」不会红。全部落在本文件的
 * 常量 + 派生类型上，客户端只 import 类型（零运行时依赖）。
 */
declare const SELF_UPDATE_FAILURE_CODES: readonly ['invalid-version', 'profile-unknown', 'unsupported-profile', 'non-registry-install', 'not-newer', 'install-failed'];
/** 自更新失败码（联合类型由上面的常量派生） */
type SelfUpdateFailureCode = (typeof SELF_UPDATE_FAILURE_CODES)[number];
/**
 * 同步通道清单（**零依赖**：宿主与 client 半都可运行时 import）。
 *
 * 为什么放在这里（而不是 `src/sync/sync-config.ts`）：sync-config.ts import 了
 * node:fs / node:path，client 半**运行时** import 它会把 node 模块带进浏览器产物
 * （DSH loader 报 missed the module table，整个插件不加载）。通道清单是「纯常量」，
 * 与 ENCRYPTED_CONTAINER_CODE 同一处置：常量放这里，读写实现留在 sync-config.ts。
 *
 * 宿主侧 sync-config.ts **re-export** 它，仍是全仓唯一事实源（类型 SyncTransportType 由它派生）。
 *
 * 通道与「云端点具体兼容商」的关系：`s3` 是一条通道（配置里带 `provider` 区分
 * s3 / oss / cos / minio / kodo 五家），`gist` 是一条通道（provider 恒 gist）。
 */
declare const SYNC_CHANNELS: readonly ['git', 'webdav', 's3', 'gist'];
/**
 * S3 兼容系通道清单（**唯一声明处**，t88；先例 = 上面的 SYNC_CHANNELS）。
 *
 * 为什么也放这里：宿主 `sync/sync-config.ts` 与客户端镜像（`ui/sync-settings-view.ts` 的 `S3_PROVIDERS`、
 * `client/sync/sync-view.ts` 的 provider 文案表）必须同值 —— 两侧各写一份字面量时，「宿主加了兼容商而界面少一个选项」
 * 这类静默漂移**不会红**（客户端只能靠 `satisfies` 穷尽检查拦「新增」，拦不住「改名 / 删除 / 顺序」）。
 * 放到零依赖模块后，两侧都 import 它；`sync-config.ts` 只 re-export（宿主沿用既有 import 路径）。
 *
 * 与通道清单的关系：`s3` 是**一条通道**（配置里用 `provider` 区分这五家），`gist` 是另一条通道（provider 恒 gist）。
 */
declare const S3_COMPAT_PROVIDERS: readonly ['s3', 'oss', 'cos', 'minio', 'kodo'];
/** S3 兼容系通道类型 */
type S3CompatProvider = (typeof S3_COMPAT_PROVIDERS)[number];
/** 非 S3 系的云端点通道（GitHub Gist，走 REST） */
declare const GIST_PROVIDER: 'gist';
/** Gist 通道类型 */
type GistProvider = typeof GIST_PROVIDER;
/** 备份容器形态。 */
type BackupContainerKind = 'zip' | 'encrypted';
/** 备份文件来源（UI Badge 展示） */
type BackupFileSource = 'auto' | 'manual';
/** 备份文件元信息（列表行数据；无敏感字段） */
interface BackupFileMeta {
  /** 文件名（如 dsh-config-auto-20260824-120000-abc.zip） */
  name: string;
  /** 绝对路径（供 /download 与导入向导引用） */
  path: string;
  /** 字节数 */
  sizeBytes: number;
  /** 修改时间（ms 时间戳；按此倒序展示/清理） */
  mtimeMs: number;
  /** 来源：auto = 定时备份；manual = 手动导出 */
  source: BackupFileSource;
  /** 用户备注（手动导出时可选填写；null = 无备注） */
  note?: string | null;
  /**
   * 容器形态（仅 `listBackupFiles(dir, { withContainerKind: true })` 时探测）。
   * 界面据此决定「导入」要不要先走「解锁加密备份」阶段（issue #55）；未探测的调用方
   * （保留策略 / 磁盘体检只要名称与时间）拿到 undefined，消费方按「非 encrypted」保守处理
   * —— 等同既有明文路径，绝不让缺字段把明文备份挡在解锁页。
   */
  containerType?: BackupContainerKind;
}
/** 体检子区（顺序即报告/展示顺序：先备份产物，再缓存/暂存，末位为只读保护的附加区） */
declare const DISK_USAGE_AREAS: readonly ["exports", "snapshots", "sync", "marketCache", "marketWork", "tmp", "logs", "bootState", "migrationHistory", "transactions", "locks", "vault", "rollback-points"];
/** 全部体检子区 id（= `DISK_USAGE_AREAS` 的元素类型） */
type DiskUsageScanArea = typeof DISK_USAGE_AREAS[number];
/** 子区回收策略语义（决定界面文案，不由界面自行判断） */
type DiskUsagePolicy =
/** 可随时重建/可重新下载：现在就能整块清掉（tmp、market/cache、market/work） */
'regenerable' |
/** 有自动保留期（导出产物 7 天 / 定时备份保留最近 N 个） */
'retained' |
/** 用户数据/安全网（导入前快照、同步配置与工作副本）——只报告，不提供清理 */
'protected';
/** 单个子区的体检结果 */
interface DiskUsageAreaReport {
  /** 字节数（目录不可读/不存在 → 0） */
  sizeBytes: number;
  /** 文件数（目录不可读/不存在 → 0） */
  fileCount: number;
  /** 目录本身读不到（不存在或权限不足）：界面必须说明「未统计」而不是显示 0 字节 */
  unreadable: boolean;
  /** 可回收策略 */
  policy: DiskUsagePolicy;
  /** 自动回收的保留期（毫秒；仅 retained 语义有值） */
  retentionMs?: number;
  /** 已超过保留期、下次自动清理会删掉的字节数（仅 retained） */
  expiredBytes?: number;
  /** 已超过保留期的条目数（仅 retained） */
  expiredCount?: number;
}
/** 单条遗留数据的体检结果（只报告；`policy` 恒为 protected） */
interface DiskUsageLegacyEntry {
  /** 稳定 id（与 `LEGACY_DATA_DIRS` 逐条对应） */
  id: string;
  /** 相对 dataDir 的路径（如 `checkpoints`） */
  relPath: string;
  /** 绝对路径（界面「在哪儿」展示） */
  path: string;
  /** 字节数（不存在/不可读 → 0，必须与 unreadable 一起看） */
  sizeBytes: number;
  /** 文件数（不存在/不可读 → 0） */
  fileCount: number;
  /** 读不到/不存在/被非目录占住 → true（界面必须显示「未统计」，绝不伪报 0 字节） */
  unreadable: boolean;
  /** 恒为 `protected`：只报告，绝不提供自动清理 */
  policy: 'protected';
}
/** 子区明细记录：`DISK_USAGE_AREAS` 的**每个**子区（含回滚点库等附加子区）逐键必填 ——
 *  报告运行时恒为完整结构，索引访问不可能拿到 undefined（`noUncheckedIndexedAccess` 下也成立，
 *  故只读消费者如离线救急台可直接 `report.areas[area]`，不需要缺失回退）。 */
type DiskUsageAreasReport = Record<DiskUsageScanArea, DiskUsageAreaReport>;
/** 体检报告（路径字段供界面「在哪儿」展示；均为本机绝对路径，无敏感内容） */
interface DiskUsageReport {
  /** dataDir（`$DSH_HOME/dsh-config-manager`） */
  dataDir: string;
  /** 全部**子区**合计字节数（含回滚点库等附加子区；**不含**遗留数据 —— 见 legacy） */
  totalBytes: number;
  /** 全部子区合计文件数（口径同 totalBytes） */
  totalFiles: number;
  /** 可立即清理（regenerable）子区合计字节数 */
  reclaimableBytes: number;
  /** 到达自动回收期的字节数（retained 子区） */
  expiredBytes: number;
  /** 各子区明细（恒含 `DISK_USAGE_AREAS` 的全部子区，逐键必填） */
  areas: DiskUsageAreasReport;
  /**
   * 遗留数据明细（插件**已不再读取**、也**不代删**；只报告）。
   * 结构可容纳多条（见 `LEGACY_DATA_DIRS`）；**不计入 totalBytes**（子区合计与遗留数据
   * 分开列，界面才不会把「能解释来源的占用」和「遗留占用」混成一个数）。
   * 类型上可选只是为了让既有报告字面量（测试/旧调用方）继续成立 —— 宿主
   * `GET /disk-usage` 恒回传本字段（无遗留目录时为空数组）。
   */
  legacy?: readonly DiskUsageLegacyEntry[];
  /** 定时备份产物的保留口径（「保留最近 N 个」；界面用它解释为什么有的备份不会自动回收） */
  backupRetention: {
    keepLast: number;
    /** 最新一个备份产物的字节数（无备份 → 0） */
    latestBackupBytes: number;
    /** 最新一个备份产物的时间（ISO-8601；无备份 → null） */
    latestBackupAt: string | null;
  };
}
/** 严重级（数组顺序 = 由重到轻；排序与展示都用这一份）。 */
type SessionHealthSeverity = 'blocksStartup' | 'unloadable' | 'nextRequestFails' | 'invisible' | 'ok';
/** 路由返回的一行（与宿主 session-health 的 SessionHealthRow 同构；此处只取展示所需）。 */
interface SessionHealthRowView {
  unitId: string;
  sessionId: string;
  /**
   * 对话标题（宿主从 DSH 会话缓存补；**可能缺省** —— 缓存没覆盖这条会话时就没有）。
   * 界面不得拿目录名伪装成标题，也不得编造：缺省 → 回落显示 sessionId。
   */
  title?: string;
  /** 空白会话（从未提问过；宿主下发的事实）—— 界面显示本地化的「新会话」，不用 uuid 冒充标题。 */
  blank?: boolean;
  projectKey: string;
  severity: SessionHealthSeverity;
  issues: {
    code: string;
    severity: SessionHealthSeverity;
    detail?: string;
  }[];
  version?: number;
  cwd?: string;
  origin?: string;
  sizeBytes?: number;
  mtimeMs?: number;
}
/** 路由响应（`GET /recovery/sessions`）。 */
interface SessionHealthResponse {
  ok: boolean;
  readOnly: boolean;
  sessionsDir: string;
  sessionsDirExists: boolean;
  targetFormatVersion: number | null;
  summary: {
    total: number;
    bySeverity: Record<SessionHealthSeverity, number>;
    structurallyChecked: number;
    deepVerified: number;
    deepUnverified: number;
    untested: number;
    unreadableEntries: number;
  };
  rows: SessionHealthRowView[];
  /** 被 limit 截断掉的条数 */
  truncated: number;
  nextSteps: {
    commands: {
      command: string;
      reason: string;
    }[];
    notes: string[];
  };
  /** T8：本机可回滚的修复（台账；宿主保证**不含任何绝对路径**） */
  repairs?: SessionRepairEntry[];
  /** 台账读不出来时的事实（界面如实提示，不谎报「没有可回滚的修复」） */
  repairsError?: string;
}
/** 一次修复的台账记录（宿主回传；只有标识与计数，没有目录）。 */
interface SessionRepairEntry {
  repairId: string;
  unitId: string;
  sessionId: string;
  projectKey?: string;
  logName?: string;
  backupName?: string;
  /** 修复时刻（epoch ms） */
  at?: number;
  droppedRows?: number;
  bytesBefore?: number;
  bytesAfter?: number;
  /** 已回滚时刻（epoch ms；缺省 = 未回滚） */
  rolledBackAt?: number;
}
/** 计划里的一步动作（与宿主 SessionRepairAction 同构；界面只渲染）。 */
interface SessionRepairActionView {
  code: string;
  detail: string;
  lossy: boolean;
  rows: number;
}
/**
 * 写后**真 codec 复验结论**的展示视图（src/ui 内部定义的结构化类型）。
 *
 * 为什么不直接 import utils/session-verify.ts 的 SessionVerifyResult：src/ui 会被打进 **client bundle**
 * （浏览器半），而那个模块经 utils/zstd-frame.ts 间接依赖 `node:zlib` —— bundle 里一旦出现对 node: 内建模块的
 * 引用，DSH loader 会报 missed the module table，**整个插件不加载**（本项目实测过）。
 * 所以这里只**逐字段镜像**宿主回传的形状（结构化鸭子类型），判定逻辑落在本模块的纯函数里。
 *
 * 语义（与 utils/session-verify.ts 的 SessionVerifyResult 逐字同源，**不许曲解**）：
 *  · verified && equivalentToReadPath   → 「现役读盘可读」（header 版本 = 本机现役代际）；
 *  · verified && !equivalentToReadPath  → 「迁移链可还原」（pre-v4 日志），**不等于**现役读盘可读；
 *  · !verified                          → 「**未验证**」（本机跑不了真 codec 门），**不等于**已验证。
 */
interface SessionVerifyView {
  verified: boolean;
  /** verified 时解出的事件数 */
  events?: number;
  /** !verified 时的机器可读原因（unavailable / invalid-header / decode-failed / finish-failed） */
  reason?: string;
  /** !verified 时的补充详情（机器可读码 + 候选标签，**不含路径**） */
  detail?: string;
  /** 额外的「已安装 build 语义校验」结论（不参与判定） */
  strong?: boolean;
  strongDetail?: string;
  /** 是否等价于 DSH 现役读盘路径（未验证时恒 false = 「没有任何可声称的现役等价」） */
  equivalentToReadPath: boolean;
}
/** 修复预览 / 应用结果（POST /recovery/sessions/repair）。 */
interface SessionRepairResult {
  ok: boolean;
  /** 机器可读原因（文案由界面映射；未知原因回退通用文案） */
  reason?: string;
  unitId: string;
  sessionId?: string;
  logName?: string;
  droppedRows?: number;
  bytesBefore?: number;
  bytesAfter?: number;
  /** 应用时必须回传的指纹（预览给出） */
  expect?: {
    size: number;
    mtimeMs: number;
  };
  /** busy 时的最近写入时间（epoch ms） */
  mtimeMs?: number;
  repairId?: string;
  backupName?: string;
  /** 修复发生了但台账没记上（回滚入口不可用；备份文件仍在） */
  ledgerRecorded?: boolean;
  /** 计划里的动作清单（预览也回传：界面据此逐条说明「将要做什么」） */
  actions?: SessionRepairActionView[];
  /** 计划含**有损**动作（截断）：应用时必须显式放行 */
  lossy?: boolean;
  /** 保留的行数 */
  keptRows?: number;
  /**
   * 写后真 codec 复验结论（**应用期才有**）。调用方必须据它区分三态；
   * 缺省 = 没回传复验结论（预览路径）—— **绝不**当成「已验证」。
   */
  verify?: SessionVerifyView;
  /**
   * 确定性失败（reason=`verify-failed`）时：自动回滚是否成功。
   * false = 目标当前仍是「修复后字节」（危险态，必须可见）；缺省 = 服务层没回传（不猜）。
   */
  rolledBack?: boolean;
}
/** 回滚结果（POST /recovery/sessions/rollback）。 */
interface SessionRepairRollbackResult {
  ok: boolean;
  reason?: string;
  repairId: string;
  unitId?: string;
  sessionId?: string;
}
/**
 * 客户端展示层（src/ui/*、src/client/common/*）的渲染文案目录（zh 源语言 / en 镜像）。
 *
 * 与 core 的 messages.ts 分工：本目录负责「客户端纯渲染层」（ReportView / ErrorBanner /
 * ProgressBar / sync-view）产生的中文文案；core 侧引擎消息已随 API 数据源翻译。
 * 这些纯函数原先直接内嵌中文，现经 UiDict 注入：Client 挂载时按 ctx.locale 提供。
 *
 * 纪律：
 *  - TextKey 类型 = keyof typeof uiZh，en 缺键/多键即编译错误；
 *  - {param} 插值，缺参原样保留。
 */
declare const uiZh: {
  readonly commonClose: '关闭';
  readonly commonCancel: '取消';
  readonly commonRetry: '重试';
  readonly commonUnknownError: '未知错误';
  readonly 'export.download': '下载备份文件';
  readonly 'export.run': '开始导出';
  readonly 'export.selectionWarnings': '以下分区为设备相关数据，跨设备导入时可能不适用：';
  readonly 'export.included': '已包含';
  readonly 'export.excluded': '未包含';
  readonly 'export.unknownSection': '未知分区：{id}';
  readonly 'export.deviceSpecific': '{label} 为设备相关数据（{portability}），跨设备导入时可能不适用';
  readonly 'report.backupCreated': '备份已创建';
  readonly 'report.importComplete': '导入完成';
  readonly 'report.importFailed': '导入失败';
  readonly 'report.tombstonedSkipped': '已按删除记录跳过 {count} 项';
  readonly 'report.included': '已包含：';
  readonly 'report.excluded': '未包含：';
  readonly 'report.security': '安全：';
  readonly 'report.apiKeysExcluded': 'API 密钥已排除：';
  readonly 'report.containsSecrets': '包含密钥：';
  readonly 'report.encrypted': '已加密：';
  readonly 'report.redacted': '{count} 个敏感字段已脱敏';
  readonly 'report.file': '文件：';
  readonly 'report.yes': '是';
  readonly 'report.yesEncrypted': '是（加密）';
  readonly 'report.no': '否';
  readonly 'report.importedRestored': '已导入/恢复';
  readonly 'report.skipped': '跳过';
  readonly 'report.needAttention': '需注意';
  readonly 'report.failed': '失败';
  readonly 'report.noChanges': '无变更';
  readonly 'report.reason': '原因';
  readonly 'report.note': '说明';
  readonly 'report.unknownReason': '未知原因';
  readonly 'report.problems': '需要你关注（{count}）';
  readonly 'report.sectionDetail': '分区明细';
  readonly 'report.other': '其它';
  readonly 'report.fullText': '完整文本报告（含逐项原因）';
  readonly 'report.secrets': '密钥：';
  readonly 'report.credentialsNeedEntry': '{count} 个凭据需要补录';
  readonly 'report.restartPluginsMcp': '插件/MCP 更改将在重启 DSH 后生效';
  readonly 'report.rollbackFull': '回滚：已完整恢复导入前的配置。';
  readonly 'report.rollbackPartial': '回滚部分完成。';
  readonly 'report.rollbackManual': '以下项目可能需要人工恢复：';
  readonly 'report.restored': '已恢复：{count} 项';
  readonly 'report.includedCount': '已包含 {count}';
  readonly 'report.excludedCount': '未包含 {count}';
  readonly 'report.badgeEncrypted': '已加密';
  readonly 'report.badgeNoSecrets': '不含密钥';
  readonly 'report.badgeRedacted': '{count} 项已脱敏';
  readonly 'report.rollback': '回滚';
  readonly 'report.action.fixIssues': '查看失败项';
  readonly 'report.includedSections': '已包含的分区';
  readonly 'report.excludedSections': '未包含的分区';
  readonly 'report.warnings': '注意事项';
  readonly 'report.unit.namespaces': '个命名空间';
  readonly 'report.unit.files': '个文件';
  readonly 'report.unit.servers': '个服务器';
  readonly 'report.unit.providers': '个 Provider';
  readonly 'report.unit.plugins': '个插件';
  readonly 'report.unit.patchLines': '行补丁';
  readonly 'report.unit.patchFiles': '个补丁文件';
  readonly 'report.unit.localTarballs': '个本地包';
  readonly 'report.unit.prompts': '条提示词';
  readonly 'report.unit.workspaces': '个工作区';
  readonly 'report.unit.credentials': '项凭据状态';
  readonly 'report.unit.notes': '条说明';
  readonly 'error.notMounted': 'config-manager 服务未挂载（插件未加载）：请确认 profile 中已安装 dsh-config-manager 并重启 DSH';
  readonly 'error.apiPathMissed': '接口路径未命中（HTTP {status}）：请求前缀为 {base}，但该路径没有返回 JSON —— 若你经反向代理挂在子路径下，请检查代理是否转发了这个前缀（issue #108）';
  readonly 'error.httpInvalidJson': 'HTTP {status}: 无效的 JSON 响应';
  readonly 'error.fallback': '操作失败';
  readonly 'error.requestTimeout': '请求超时（{seconds} 秒）：未在时限内收到宿主响应，请重试';
  readonly 'error.downloadFailed': '下载失败：HTTP {status}';
  readonly 'error.exportTimeout': '导出超时（{minutes} 分钟）：导出过程未完成，请重试；若反复超时请检查 DSH 状态';
  readonly 'error.syncTimeout': '同步请求超时（{minutes} 分钟）：请检查网络与仓库可达性后重试';
  readonly 'error.recoveryTimeout': '恢复请求超时（{minutes} 分钟）：过程可能仍在后台进行，请先刷新预览确认；确实未完成再重试';
  readonly 'error.settingsConflict.title': '配置已被并发修改';
  readonly 'error.settingsConflict.action': '目标 DSH 的该配置在导入期间被其他进程修改，为避免覆盖请重新导出或手动核对后再试。';
  readonly 'error.notConfirmed.title': '导入未确认';
  readonly 'error.notConfirmed.action': '请在预览页确认导入内容后重试。';
  readonly 'error.integrity.title': '备份完整性校验失败';
  readonly 'error.integrity.action': '备份文件可能已损坏或被篡改，请重新导出备份后再试。';
  readonly 'error.schema.title': '备份格式版本不受支持';
  readonly 'error.schema.action': '请升级 DSH Config Manager 或使用相同版本的备份文件。';
  readonly 'error.notFound.title': '文件或路径不存在';
  readonly 'error.notFound.action': '请检查文件路径是否正确、文件是否已被移动或删除。';
  readonly 'error.permission.title': '权限不足';
  readonly 'error.permission.action': '请检查目标目录的读写权限后重试。';
  readonly 'error.needsRestart.title': '插件安装需要重启生效';
  readonly 'error.needsRestart.action': '导入已完成，插件将在重启 DSH 后生效；请在 DSH Desktop 中重启服务。';
  readonly 'error.reason': '原因';
  readonly 'error.suggestedAction': '建议操作';
  readonly 'error.item': '相关项';
  readonly 'progress.analyzing': '正在分析配置…';
  readonly 'progress.exportingSettings': '正在导出设置…';
  readonly 'progress.scanningSecrets': '正在扫描密钥…';
  readonly 'progress.exportingPlugins': '正在导出插件…';
  readonly 'progress.creatingArchive': '正在创建归档…';
  readonly 'progress.calculatingChecksums': '正在核对文件完整性…';
  readonly 'progress.exporting': '正在导出配置…';
  readonly 'progress.validating': '正在校验备份…';
  readonly 'progress.checkingCompatibility': '正在检查兼容性…';
  readonly 'progress.creatingSnapshot': '正在创建安全快照…';
  readonly 'progress.restoringSettings': '正在恢复设置…';
  readonly 'progress.restoringPlugins': '正在恢复插件…';
  readonly 'progress.restoringMcp': '正在恢复 MCP…';
  readonly 'progress.validatingConfig': '正在校验配置…';
  readonly 'progress.rollingBack': '正在回滚…';
  readonly 'progress.executing': '正在应用配置（插件安装可能需要较长时间）…';
  readonly 'progress.syncing': '正在同步配置…';
  readonly 'progress.backingUp': '正在备份配置…';
  readonly 'progress.restoring': '正在恢复快照…';
  readonly 'progress.switchingProfile': '正在切换配置档案…';
  readonly 'progress.recovering': '正在恢复/回滚…';
  readonly 'progress.done': '已完成';
  readonly 'progress.failed': '已失败';
  readonly 'snapshots.status': '状态';
  readonly 'snapshots.planTitle': '恢复计划预览';
  readonly 'snapshots.confirmRestore': '确认恢复？会先把当前文件备份到一个安全位置，再删除导入期间新增的插件。';
  readonly 'snapshots.execute': '执行恢复';
  readonly 'snapshots.executing': '正在恢复…';
  readonly 'snapshots.restored': '已恢复';
  readonly 'snapshots.removedPlugins': '已卸载插件';
  readonly 'snapshots.manualHints': '需人工处理';
  readonly 'snapshots.failed': '失败';
  readonly 'snapshots.skipped': '跳过';
  readonly 'snapshots.noActions': '该快照无可恢复动作（或全部跳过）。';
  readonly 'snapshots.reportTitle': '恢复报告';
  readonly 'sync.privateRepoHint': '安全要求：同步仓库必须为私有仓库（public 仓库会公开你的配置内容）。认证 token 仅用于仓库访问，绝不写入同步文件、提交内容或日志。';
  readonly 'sync.kind.create': '新增';
  readonly 'sync.kind.update': '更新';
  readonly 'sync.kind.skip': '跳过';
  readonly 'sync.kind.conflict': '冲突';
  readonly 'sync.kind.install': '安装';
  readonly 'sync.kind.missingSecret': '凭据迁移';
  readonly 'sync.kind.missingDependency': '缺依赖';
  readonly 'sync.kind.pathMapping': '路径映射';
  readonly 'sync.kind.warning': '警告';
  readonly 'sync.kind.error': '错误';
  readonly 'sync.severity.error': '错误';
  readonly 'sync.severity.warning': '警告';
  readonly 'sync.severity.info': '信息';
  readonly 'sync.pushLabel': '推送到远端';
  readonly 'sync.pullLabel': '拉取差异预览';
  readonly 'sync.pushing': '正在推送…';
  readonly 'sync.pulling': '正在拉取…';
  readonly 'sync.statusLoading': '正在读取同步状态…';
  readonly 'sync.statusUnconfigured': '尚未配置同步仓库（请填写仓库地址并推送一次以保存配置）';
  readonly 'sync.credConfigured': '凭据已配置';
  readonly 'sync.credMissing': '未配置凭据（token 将在首次推送/拉取时写入 DSH credentials）';
  readonly 'sync.lastSync': '上次同步：{time}';
  readonly 'sync.neverSynced': '尚未同步过';
  readonly 'sync.neverSyncedShort': '从未同步';
  readonly 'sync.pushFailed': '推送失败';
  readonly 'sync.pushOk': '推送成功（快照 {id}）';
  readonly 'sync.pushSkipped': '内容未变化，已跳过（沿用远端快照 {id}）';
  readonly 'sync.conflictUnresolved': '冲突项 {id} 必须先选择解决方式（保留当前 / 使用导入）';
  readonly 'sync.pushPreviewHeadline': '将推送 {total} 个分区（{changed} 个有变化）';
  readonly 'sync.pushPreviewEncrypted': '加密快照：载荷将整体加密，各分区相对基线的变化不可比对。';
  readonly 'sync.pushPreviewCredentials': '本次推送包含真实凭据值（已随载荷整体加密；远端只见密文）。';
  readonly 'sync.pullFailed': '拉取失败';
  readonly 'sync.pullOk': '远端快照 {id} 差异预览：共 {count} 项变更';
  readonly 'sync.pullEmpty': '远端快照与本地一致（无变更）';
  readonly 'sync.previewHint': '以上为只读差异预览，不会执行导入。当前版本暂不支持一键导入；如需应用远端配置，请使用「导入恢复」向导手动导入导出的备份。';
  readonly 'sync.syncing': '正在同步…';
  readonly 'sync.importDone': '已导入 {n} 个分区';
  readonly 'sync.importPartial': '部分成功：{n} 项未生效（其余已写入，未整体回滚）';
  readonly 'sync.importFailed': '导入失败（已整体回滚）';
  readonly 'sync.autosyncNever': '从未运行';
  readonly 'sync.autosyncLastRun': '上次运行：{time}';
  readonly 'sync.autosyncSuccess': '成功';
  readonly 'sync.autosyncSkipped': '已跳过';
  readonly 'sync.autosyncFailed': '失败';
  readonly 'sync.autosyncPartial': '部分成功';
  readonly 'sync.autosyncFailCount': '连续失败 {n} 次';
  readonly 'sync.duration.min': '{n} 分钟';
  readonly 'sync.duration.hour': '{n} 小时';
  readonly 'sync.duration.day': '{n} 天';
  readonly 'sync.github.starting': '正在发起 GitHub 授权…';
  readonly 'sync.github.waitingNoCode': '请在浏览器中打开授权页面并完成授权…';
  readonly 'sync.github.waiting': '请在浏览器中打开授权页面，输入一次性代码 {code} 完成授权（自动等待确认）。';
  readonly 'sync.github.polling': '正在确认 GitHub 授权状态…';
  readonly 'sync.github.success': 'GitHub 登录成功：token 已安全写入 DSH credentials，可直接推送/拉取。';
  readonly 'sync.github.failed': 'GitHub 登录失败';
  readonly 'sync.github.defaultStatus': '通过 GitHub OAuth 设备码流程登录，token 自动写入 DSH credentials（无需手动输入）。';
  readonly 'sync.github.login': '使用 GitHub 登录';
  readonly 'sync.github.relogin': '重新登录';
  readonly 'sync.github.pollSuccess': 'GitHub 登录成功：token 已安全写入 DSH credentials。';
  readonly 'sync.github.pollDenied': 'GitHub 授权被拒绝（access_denied）。可重新发起登录，或改用下方手动 token 输入。';
  readonly 'sync.github.pollExpired': 'GitHub 授权已过期（expired_token）。请重新发起登录。';
  readonly 'sync.github.pollError': 'GitHub OAuth 错误：{detail}';
  readonly 'sync.github.unknownError': '未知错误';
  readonly 'market.statusUnconfigured': '尚未添加市场（请输入公开 Git 仓库地址）';
  readonly 'market.statusConfigured': '已添加 {count} 个市场';
  readonly 'market.supplyUnofficial': '来自公共网络、非官方审核';
  readonly 'market.supplySource': '来源仓库：{url}';
  readonly 'market.supplyDownloadedAt': '下载时间：{time}';
  readonly 'market.supplyAuthor': '作者：{author}';
  readonly 'market.supplyProvenanceSource': '作者声明来源：{source}';
  readonly 'market.supplyProvenanceNote': '作者自述：{note}';
  readonly 'market.detail.sections': '包含分区：{sections}';
  readonly 'market.detail.sectionsEmpty': '未声明分区';
  readonly 'market.detail.statusValid': '校验通过';
  readonly 'market.detail.statusInvalid': '校验未通过';
  readonly 'myConfigs.autoField': '系统自动';
  readonly 'myConfigs.field.id': '条目 ID';
  readonly 'myConfigs.field.author': '作者';
  readonly 'myConfigs.field.version': '版本';
  readonly 'myConfigs.field.updatedAt': '更新时间';
  readonly 'myConfigs.status.notListed': '未收录';
  readonly 'myConfigs.status.pendingPr': 'PR 待审核';
  readonly 'myConfigs.status.listed': '已收录';
  readonly 'myConfigs.form.errorName': '名称不能为空';
  readonly 'consult.dim.compatibility': '版本/平台兼容性';
  readonly 'consult.dim.integrity': '结构完整性';
  readonly 'consult.dim.sections': '分区完整性';
  readonly 'consult.dim.consistency': '一致性';
  readonly 'consult.dim.sensitive': '敏感暴露';
  readonly 'consult.dim.migratability': '可迁移性';
  readonly 'consult.recommendation.proceed': '建议：可继续';
  readonly 'consult.recommendation.review': '建议：需人工确认';
  readonly 'consult.recommendation.block': '建议：阻止执行';
  readonly 'consult.title': '迁移前咨询';
  readonly 'consult.healthScore': '健康评分 {score}';
  readonly 'consult.dryRun': '只读分析';
  readonly 'consult.blockers': '{count} 项硬阻断（不处理无法安全导入）';
  readonly 'consult.attention': '{count} 项需处理';
  readonly 'consult.reasons': '建议依据';
  readonly 'consult.willApply': '将应用';
  readonly 'consult.sections': '{count} 个分区';
  readonly 'consult.items': '{count} 项';
  readonly 'consult.conflicts': '{count} 个冲突';
  readonly 'consult.risks': '{count} 个风险';
  readonly 'consult.dimensions': '评分维度';
  readonly 'consult.loading': '正在生成咨询报告…';
  readonly 'diskUsage.title': '磁盘占用';
  readonly 'diskUsage.files': '{count} 个文件';
  readonly 'diskUsage.total': '合计 {size} · {files}';
  readonly 'diskUsage.refresh': '重新体检';
  readonly 'diskUsage.loading': '正在统计磁盘占用…';
  readonly 'diskUsage.unreadable': '未统计';
  readonly 'diskUsage.partial': '部分目录读不到：合计不含它们';
  readonly 'diskUsage.expiredHint': '其中 {size} 已到回收条件';
  readonly 'diskUsage.policy.regenerable': '可随时重建';
  readonly 'diskUsage.policy.retained': '{retention} 后自动回收';
  readonly 'diskUsage.policy.protected': '用户数据 / 安全网（不自动清理）';
  readonly 'diskUsage.area.exports': '备份文件';
  readonly 'diskUsage.area.exportsDesc': '手动导出与定时备份的 ZIP（host 端副本）';
  readonly 'diskUsage.area.snapshots': '导入前快照';
  readonly 'diskUsage.area.snapshotsDesc': '每次导入前自动创建的安全网';
  readonly 'diskUsage.area.sync': '同步配置与工作副本';
  readonly 'diskUsage.area.syncDesc': '同步通道配置 / 历史 / Git 工作副本';
  readonly 'diskUsage.area.marketCache': '市场缓存';
  readonly 'diskUsage.area.marketCacheDesc': '市场列表与条目缓存（可重新拉取）';
  readonly 'diskUsage.area.marketWork': '市场工作副本';
  readonly 'diskUsage.area.marketWorkDesc': '市场 Git 只读副本（可重新 clone）';
  readonly 'diskUsage.area.tmp': '临时暂存';
  readonly 'diskUsage.area.tmpDesc': '导入 / 导出 / 解密的中间产物';
  readonly 'diskUsage.area.logs': '日志';
  readonly 'diskUsage.area.logsDesc': '排障用运行日志';
  readonly 'diskUsage.area.bootState': '启动状态';
  readonly 'diskUsage.area.bootStateDesc': '崩溃归因与救援模式的状态文件';
  readonly 'diskUsage.area.migrationHistory': '迁移历史';
  readonly 'diskUsage.area.migrationHistoryDesc': '导入 / 恢复的审计记录';
  readonly 'diskUsage.area.transactions': '事务日志';
  readonly 'diskUsage.area.transactionsDesc': '导入执行日志（出事时对着它排查）';
  readonly 'diskUsage.area.locks': '环境锁';
  readonly 'diskUsage.area.locksDesc': '跨进程写保护锁';
  readonly 'diskUsage.area.vault': '敏感文件镜像';
  readonly 'diskUsage.area.vaultDesc': '本机编辑器写入通道的镜像（只在有需要时启用）';
  readonly 'diskUsage.retention.none': '保留策略已关闭（不自动回收）';
  readonly 'diskUsage.retention.days': '{count} 天';
  readonly 'diskUsage.retention.hours': '{count} 小时';
  readonly 'diskUsage.retention.minutes': '{count} 分钟';
  readonly 'diskUsage.backupRetention': '定时备份保留最近 {count} 个；导出文件保留 {days} 天后自动回收。';
  readonly 'diskUsage.clean.title': '释放空间';
  readonly 'diskUsage.clean.hint': '只清理可重建的缓存与暂存；快照与同步数据永不在此处删除。';
  readonly 'diskUsage.clean.now': '立即清理';
  readonly 'diskUsage.clean.cleaning': '正在清理…';
  readonly 'diskUsage.clean.tmpMarket': '清理临时与市场缓存';
  readonly 'diskUsage.clean.tmpMarketDesc': '忽略保留期直接清空：这些内容随时可重建（下载中的导入请稍后再清）。';
  readonly 'diskUsage.clean.expiredExports': '回收过期备份文件';
  readonly 'diskUsage.clean.expiredExportsDesc': '只删已超过保留期的导出 ZIP（定时备份不在此列）。';
  readonly 'diskUsage.clean.done': '已释放 {size}，删除 {count} 项';
  readonly 'diskUsage.clean.nothing': '没有可释放的内容';
  readonly 'diskUsage.clean.nothingAbsent': '没有需要清理的内容（目标目录不存在或已为空）';
  readonly 'diskUsage.clean.failed': '清理完成，但有 {count} 项失败（已跳过）';
  readonly 'diskUsage.clean.confirmTitle': '清理磁盘占用';
  readonly 'diskUsage.clean.confirmMessage': '将删除可重建的缓存与暂存，以及已过期的备份文件；快照与同步数据不受影响。此操作不可撤销，但被删内容都可重新生成。';
  readonly 'diskUsage.clean.confirm': '清理';
  readonly 'diskUsage.loadFailed': '磁盘占用统计失败';
  readonly 'diskUsage.location': '统计位置';
  readonly 'diskUsage.col.area': '内容';
  readonly 'diskUsage.col.size': '占用';
  readonly 'diskUsage.col.files': '文件数';
  readonly 'diskUsage.col.policy': '回收策略';
  readonly 'diskUsage.clean.reclaimableLabel': '可立即释放';
  readonly 'diskUsage.clean.includeExpired': '同时回收过期备份文件';
  readonly 'diskUsage.area.rollbackPoints': '回滚点库';
  readonly 'diskUsage.area.rollbackPointsDesc': '每回合自动留点的快照（工作区 + 会话两态）；只报告，不自动清理';
  readonly 'diskUsage.legacy.title': '遗留数据';
  readonly 'diskUsage.legacy.hint': '插件不再读取 · 不会自动删除 · 不计入上方合计';
  readonly 'diskUsage.legacy.label': '遗留数据';
  readonly 'library.kind.snapshot': '本机快照';
  readonly 'library.kind.backupFile': '备份文件';
  readonly 'library.kind.remote': '远端快照';
  readonly 'library.kind.market': '市场配置';
  readonly 'library.meta.entries': '{count} 条目';
  readonly 'library.meta.plugins': '{count} 插件';
  readonly 'library.meta.sections': '{count} 分区';
  readonly 'library.meta.sourceAuto': '自动';
  readonly 'library.meta.sourceManual': '手动';
  readonly 'library.meta.channelGit': 'Git';
  readonly 'library.meta.channelWebdav': 'WebDAV';
  readonly 'library.meta.dshVersion': 'DSH {version}';
  readonly 'library.badge.pinned': '置顶';
  readonly 'library.badge.current': '当前基线';
  readonly 'library.badge.encrypted': '加密';
  readonly 'library.badge.unreadable': '读不到';
  readonly 'library.cap.restore': '恢复';
  readonly 'library.cap.import': '导入';
  readonly 'library.cap.unlockImport': '解锁后导入';
  readonly 'library.cap.pull': '拉取';
  readonly 'library.cap.install': '安装';
  readonly 'library.cap.inspect': '查看与对比';
  readonly 'library.cap.download': '下载';
  readonly 'library.cap.consult': '迁移前咨询';
  readonly 'library.cap.pin': '置顶';
  readonly 'library.cap.unpin': '取消置顶';
  readonly 'library.cap.delete': '删除';
  readonly 'library.detail.id': 'ID';
  readonly 'library.detail.created': '创建时间';
  readonly 'library.detail.modified': '修改时间';
  readonly 'library.detail.path': '路径';
  readonly 'library.detail.note': '备注';
  readonly 'library.detail.entries': '条目数';
  readonly 'library.detail.plugins': '快照前插件数';
  readonly 'library.detail.pinned': '置顶';
  readonly 'library.detail.container': '容器形态';
  readonly 'library.detail.sections': '分区数';
  readonly 'library.detail.platform': '平台';
  readonly 'library.detail.dsh': 'DSH 版本';
  readonly 'library.detail.author': '作者';
  readonly 'library.detail.version': '版本';
  readonly 'library.detail.updated': '更新时间';
  readonly 'library.detail.size': '体积';
  readonly 'library.detail.source': '来源';
  readonly 'library.value.yes': '是';
  readonly 'library.value.no': '否';
  readonly 'library.value.encryptedContainer': '加密容器（导入前需解锁）';
  readonly 'library.value.plainZip': '明文 ZIP';
  readonly 'library.summary.count': '共 {count} 个';
  readonly 'library.summary.encrypted': '{count} 个加密';
  readonly 'foreign.source.claude-code': 'Claude Code';
  readonly 'foreign.source.hermes': 'Hermes';
  readonly 'foreign.source.cursor': 'Cursor';
  readonly 'foreign.source.codex': 'Codex CLI';
  readonly 'foreign.source.copilot': 'GitHub Copilot CLI';
  readonly 'foreign.source.antigravity': 'Google Antigravity';
  readonly 'foreign.source.gemini': 'Gemini CLI';
  readonly 'foreign.source.reasonix': 'Reasonix';
  readonly 'foreign.source.opencode': 'OpenCode';
  readonly 'foreign.source.mimocode': 'MimoCode';
  readonly 'foreign.source.zcode': 'ZCode';
  readonly 'foreign.source.grokbuild': 'Grok Build';
  readonly 'foreign.source.openclaw': 'OpenClaw';
  readonly 'foreign.source.pi': 'Pi';
  readonly 'foreign.source.kimi': 'Kimi CLI';
  readonly 'foreign.source.kilocode': 'Kilo Code';
  readonly 'foreign.source.qoder': 'Qoder';
  readonly 'foreign.source.chatgpt': 'ChatGPT';
  readonly 'foreign.source.workbuddy': 'WorkBuddy';
  readonly 'foreign.source.qwen': '千问办公';
  readonly 'foreign.source.continue': 'Continue';
  readonly 'foreign.source.cline': 'Cline';
  readonly 'foreign.source.goose': 'Goose';
  readonly 'foreign.source.dsh4': 'DSH 会话日志（V4 代次）';
  readonly 'foreign.source.zed': 'Zed';
  readonly 'foreign.source.crush': 'Crush';
  readonly 'foreign.source.teleagent': 'TeleAgent';
  readonly 'foreign.source.trae': 'Trae';
  readonly 'foreign.source.vibe': 'Vibe';
  readonly 'foreign.source.dsh': 'DSH 会话日志（V0-V3 代次）';
  readonly 'foreign.source.unknown': '未识别的来源';
  readonly 'foreign.found.yes': '已检测到';
  readonly 'foreign.found.no': '未检测到';
  readonly 'foreign.paths': '命中路径：{paths}';
  readonly 'foreign.pathsNone': '没有命中任何真值表路径';
  readonly 'foreign.credentialRefs': '需补录凭据 {count} 项：{refs}';
  readonly 'foreign.skip.unsupported-hooks': 'settings 的 hooks：DSH 无对等结构，未迁移';
  readonly 'foreign.skip.unsupported-commands': '斜杠命令：与 DSH 提示词不是同一语义，本次未迁移';
  readonly 'foreign.skip.credentials-not-migrated': '凭据字段只记录名字，值不读取也不迁移';
  readonly 'foreign.skip.skill-missing-file': '技能目录缺少 SKILL.md，未迁移';
  readonly 'foreign.skip.skill-invalid-frontmatter': '技能 frontmatter 非法，DSH 会静默丢弃，故未迁移';
  readonly 'foreign.skip.skill-invalid-name': '技能名含非法字符或路径穿越，未迁移';
  readonly 'foreign.skip.mcp-server-empty': 'MCP 条目既无 command 也无 url，未迁移';
  readonly 'foreign.skip.mcp-type-sse-coerced': 'MCP type=sse：按带 url 的 http 处理';
  readonly 'foreign.skip.mcp-credential-redacted': 'MCP 值里发现凭据字段：值已丢弃，只保留字段名与引用名';
  readonly 'foreign.skip.source-unreadable': '外部文件读不到、超限或解析失败';
  readonly 'foreign.skip.source-empty-file': '配置文件存在但为空（0 字节）：如实上报，不产出空分区';
  readonly 'foreign.skip.source-location-overridden': '配置位置被环境变量覆盖，按覆盖后的位置读取';
  readonly 'foreign.skip.session-cwd-derived': '会话记录里没有 cwd：按源侧目录名推导出工作目录，且该目录在本机确实存在（推不出来的一律按「缺少 cwd」跳过）';
  readonly 'foreign.skip.source-needs-explicit-path': '该来源没有自动探测位置：必须显式提供导出文件路径（自动探测永远不会命中）';
  readonly 'foreign.skip.session-format-version-unknown': '本机 DSH 会话格式版本未知：不猜版本，整批会话未迁移';
  readonly 'foreign.skip.session-format-unsupported': '本机 DSH 会话格式版本不受支持，该会话未迁移';
  readonly 'foreign.skip.session-missing-cwd': '会话记录缺少 cwd，无法归位到工作区';
  readonly 'foreign.skip.session-unsafe-id': '会话文件名不能作为安全路径段，未迁移';
  readonly 'foreign.skip.session-empty': '会话没有任何可迁移的事件';
  readonly 'foreign.skip.session-unparsable': '会话存在解析不出来的行，未迁移';
  readonly 'foreign.skip.unsupported-session-record': '该类型的会话记录本版不迁移';
  readonly 'foreign.skip.session-id-conflict': '同 id 会话已存在：不覆盖，跳过并保留本机既有的那条';
  readonly 'foreign.skip.skill-id-conflict': '技能重名：先到先得，其余跳过';
  readonly 'foreign.skip.sessions-not-migrated': '该来源的对话存储形态本版不迁移';
  readonly 'foreign.skip.memory-report-only': '记忆文件只报告、不导入（正文不进备份包）';
  readonly 'foreign.skip.skill-category-flattened': '技能带分类层级：已压平为 DSH 的单层技能目录';
  readonly 'foreign.skip.legacy-rules-file': '旧式规则文件：DSH 无对等结构，只报告';
  readonly 'foreign.skip.instructions-merged': '多份指令源被合并为一个全局指令文件';
  readonly 'foreign.skip.instructions-override-selected': '命中更高优先级的指令文件（override），按它导入';
  readonly 'foreign.importNothing': '没有可导入的内容：该来源在本机没有可转换的配置或会话';
  readonly 'foreign.skip.trae-db-key-invalid': 'Trae 加密会话库的密钥对不上（换版或密钥被覆盖）：页面头校验不通过，本次未读出任何会话';
  readonly 'foreign.skip.trae-db-too-large': 'Trae 加密会话库超出本来源的体积上限：未解密，未读出任何会话（全局 1 GiB 上限未改动）';
  readonly 'foreign.skip.trae-db-decrypt-failed': 'Trae 加密会话库无法解密：文件被截断、不是 SQLCipher 形态或读取失败，本次未读出任何会话';
  readonly 'foreign.skip.trae-db-schema-mismatch': 'Trae 加密会话库解密成功但表结构不符（缺 chat_session / history_v2 或必需列）：不猜字段，本次未读出任何会话';
  readonly 'foreign.skip.unsupported-permissions': '权限规则（allow/ask/deny）未迁移：DSH 没有权限规则文件的对等结构，这些规则不在本包内，导入后不会生效';
  readonly 'foreign.skip.unsupported-settings-keys': 'settings.json 里其余未迁移的顶层键：只记录键名与条数，键值一律不读取，也不会写进本包';
  readonly 'foreign.skip.unsupported-agents': '.claude/agents/*.md 子代理定义未迁移：DSH 的子代理是运行时 provider 注册制，没有文件级对等结构';
  readonly 'foreign.skip.unsupported-rules': '.claude/rules/*.md（带 frontmatter 作用域）未迁移：并入全局指令会丢掉作用域，故只报告不合并';
  readonly 'foreign.skip.unsupported-plugins': 'Claude Code 插件本体未迁移：插件的 hooks / 命令靠 Claude 运行时执行，DSH 无法加载，插件代码一律不复制；插件自带的 skills 与 .mcp.json 里的 MCP 定义另行迁移';
  readonly 'foreign.skip.session-id-mismatch': '会话记录里的 sessionId 与文件名不一致：DSH 按目录名/文件名定位会话，本次以文件名为准，记录里的 id 未采用';
  readonly 'foreign.skip.mcp-server-id-conflict': '同名 MCP server 在多处出现（全局 / 项目级 / 插件）：先到先得，其余同名项只报告未迁移';
  readonly 'foreign.skip.project-scan-truncated': '项目较多：项目级扫描只覆盖了上限内的项目，其余项目本次未读取，其配置不在本包内';
  readonly 'foreign.lossy.file-section-secrets.title': '文件类分区的明文不做剥离';
  readonly 'foreign.lossy.file-section-secrets.detail': '技能 / Agent 预设 / 全局指令 / 插件文件 / 历史会话 / 插件自身配置这六个文件类分区承载的是原始文件内容：命中的明文原样进包（导入侧只报告、不改写；本页的产包路径连扫描都不做）。「默认不含秘密」只对结构化分区成立，对这类分区不成立 —— 需要保密请先清理源文件。';
  readonly 'foreign.lossy.entry-backslash.title': '条目名中段反斜杠：跨平台落点可能不同';
  readonly 'foreign.lossy.entry-backslash.detail': 'ZIP 条目名里出现在中段的反斜杠不会被拒绝：同一个包在 Windows 目标上会被当作路径分隔符（落成多级目录），在 POSIX 目标上只是一个普通字符。本实现刻意不改这一格式行为；界面无法逐条检查条目名，跨平台导入后请核对这类文件是否落在预期位置。';
  readonly 'foreign.lossy.prompt-persona-reshape.title': 'prompts 的 systemPrompt 形状变化';
  readonly 'foreign.lossy.prompt-persona-reshape.detail': '源里的 systemPrompt 是字符串，导入落盘时写成带 persona 字段的对象：persona 文本无损，字段形状改变。兼容性评分不会为这一条给出原因 —— 它不改变内容，只改变形态。';
  readonly 'export.category.settings': 'DSH 全局设置（namespace 分区，redacted）';
  readonly 'export.category.providers': 'LLM Provider / Model / 默认模型 / BaseURL';
  readonly 'export.category.plugins': '已安装插件清单与启用状态（不含二进制）';
  readonly 'export.category.pluginFiles': '插件放在 ~/.dsh 根下的配置文件（白名单 + plugin-config/ 目录，整文件复制）';
  readonly 'export.category.self': '配置管理器自身的设置（同步/自动同步/分区选择/UI 偏好/市场；sync-*.json 等，不含凭据值）';
  readonly 'export.category.pluginData': '插件在系统主目录下的数据（如 ~/.dsh-wallpaper-engine、~/.mnemon 的配置与状态；可再生成缓存绝不收录）';
  readonly 'export.category.pluginAssets': '插件的大体积文件（上传的壁纸、本地数据库等；默认不勾选）';
  readonly 'export.category.mcp': 'MCP 服务器组合配置（需重启生效）';
  readonly 'export.category.prompts': 'System Prompt / Plan Mode 提示';
  readonly 'export.category.skills': '用户技能文件（~/.dsh/skills）';
  readonly 'export.category.agentPresets': 'Agent 预设（~/.dsh/.agent-presets）';
  readonly 'export.category.agentInstructions': '全局指令文件（~/.dsh/AGENTS.md，注入每个会话）';
  readonly 'export.category.workspaces': '工作区记录（含绝对路径，需路径映射）';
  readonly 'export.category.ui': 'UI 类 settings namespace（localStorage 项仅说明）';
  readonly 'export.category.credentialsStatus': '凭据状态（configured 标记，永不导出值）';
  readonly 'export.category.sessions': '历史会话（默认关闭，含敏感内容）';
  readonly 'export.group.automationNote': 'DSH 当前无 Workflows / Commands 配置文件（运行时注册），无迁移内容';
  readonly 'report.unitSeparator': '，';
  readonly 'foreign.source.unknownWithId': '未识别的来源（{id}）';
  readonly 'import.analysisFailed': '备份分析失败';
  readonly 'import.analysisIncomplete': '尚未完成分析，请先选择备份文件';
  readonly 'import.notConfirmed': '导入未确认：必须确认后才允许修改任何数据';
  readonly 'import.retryNoResult': '没有可重试的导入结果';
  readonly 'import.retryNothing': '没有失败或跳过的项需要重试';
  readonly 'run.exportResultLost': '上次导出任务已结束但结果无法恢复，请重新导出';
  readonly 'run.importResultLost': '上次导入任务已结束或超过保留期，结果无法恢复，请重新导入';
  readonly 'run.restoreResultLost': '上次恢复任务已结束但结果无法恢复，请重新执行';
  readonly 'run.exportUnavailable': '导出失败（结果不可用）';
  readonly 'run.restoreUnavailable': '恢复失败（结果不可用）';
  readonly 'run.progressLost': '任务已结束或超过保留期，进度不可恢复';
  readonly 'run.restoreProgressLost': '恢复任务已结束或超过保留期，进度不可恢复';
};
type UiTextKey = keyof typeof uiZh;
/** UI 翻译函数：key → 当前语言文案（{param} 插值；未知键回退 zh/键名）。 */
type UiT = (key: UiTextKey, params?: Record<string, string | number>) => string;
/**
 * GET /update-check 的结果。
 *
 * 成功与失败都用 HTTP 200：离线 / registry 不可达**不是插件故障**，界面据 `ok` 决定显示
 * 「已是最新 / 有新版本 / 检查失败（可重试）」，而不是弹错误横幅。
 */
type PluginUpdateCheckResult = {
  ok: true;
  /** 当前运行的插件版本 */
  current: string;
  /** npm 上的 latest */
  latest: string;
  /** latest > current（严格更新才算；本地跑预发布版时不提示降级） */
  updateAvailable: boolean;
  /** 本次结论时间戳（ms；缓存命中时为首查时间） */
  checkedAt: number;
  /** 是否来自进程内缓存 */
  cached: boolean;
} | {
  ok: false;
  current: string;
  /** 失败原因（网络 / 超时 / 响应畸形；可读、可重试、无敏感信息） */
  error: string;
};
/**
 * POST /update-apply 的结果（关于页「立即更新」）。
 *
 * 语义：用户**显式点击**后，宿主经官方 `dsh plugin` 通道把本插件安装为**钉住的精确版本**；
 * 成功只表示文件已换新，必须重启 DSH 才生效（needsRestart）。
 * 失败码与宿主共用同一份字面量（utils/shared-constants.ts），界面据码映射本地化文案，
 * 只有未知码才回落到宿主返回的原始错误文本。
 */
type PluginUpdateApplyResult = {
  ok: true;
  version: string;
  command: string;
  needsRestart: true;
} | {
  ok: false;
  code: SelfUpdateFailureCode;
  error: string;
};
/** 手动清理可点选的动作：可重建区（tmp + 市场缓存/工作副本）/ 已到期的导出产物。 */
type DiskUsageCleanCategory = 'tmp' | 'expired-exports';
/** POST /disk-usage/cleanup 的回执（回执里带刷新后的报告，避免界面再发一次 GET）。 */
interface DiskUsageCleanupResult {
  ok: boolean;
  /** 本次请求实际覆盖的动作 */
  requested: DiskUsageCleanCategory[];
  /** 被排除的动作（只请求了 tmp 时 = ['expired-exports']）——界面据此如实说明，不假装清过 */
  excluded: DiskUsageCleanCategory[];
  /** 删除条目数（文件 + 目录） */
  removed: number;
  /** 释放字节数（含目录递归，按清理前后子区体积差计） */
  freedBytes: number;
  /** 分区级释放量（子区 id → 字节；只含本次实际清理过的子区） */
  freedByArea: Partial<Record<string, number>>;
  /** 单项失败数（不影响其余清理） */
  errors: number;
  /** 逐条删除记录（相对 dataDir 的描述 + 字节数） */
  detail: string[];
  /** 清理后重新体检的报告 */
  report: DiskUsageReport;
}
/** recovery 决策（§5.2）：rollback-recommended=恢复到 trusted snapshot；rollback-continue=续跑中断回滚；needs-attention=需人工调查。 */
type RecoveryDecision = 'rollback-recommended' | 'rollback-continue' | 'needs-attention';
/** post-recovery verification verdict（§6.3）。 */
type RecoveryVerdict = 'MATCH' | 'PARTIAL_MATCH' | 'MISMATCH' | 'VERIFICATION_ERROR';
/** GET /recovery/status 的单个 incident（未解决 operation）。 */
interface RecoveryIncident {
  operationId: string;
  operationType: string;
  state: string;
  decision: RecoveryDecision;
  snapshotId: string | null;
  /** 已 redact 的原因文本。 */
  reason: string;
  createdAt: string;
}
/**
 * 正在**正常执行中**的操作（GET /recovery/status 的 `live`，加法字段）。
 *
 * 与 `incidents` 互斥：同一条 active journal 要么是「正在跑」（GLOBAL 锁由它持有、
 * 且 journal.ownerInstanceId 与锁持有者一致），要么是「一次未正常完成的操作」。
 * 判别只发生在宿主侧（single source = recovery-orchestrator 的 isLiveInFlight），
 * 客户端只负责如实展示。
 *
 * 旧宿主不返回 → undefined（面板按「无进行中操作」处理）。
 */
interface RecoveryActiveOperation {
  operationId: string;
  operationType: string;
  state: string;
  startedAt: string;
}
/** GET /recovery/status 响应。 */
interface RecoveryStatus {
  incidents: RecoveryIncident[];
  running: {
    runId: string;
    status: string;
  }[];
  /**
   * 正在正常执行的操作（不是 incident）。用途：面板要能解释「为什么现在什么都点不动」——
   * 此前这类操作被误报成事故，「执行恢复」永久灰、放弃恢复一直 423，用户拿不到任何原因。
   */
  live?: RecoveryActiveOperation[];
  /**
   * 环境锁状态摘要（issue #31）。纯残留锁**不是** journal：进程在 op 期间被杀时
   * `journalId: null`、`transactions/active/` 为空，incidents 恒为 []，而 423 文案却
   * 让用户去「事故恢复」处理 → 面板恒空、GUI 无出路。本字段让面板能显示可执行的锁事项。
   * 旧宿主不返回 → undefined（面板按「无锁事项」处理，不误报）。
   */
  lock?: RecoveryLockStatus;
  /**
   * SAFE MODE 阻断态（issue #56）。此前 status 完全没有这个信息 ⇒ 「durable 标记还在、
   * active/ 却已空」时面板显示「暂无需要处理的恢复事项」，而所有写操作持续 423 —— 用户
   * 看不到任何线索，也没有任何出口。
   *
   * 旧宿主不返回 → undefined（面板按「未阻断」处理，不误报保护）。
   */
  safeMode?: RecoverySafeModeStatus;
  /**
   * 中断的档案复制残留（cross-F3 / t54）：目标目录带 `.dcm-copy-in-progress.json` 标记、
   * 却没有 package.json 的半截副本。它们既不在档案列表里、删除又报 notFound ——
   * 用户此前在「事故恢复」里既看不到、也没有任何处置入口。
   * 旧宿主不返回 → undefined（按「无残留」处理，不误报）。
   */
  incompleteCopies?: RecoveryIncompleteCopy[];
  /**
   * t89：残留**枚举失败**（读 profiles 目录失败）时为 true —— 与「确实没有残留」
   * （字段缺省）区分开：此前两者在响应里完全同形（都是 `incompleteCopies: []`），
   * 界面便把「读不到」渲染成「暂无残留」。
   * 旧宿主不返回 → undefined（按「读到了」处理，绝不误报失败）。
   */
  incompleteCopiesUnreadable?: boolean;
}
/**
 * 中断的档案复制残留（cross-F3 / t54）：**只允许删除**。
 * 形态恒为 generic ⇒ 不可启动（没有 package.json，spawn 出去只会得到一个起不来的实例）。
 */
interface RecoveryIncompleteCopy {
  /** 目标档案名（= 目录名） */
  name: string;
  /** 目标目录绝对路径（界面渲染前过 `redact()`） */
  dir: string;
  /** 来源档案名（标记不可解析时为 null —— 界面不臆造） */
  sourceName: string | null;
  /** 复制开始时刻（ISO；标记不可解析时为 null） */
  startedAt: string | null;
}
/** SAFE MODE 阻断态摘要（只暴露结论与是否可解除）。 */
interface RecoverySafeModeStatus {
  /** durable 标记当前是否在阻断写操作（与 mutation gate 的 isBlocked 同源）。 */
  blocked: boolean;
  /**
   * 是否「没有未解决 incident，可安全解除」——即「结案但保护仍开着」。
   * 面板仅在 blocked && clearable 时渲染「解除安全模式」入口；还有 NEEDS_ATTENTION
   * 事务时必须先处理它（宿主侧也会拒绝，界面不给假按钮）。
   */
  clearable: boolean;
}
/** 环境锁状态摘要：**只暴露分类**（owner pid/op/hostname 属内部诊断，不进 UI/响应体）。 */
interface RecoveryLockStatus {
  /** LockState：STALE_LOCK_DETECTED / UNKNOWN_STATE / LOCKED / FREE / LOCK_IO_ERROR / PERMISSION_ERROR */
  state: string;
  /** 是否需用户显式处理（残留锁/无法判定）。LOCKED 活锁为 false —— 它会自行释放，不该催用户回收。 */
  attention: boolean;
}
/** POST /recovery/lock/recover 响应（显式回收 stale 残留锁；拒绝时 ok=false）。 */
interface RecoveryLockRecoverResult {
  ok: boolean;
  removed: boolean;
  state: string;
}
/**
 * POST /recovery/safe-mode/clear 响应（issue #56：显式解除 SAFE MODE）。
 * - 已解除 → `ok:true, cleared:true`；
 * - 本来就没阻断 → `ok:true, cleared:false, reason:'not-blocked'`（幂等，不是错误）；
 * - 还有未解决 incident → `ok:false, cleared:false, reason:'unresolved-incidents', unresolved:N`。
 */
interface RecoverySafeModeClearResult {
  ok: boolean;
  cleared: boolean;
  reason?: string;
  unresolved?: number;
}
/** GET /recovery/:operationId/preview 响应（只读，零写入）。 */
interface RecoveryPreview {
  operationId: string;
  operationType: string;
  state: string;
  decision: RecoveryDecision;
  snapshotId: string | null;
  snapshotVerdict: string | null;
  snapshotMeta: {
    id: string;
    createdAt: string;
    operationType?: string;
  } | null;
  environmentFingerprint: string;
  environmentCompatible: boolean;
  reason: string;
  createdAt: string;
}
/** POST /recovery/:operationId/verify 响应。 */
interface RecoveryVerifyResult {
  ok: boolean;
  operationId: string;
  verdict: RecoveryVerdict;
  terminal: string;
  /** 每项检查结果（已 redact）。 */
  details: string[];
  /** 需人工处理项（已 redact）。 */
  manualHints: string[];
}
/** POST /recovery/:operationId/execute|retry 响应。 */
interface RecoveryExecuteResult {
  ok: boolean;
  operationId: string;
  decision: RecoveryDecision;
  state: string;
  runId: string;
}
/** POST /recovery/:operationId/confirm 响应。 */
interface RecoveryConfirmResult {
  ok: boolean;
  operationId: string;
  snapshotId: string;
  verdict: string;
}
/** POST /recovery/:operationId/dismiss 响应。 */
interface RecoveryDismissResult {
  ok: boolean;
  operationId: string;
  dismissed: boolean;
}
/**
 * Recovery 端口契约（§10.3）：recovery 无现有 port（ExportPort/ImportPort 只服务控制器）。
 * `recovery-api.ts` 实现之；`recovery-view.ts` 是纯渲染模型（非控制器），消费本端口返回的渲染数据。
 * 安全：所有 destructive 动作（confirm/execute/retry/dismiss）必须显式传 userConfirmed=true，
 * 由 Host 侧双重校验（请求体 + journal 状态机）。
 */
interface RecoveryPort {
  status(): Promise<RecoveryStatus>;
  preview(operationId: string): Promise<RecoveryPreview>;
  confirm(operationId: string, userConfirmed: boolean): Promise<RecoveryConfirmResult>;
  execute(operationId: string, userConfirmed: boolean): Promise<RecoveryExecuteResult>;
  verify(operationId: string): Promise<RecoveryVerifyResult>;
  retry(operationId: string, userConfirmed: boolean): Promise<RecoveryExecuteResult>;
  dismiss(operationId: string, userConfirmed: boolean): Promise<RecoveryDismissResult>;
  /**
   * POST /recovery/lock/recover（issue #31）：显式回收 stale 残留配置锁。
   * 不带 operationId（残留锁没有 journal）；宿主侧会重新证明确属 stale 才回收，
   * 无法证明（活锁/判定不确定/二次验证失败）→ 返回 ok=false 且不做任何改动。
   */
  recoverStaleLock(userConfirmed: boolean): Promise<RecoveryLockRecoverResult>;
  /**
   * POST /recovery/safe-mode/clear（issue #56）：显式解除仍然生效的 SAFE MODE 保护。
   * 不带 operationId（该状态下往往已无 active journal）；宿主侧会重新判定
   * 「是否还有未解决的恢复事项」，有则拒绝（ok=false），绝不无条件清标记。
   */
  clearSafeMode(userConfirmed: boolean): Promise<RecoverySafeModeClearResult>;
  /**
   * GET /recovery/sessions（T5，**只读**）：本机存量会话的体检（损坏分类 + 可见性）。
   *
   * 为什么挂在 RecoveryPort 而不是新开一个端口：它与「我的对话去哪了」是同一件事，
   * 且宿主把它挂在既有 recovery prefix 路由下（不新增注册路由条目）。
   * `limit` 只影响回传浏览器的行数（摘要里的 total 仍是全量口径）。
   */
  sessions(limit?: number): Promise<SessionHealthResponse>;
  /**
   * POST /recovery/sessions/repair（T8）：应用内修复一份会话日志。
   *
   * apply=false 只预览（零写入）；apply=true 时**必须**回传预览给出的 expect 指纹 ——
   * 宿主用它做 TOCTOU 判定（预览之后文件被改过就拒绝，绝不按旧计划写入）。
   * 执行器自带完整安全序列（写前校验 → 时间戳备份 → 原子换入 → 写后复验）。
   */
  repairSession(unitId: string, apply: boolean, expect?: {
    size: number;
    mtimeMs: number;
  }, allowLossy?: boolean): Promise<SessionRepairResult>;
  /** POST /recovery/sessions/rollback（T8）：按台账里的 repairId 回滚一次修复（客户端不传路径）。 */
  rollbackSessionRepair(repairId: string): Promise<SessionRepairRollbackResult>;
}
/**
 * 「下载原始日志 (ZIP)」入口的**纯展示模型**（F-2，框架无关、node 可测）。
 *
 * 本模块**不做任何 I/O 与 React**：输入是宿主探测回来的结构化事实，输出是组件直接渲染的三件事 ——
 * 是否可用、给用户看的原因、按钮的交互状态。判定集中在这里的原因很实在：这条入口最容易犯的错
 * **不是**功能错，而是**显隐判据错**（生态竞品普遍用已过时的 `status !== 501` 探测，在本机 DSH 上
 * 会因为服务缺失返 500 而**几乎恒显示**）。判据只能有一份，且必须可单测。
 *
 * 三态语义（与宿主 src/routes/session-export.ts 的 `SessionExportAvailability` 同源）：
 *  - `available`  → 显示并可用；
 *  - `unavailable` → **显示但禁用**，并给出可读原因（绝不静默、也绝不直接消失让用户以为没这功能）；
 *  - `unknown`    → **保守显示为可用**（拿不到状态码时绝不猜成「不支持」——那会藏掉一个其实能用的功能）。
 *
 * 为什么 `unavailable` 是「禁用 + 说明」而不是「隐藏」：隐藏会让用户无从判断「是这台机器不支持」
 * 还是「插件没做这个功能」；禁用 + 一句话原因把这句话说清楚（与仓库「绝不静默」的既有取向一致）。
 */
/** 可用性三态（与宿主 src/routes/session-export.ts 的判定同源）。 */
type SessionExportAvailability = 'available' | 'unavailable' | 'unknown';
/** 成因（机器可读；界面映射成文案，**绝不渲染裸码**）。 */
type SessionExportReason = 'service-missing' | 'auth-required' | 'read-failed' | 'network-error' | 'unexpected-status';
/** 宿主探测回来的结构化事实（与 GET /session-export 的响应字段一一对应）。 */
interface SessionExportProbe {
  availability: SessionExportAvailability;
  reason?: SessionExportReason;
  /** DSH 返回的状态码（0 = 没拿到响应） */
  status: number;
  /** 探测的路径（诊断用） */
  path: string;
  /** 探测时刻（ISO） */
  checkedAt: string;
}
/** 未能迁移的外部内容（响亮失败：宁可在计划里报出来，也不静默丢） */
interface ForeignSkip {
  /** 稳定机器码（UI 用它映射文案；禁止渲染裸枚举） */
  code: ForeignSkipCode;
  /** 外部侧位置（server 名 / skill 名 / 文件名；**不含任何值**） */
  origin?: string;
  /** 机器可读的细分原因（如 no-frontmatter / yaml-error），同样交给 UI 映射 */
  detail?: string;
  /** 同码聚合时的条数 */
  count?: number;
}
type ForeignSkipCode =
/** settings.json 的 hooks：DSH 无对等结构 */
'unsupported-hooks' |
/** commands/*.md（斜杠命令）：与 DSH prompts 不是同一语义，本期不搬 */
'unsupported-commands' |
/** settings.json 的 env 里出现凭据名：只计数与记名，**值不读** */
'credentials-not-migrated' |
/** SKILL.md 缺失 */
'skill-missing-file' |
/** frontmatter 不是合法 YAML / 缺 name|description（DSH 会**静默丢弃**该 skill，这里必须报） */
'skill-invalid-frontmatter' |
/** 目录名/文件相对路径非法（含分隔符、.. 等），无法作为 skill 单元 */
'skill-invalid-name' |
/** MCP 条目既无 command 也无 url */
'mcp-server-empty' |
/** MCP type=sse（DSH 只支持 stdio / streamable-http）→ 按带 url 的 http 处理 */
'mcp-type-sse-coerced' |
/** MCP 值里发现凭据字段（值已丢弃，只留字段名与引用名） */
'mcp-credential-redacted' |
/** 外部文件读不到 / 超限 / 解析失败 */
'source-unreadable' |
/** 会话：目标机未提供 DSH 会话格式版本（不猜版本，宁可整批不转） */
'session-format-version-unknown' |
/** 会话：目标机格式版本不是本模块已实现的行式 */
'session-format-unsupported' |
/** 会话：记录里没有 cwd（DSH 要求「日志位置 == projectKey(cwd)/id」，没有 cwd 无法归位） */
'session-missing-cwd' |
/** 会话：文件名不能自证是安全路径段 */
'session-unsafe-id' |
/** 会话：没有任何可迁移的事件 */
'session-empty' |
/** 会话：存在解析不出来的行 */
'session-unparsable' |
/** 会话：某类 Claude 记录本期不迁移（sidechain / attachment / queue-operation / system …） */
'unsupported-session-record' |
/** 同 id 会话（包内重复 / 目标机已存在，含「另一 projectKey 下同 id」）：**不覆盖、跳过并报码**（用户决策，§8.4） */
'session-id-conflict' |
/** 外部技能重名（压平分类后同名，或两次来源同名）：先到先得，其余跳过并报码（§8.4） */
'skill-id-conflict' |
/** 该来源的对话存储形态本版不迁移（如 Hermes 的 SQLite state.db）：只报告，绝不产出 sessions 分区 */
'sessions-not-migrated' |
/** 记忆文件只报告不导入（如 Hermes memories/MEMORY.md、USER.md）：用户决策，正文绝不进包 */
'memory-report-only' |
/** 外部技能带分类层级（如 Hermes skills/<分类>/<技能>）：压平为 DSH 单层 <技能>/SKILL.md 并报码 */
'skill-category-flattened' |
/** 旧式规则文件（如 .cursorrules）：DSH 无对等结构，只报告 */
'legacy-rules-file' |
/** 多份指令源被合并为单个 AGENTS.md（DSH 只读一个全局指令文件）：如实报告合并来源数 */
'instructions-merged' |
/** 命中更高优先级的指令文件（如 Codex 的 AGENTS.override.md 优先于 AGENTS.md）：报告被选中的那一个 */
'instructions-override-selected' |
/** 配置文件存在但为 0 字节（如实测的 Antigravity mcp_config.json）：报码，绝不产出空分区 */
'source-empty-file' |
/** 配置目录位置被环境变量/命令行覆盖（CLAUDE_CONFIG_DIR / HERMES_HOME / CODEX_HOME / COPILOT_HOME） */
'source-location-overridden' |
/**
 * 会话 cwd 由**源侧路径/编码目录名推导**（记录里没有 cwd 字段），且推导结果在本机**真实存在**
 * —— 才允许落盘（存在性检查把「猜」变成「有证据的推断」）；不存在的推导一律按
 * `session-missing-cwd` 跳过，绝不产出一条指向不存在目录的会话。
 */
'session-cwd-derived' |
/**
 * 该来源**没有自动根**（竞品 `defaultRoots.chatgpt = null`）—— 必须由用户显式给出导出文件
 * 路径；本机自动探测永远不会命中，如实报码而不是假装「未安装」。
 */
'source-needs-explicit-path' |
/** settings.json 的 permissions（allow/ask/deny）：DSH 无权限规则文件对等结构，只报告条数 */
'unsupported-permissions' |
/** settings.json 里其余未迁移的顶层键（只记键名与条数，**值一律不读**） */
'unsupported-settings-keys' |
/** .claude/agents/*.md 子代理定义：DSH 的 subagent 是运行时 provider 注册制，无文件级对等结构 */
'unsupported-agents' |
/** .claude/rules/*.md 带 frontmatter 作用域：合并进全局指令会丢作用域，故只报告 */
'unsupported-rules' |
/** Claude Code 插件本体（插件 API / hooks / commands 的执行面）：DSH 无法加载，**绝不复制其代码** */
'unsupported-plugins' |
/** 会话记录里的 sessionId 与文件名 stem 不一致（DSH 以目录/文件名定位会话，故以文件名为准并如实报码） */
'session-id-mismatch' |
/** 同名 MCP server 在多处出现（全局 / 项目级 / 插件）：先到先得，其余只报告 */
'mcp-server-id-conflict' |
/** 项目级扫描触顶（maxProjects）：**不静默**，如实报码 */
'project-scan-truncated' |
/** 加密库密钥不符（换版 / 用户覆盖了错误密钥）：页头判据不成立，**绝不静默 0 会话** */
'trae-db-key-invalid' |
/** 加密库超出**本来源**的体积上限（copy-too-large 语义；全局 1 GiB 兜底未改） */
'trae-db-too-large' |
/** 加密库解密失败：截断 / 非 SQLCipher 形态 / 页尺寸不符 / IO 错误 */
'trae-db-decrypt-failed' |
/** 解密成功但表结构不符（缺 chat_session / history_v2 或必需列）：可判定失败，不猜字段 */
'trae-db-schema-mismatch';
/** `GET /foreign-sources` 返回的一条来源检测结果（与宿主 ForeignSourceStatus 同构） */
interface ForeignSourceStatusInput {
  id: string;
  /** 宿主给的字典键（如 foreign.source.claude-code）；**只作为兜底**，正常走 id 映射 */
  labelKey?: string;
  found: boolean;
  /** 命中位置（相对 home 的 POSIX 路径；宿主保证绝不是绝对路径） */
  paths: readonly string[];
  skipped?: readonly ForeignSkip[];
}
/** `GET /foreign-sources` 响应 */
interface ForeignSourcesResponse$1 {
  conflictPolicy?: string;
  projectScoped?: boolean;
  sources: readonly ForeignSourceStatusInput[];
}
/** 列举失败的原因码（客户端按它选字典键）。 */
type BrowseErrorCode = 'not-found' | 'denied' | 'failed' | 'not-absolute';
/** 一条条目：目录（可进入）或文件（可选中）。 */
interface BrowseEntry {
  /** 末段名字（驱动器根即盘符本身，如 `D:\\`）。 */
  name: string;
  /** 绝对路径（客户端原样回填输入框）。 */
  path: string;
  kind: 'dir' | 'file';
}
/** 列举结果。 */
interface BrowseResult {
  /** 当前列出的目录；空串 = 「此电脑」（Windows 的盘符根列表）。 */
  path: string;
  /** 上一级；已是根时为 null。 */
  parent: string | null;
  /** 用户主目录（界面上的快捷入口；不随 path 变化）。 */
  home: string;
  entries: BrowseEntry[];
  /** 命中 {@link BROWSE_ENTRY_LIMIT} 被截断。 */
  truncated: boolean;
  /** 失败原因码；成功为 null。 */
  error: BrowseErrorCode | null;
}
type NativePickReason = 'canceled' | 'unsupported' | 'failed';
type NativePickResult = {
  ok: true;
  path: string;
} | {
  ok: false;
  reason: NativePickReason;
  detail?: string;
};
/** 超时文案键（全部已存在于 ui/i18n.ts；本模块只做选键，不新增文案口径）。 */
type TimeoutMessageKey = 'error.requestTimeout' | 'error.fallback' | 'error.exportTimeout' | 'error.syncTimeout' | 'error.recoveryTimeout';
/** 请求选项：超时档位、超时文案键、调用方取消信号。 */
interface RequestOptions {
  /** 覆盖默认超时（缺省 REQUEST_TIMEOUT_MS）。 */
  timeoutMs?: number;
  /** 超时文案键（缺省 `DEFAULT_TIMEOUT_KEY` = error.requestTimeout：语境中立的通用超时）。 */
  timeoutKey?: TimeoutMessageKey;
  /** 调用方取消信号（与内部超时合并；取消时原样抛出 AbortError）。 */
  signal?: AbortSignal;
}
/** 携带路由 JSON error 消息的错误类型（客户端所有请求错误的唯一类型）。 */
declare class ConfigManagerApiError extends Error {
  /**
   * HTTP 状态码（有响应时）。
   *
   * 为什么需要：有些拒绝不是「出错」而是**必须由界面接管的流程状态** —— 典型是
   * T1 的会话格式处置：`/plan` 在 `abort` 处置下返回 **409 + code=sessionFormatUnsupported**，
   * 界面要据此渲染「三选一」的阻断态，而不是弹一条无可操作性的错误横幅。
   */
  readonly status?: number;
  /** 路由 error 体里的机器可读错误码（如 `sessionFormatUnsupported`；缺省 = 路由没给）。 */
  readonly code?: string;
  constructor(message: string, status?: number, code?: string);
}
/** Host 半健康检查响应（plugin 版本 / DSH 版本 / 平台，用于主页横幅与兼容性说明） */
interface ServiceStatus {
  ready: boolean;
  pluginVersion: string;
  dshVersion: string;
  platform: string;
  arch: string;
  /**
   * issue #28 诊断位（best-effort，失败时缺省）：插件清单实际读的是哪个目录 / 哪个 profile /
   * 看到几个插件。用于定位「装了插件但备份没识别到」——用户可据此自查 profile 与 DSH_HOME。
   */
  homeDir?: string;
  profile?: string;
  /** profile 的 package.json 是否可读（false → 清单必然为空） */
  profileManifestReadable?: boolean;
  installedPluginCount?: number;
  installedPluginNames?: string[];
  /** dsh.profile.bundles 声明（非空即替换默认插件栈） */
  bundles?: string[];
}
/**
 * 外部 agent 来源发现响应（`GET /foreign-sources`）。
 *
 * 复用 `src/ui/foreign-view.ts` 的输入类型 —— 响应形状的**唯一权威**在那边（视图模型只读它）。
 * 路径刻意在本文件重导出，避免组件同时 import 两处（同 `UploadResponse` 的做法）。
 */
type ForeignSourcesResponse = ForeignSourcesResponse$1;
/**
 * 外部来源 → bundle 的响应（`POST /foreign-import`）。
 *
 * `zipPath`：受控临时目录里的标准 bundle v1 ZIP，直接喂给既有导入向导的 `analyzeImport`。
 * `skipped` / `credentialRefs` **绝不含凭据值**（值在转换层已被剥离）。
 */
interface ForeignImportResponse {
  zipPath: string;
  name: string;
  /** 来源 id（六来源之一） */
  source: string;
  /** 来源显示名的字典键（如 foreign.source.hermes） */
  labelKey: string;
  /** 产物字节数（读不到时为 0，界面按「未知」处理） */
  sizeBytes: number;
  /** 本次产出包内的分区（空分区不会被写入，也不出现在这里） */
  sections: SectionId[];
  /** 各分区的条目计数（机器可读；键形如 `mcp.servers`） */
  counts: Record<string, number>;
  /** 未迁移项（只有机器码 + 位置名 + 条数） */
  skipped: ForeignSkip[];
  /** 凭据**引用名**（形如 `mcp:gitnexus:GITHUB_TOKEN`）；导入后由用户补录值 */
  credentialRefs: string[];
  /** 检测到的本机位置（相对 home；绝不回传绝对路径） */
  detectedPaths: string[];
  /** 冲突策略（用户决策：同 id 不覆盖、跳过并报码） */
  conflictPolicy: string;
}
/** export 端点响应（对齐 ExportFlow 的 ExportRunResult 前半部分；runId 为 m1 run 注册表标识） */
interface ExportResponse {
  zipPath: string;
  manifest: Manifest;
  report: ExportReport;
  /** m1：本次导出 run 的 id（可用 /progress 查询状态 / 刷新恢复） */
  runId: string;
}
/** upload 端点响应：Host 把用户上传的 ZIP 存入受控临时目录，返回可被 analyze/plan/execute 引用的路径 */
interface UploadResponse {
  zipPath: string;
  name: string;
  sizeBytes: number;
  /** zip=普通备份；encrypted=整体加密备份容器（需先 decryptArchive 解锁才能按 ZIP 解析） */
  containerType: 'zip' | 'encrypted';
}
/** P1-⑦/P2-⑬：备份内容查看 / 差异对比结果（只读；复用 analyze + plan 链路，零写入） */
interface BackupInspectResult {
  analysis: ImportAnalysis;
  plan: ImportPlan;
}
/** P2-⑫：导出前预览响应（不落盘 ZIP；各分区 counts + 估算大小） */
interface ExportPreviewResponse {
  ok: boolean;
  /**
   * Phase 1：每个分区附带**可单独勾选的最小单元**清单（`items`）。
   * items 为空数组 = 本分区不可细分（UI 只给整体开关）。单元由 adapter.listUnits()
   * 零 I/O 派生，id 命名空间与导入侧 PlanItem.id 一致。
   */
  sections: {
    section: SectionId;
    count: number;
    sizeBytes: number;
    items: ExportUnit[];
  }[];
  totalSections: number;
  totalSizeBytes: number;
  /** 读取失败的分区**数量**（既有契约，语义与类型均不变） */
  sectionsFailed: number;
  /**
   * 读取失败的分区 **id 列表**（t7，可选）。
   *
   * 宿主逐个分区调用 adapter.export 失败时一并收集。有了它，客户端不必再靠
   * 「请求了但没回来」推断失败分区，可以直接精确标注。
   *
   * 向后兼容：**可选**字段 —— 旧宿主（或第三方实现）不回该字段时，客户端回退到
   * 推断路径（见 `ui/export-flow.ts` 的 `failedSectionsFromResponse`）；
   * 旧客户端看到未知字段也会忽略，不受影响。
   */
  failedSections?: SectionId[];
}
/** decrypt-archive 端点响应：解锁整体加密容器后返回明文 ZIP 路径 + 解密覆盖的凭据 ref 名（非值） */
interface DecryptArchiveResponse {
  zipPath: string;
  /** 解密覆盖的凭据 ref 名（非值）；UI 据此从补录阶段剔除已恢复项 */
  refs: string[];
}
/** restore 端点响应：dryRun=true 返回 plan；执行返回 report（与 CLI 一致的诚实报告）。
 *  runId 仅真实执行时存在（宿主 RunRegistry 登记；/runs + /progress 刷新恢复用）。 */
interface RestoreResponse {
  dryRun: boolean;
  plan?: RestorePlan;
  report?: RestoreReport;
  runId?: string;
  /** git 风格预览：逐动作的变更状态 + 行数统计（dryRun=true 时由宿主附带；旧宿主不返回） */
  changeSummary?: RestoreChangeSummary;
  /** 恢复计划指纹（dryRun=true 时由宿主附带；执行时回传以发现「确认后磁盘又变了」；旧宿主不返回） */
  planFingerprint?: string;
}
/** Star 引导弹窗状态（GET /star-prompt；纯偏好，无 secret） */
interface StarPromptStatus {
  ok: boolean;
  /** 引导用户点 Star 的 GitHub 仓库地址（Host 提供，硬编码常量） */
  repoUrl: string;
  /** 首次进入页面时间（ms 时间戳）；undefined = 尚未进入过页面 */
  firstSeenAt?: number;
  /** 用户点过「不再提示」 */
  dismissed: boolean;
  /** 用户点过「去点 Star」（方案 A：引导完成） */
  clicked: boolean;
}
/** Star 引导弹窗状态的局部更新补丁（POST /star-prompt；全部可选） */
interface StarPromptPatch {
  firstSeenAt?: number;
  dismissed?: boolean;
  clicked?: boolean;
}
/** POST /star-prompt 响应（更新后的最新状态） */
interface StarPromptSaveResponse {
  ok: boolean;
  firstSeenAt?: number;
  dismissed: boolean;
  clicked: boolean;
}
/** 更新内容弹窗状态（GET /release-notes-prompt） */
interface ReleaseNotesPromptStatus {
  ok: boolean;
  lastSeenVersion?: string;
  dismissed: boolean;
  currentVersion?: string;
}
/** 更新内容弹窗状态局部更新补丁（POST /release-notes-prompt） */
interface ReleaseNotesPromptPatch {
  lastSeenVersion?: string;
  dismissed?: boolean;
}
/** POST /release-notes-prompt 响应 */
interface ReleaseNotesPromptSaveResponse {
  ok: boolean;
  lastSeenVersion?: string;
  dismissed: boolean;
}
/** 导出下载结果（流式落盘或内存 Blob 兜底） */
interface DownloadResult {
  blob?: Blob;
  filename: string;
  streamed: boolean;
  bytes: number;
}
/** 下载选项：saveDialog=true 才弹系统保存对话框（需用户手势）；缺省自动下载到浏览器下载目录 */
interface DownloadOptions {
  saveDialog?: boolean;
}
/**
 * DSH 宿主自带目录选择器的结果。
 *  - `ok`：用户选中（`path` 非空）；
 *  - `canceled`：用户点了取消，调用方静默收手；
 *  - `unavailable`：宿主没有这个能力（非桌面宿主 / 版本较旧 / 调用抛错），调用方回落下一层。
 */
type DshPickResult = {
  ok: true;
  path: string;
} | {
  ok: false;
  reason: 'canceled' | 'unavailable';
};
/**
 * Config Manager 浏览器半的唯一数据入口。
 * 同时实现 `ExportPort`（export-flow 用）与 `ImportPort`（import-wizard 用）。
 */
declare class ConfigManagerApi {
  /**
   * 加密备份密码（仅内存，默认 null = 普通备份）。
   * ExportView 在 run 前设置；export 请求体携带给 Host 半做 AES-256-GCM 加密。
   * 绝不写入 manifest / 任何 DSH 配置 / localStorage。
   */
  exportPassword: string | null;
  /** 客户端展示层翻译器（zh 源 / en 镜像，见 ui/i18n.ts）。 */
  readonly t: UiT;
  /**
   * DSH 自带目录选择器（桌面壳全局 `__DSH_DIRECTORY_PICKER__.pick` 或客户端服务 `ctx.get('uiWorkspace').pickDirectory`），
   * 由 `apply(ctx)` 注入的**惰取** thunk（解析顺序见 `import/dsh-directory-pick.ts`）。
   * 宿主没提供该能力时保持 `undefined`。
   */
  private readonly dshDirectoryPicker;
  constructor(t: UiT, dshDirectoryPicker?: () => Promise<string | null>);
  /** 健康/版本检查（主页横幅：插件版本 / DSH 版本 / 平台） */
  status(): Promise<ServiceStatus>;
  /** Star 引导弹窗状态（进入页面时判定是否展示 / 是否补记首次使用时间）。 */
  starPromptStatus(): Promise<StarPromptStatus>;
  /** P2-⑫：导出前只读预览（不落盘 ZIP）——「将打包 X 分区 / Y 条目 / 约 Z 大小」。 */
  /**
   * 只读清单（不落盘 ZIP）：分区 + 可勾选单元 + 估算大小。
   * `only` 缺省 = 推荐分区；内容选择器按「已勾选分区」与「展开/勾选某分区」分批调用，
   * 避免为了打开选择器就把 sessions 全量读一遍。
   */
  exportPreview(only?: SectionId[]): Promise<ExportPreviewResponse>;
  /** 保存 Star 引导弹窗状态（局部更新：firstSeenAt / dismissed / clicked）。
   * 纯偏好无 secret；失败由调用方静默降级（本次不弹/不记，下次再判）。 */
  saveStarPrompt(patch: StarPromptPatch): Promise<StarPromptSaveResponse>;
  /** 更新内容弹窗状态（进入页面时判定是否展示 / 是否已永不提示）。 */
  releaseNotesPromptStatus(): Promise<ReleaseNotesPromptStatus>;
  /** 保存更新内容弹窗状态（局部更新：lastSeenVersion / dismissed）。 */
  saveReleaseNotesPrompt(patch: ReleaseNotesPromptPatch): Promise<ReleaseNotesPromptSaveResponse>;
  /** ExportPort.export：调用 Host 侧导出编排（core Exporter）。加密密码随请求体传输（仅内存）。
   * 带 5 分钟超时（AbortController 在 common/http.ts）：宿主若卡死，客户端得到明确错误而不是永远停在进度条。 */
  export(options: ExportOptions): Promise<ExportResponse>;
  /**
   * 把导出的 ZIP 下载到本机。
   * - 默认（saveDialog 缺省/false）：读取为 Blob 后用 <a download> 触发浏览器
   *   静默下载到「下载」目录，无需用户额外操作（导出完成即可自动调用）；
   * - saveDialog: true：优先 File System Access API 流式落盘（不占整文件内存），
   *   用户可在系统保存对话框中选择位置；不可用/取消时回退 Blob 下载。
   *
   * 请求本身走 `common/http.ts` 的 `openStream`（唯一封装）：headers 阶段有超时，
   * 正文阶段是**空闲超时**（每读一块数据重置）——宿主卡死时下载明确失败而非永久转圈。
   */
  download(zipPath: string, opts?: DownloadOptions, onProgress?: (received: number, total: number) => void): Promise<DownloadResult>;
  /** 读取流式下载响应并落盘（流式写优先；不可用时 Blob + <a download> 兜底）。 */
  private saveDownloaded;
  /** 上传用户选择的 ZIP 到 Host 受控临时目录，返回可引用的 zipPath（dsh-ssh 同款原始字节上传） */
  upload(file: File): Promise<UploadResponse>;
  /**
   * ImportPort.analyzeImport：零写入分析（校验/兼容性/差异/路径/秘密检测）。
   *
   * `opts.decryptPassword`（仅内存）：提供即让宿主解开 secrets.enc，把
   * `analysis.credentials`（仅 ref 名）一并回传（issue #39 Feature 2）——
   * 客户端不必自己解析 .credentials.yaml。不传 = refs 为空数组。
   */
  analyzeImport(zipPath: string, opts?: {
    decryptPassword?: string;
  }): Promise<ImportAnalysis>;
  /**
   * ImportPort.createImportPlan：用用户决策（冲突/路径映射/策略）生成最终计划（Dry Run 零写入）。
   * `opts.decryptPassword`（仅内存）：加密备份必须与 /analyze、/execute 传同一个密码，
   * 让计划包含「归档里带值的凭据」——否则导入时这些值不会被写回。
   */
  createImportPlan(zipPath: string, decisions: ImportDecisions, opts?: {
    decryptPassword?: string;
    sessionFormatDisposition?: SessionFormatDisposition;
  }): Promise<ImportPlan>;
  /**
   * 列出一层本机目录（只读；路径映射「选本机路径」弹窗的数据源）。
   * `target` 缺省或空串 = 「此电脑」根列表（Windows 盘符 / POSIX `/`）。
   * 失败不抛异常：宿主回 `error: 'not-found'|'denied'|'failed'|'not-absolute'`，弹窗照常可用。
   */
  browsePath(target?: string): Promise<BrowseResult>;
  /**
   * 弹**系统原生**目录选择器（同一端点的 POST 形态）。
   *
   * 用户可能在系统对话框里逛几分钟，所以超时必须远大于常规请求：内核侧 10 分钟兜底，这里再加一道。
   * 回 `reason: 'unsupported' | 'failed'` 时调用方回落到内置目录浏览器，不当错误处理。
   */
  pickNativePath(startPath?: string, title?: string): Promise<NativePickResult>;
  /**
   * 复用 **DSH 宿主自带**的原生目录选择器（就是「选择工作区目录」那个窗口）。
   *
   * 比插件自己起系统对话框更稳：窗口由 DSH 主进程弹，跟着宿主走，不受插件宿主的进程形态限制。
   * 完全不设客户端超时 —— 用户可能在原生窗口里逛几分钟，宿主侧 `host.pickDirectory` 也是 caller-signal-only。
   * 宿主没有该能力或调用抛错一律归成 `unavailable`，由调用方回落插件自己的原生对话框，不当错误处理。
   */
  pickDshPath(): Promise<DshPickResult>;
  /** ImportPort.decryptArchive：解锁整体加密备份容器 → 明文 ZIP 路径 + 解密覆盖的凭据 ref 名 */
  decryptArchive(zipPath: string, password: string): Promise<DecryptArchiveResponse>;
  /** ImportPort.executeImportPlan：快照→分阶段 apply→validate→commit/rollback */
  executeImportPlan(zipPath: string, plan: ImportPlan, opts: {
    confirm: boolean;
    secretInputs?: Record<string, string>;
    rollbackOnError: boolean;
    decryptPassword?: string;
    sessionFormatDisposition?: SessionFormatDisposition;
  }): Promise<ImportResult & {
    runId: string;
  }>;
  /**
   * m1：查询单个 run 的实时状态（执行中轮询 / 刷新恢复用；404 = 已过保留期或不存在）。
   *
   * 超时用**普通档位**（30s）：`run-store.pollRun` 只在 promise 拒绝时才走 `applyGone`
   * （把 run 判为「已结束/不可恢复」并停止轮询），所以这里必须**有界**但不能过短 ——
   * 宿主事件循环被大操作短暂占住时，误报的代价（丢掉进度跟踪）高于晚 30 秒收敛。
   */
  progress(runId: string): Promise<RunState>;
  /** m1：列出当前活跃（running）的 run（刷新后重新订阅进行中任务的入口；超时同上）。 */
  runs(): Promise<RunState[]>;
  /** 导入中「跳过当前插件」：宿主 abort 当前计划项的中止控制器（kill 子进程 + 清半装状态）。
   * 404 = run 不在执行（已完成/无进行中导入）。 */
  skipExecute(runId: string): Promise<{
    skipped: boolean;
  }>;
  /**
   * 运行中心：列出最近的 run（含刚结束的；终态受宿主保留期约束，**不是**持久审计）。
   * 一次拿全「进行中 + 刚结束」，避免运行中心同时开两条轮询链。
   */
  runsRecent(): Promise<RunState[]>;
  /**
   * 运行中心：请求终止。协作式取消 —— 宿主在**计划项边界**暂停并把 run 置为「待决策」，
   * 由 decideRunCancel 回传处置方式。409 = 该任务类型没有安全点（目前只有导入支持）。
   */
  cancelRun(runId: string): Promise<{
    requested: boolean;
  }>;
  /** 运行中心：把「回滚 / 保留已应用项」的选择回传给停在安全点的引擎。 */
  decideRunCancel(runId: string, decision: 'rollback' | 'keep'): Promise<{
    accepted: boolean;
  }>;
  /** 列出全部快照元信息（createdAt 倒序；含 status/条目数/宿主文件数/插件数） */
  snapshots(): Promise<SnapshotMeta[]>;
  /**
   * 同 `snapshots()`，但把「快照目录读不出来」的事实一并带回（宿主 out.unreadable 透传）。
   * 为什么需要：读不出来与「没有快照」必须分清 —— 只拿数组会让界面把 EACCES 渲染成空列表。
   */
  snapshotsDetailed(): Promise<{
    snapshots: SnapshotMeta[];
    unreadable: string | null;
  }>;
  /** 快照恢复：dryRun=true 只取动作计划（零写入）；false 执行并返回诚实报告 */
  restoreSnapshot(snapshotId: string, dryRun: boolean, planFingerprint?: string): Promise<RestoreResponse>;
  /**
   * git 风格恢复预览：单个文件的逐行差异（只读，零写入）。
   * before = 当前磁盘文件 / after = 快照 blob；越界 / 二进制 / 超限经响应里的 reason 表达。
   */
  snapshotFileDiff(payload: {
    snapshotId: string;
    kind: SnapshotFileDiff['kind'];
    target?: string;
    blobPath?: string;
  }): Promise<SnapshotFileDiff>;
  /** P1-⑧：手动删除单个快照（危险操作：该导入前回滚点不可恢复；`removed` 为是否实际删除）。 */
  deleteSnapshot(snapshotId: string): Promise<{
    removed: boolean;
  }>;
  /** 列出 DSH profile：列表 + 当前运行 + 在跑的实例（台账 ∪ 心跳）+ 起步模板。 */
  profilesList(): Promise<DshProfilesSnapshot>;
  /** 单个档案详情（package.json / cordis.patch.yml 原文；大文件原文截断为 null）。 */
  profileDetail(name: string): Promise<DshProfileDetail>;
  /** 新建档案（在 $DSH_HOME/profiles/<name> 写标准 profile 三件套；template = base/web/headless/sdk/…）。 */
  profileCreate(name: string, template: string): Promise<DshProfileMeta>;
  /**
   * 复制档案：整份拷贝成新档案（package.json 的 name 跟随改写）。
   * includeNodeModules 缺省 true —— 副本立刻可用，但 285 MB 级档案实测要三十秒上下（走长操作档位）；
   * 传 false 只拷清单与 patch（秒级），回执 copy.warnings 会带 depsNotInstalled，调用方必须如实展示。
   */
  profileCopy(name: string, newName: string, opts?: {
    includeNodeModules?: boolean;
  }): Promise<{
    profile: DshProfileMeta;
    copy: DshProfileCopyResult;
  }>;
  /** 重命名档案（目录级移动；当前运行中的档案被 host 拒绝）。 */
  profileRename(name: string, newName: string): Promise<DshProfileMeta>;
  /** 物理删除档案目录（不可恢复；当前运行中的档案需显式 allowCurrent=true）。 */
  profileDelete(name: string, opts?: {
    allowCurrent?: boolean;
  }): Promise<void>;
  /**
   * 停掉该档案的实例：本插件启动的走台账，**别处/手动启动的**走心跳（同样按 pid 停）。
   * 返回停止后的运行中实例列表 —— UI 据此把该行按钮换回「启动」。
   */
  profileStop(name: string): Promise<{
    result: DshProfileStopOutcome;
    running: DshProfileRunningView[];
  }>;
  /**
   * 用该档案启动一个**独立 DSH 实例**（"切换档案"真正可用的形态；DSH 没有默认 profile 状态）。
   * 只支持 web 形态档案；host 要等子进程起来（最长 20s 探活）→ 长操作档位。
   * 同时返回启动后的 running 列表：UI 立刻把该行按钮换成「停止」，不必再 GET 一次。
   */
  profileLaunch(name: string): Promise<{
    launch: DshProfileLaunchResult;
    running: DshProfileRunningView[];
  }>;
  /** 读取定时备份配置（enabled / interval / 上次运行状态；无敏感字段）。 */
  backupSchedule(): Promise<BackupScheduleStatus>;
  /** 保存定时备份设置（enabled + interval）；Host 校验后原子写 + 重排调度器。 */
  saveBackupSchedule(draft: BackupScheduleDraft): Promise<BackupScheduleStatus>;
  /** 立即执行一次全量备份（复用调度器 runOnce，防重；返回执行结果 + 最新配置）。 */
  runBackupNow(): Promise<{
    run: BackupRunResult;
    schedule: BackupScheduleStatus;
  }>;
  /** 列出导出目录（exports/*.zip）下的全部备份文件（时间倒序；含来源 auto/manual）。 */
  listBackupFiles(): Promise<BackupFileMeta[]>;
  /** 删除一个备份文件（危险操作：不可恢复；仅限 exports 目录内 .zip）。 */
  deleteBackupFile(name: string): Promise<{
    removed: boolean;
  }>;
  /** 磁盘占用体检（只读）：按子区回传字节/文件数 + 各保留期的「已到期」量。 */
  getDiskUsage(): Promise<DiskUsageReport>;
  /**
   * 手动清理缓存与暂存（走 mutation gate）。
   * 缺省只清可重建区（tmp + 市场缓存/工作副本）；`categories` 可加入 'expired-exports'
   * 只删**已超保留期**的导出产物。snapshots / sync 永不在候选集内。
   */
  cleanupDiskUsage(categories: Array<'tmp' | 'expired-exports'>): Promise<DiskUsageCleanupResult>;
  /**
   * 只读检查 npm 上是否有新版本（GET /update-check）。
   *
   * `force=false`（缺省）命中宿主 10 分钟内的进程内缓存；`force=true` 绕过缓存重新探测
   * （用户在「关于」页点「重新检查」）。离线 / registry 不可达时返回 `ok:false` + 原因
   * —— 界面显示可重试提示，不当作错误横幅。
   */
  checkUpdate(force?: boolean): Promise<PluginUpdateCheckResult>;
  /**
   * 执行插件自更新（POST /update-apply）—— **只在用户显式点「立即更新」后**调用。
   *
   * 宿主经官方 dsh plugin 通道安装钉住的精确版本（见 core/self-update.ts）；成功后必须
   * 重启 DSH 才生效。安装可能较慢（慢网络下分钟级），故用独立的长超时档位。
   */
  applyUpdate(version: string): Promise<PluginUpdateApplyResult>;
  /** 迁移前咨询（只读健康评分 + 建议）：对 4 种可迁移源生成统一咨询报告。 */
  consult(input: {
    type: 'export-zip' | 'local-snapshot' | 'remote-snapshot' | 'profile';
    id: string;
    snapshotId?: string;
  }): Promise<ConsultReport>;
  /**
   * GET /foreign-sources：六来源的本机检测结果（**只读**，零写入）。
   *
   * 未安装是正常状态（found=false），不是错误 —— 界面照常列出全部六条，
   * 用户才知道「哪些查过了、本机确实没有」。
   */
  foreignSources(opts?: {
    projectDir?: string;
  }): Promise<ForeignSourcesResponse>;
  /**
   * POST /foreign-import：把本机某个外部 agent 的配置翻译成标准 bundle v1 ZIP，
   * 落到宿主受控临时目录并返回 zipPath —— 之后**完全复用既有导入向导**
   * （analyzeImport → createImportPlan → executeImportPlan），不新建第二套向导。
   *
   * 为什么必须由宿主产包：转换要读本机文件系统并写 ZIP，浏览器半做不了
   * （此前该能力只在 CLI 里，GUI 会在「点导入」之后断链）。
   *
   * `projectDir`：项目级真值位置（Cursor/Codex 的 <项目>/.cursor/**）。**缺省不传 = 不扫项目级** ——
   * 宿主进程的 cwd 不是用户的项目，绝不猜。
   *
   * 响应**绝不含凭据值**：只有 skipped 机器码与凭据**引用名**（值在转换层已被剥离）。
   */
  foreignImport(source: string, opts?: {
    projectDir?: string;
  }): Promise<ForeignImportResponse>;
  /**
   * GET /session-export（**只读**）：探测 DSH 官方 session.export 端的可用性。
   *
   * 为什么由宿主代探而不是浏览器直接打 DSH：见 src/routes/session-export.ts 的文件头 ——
   * 该端点挂在带浏览器认证的 `/api` 前缀下，浏览器侧「401 / 404 / 连不上」分不开，
   * 而「路由没注册」与「持久化后端缺服务」的处理方式**完全不同**（前者保守显示、后者隐藏入口）。
   *
   * 返回三态（**绝不二值化**）：`available` 显示 / `unavailable` 禁用并说明原因 / `unknown` 保守显示。
   */
  sessionExportProbe(): Promise<SessionExportProbe>;
  /** F-2：原始日志 ZIP 的代理下载地址（探测与下载同一条路由，query 决定形态）。 */
  sessionExportUrl(sessionId: string, opts?: {
    includeDescendants?: boolean;
  }): string;
  /**
   * F-2：把某条会话的原始日志 ZIP 下载到本机（由 DSH 自己打包，含子会话与附件）。
   *
   * 复用**既有**的流式下载链路（openStream + saveDownloaded，与导出产物同一条）：
   *  - 大 ZIP 不整本驻留内存（流式写优先，不可用时才 Blob 兜底）；
   *  - 正文阶段是**空闲超时**（每读一块重置）—— 宿主卡死时明确失败而非永久转圈；
   *  - 失败时把上游（DSH）的状态码与正文如实抛出（代理路由原样透传，见 src/routes/session-export.ts）。
   *
   * 为什么走本插件的代理而不是直连 DSH 的 `/api/session.export`：`openStream` 认得本插件的
   * 错误信封；直连 DSH 时 401/404 只是一次没有解释的失败（而 404 也可能是「拼错路径」）。
   */
  downloadSessionExport(sessionId: string, opts?: DownloadOptions, onProgress?: (received: number, total: number) => void): Promise<DownloadResult>;
  /** 「查看备份内容」：对 exports 目录内的备份文件做只读分析（reuse /analyze，零写入）。
   *  返回分析 + 与当前配置的差异计划摘要（"装/导这个备份会动你什么"）。 */
  inspectBackup(zipPath: string): Promise<BackupInspectResult>;
}
interface SyncPushReport {
  ok: boolean;
  snapshotId: string;
  /** 实际进入同步的 portable 分区 */
  sections: SectionId[];
  /** 分区级告警（单项失败不拖垮整体，§34.17 语义） */
  warnings: string[];
  message?: string;
  /**
   * 本次推送**被前置检测拒绝**（远端已被其它设备推进）：未写远端、未记基线、未改 sync-state。
   * 这是「需要先合并远端」的冲突态，不是通道/凭据故障 —— 调用方（自动同步 / 路由）应按冲突处理，
   * 而不是记成「同步失败」。
   */
  conflict?: boolean;
  /**
   * 本次推送前**收养了本机自己推上去的远端最新快照**（0.4.1 自愈）：该值 = 被收养的快照 id。
   *
   * 触发场景：上次推送在上传成功、写基线之前被打断（进程退出/崩溃/断电），远端已前进而本机
   * `lastSnapshotId` 仍是上一版 → 前置检测会永久拒绝推送（每次都说「远端被别人推进了」），
   * 单设备用户因此被自己的快照锁死。判据只看「远端最新快照的 manifest.deviceId == 本机
   * deviceId」，别的设备推进过就仍然按冲突返回，绝不越过。
   */
  adoptedBase?: string;
  /**
   * issue #140：本次推送**没有产生新快照**（远端最新快照的分区内容与本次导出逐字相同）。
   *
   * 语义：`ok:true` + 本字段 = 「什么都没做，也不算失败」——未 upload、未建目录、未裁剪；
   * 只是把基线指针**收养**到远端最新快照（`adoptedSnapshotId`），让下一轮判定有正确起点。
   * GUI / 报告必须显式区分它（「内容未变化，已跳过」），不能显示成「已推送 xx」。
   */
  skipped?: 'unchanged';
  /** issue #140：`skipped='unchanged'` 时被收养的远端快照 id（= 本次报告里的 snapshotId） */
  adoptedSnapshotId?: string;
}
/** 差异报告中的单个变更项（PlanItem 摘要，不含敏感细节） */
interface PullChange {
  id: string;
  adapter: SectionId;
  kind: PlanItemKind;
  description: string;
  severity: PlanItem['severity'];
}
interface SyncPullReport {
  ok: boolean;
  snapshotId: string;
  changes: PullChange[];
  /** 是否存在需要人工决策的项（Conflict / MissingSecret / MissingDependency / 路径问题）。
   * 插件 Install 不算 —— 插件安装随同步自动采用（product requirement）。 */
  needsReview: boolean;
  message?: string;
}
/** P0-②：push 前只读预览 ——「将推送什么」的单分区摘要（不写远端、不落盘）。 */
interface SyncPushPreviewSection {
  /** 分区 id（将进入快照的 portable 分区） */
  section: SectionId;
  /** 分区内条目计数（adapter.export 的 counts 聚合；无计数时为 0） */
  count: number;
  /** 相对上次基线（sync-state）是否变化：true = 本次会更新该分区；false = 与基线一致 */
  changed: boolean;
}
/** P0-②：push 前预览结果（零写入）。 */
interface SyncPushPreview {
  ok: boolean;
  /** 将推送的分区清单（含计数与变化标记） */
  sections: SyncPushPreviewSection[];
  /** 远端现有快照数（0 = 首次推送将创建首个基线） */
  remoteSnapshotCount: number;
  /** 加密快照：载荷将整体加密（分区计数与基线比较不可得） */
  encrypted: boolean;
  /** 本次推送是否真的会带上凭据载荷（.credentials.yaml 可读且非空；issue #38） */
  credentialsIncluded: boolean;
  message?: string;
}
/** 同步通道类型（由 SYNC_CHANNELS 派生；host 侧与 client 半统一引用）。 */
type SyncTransportType$1 = (typeof SYNC_CHANNELS)[number];
/** S3 兼容系通道的回传视图：**只带 secretStored 标记，绝不带密钥值**。 */
interface CloudS3ChannelView {
  provider: S3CompatProvider;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  pathStyle: boolean;
  /** 密钥已在 credentials 里（只回布尔） */
  secretStored: boolean;
}
/** Gist 通道的回传视图：**只带 secretStored 标记，绝不带 token 值**。 */
interface CloudGistChannelView {
  provider: GistProvider;
  gistId: string;
  apiBaseUrl: string;
  filePrefix: string;
  secretStored: boolean;
}
/**
 * 远程同步通道类型：git（默认）或 webdav。
 * **唯一来源** = 宿主 src/sync/sync-config.ts 的 SYNC_CHANNELS（此处仅 type-only 别名：
 * 客户端 bundle 必须自包含，type-only 引用会被完全擦除，不会把宿主的 node:fs 带进浏览器产物）。
 */
type SyncTransportType = SyncTransportType$1;
/** GET /sync/status 响应：配置/凭据/上次同步的只读事实（无任何 secret 值） */
interface SyncStatusResponse {
  ok: boolean;
  /**
   * 方案 A：是否存在同步基线（本地祖先指针；宿主只回布尔，绝不回快照 id）。
   * **缺省 undefined = 未知 → 一律按「无基准」处理**，走老导入确认路径（fail-safe）。
   */
  hasBaseline?: boolean;
  /** 是否已保存过仓库/通道配置（sync-config.json；任一通道配置过即为 true） */
  configured: boolean;
  /** git 通道：已配置的仓库地址（不含 token，可回显；与当前通道无关，配置过即返回） */
  repoUrl?: string;
  /** git 通道：仓库内子目录前缀（'' / 缺省 = 仓库根；issue 131，供表单回填） */
  subdir?: string;
  /** git 通道：DSH credentials 中是否已存在 token（describe 只报状态，值永不返回） */
  credentialConfigured: boolean;
  credentialWritable: boolean;
  /** webdav 通道：配置状态（url 可回显，username 非敏感；password 值永不返回；
   *  与当前通道无关，配置过即返回，供 git ↔ webdav 切换时回填表单） */
  webdav?: WebDavStatusResponse;
  /**
   * 云端点通道 s3 的非密配置视图（**只有 secretStored 布尔，绝无 AccessKey Secret 值**）。
   * 配置过即返回（与当前活动通道无关），供表单在各通道间切换时回填。
   */
  s3?: CloudS3ChannelView;
  /** 云端点通道 gist 的非密配置视图（**只有 secretStored 布尔，绝无 token 值**）。 */
  gist?: CloudGistChannelView;
  /** 已保存的云端点 provider 清单（只有名字；切换 provider 时回填用） */
  cloudSavedProviders?: string[];
  /** sync-state.lastSyncAt；'' = 从未同步 */
  lastSyncAt?: string;
  /** sync-state.sections 条目数 */
  sectionCount: number;
  transport?: {
    type: string;
    ref: string;
  };
  /** 上次选择的同步通道（磁盘 ui-prefs.json；UI 回填优先于此，localStorage 仅兜底） */
  lastSyncChannel?: SyncTransportType;
  /** 可同步分区目录（「高级/自定义导出」勾选列表；host adapters 唯一事实源，只含 portable） */
  syncSections?: SyncSectionInfo[];
  /** 当前分区选择（当前激活通道；UI 回填用，自动同步与手动 push 共用） */
  syncSelection?: SyncSelectionPayload;
  /** 全部通道的分区选择（git/webdav 各自独立；UI 按当前 tab 取对应通道） */
  syncSelectionByChannel?: Record<SyncTransportType, SyncSelectionPayload>;
  /** 全部通道的「同步密码是否已保存」状态（只回布尔，密码值永不回传浏览器） */
  syncCredentialsByChannel?: Record<SyncTransportType, SyncPasswordState>;
  /** 自动同步当前状态（当前激活通道；供 UI 顶部开关回填；§3.9） */
  autosync?: AutosyncStatusResponse;
  /** 全部通道的自动同步状态（git/webdav 各自独立；UI 按当前 tab 取对应通道） */
  autosyncByChannel?: Record<SyncTransportType, AutosyncStatusResponse>;
  /**
   * P2（2026-11-14 真机事故）：等人裁决的冲突分区。
   * 自动同步撞上「远端已推进 + 分区冲突」时，宿主把冲突分区落进 sync-state.pendingMerge；
   * 有值 = 同步并没有坏，只是有人在等你确认那几个分区（首页「待裁决」行据此跳同步页）。
   * **永不携带远端快照 id**（与 hasBaseline 同一纪律）；since = 这件事第一次挂住的时刻。
   */
  pendingMerge?: {
    sections: string[];
    since: string;
  };
  /**
   * issue #79：git 工作副本与配置地址的关系（host 只读自检）。
   *  - `{ facts }` = 自检成功（origin 是否已跟随 repoUrl）
   *  - `{ error }` = 自检读不出来（git 不可用 / 工作副本异常）——**如实回传**，不伪装成「不存在」
   */
  workDir?: {
    facts: SyncWorkDirFacts;
  } | {
    error: string;
  };
}
/** git 工作副本自检事实（与宿主 GitWorkDirFacts 同形；无任何敏感值）。 */
interface SyncWorkDirFacts {
  /** 工作副本路径 */
  path: string;
  /** `.git` 是否存在 */
  exists: boolean;
  /** 当前 origin（读不出 → null） */
  origin: string | null;
  /** 单独配置的 push URL（未单独配置 → null） */
  pushUrl: string | null;
  /** fetch / push 地址是否都已跟随 repoUrl */
  match: boolean;
  /** 未上行的本地提交数（仅 detail 自检时给出，否则 null） */
  ahead: number | null;
  /** 工作树是否有未提交改动（仅 detail 自检时给出，否则 null） */
  dirty: boolean | null;
  /** 远端分支上的快照数（仅 detail 自检时给出，否则 null；issue #104 建议 3） */
  remoteSnapshots: number | null;
}
/** 同步密码的保存状态（只回布尔；密码值永不回传浏览器）。 */
interface SyncPasswordState {
  /** 加密备份密码是否已保存到本机凭据库（DSH credentials） */
  encryptPasswordConfigured: boolean;
  /** 解密密码是否已保存到本机凭据库 */
  decryptPasswordConfigured: boolean;
}
/** 同步分区选择（POST /sync/selection 请求体 + status.syncSelection 响应；持久化于 Host）。
 *  git/webdav 通道各自独立（transport 缺省 git）。 */
interface SyncSelectionPayload {
  /** 目标通道（git/webdav 各自独立的模式与勾选；缺省 git） */
  transport?: SyncTransportType;
  mode: 'default' | 'advanced';
  /** 高级模式勾选分区；default 模式可为空数组 */
  sections: SectionId[];
  /** sessions（历史会话）分区同步「最新 N 个会话」上限；缺省 5 */
  sessionsLimit?: number;
  /**
   * 显式点名的会话单元 id（非空时优先于 sessionsLimit；空数组 = 回到「最新 N 个」模式）。
   * 与导出选择器的单元 id 同一命名空间（sessions:<projectKey>/<sessionId>）。
   */
  sessionsInclude?: string[];
  /** 手动推送默认加密快照（开关持久化；密码存 DSH credentials，见下） */
  encrypt?: boolean;
  /** 手动推送默认导出真实凭据值（必须同时 encrypt） */
  includeSecrets?: boolean;
  /**
   * 加密备份密码（可选）：非空 → 写入本机凭据库（DSH credentials）后长期复用。
   * 只走请求体内存传输，绝不写入同步文件 / 日志 / 响应。
   */
  encryptPassword?: string;
  /** 解密密码（可选）：非空 → 写入本机凭据库，拉取加密快照时自动使用 */
  decryptPassword?: string;
  /** 主动删除已保存的加密密码（用户取消勾选「加密备份」时） */
  clearEncryptPassword?: boolean;
  /** 主动删除已保存的解密密码（用户点「删除已保存密码」时） */
  clearDecryptPassword?: boolean;
  /** 响应/状态回填：密码是否已保存在本机凭据库（只回布尔，绝不回值） */
  encryptPasswordConfigured?: boolean;
  decryptPasswordConfigured?: boolean;
}
/** webdav 通道状态字段（无任何 secret 值；password 只报 passwordConfigured 布尔） */
interface WebDavStatusResponse {
  /** 上次使用的服务器地址（可回显；不含 userinfo） */
  url?: string;
  /** 上次使用的用户名（非敏感，可回显；供表单回填） */
  username?: string;
  /** 是否已填过用户名（布尔；便于 UI 提示徽章） */
  usernameConfigured: boolean;
  /** DSH credentials 中是否已存在密码（值永不返回） */
  passwordConfigured: boolean;
}
/** POST /sync/config 响应：保存成功后的轻量凭据状态（无 secret 值；UI 直接合并刷新徽章）。 */
interface SyncConfigSaveResponse {
  ok: boolean;
  configured: boolean;
  transport: SyncTransportType;
  /** git 通道：token 是否已配置（值永不返回） */
  credentialConfigured: boolean;
  /** webdav 通道：username/password 是否已配置（值永不返回；git 通道为 undefined） */
  webdav?: {
    usernameConfigured: boolean;
    passwordConfigured: boolean;
  };
  /** 云端点通道保存后的非密视图（只带 secretStored 布尔，绝无密钥值） */
  s3?: CloudS3ChannelView;
  gist?: CloudGistChannelView;
}
/** POST /sync/config 且 clear:true 的响应：断开一条通道配置后的轻量事实（无任何 secret 值）。 */
interface SyncChannelClearResponse {
  ok: boolean;
  /** 被断开的通道 */
  cleared: SyncTransportType;
  /** 该通道之前是否有配置（false = 本来就没配；幂等成功，不算失败） */
  removed: boolean;
  /** 断开后是否**还有**别的通道配置（false = 已无任何通道，页面应显示「未配置」） */
  configured: boolean;
  /** 断开后的活动通道（被删的是活动通道时已自动切到剩下的那条） */
  transport: SyncTransportType;
}
/** 可同步分区条目（status.syncSections 项）。只含 portable —— 与 SyncEngine 同步通道一致。 */
interface SyncSectionInfo {
  id: SectionId;
  /** 展示名（host adapter displayName） */
  displayName: string;
  portability: 'portable' | 'deviceSpecific' | 'platformSpecific';
  defaultIncluded: boolean;
}
/** push 请求体（token 可选：非空则 Host 先写入 DSH credentials 再使用）。
 *  扁平形状与 Host parseSyncBody 一致：git 携带 repoUrl/token；
 *  webdav 携带 url/username/password（顶层，不嵌套 webdav 对象）。
 *  git 可执行文件固定使用系统 PATH 中的 git，不再接受自定义路径。
 *  sections 可选（高级/自定义导出模式）：只推送勾选分区；缺省 = 默认模式全部推荐分区。
 *  encrypt/encryptPassword/includeSecrets：加密快照（含可选密钥导出；密码仅内存传输，绝不落盘）。 */
interface SyncPushPayload {
  /** 通道类型；缺省 'git' */
  transport?: SyncTransportType;
  repoUrl?: string;
  token?: string;
  /** webdav 通道字段（transport='webdav' 时使用；扁平顶层） */
  url?: string;
  username?: string;
  password?: string;
  /** 仅同步指定分区（缺省 = 全部 portable 推荐分区；即「默认/快速导出」vs「自定义导出」） */
  sections?: SectionId[];
  /**
   * sessions（历史会话）分区选项。**只有显式提供它**，sessions 才被允许进入同步通道；
   * limit = 只带「最新 N 个会话」（缺省 5；0 = 不带）。未提供 → 会话分区按普通
   * 非 portable 分区跳过并告警（安全默认：内容敏感的会话绝不悄悄随同步上行）。
   *
   * include（显式点名的会话单元 id，形如 sessions:<projectKey>/<sessionId>）非空时
   * **优先于 limit** —— 用户点名的对话必须赢（宿主侧见 SyncEngineOptions 的说明）。
   */
  sessions?: {
    limit?: number;
    include?: string[];
  };
  /** 加密快照（sections 载荷整体加密；开启时必须提供 encryptPassword） */
  encrypt?: boolean;
  /** 加密密码（仅本次请求体内存传输，Host 绝不落盘/落日志；encrypt=true 时必填） */
  encryptPassword?: string;
  /** 导出真实凭据值（必须同时 encrypt=true，否则 Host 拒绝：密钥绝不明文进同步通道） */
  includeSecrets?: boolean;
  /**
   * issue #140：强制推送 —— 内容与远端最新快照一致时**也**新建快照。
   * 缺省 false = 内容没变就跳过（不 upload、不建目录，报告 skipped:'unchanged'）。
   */
  force?: boolean;
  /** s3：具体兼容商（s3 / oss / cos / minio / kodo） */
  provider?: string;
  endpoint?: string;
  region?: string;
  bucket?: string;
  /** 对象键前缀（缺省 = 根前缀） */
  prefix?: string;
  /** AccessKey ID（标识符，可回显；不是密钥） */
  accessKeyId?: string;
  /** path-style 寻址（缺省跟随兼容商变体） */
  pathStyle?: boolean;
  /** 显式覆盖签名方言（高级覆盖；宿主忽略非法值） */
  dialectId?: 'aws4' | 'oss4';
  /** gist：目标 gist id */
  gistId?: string;
  /** gist：GitHub API 根（缺省 https://api.github.com） */
  apiBaseUrl?: string;
  /** gist：文件名前缀（缺省 dsh-sync） */
  filePrefix?: string;
  /**
   * 云端点密钥（s3 的 AccessKey Secret / gist 的 token）：**只写**。
   * 仅请求体内存传输；宿主写入 DSH credentials 槽位（cloudSecretRef）后即丢弃。
   * 响应、配置文件与日志里永远只有 `secretStored` 布尔。
   */
  secret?: string;
}
/** pull 请求体（strategy 缺省 merge：冲突保留待决策；snapshotId 缺省 = 最新；
 *  decryptPassword 可选：拉取加密快照时提供，仅内存传输）。 */
interface SyncPullPayload extends SyncPushPayload {
  strategy?: 'merge' | 'replace' | 'skipExisting';
  snapshotId?: string;
  /** 解密密码（拉取/一键同步遇到加密快照时提供；仅内存传输，绝不落盘） */
  decryptPassword?: string;
}
/**
 * POST /sync/probe 结果。
 *
 * **失败也是正常返回**（HTTP 200 + \`ok:false\`）：测试连接是**预期会失败**的诊断动作，
 * 用 5xx 表达会被界面当成基础设施崩溃。\`message\` / \`hint\` 由通道层本地化并脱敏后原样带回。
 */
interface SyncProbeSuccess {
  ok: true;
  transport: string;
  /** 结论（可直接展示的成功文案） */
  message: string;
  /** 附加提醒（例如「该 S3 兼容端点应把 region 填成 xxx」），有值时界面按 warn 级展示 */
  hint?: string;
  /** 远端已有快照数（取得时回传） */
  snapshotCount?: number;
  /** 自检过程中**自动创建**的远端目录（webdav 幂等 MKCOL；界面须逐条说明，绝不静默写远端） */
  createdCollections?: string[];
}
/** 自检失败（诊断动作的预期结果，不是异常） */
interface SyncProbeFailure {
  ok: false;
  error: string;
  /**
   * **能力边界标记**：该通道不提供连通性自检（传输层未实现 probe）。
   *
   * 与故障**严格区分**：true = 这个通道没有这项能力（中性提示，同步功能不受影响）；
   * 缺省/undefined = 真的没连通（按故障展示）。界面据此选 info 而不是「操作失败」。
   */
  unsupported?: boolean;
}
type SyncProbeResult = SyncProbeSuccess | SyncProbeFailure;
/** GET /sync/snapshots-list 响应：远端历史快照列表（按 createdAt 倒序）。 */
interface SyncSnapshotsListResponse {
  ok: boolean;
  /** 按 createdAt 倒序（最新在前） */
  snapshots: SyncSnapshotLite[];
  /** 当前本地祖先指针（sync-state.lastSnapshotId），用于高亮当前基线 */
  currentSnapshotId?: string;
  /**
   * 远端**存在但读不出来**的快照（issue #59）。
   *
   * 为什么必须回传：列表跳过坏文件是必要防御，但静默跳过会让「推送成功 + 列表为空」
   * 变成自相矛盾且无从自查的状态。有值即代表「远端列表不完整」，界面须如实告知。
   */
  unreadable?: {
    file: string;
    reason: string;
  }[];
}
/** 远端快照摘要（「选择历史快照」下拉项）。 */
interface SyncSnapshotLite {
  id: string;
  createdAt: string;
  sectionCount: number;
  platform: string;
  dshVersion: string;
  /**
   * cloud-sync 借鉴项 ⑥：推送方设备身份（宿主从快照 manifest 读出）。
   * **旧快照没有这两个字段** —— 界面必须据此不显示设备行，绝不把 undefined 渲染成文案、
   * 也不显示空串占位。
   */
  deviceName?: string;
  /** 稳定设备 id（换主机名/改机器名都不变；用于认出「同一台设备」）。 */
  deviceId?: string;
}
/** POST /sync/sync 请求体（一键同步第一步：拉取 → 差异确认会话）。 */
interface SyncStartPayload extends SyncPushPayload {
  /** 缺省 = 最新快照；传入则对该历史快照拉取 */
  snapshotId?: string;
  /**
   * 会话格式处置（T1）。**一键同步显式传 `guide`**：差异确认弹窗是本流程唯一的决策界面，
   * 而预览发生在它出现之前 —— 用缺省 abort 会让用户什么都看不到就被拒。真正的阻断语义
   * 由 apply-items 上同名字段承担（此刻已有决策界面），服务端两处都会校验。
   */
  sessionFormatDisposition?: SessionFormatDisposition;
}
/** POST /sync/sync 响应：差异确认会话（items 供 UI 逐项确认）。 */
interface SyncStartResponse {
  ok: boolean;
  /** 差异确认会话 id：后续 apply-items / cancel 引用 */
  syncSessionId: string;
  /** 被拉取的远端快照 id */
  snapshotId: string;
  items: SyncConfirmItem[];
  /** 是否包含任何需人工决策项 */
  needsReview: boolean;
  compatibility: 'excellent' | 'good' | 'partial' | 'unsupported';
  message?: string;
  /**
   * 预览失败的**结构化原因**（issue #116）：`'remote-empty'` = 远端还没有任何快照 —— 首次同步的正常起点，
   * UI 据此引导「先推送」而不是报「同步失败」。没有 reason 的失败按 message 原样展示。
   */
  reason?: 'remote-empty';
}
/** 单条可确认的差异项（由 ImportPlan.item 投影 + 冲突详情）。 */
interface SyncConfirmItem {
  itemId: string;
  adapter: SectionId;
  kind: PlanItemKind;
  description: string;
  /** 变更详情（如插件「当前 1.1 vs 导入 1.6」），与导入恢复向导展示一致 */
  detail?: string;
  severity: 'info' | 'warning' | 'error';
  /** 默认采纳方向；Conflict/MissingSecret 等人工项默认 false */
  defaultAdopt: boolean;
  /** 用户最终决策（缺省 = defaultAdopt） */
  adopt: boolean;
  /** 冲突项内联解决所需详情（仅 Conflict 项非空） */
  conflict?: SyncConflictDetail;
  /** 该项若采用将写入的目标摘要 */
  target?: {
    adapter: SectionId;
    ref: string;
  };
}
/** 冲突项内联解决详情（来源 MergeConflict + 可读 diff）。 */
interface SyncConflictDetail {
  path: string;
  kind: 'key' | 'file' | 'section';
  local?: unknown;
  remote?: unknown;
  ancestor?: unknown;
  diff?: string;
}
/** POST /sync/apply-items 请求体（一键同步第二步：按逐项决策执行导入）。 */
interface ApplyItemsPayload {
  syncSessionId: string;
  /** 每项的最终采纳决策（未列出项视为 adopt=false） */
  adoptions: SyncItemAdoption[];
  /**
   * 会话格式处置（T1）。一键同步当前恒传 `guide`（确认页尚无三选一控件；服务端已按
   * `abort`/`skip`/`guide` 三态校验）。缺省（不传）由宿主按插件配置项 → abort 决定。
   */
  sessionFormatDisposition?: SessionFormatDisposition;
}
/** 单条采纳决策。 */
interface SyncItemAdoption {
  itemId: string;
  adopt: boolean;
  /** 冲突项解决方案（仅当该项是 Conflict 且 adopt=true 时必须）。
   *  与导入恢复向导一致：keepLocal=保留当前 / useRemote=使用导入；跳过 = adopt=false。 */
  resolution?: 'useRemote' | 'keepLocal';
}
/** POST /sync/apply-items 响应。 */
interface ApplyItemsResponse {
  ok: boolean;
  applied: string[];
  skipped: string[];
  needsRestart: boolean;
  warnings: string[];
  /** 应用前快照 id（UI 一键回滚用） */
  restoreId: string;
  /** 任一失败是否整体回滚 */
  rolledBack: boolean;
  failed: {
    itemId: string;
    message?: string;
  }[];
  /**
   * 未生效项（issue #56）：`status='warning'` 的计划项 —— 非致命但确实没写进去
   * （典型：插件安装失败，而排在它后面的步骤因此不会执行）。
   * `ok` 不会因它变 false，所以界面必须单独拿这个字段把「部分成功」讲出来。
   * 旧宿主不返回 → undefined（按「无未生效项」处理，不误报）。
   */
  ineffective?: {
    itemId: string;
    adapter: string;
    message?: string;
  }[];
  /**
   * 「整体回滚是否完整」（诚实性，2026-10）。`rolledBack=true` 只说「触发了整体回滚」，
   * 不代表每一项都补偿成功（典型：原本已存在的凭据值 DSH 不可回读 → 无法自动恢复）。
   * 此时引擎把失败项并入 `warnings`，并置 `rollbackFull=false`；界面据此**不得**
   * 显示成「已整体回滚」，必须列出未恢复项。
   * 旧宿主不返回 → undefined（按旧的「已整体回滚」文案处理，不误报）。
   */
  rollbackFull?: boolean;
  result: unknown;
}
/** POST /sync/rollback 响应：一键回滚的诚实结果（full=false 时 failed 列出未回滚项）。 */
interface SyncRollbackResponse {
  ok: boolean;
  /** 是否**每一项**都补偿成功（false = 部分回滚，配置可能停留在中间状态） */
  full: boolean;
  /**
   * 未回滚项（full=false 时非空）。`reason` = 为什么没能恢复；`manualHint` = 人工怎么补
   * （如「请重新补录该凭据」）。旧宿主不返回 → undefined（按「无未回滚项」处理）。
   */
  failed?: SyncRollbackFailedItem[];
  /** 同步历史写入失败（回滚本身已完成；仅提示） */
  historyWriteError?: string;
}
/** 单条未回滚项。 */
interface SyncRollbackFailedItem {
  /** 形如 `<adapter>:<ref>` */
  item: string;
  reason: string;
  manualHint?: string;
}
/**
 * 合并冲突成因（对齐宿主 src/sync/merge.ts 的 MergeConflictReason）。
 * 未在本联合里的字符串照样可能从宿主回传 —— 界面侧一律经 merge-view.ts 的
 * mergeReasonKey() 映射，未知值按 both-modified 措辞，**绝不渲染裸枚举**。
 */
type MergeConflictReason = 'both-modified' | 'modify-delete' | 'delete-modify' | 'no-ancestor' | 'binary' | 'format' | 'array' | 'section';
/** 分区级合并决策（'conflict' = 双侧改动重叠，必须由用户裁决）。 */
type MergeSectionDecision = 'useRemote' | 'keepLocal' | 'merge' | 'skip' | 'conflict';
/** 单条冲突的三列预览（已由宿主脱敏/序列化，界面负责截断）。 */
interface MergePreviewConflict {
  /** 冲突位置：JSON 分区是 top-level key；FilesSection 是 relativePath。 */
  path: string;
  kind: 'key' | 'file';
  reason?: MergeConflictReason;
  localPreview: string;
  remotePreview: string;
  ancestorPreview: string;
}
/** 单个分区的合并预览。 */
interface MergePreviewSection {
  id: SectionId;
  decision: MergeSectionDecision;
  /** 自动合并并入的变更点数量（仅自动合并成功时有意义） */
  autoMerged?: number;
  conflictCount: number;
  conflicts: MergePreviewConflict[];
}
/** 预览摘要（可自动应用 / 待裁决 / 冲突条目 / 无变化）。 */
interface MergePreviewSummary {
  auto: number;
  review: number;
  conflicts: number;
  skipped: number;
}
/** POST /sync/merge-preview 请求体（只读；密码仅内存传输，绝不落盘/落日志）。 */
interface MergePreviewPayload {
  /** 远端快照 id；缺省 = 最新 */
  snapshotId?: string;
  /** 解密密码（仅当远端快照加密时使用；缺省 = 已保存的 DECRYPT 凭据） */
  decryptPassword?: string;
  /** 跨机路径映射（与一键同步同一口径） */
  pathMappings?: PathMapping[];
}
/** POST /sync/merge-preview 响应（只读三方合并结果）。 */
interface MergePreviewResponse {
  ok: boolean;
  snapshotId: string;
  /** 是否存在共同基准快照（false = 退化为两方比较，双侧不一致一律按冲突） */
  hasAncestor: boolean;
  sections: MergePreviewSection[];
  summary: MergePreviewSummary;
  /** 失败/降级原因（仅在 ok=false 等场景出现） */
  message?: string;
  /** 失败的结构化原因（issue 116）：`'remote-empty'` = 远端还没有任何快照 —— 首次同步的正常起点，不是故障。 */
  reason?: 'remote-empty';
}
/** 单条裁决动作。 */
type MergeResolutionActionWire = 'keepLocal' | 'useRemote' | 'useMerged' | 'skip';
/** 单条裁决：id = 分区 id（分区级）或 `分区id::冲突路径`（冲突级，见 merge-view.ts）。 */
interface MergeResolution {
  id: string;
  action: MergeResolutionActionWire;
}
/** POST /sync/apply-merge 请求体（写动作；过 mutation gate）。 */
interface MergeApplyPayload extends MergePreviewPayload {
  resolutions: MergeResolution[];
}
/** POST /sync/apply-merge 响应（字段与 /sync/apply-items 同风格 + pendingConflicts）。 */
interface MergeApplyResponse {
  ok: boolean;
  applied: string[];
  skipped: string[];
  needsRestart?: boolean;
  warnings: string[];
  /** 执行前快照 id（界面一键回滚用） */
  restoreId?: string;
  /** 任一失败是否整体回滚 */
  rolledBack?: boolean;
  /** 整体回滚是否完整（false = 有项未恢复，见 warnings；缺省 = 旧宿主未回传） */
  rollbackFull?: boolean;
  /** 执行后仍待裁决的分区（下次同步仍会出现） */
  pendingConflicts: SectionId[];
  failed?: {
    itemId: string;
    message?: string;
  }[];
  ineffective?: {
    itemId: string;
    adapter: string;
    message?: string;
  }[];
  historyWriteError?: string;
}
/** 统一间隔类型。 */
type AutosyncInterval = '5m' | '15m' | '30m' | '60m' | '6h' | '12h' | '24h';
/** 最近一次自动同步执行状态。 */
type AutosyncRunStatus = 'success' | 'skipped' | 'failed' | 'partial';
/** 自动应用的最高风险等级（low = 只自动落低风险分区；medium = plugins/mcp 也自动落盘）。 */
type AutosyncAutoApplyTier = 'low' | 'medium';
/** 双侧都改（真冲突）时的策略（ask = 保留冲突待人工裁决；local = 保留本机并推上去）。 */
type AutosyncConflictPolicy = 'ask' | 'local';
/** GET/POST /sync/autosync 响应：自动同步状态。 */
interface AutosyncStatusResponse {
  enabled: boolean;
  interval: AutosyncInterval;
  /** 真·自动同步：本地改动即时触发（缺省 true；host 读取层已补缺省） */
  realtime?: boolean;
  /** realtime 下的远端轮询间隔（ms；缺省 60000） */
  remoteCheckMs?: number;
  /** 自动应用的最高风险等级（缺省 medium：plugins/mcp 也自动落盘） */
  autoApplyTier?: AutosyncAutoApplyTier;
  /** 双侧都改时的策略（缺省 local：保留本机并推上去） */
  conflictPolicy?: AutosyncConflictPolicy;
  lastRunAt?: string;
  lastRunStatus?: AutosyncRunStatus;
  lastRunMessage?: string;
  /**
   * issue #79：本轮跳过的**结构化原因码**（界面按码取字典，绝不渲染裸枚举）。
   * 取值与同步历史的 skipReason 同一套：conflict / mutation-locked / encrypted /
   * unconfigured / upToDate / unchanged。
   */
  lastRunSkipReason?: string;
  /** 跳过涉及的分区数（当前仅 conflict：远端另有 N 个分区待确认） */
  lastRunSkipCount?: number;
  consecutiveFailures: number;
  /** 距上次自动同步已过 ms（host 计算，供 UI 倒计时/立即触发判断） */
  elapsedMs: number;
  lastRunHistoryId?: string;
}
/** POST /sync/autosync 请求体（transport 指定目标通道；git/webdav 各自独立）。 */
interface AutosyncUpdatePayload {
  /** 目标通道（git/webdav 各自独立的开关/间隔/状态；缺省 git） */
  transport?: SyncTransportType;
  enabled: boolean;
  interval?: AutosyncInterval;
  startupMinIntervalMs?: number;
  /** 本地改动即时触发（缺省 true） */
  realtime?: boolean;
  /** realtime 下的远端轮询间隔（ms；宿主 clamp 到 15s–1h） */
  remoteCheckMs?: number;
  /** 自动应用等级（缺省 medium） */
  autoApplyTier?: AutosyncAutoApplyTier;
  /** 冲突策略（缺省 local） */
  conflictPolicy?: AutosyncConflictPolicy;
}
/** 自动同步执行记录（§3.7 AutosyncHistoryEntry）。 */
interface AutosyncHistoryEntry {
  /** 触发该次运行的同步通道（git / webdav；旧记录缺省 undefined） */
  transport?: SyncTransportType;
  direction: 'pull' | 'push' | 'both';
  status: 'success' | 'skipped' | 'failed' | 'partial';
  /** 跳过原因（冲突项 / 缺失依赖 / Install / 错误 / 无远端 / 网络） */
  skipReason?: string;
  /** 被跳过的冲突分区 id（冲突跳过时列出） */
  conflictedSections?: string[];
  /** 本次自动合并实际写入的分区 */
  appliedSections?: string[];
  /** 本次 push 产生的快照 id */
  pushedSnapshotId?: string;
  /** 本次 pull 来源快照 id */
  pulledSnapshotId?: string;
  error?: string;
  notifiedAt?: string;
  /** 本次触发时的连续失败计数 */
  failureCountAtRun: number;
  createdAt: string;
}
/** 同步历史条目（Host 端返回；kind='autosync' 时 autosync 非空）。 */
interface SyncHistoryEntry {
  id: string;
  createdAt: string;
  kind: 'push' | 'pull' | 'apply' | 'autosync' | 'rollback';
  sectionCount?: number;
  reviewCount?: number;
  /** 快照类条目的触发通道（git / webdav；旧快照缺省 undefined） */
  transport?: string;
  autosync?: AutosyncHistoryEntry;
}
/** GET /sync/history 响应：{ entries }。 */
interface SyncHistoryResponse {
  entries: SyncHistoryEntry[];
}
/** POST /sync/github/start 响应：UI 展示用（device_code 只存宿主，绝不回传） */
interface GithubDeviceFlowStartResponse {
  /** 随机 flowId：后续 poll/cancel 凭它引用宿主侧登记的 device_code */
  flowId: string;
  /** 一次性用户码（用户在 GitHub 授权页输入） */
  userCode: string;
  /** GitHub 授权页 URL（用户浏览器打开） */
  verificationUri: string;
  /** 设备码过期秒数 */
  expiresIn: number;
  /** GitHub 建议轮询间隔秒数 */
  interval: number;
}
/** POST /sync/github/poll 响应状态 */
type GithubPollStatus = 'pending' | 'success' | 'denied' | 'expired' | 'error';
/** POST /sync/github/poll 响应：成功时 token 已由 Host 写入 DSH credentials（值永不回传） */
interface GithubPollResponse {
  status: GithubPollStatus;
  /** pending：下次轮询前应等待的毫秒数 */
  pollDelayMs?: number;
  /** 终止态错误码（GitHub error code） */
  errorCode?: string;
  /** 终止态可展示消息（来自 GitHub error_description / 宿主文案，不含秘密） */
  message?: string;
  /** success 时恒 true（凭据已配置）；便于 UI 直接刷新状态 */
  credentialConfigured?: boolean;
}
/** POST /sync/github/validate 响应：token 是否已配置 + 是否有效（GET /user；
 *  401 → 无效）。只回布尔 + 登录名（非敏感），token 值永不回传浏览器。 */
interface GithubValidateResponse {
  ok: boolean;
  /** token 是否存在于 DSH credentials */
  configured: boolean;
  /** token 是否有效（GitHub GET /user 成功；configured=false 时恒 false） */
  valid: boolean;
  /** GitHub 登录名（valid=true 时；非敏感展示位） */
  login?: string;
}
/** 仓库列表条目（宿主 `GitHubRepoSummary` 的投影；token 等秘密永不在此出现）。 */
interface GithubRepositorySummary {
  /** owner/name */
  fullName: string;
  /** 仓库主页（展示用） */
  htmlUrl: string;
  /** 提交值：clone URL（https 形态，不含凭据） */
  cloneUrl: string;
  defaultBranch: string;
  private: boolean;
  fork: boolean;
  /** 最近一次 push（ISO 8601；空仓库 → 空串） */
  pushedAt: string;
  /** 最近一次更新（ISO 8601；缺字段 → 空串） */
  updatedAt: string;
}
/** GET /sync/github/repositories 响应：当前 GitHub 用户可见的仓库（按最近更新排序）。 */
interface GithubRepositoriesResponse {
  ok: boolean;
  repos: GithubRepositorySummary[];
}
/** POST /sync/github/repositories 响应：新建的仓库。
 *  **恒定私有** —— 宿主强制 private:true，客户端无法请求公开仓库。 */
interface GithubCreateRepositoryResponse {
  ok: boolean;
  repo: GithubRepositorySummary;
}
/** 远程同步浏览器半数据入口（备份与迁移页第 4 个 tab 的注入业务面） */
declare class SyncApi {
  readonly t: UiT;
  constructor(t: UiT);
  /** 读取同步状态（配置 / 凭据 / 上次同步时间 / 分区数 / 工作副本自检）。
   *
   * 两个与请求计时无关、只为调用场景服务的开关：
   *  - `timeoutMs`：首页只拿它填一个指标段，等不起同步族默认的 5 分钟档；
   *  - `workDirDetail`：只要「工作副本是否跟随地址」时传 false —— 宿主跳过 ahead / dirty /
   *    remoteSnapshots 那 5 条 git 子进程（Windows 每次约 80 ms，实测端点 730 ms → 170 ms）。
   *    同步页的 WorkDirCard 需要全量，保持缺省（true）。关掉时那三项由宿主如实回 null，
   *    界面显示「未知」，不会被当成 0。 */
  status(opts?: RequestOptions & {
    workDirDetail?: boolean;
  }): Promise<SyncStatusResponse>;
  /**
   * 重建 git 工作副本（issue #79 的自救入口）。
   *
   * - `relink`：只把 origin / push URL 重指向当前配置地址（非破坏性，不碰工作树与本地提交）；
   * - `adopt`：把当前地址的远端历史合并进工作副本（issue #104：换仓库 / 远端历史被重写后两条历史
   *   不相交，pull --ff-only 永远失败）。不改写本地提交、可 `git revert`，冲突由 host 自动 `merge --abort`；
   * - `reclone`：删除工作副本后重新 clone（**丢弃未上行的本地提交**）→ 必须带 `confirm: true`。
   *
   * 写动作：host 侧过 mutation gate（SAFE MODE / 环境锁）。
   */
  workdirReset(payload: {
    mode: 'relink' | 'adopt' | 'reclone';
    confirm?: boolean;
  }): Promise<{
    ok: boolean;
    mode: string;
    workDir: {
      facts: SyncWorkDirFacts;
    };
  }>;
  /**
   * cloud-sync 借鉴项 ②：连通性自检（**只读**）。
   *
   * 失败回 \`ok:false\` 而非抛错 —— 调用方必须按 \`result.ok\` 分流，把失败当**结论**展示，
   * 不要落进 catch（否则「连不上」会被渲染成崩溃）。
   */
  probe(payload: SyncPushPayload): Promise<SyncProbeResult>;
  /**
   * 分区条目清单（复用 /export-preview；**只读**，不写任何内容）。
   *
   * 用途：同步页的「逐会话勾选」需要单元清单（sessions 的每个会话目录 + 其所属工作区），
   * 而清单的权威来源就是导出预览那条路由（adapter.listUnits()）。类型用 type-only 引入 ——
   * 不会把 api.ts 的运行时依赖带进 bundle，也不会与之形成运行时循环。
   */
  exportPreview(only?: SectionId[]): Promise<ExportPreviewResponse>;
  /** 推送：导出 portable 分区 → 提交到私有 Git 仓库 → 更新 sync-state */
  push(payload: SyncPushPayload): Promise<SyncPushReport>;
  /** P0-②：push 前只读预览（「将推送什么」，零写入远端）——body.preview=true 触发 */
  pushPreview(payload: SyncPushPayload): Promise<SyncPushPreview>;
  /** 拉取差异预览：拉取远端最新快照 → 只读分析（绝不执行导入） */
  pull(payload: SyncPullPayload): Promise<SyncPullReport>;
  /**
   * 「拉取即导入」：把远端快照**落地成本机 ZIP**，返回它的路径。
   * 拿到路径后交给导入向导 —— 与从备份文件导入**同一条路径**（可解锁、可选内容、可回滚），
   * 而不是另造一套"直接写配置"的通道。
   * 与 pull 的区别：pull 只回差异预览（临时 ZIP 用完即删）；本方法真的留下一个文件。
   */
  download(payload: SyncPullPayload & {
    name?: string;
  }): Promise<{
    ok: boolean;
    zipPath: string;
    snapshotId: string;
  }>;
  /**
   * 删除**远端**的一份快照（产物库「远端快照 → 删除」，不可恢复）。
   *
   * 只动远端：本机配置与同步基线都不变（宿主 `SyncEngine.deleteSnapshot`）；
   * 远端不存在时同样返回成功（transport 契约：不存在视为成功）。
   */
  deleteSnapshot(payload: SyncPushPayload & {
    snapshotId: string;
  }): Promise<{
    ok: boolean;
    snapshotId: string;
  }>;
  /** GitHub OAuth device flow：发起登录，返回一次性用户码 + 授权页 URL + flowId */
  githubStart(): Promise<GithubDeviceFlowStartResponse>;
  /** GitHub OAuth device flow：凭 flowId 轮询授权结果（成功时 token 已由 Host 写入 credentials） */
  githubPoll(flowId: string): Promise<GithubPollResponse>;
  /** GitHub OAuth device flow：取消（丢弃宿主侧登记，零副作用） */
  githubCancel(flowId: string): Promise<{
    ok: boolean;
  }>;
  /** GitHub token 有效性校验（判定「是否已登录」：token 存在且 GitHub API 接受；
   *  401 → valid:false 引导重新登录；非 401 错误向上抛，UI 兜底不误判登出） */
  githubValidate(): Promise<GithubValidateResponse>;
  /** 列出当前 GitHub 用户可见的仓库（供「选择已有仓库」下拉；只读，不改任何状态）。
   *  未登录 / token 失效 → 401，由调用方按「先登录」引导处理。 */
  githubListRepositories(): Promise<GithubRepositoriesResponse>;
  /** 新建仓库并返回其信息（供「新建仓库」表单；**宿主强制私有**，
   *  描述为空则不传该字段）。名称非法 / 已存在 → 422，由调用方展示原因。 */
  githubCreateRepository(name: string, description?: string): Promise<GithubCreateRepositoryResponse>;
  /** 同步历史：列出本地祖先快照 + 自动同步执行记录（按 createdAt 倒序合并）。 */
  history(): Promise<SyncHistoryResponse>;
  /** 远端历史快照列表（供「选择历史快照」下拉）。 */
  snapshotsList(payload: SyncPushPayload): Promise<SyncSnapshotsListResponse>;
  /** 一键同步第一步：拉取 → 差异确认会话（items 逐项确认，暂不导入）。 */
  sync(payload: SyncStartPayload): Promise<SyncStartResponse>;
  /** 一键同步第二步：按用户对差异项的逐项决策执行导入。 */
  applyItems(payload: ApplyItemsPayload): Promise<ApplyItemsResponse>;
  /** 取消/清理差异确认会话（丢弃临时 ZIP，零副作用）。 */
  cancel(syncSessionId: string): Promise<{
    ok: boolean;
  }>;
  /** 自动同步状态（GET /sync/autosync 返回全部通道的 { git, webdav }，各自独立）。 */
  autosyncStatusAll(): Promise<Record<SyncTransportType, AutosyncStatusResponse>>;
  /** 自动同步状态（指定通道；从全部通道状态中取）。 */
  autosyncStatus(transport?: SyncTransportType): Promise<AutosyncStatusResponse>;
  /** 自动同步配置更新（POST /sync/autosync；payload.transport 指定目标通道）。 */
  autosyncUpdate(payload: AutosyncUpdatePayload): Promise<AutosyncStatusResponse>;
  /** 保存同步分区选择（POST /sync/selection）：模式 + 勾选分区持久化到 Host。
   *  自动同步调度器与手动 push 共用此配置（刷新/重启后仍然生效）。 */
  saveSelection(payload: SyncSelectionPayload): Promise<SyncSelectionPayload>;
  /** 保存同步通道配置（POST /sync/config）：url/username/password（git: repoUrl/token）持久化。
   *  password/token 经 Host 写入 DSH credentials（值永不回传）；返回凭据布尔供 UI 刷新徽章。 */
  saveConfig(payload: SyncPushPayload): Promise<SyncConfigSaveResponse>;
  /** 断开同步通道配置（POST /sync/config 带 clear:true）：删除该通道的配置、凭据（token / 口令 /
   *  加密·解密密码）与自动同步开关。用户要求：配置过的通道必须能删掉，否则一条打不通的通道
   *  会永久占位，产物库远端源与自动同步只能一直报读取失败。**只解除本机绑定**，远端数据不动。 */
  clearChannel(channel: SyncTransportType): Promise<SyncChannelClearResponse>;
  /** 保存插件 UI 偏好（POST /sync/ui-prefs）：当前为上次选择的同步通道（ui-prefs.json，
   *  随 self 分区进导出备份）。纯偏好无 secret；失败由调用方静默降级（localStorage 兜底）。 */
  saveUiPrefs(payload: {
    lastSyncChannel?: SyncTransportType;
  }): Promise<{
    ok: boolean;
    lastSyncChannel?: SyncTransportType;
  }>;
  /** 一键回滚：按 restoreId 调用 backup→rollback（full=false 时 failed 列出未回滚项与人工提示） */
  rollback(payload: {
    restoreId: string;
  }): Promise<SyncRollbackResponse>;
  /**
   * T-ui-merge：远程合并**只读**预览（三方合并 + 冲突清单 + 摘要），零写入。
   *
   * 与 /sync/sync 的区别：这里不做导入计划、不登记同步会话，只回答「远端与本地差在哪、
   * 哪些分区需要我裁决」；密码只在请求体内传输（宿主绝不回传/落日志）。
   */
  mergePreview(payload?: MergePreviewPayload): Promise<MergePreviewResponse>;
  /**
   * T-ui-merge：按逐项裁决执行合并（写动作，宿主侧过 mutation gate）。
   *
   * 返回 pendingConflicts = 执行后**仍**待裁决的分区：界面据此告诉用户
   * 「跳过 ≠ 已解决，下次同步仍会出现」，而不是把一次带 skip 的执行报成「已解决」。
   */
  applyMerge(payload: MergeApplyPayload): Promise<MergeApplyResponse>;
  /** Phase 7 迁移前咨询（只读健康评分 + 建议）：对远端快照生成咨询报告。 */
  consult(input: {
    type: 'remote-snapshot';
    id: string;
    snapshotId?: string;
  }): Promise<ConsultReport>;
}
/**
 * 发布模式（F6 迁移/分享双模式，借鉴 dsh-packer config.personalPatterns 同源设计）：
 *  - 'migrate'（缺省）：迁移模式，同一份数据全带（只受 BANNED 分区与字面量凭据扫描约束）；
 *  - 'share'：分享模式，自动排除设备/平台相关分区（deviceSpecific/platformSpecific），
 *    并对隐私内容**强制拦截**（发现任何敏感痕迹直接拒绝打包，而不是仅警告）。
 */
type MarketPublishMode = 'migrate' | 'share';
/** index.json 中的单条目摘要（浏览卡片数据源；仅展示，不直接作为导入依据） */
interface MarketIndexItem {
  /** 条目 id —— 对应 items/<itemId>/，必须过 SAFE_ITEM_ID_RE */
  id: string;
  /** 条目标题（卡片标题） */
  name: string;
  /** 一句话描述 */
  description?: string;
  /** 作者 / 发布者（字符串，不做身份校验） */
  author?: string;
  /** 条目版本号（展示用；与 L2 manifest.version 一致性见 security） */
  version?: string;
  /** 发布/更新时间 ISO-8601（展示用） */
  updatedAt?: string;
  /** 内容类别标签（展示用；禁止执行语义） */
  categories?: string[];
  /** 条目来源仓库 URL（发布者自托管；读取路由依据）；缺省 = 市场仓库自身（兼容现状单仓）。
   *  存在时必须过 validateRepoUrl（拒绝 userinfo / 空白），只读拉取、永不注入凭据。 */
  repo?: string;
}
/** 供应链/来源信息（纯展示，不做身份验证） */
interface MarketItemProvenance {
  /** 作者声明的来源（仓库 URL 等，展示用） */
  source?: string;
  /** 作者自述（展示用） */
  note?: string;
}
/** 已添加的市场摘要（GET/POST market 响应；无凭据） */
interface MarketSummary {
  url: string;
  addedAt: string;
  /** 最近一次刷新拉到的 index.json 市场名（可空） */
  name?: string;
  /** 缓存 index 的条目数（可空） */
  itemCount?: number;
  /** 最近一次成功拉取时间（可空） */
  lastFetchedAt?: string;
}
/** POST /market/browse 响应：合并 index + 缓存状态的列表项 */
interface MarketListItem {
  id: string;
  name: string;
  description?: string;
  author?: string;
  version?: string;
  updatedAt?: string;
  categories?: string[];
  /** 条目来源仓库 URL（来自 index 条目；UI 据此显示来源徽章）；缺省 = 市场仓库自身 */
  repo?: string;
  /** 条目来源仓库的 star 数（仓库级，非条目级；undefined = 无数据——查询失败/非 GitHub 仓库） */
  stars?: number;
  /** 本地缓存状态：cached | fresh | none（UI 徽章） */
  cacheState: 'cached' | 'fresh' | 'none';
  /** 分区清单（P2-⑭：已缓存条目从 L2 manifest 合并；未缓存条目缺省 = 未知，列表分区筛选时排除） */
  sections?: SectionId[];
}
/** POST /market/download 响应：条目详情 + 校验结果（dry-run 预览） */
interface MarketItemDetail {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  updatedAt?: string;
  sections: SectionId[];
  /** 条目来源仓库 URL（本次下载实际读取的仓库，repo ?? 市场 url）；展示用 */
  repo?: string;
  /** 供应链/来源信息（UI 恒展示） */
  provenance?: MarketItemProvenance;
  /** 下载/校验时间 */
  downloadedAt: string;
  /** 校验状态：valid | invalid */
  status: 'valid' | 'invalid';
  errors?: string[];
  /** 供应链警示（不论 status 都恒有；invalid 时叠加 errors） */
  warnings: string[];
}
/** market/download 的 payload（供后续 /execute 确认导入用） */
interface MarketDownloadResult extends MarketItemDetail {
  /** 受控临时区路径，供 confirm 后调 /execute */
  zipPath: string;
  /** 复用现有 analyzeImport 输出（dry-run） */
  analysis: ImportAnalysis;
  /** 复用现有 createImportPlan 输出（dry-run 预览） */
  plan: ImportPlan;
}
/** GET /market/status 响应：{ configured, markets } */
interface MarketStatusResponse {
  ok: boolean;
  /** 是否已添加过至少一个市场 */
  configured: boolean;
  markets: MarketSummary[];
  /** 本次 dsh 启动后市场是否已刷新过（首次打开市场页自动更新一次的依据；进程内存，dsh 重启后重置） */
  bootAutoRefreshed?: boolean;
}
/** POST /market/refresh 响应：{ ok, items, market } */
interface MarketRefreshResponse {
  ok: boolean;
  items: MarketIndexItem[];
  /** 该市场的缓存摘要（含最新 name/itemCount/lastFetchedAt） */
  market: MarketSummary;
}
/** POST /market/browse 响应：{ ok, items } */
interface MarketBrowseResponse {
  ok: boolean;
  items: MarketListItem[];
}
/** 配置市场浏览器半数据入口（备份与迁移页第 5 个 tab 的注入业务面） */
declare class MarketApi {
  readonly t: UiT;
  constructor(t: UiT);
  /** 读取内置市场摘要（条目数 / 最近拉取时间；无任何凭据） */
  status(): Promise<MarketStatusResponse>;
  /** 拉取市场最新 index.json（内置单市场；返回目录条目 + 市场缓存摘要） */
  refresh(): Promise<MarketRefreshResponse>;
  /** 浏览内置市场（合并 index + 本地缓存状态 → 条目列表带 cacheState） */
  browse(): Promise<MarketBrowseResponse>;
  /** 下载 + 校验单条目（dry-run 预览：拉取 → §6 校验 → analyzeImport → createImportPlan）。
   *  repo 可选：条目来源仓库（作者自托管）。自托管条目（官方 index 带 repo 引用、或「我的配置」
   *  未收录条目）内容文件在作者自己的公开仓库，必须显式传 repo 才能从正确来源拉取；
   *  缺省 = 市场仓库（官方同仓条目）。
   *  真正落盘由用户对预览确认后走现有 executeImportPlan（confirm:true 安全阀 + 回滚）。 */
  download(itemId: string, repo?: string): Promise<MarketDownloadResult>;
}
/** 条目收录状态：未收录（本地独有）｜ PR 待审核（带 PR 链接）｜ 已收录（官方市场 index 含该 id） */
type MyItemStatus = 'not-listed' | 'pr-pending' | 'listed';
/** 上传表单：仅用户填写的描述性内容；id/author/version/updatedAt/repoUrl 全自动 */
interface MyRepoForm {
  /** 配置名（预填 zip 文件名，可改）；id 由其派生稳定 slug */
  name: string;
  /** 显式目标条目 id（**仅 update 模式**用：由列表「更新」按钮预填，避免靠 name→slug 猜测匹配；
   *  上传（新条目）时省略；后端校验存在性，缺省回退 name slug 匹配（向后兼容） */
  id?: string;
  description?: string;
  categories?: string[];
  /** 发布模式（F6 迁移/分享双模式）：'share' 时 prepare 走分享强制拦截（排除设备/平台分区 + 保守档隐私扫描）；
   *  缺省 undefined = migrate（迁移全带，行为与历史一致）。 */
  mode?: MarketPublishMode;
}
/** 收录流程状态：pending=已提交、后台处理中；done=已提交收录（PR 已开/复用）；failed=收录失败可重试 */
type ListingState = 'pending' | 'done' | 'failed';
/**
 * upload / update 返回（ok=false 时携带已脱敏 error + errorCode）。
 * 流程拆分（2026-08-20 优化）：upload/update 只同步执行「推用户仓库」并立即返回
 * （listing='pending'），「收录流程」（fork + 官方 index + PR）在后台异步执行，
 * 避免 GitHub fork 排队时整个上传请求长时间挂起；收录结果经 listingStatus /
 * /me/items 状态徽章查询。
 */
interface UploadResult {
  ok: boolean;
  itemId: string;
  version: string;
  sha256: string;
  sections: SectionId[];
  /** 用户公开仓库 URL（https://github.com/<login>/dsh-configs） */
  repoUrl: string;
  /** 收录 PR 编号（异步模式下收起完成前为 null；完成经 listingStatus 查询） */
  prNumber: number | null;
  /** 收录 PR 链接（同上） */
  prUrl: string | null;
  warnings: string[];
  /** 收录流程状态：ok=true 且上传成功后为 'pending'（后台进行中）；失败无收录流程时 'done' 无意义 */
  listing: ListingState;
  /** listing='failed' 时：收录失败原因（已脱敏，含重试指引） */
  listingError?: string;
  /** ok=false 时：可展示错误（已脱敏，无 token 形态） */
  error?: string;
  /** ok=false 时：错误分类码（unauthorized/prepare_failed/...；无则 'internal'） */
  errorCode?: string;
}
/** POST /me/listing 响应：收录任务状态（结果卡轮询用，比拉全列表更轻） */
interface ListingStatusResponse {
  itemId: string;
  listing: ListingState;
  /** listing='done' 时：PR 编号 */
  prNumber: number | null;
  /** listing='done' 时：PR 链接 */
  prUrl: string | null;
  /** listing='failed' 时：失败原因（已脱敏） */
  error?: string;
}
/** POST /me/delete 响应：删除条目结果 */
interface DeleteResult {
  ok: boolean;
  itemId: string;
  /** 是否已异步提交「下架 PR」（条目此前已收录进官方市场时 true） */
  delisted: boolean;
  /** 被关闭的收录 PR（条目处于待审核、有 open PR 时关闭它） */
  prNumber: number | null;
  /** 被关闭 PR 的链接（同上） */
  prUrl: string | null;
  warnings: string[];
  /** ok=false 时：可展示错误（已脱敏） */
  error?: string;
  /** ok=false 时：错误分类码（item_not_found/unauthorized/...） */
  errorCode?: string;
}
/** listItems 条目：用户仓库 index.json 条目 + 收录状态 */
interface MyItemEntry {
  id: string;
  name: string;
  version?: string;
  description?: string;
  author?: string;
  updatedAt?: string;
  categories?: string[];
  status: MyItemStatus;
  /** status=pr-pending 时：PR 链接 */
  prUrl?: string;
  /** 用户公开仓库 URL */
  repoUrl: string;
  /** 用户公开仓库（<login>/dsh-configs）的 star 数（仓库级；undefined = 无数据） */
  stars?: number;
}
/**
 * POST /me/status 响应：登录态 + 用户配置仓库状态（设计文档 §4.2）。
 * 仅非敏感展示位：login 用户名可回显；token 值永不回传浏览器。
 */
interface MyMeStatusResponse {
  loggedIn: boolean;
  /** GitHub 登录名（展示 @login 用） */
  login?: string;
  /** 用户自己的配置仓库 URL（无则尚未创建） */
  repoUrl?: string;
  /** 配置仓库是否已存在（false = 尚未创建过） */
  repoExists?: boolean;
}
/**
 * 一键上传/更新请求体中的表单（设计文档 §2.4 用户输入最小化）：
 * 仅 name（必填，预填 zip 文件名可改）/ description（可选）/ categories（可选）；
 * id / author / version / updatedAt 全部系统自动生成，不在表单里。
 * categories 为数组（UI 层先经 parseCategories 解析逗号分隔文本）。
 * **与 Host 半 my-repo.ts 的 MyRepoForm 同构**（对齐导出，避免漂移）。
 */
type MyConfigsFormPayload = MyRepoForm;
/**
 * POST /me/upload | /me/update 响应（**对齐 host 半 my-repo.ts 的 UploadResult**）。
 * ok=false 时 itemId/version/sha256 可为空串，warnings/error/errorCode 携带可展示信息（已脱敏）。
 */
type MyUploadResult = UploadResult;
/** POST /me/items 响应：用户仓库的全部条目（空仓库 → 空数组）。
 *  条目 = Host 侧 MyItemEntry（含收录状态 status + prUrl + repoUrl，§4.5 在 Host 判定）。 */
interface MyItemsResponse {
  items: MyItemEntry[];
}
/**
 * 「我的配置」浏览器半数据入口（MarketPanel 的「我的配置」子视图注入业务面）。
 * 登录（GitHub device flow）不在此类 —— 复用 SyncApi.githubStart/githubPoll/githubCancel。
 */
declare class MyConfigsApi {
  readonly t: UiT;
  constructor(t: UiT);
  /** 读取登录态 + 用户配置仓库状态（token 失效 → Host 返回 401/未登录，UI 引导重新登录） */
  meStatus(): Promise<MyMeStatusResponse>;
  /** 一键上传：校验 → 建/复用仓库 → 写入用户仓库 → fork → 改官方 index → 提收录 PR */
  meUpload(payload: {
    zipPath: string;
    form: MyConfigsFormPayload;
  }): Promise<MyUploadResult>;
  /** 读取已上传条目列表（用户仓库 index.json；每条目含 Host 侧判定的收录状态） */
  meItems(): Promise<MyItemsResponse>;
  /** 一键更新：version 自动 +1，复用/重开收录 PR */
  meUpdate(payload: {
    zipPath: string;
    form: MyConfigsFormPayload;
  }): Promise<MyUploadResult>;
  /** 查询收录/下架任务状态（结果卡轮询；任务表未命中时 Host 回退 GitHub 实况推导；无任务无实况 → null） */
  meListing(itemId: string): Promise<ListingStatusResponse | null>;
  /** 重新提交收录（失败/重启丢失后重试；幂等复用已存在 fork/open PR） */
  meRelist(itemId: string): Promise<ListingStatusResponse>;
  /** 删除条目（同步删本地索引+文件；已收录自动后台提下架 PR；待审核自动关闭收录 PR） */
  meDelete(itemId: string): Promise<DeleteResult>;
}
/** 单条会话的修复原因（机器可读；文案由 CLI 输出层决定）。 */
type SessionRepairReason =
/** header 里没有 cwd（DSH 的 _no-cwd 会话）：无法判定目标目录 */
'no-cwd' |
/** 同一会话的多份 generation 的 cwd 不一致：不猜哪份为准 */
'inconsistent-generations' |
/** 目录内有 session.lock：可能正被使用 */
'locked' |
/** 位置已经正确 */
'already-placed' |
/** 需要搬家（header 未变） */
'needs-move' |
/** 需要先改写首帧 cwd（路径映射命中）再搬家 */
'needs-rewrite-move' |
/** 同一 id 出现在多个 projectKey 目录 */
'duplicate-id';
/** 一条动作的类别（决定 CLI 做什么）。 */
type SessionRepairActionKind =
/** 无需动作 */
'ok' |
/** 搬目录到正确 projectKey 段 */
'move' |
/** 改写首帧 cwd 后再搬目录 */
'rewrite-move' |
/** 只报告，不动（缺 cwd / 加锁 / 多 generation 不一致） */
'skip' |
/** 重复 id 里按 --keep 保留的那一份 */
'keep' |
/** 重复 id 里被移到隔离目录的那一份 */
'quarantine';
interface SessionRepairSummary {
  scanned: number;
  ok: number;
  move: number;
  rewriteMove: number;
  skip: number;
  keep: number;
  quarantine: number;
  /** 受影响的重复 id 条数（同一 id 的多份只算一次） */
  duplicates: number;
}
/** E1 计划里的一条动作（**不含绝对路径**：身份 = `<fromProjectKey>/<sessionId>`）。 */
interface SessionLayoutPlanItemView {
  unitId: string;
  sessionId: string;
  kind: SessionRepairActionKind;
  fromProjectKey: string;
  toProjectKey?: string;
  /** 面板入口不支持路径映射 ⇒ 恒缺席（这里保留字段只为与宿主同形） */
  rewrite?: {
    from: string;
    to: string;
  };
  reason: SessionRepairReason;
  applies: boolean;
}
interface SessionLayoutPlanView {
  ok: boolean;
  readOnly: boolean;
  /** 会话根读不出来时的机器码（`sessions-root-unreadable`） */
  reason?: string;
  summary: SessionRepairSummary;
  actions: SessionLayoutPlanItemView[];
  needsAttention: boolean;
  /** 有重复 id 但**还没选定保留哪一份**的 sessionId（面板据此要求用户选） */
  needsKeep: string[];
}
interface SessionLayoutApplyItemView {
  unitId: string;
  sessionId: string;
  action: SessionRepairActionKind;
  ok: boolean;
  reason?: string;
  /** 隔离去向（**相对** `<home>/sessions`；可直接渲染） */
  quarantineDir?: string;
  /** 归位后的新身份 */
  movedUnitId?: string;
  /** 失败后是否已成功回滚（true = 已回到原状态；false = **回滚也没成功**，危险态） */
  rolledBack?: boolean;
  needsAttention?: boolean;
}
interface SessionLayoutApplyView {
  ok: boolean;
  applied: number;
  failed: number;
  skipped: number;
  results: SessionLayoutApplyItemView[];
  /** 整体未执行：`reindex-unavailable`（宿主没给索引刷新端口）/ `sessions-root-unreadable` */
  reason?: string;
}
/**
 * 这条路由的两种响应（apply=false → 计划；apply=true → 执行结果）。
 * 判别：执行结果带 `results` 数组，计划带 `actions`/`needsKeep`。
 */
type SessionLayoutResponse = SessionLayoutPlanView | SessionLayoutApplyView;
/** 只保留两态（S2）：工作区 + 会话。 */
declare const ROLLBACK_STATES: readonly ['workspace', 'session'];
type RollbackState = (typeof ROLLBACK_STATES)[number];
/**
 * 回退范围三选一（冻结 wire contract 的 `mode`）：
 *  - `files+session`：工作区文件 + 会话（新子会话）一起回退；
 *  - `files`：只回退工作区文件；
 *  - `session`：只回退会话（fork 子会话）。
 */
declare const ROLLBACK_MODES: readonly ['files+session', 'files', 'session'];
type RollbackMode = (typeof ROLLBACK_MODES)[number];
interface RollbackGuidance {
  code: string;
  detail?: string;
}
type RollbackGuardPolicy = 'require' | 'warn' | 'off';
/** 单段摘要（恒为 workspace / session 两项；state 用 string 以便未知值也能被映射成 unknown 键）。 */
interface RollbackSegmentSummary {
  state: string;
  ok?: boolean;
  degraded?: boolean;
  capturedAt?: number;
  reasonCode?: string | null;
  /** 该段捕获的条目数（工作区文件数 / 会话 0|1） */
  entries?: number;
  bytes?: number;
  /** 会话段：游标（seq） */
  cursorBytes?: number | null;
  /** 该段**可回退**（有内容副本 / 有可写回条目） */
  restorable?: boolean;
  /** 留点时的**跳过条目总数**（工作区态：skipped + excludedDirs；会话态恒 0）—— S4「跳过并如实报告」 */
  skippedCount?: number;
  /** 该段捕获是否被上限截断（工作区态 = 单文件上限 / 字节预算 / 文件数预算任一命中） */
  truncated?: boolean;
}
interface RollbackPointSummary {
  id: string;
  createdAt: number;
  /** 自动留点归属的会话（自动点必有；无会话的旧记录为 null） */
  sessionId?: string | null;
  /** 会话单元 id（宿主回传的 <projectKey>/<sessionId>；用于分组表头） */
  unitId?: string | null;
  /**
   * 对话标题：宿主从 DSH 会话缓存补的**只读装饰**（与 /recovery/sessions 同一份索引）。
   * 读不到就**不带该字段** —— 界面回落显示 `sessionId`，绝不编造标题。
   */
  title?: string | null;
  /** 该点对应的回合号（1-based；无法判定为 null） */
  turn?: number | null;
  /** fork 的 inclusive 边界 seq（null = 无前置边界） */
  boundarySeq?: number | null;
  /** auto = 回合结束自动留点；guard = 回退前救援点 */
  kind?: string;
  protected?: boolean;
  /** 两态缺一（缺省不允许回退） */
  incomplete?: boolean;
  note?: string | null;
  /** 两态 capturedAt 的跨度（诚实事实，无同点判定） */
  spreadMs?: number;
  segments?: RollbackSegmentSummary[];
}
/**
 * 台账占用（issue #89 P2：可观测）。
 * `bytes` = records/ + payloads/ 的实际字节数；`budgetBytes` = 触发淘汰的字节预算；
 * `evicted` = 本进程内被预算淘汰的自动点累计数。缺省（老宿主没这个字段）= 界面不渲染这一行。
 */
interface RollbackLedgerStatus {
  records: number;
  bytes: number;
  budgetBytes: number;
  evicted: number;
  /**
   * 已超预算且**无处可淘汰**（典型：单条点本身就大于预算）。
   * 老宿主没有这个字段 ⇒ `undefined` 与 `false` 同义，绝不因为读不到就报警。
   */
  overBudget?: boolean;
}
interface RollbackStorageStatus {
  available: boolean;
  root?: string;
  detail?: string;
  guidance?: RollbackGuidance[];
  requirements?: readonly string[];
  /** 磁盘偏好：回合自动留点开关（缺省 / false = 关闭） */
  rollbackEnabled?: boolean;
  /** 本进程此刻是否真的在留点（关闭后订阅已解绑）。与 rollbackEnabled 正常一致 */
  rollbackActive?: boolean;
  /** 台账占用（老宿主没有这个字段） */
  ledger?: RollbackLedgerStatus;
}
/** 开关读 / 写的结果（POST 成功才会改进程 gate）。 */
interface RollbackPrefsResult {
  ok: boolean;
  rollbackEnabled: boolean;
  rollbackActive?: boolean;
}
/** 台账清理结果（只删自动点；guard 与 protected 保留）。 */
interface RollbackPurgeResult {
  ok: boolean;
  code?: string;
  detail?: string;
  removedRecords?: number;
  removedPayloads?: number;
  removedObjects?: number;
  bytes?: number;
}
interface RollbackListResult {
  ok?: boolean;
  points: RollbackPointSummary[];
  storage: RollbackStorageStatus;
  error?: string;
  /** 全局留存上限（S6：50） */
  maxRecords?: number;
  /** 每会话留存上限（S6：20） */
  maxRecordsPerSession?: number;
  /** **全局**救援点留存上限（S6 第二道 guard 预算：50） */
  maxGuards?: number;
}
interface RollbackDetailResult {
  ok: boolean;
  id: string;
  point: RollbackPointSummary;
  storage: RollbackStorageStatus;
}
/** 计数或清单：宿主回传数字就取数字，回传清单就取长度（两者都是「有多少项」）。 */
type RollbackCount = number | readonly string[];
/**
 * 预览里「回退会改动的一个文件」的动作。
 *
 * 与引擎（`src/core/rollback-point.ts` 的 `RollbackPreviewFileStatus`）**逐字同形**：
 *  · `overwrite` = 覆盖已有文件；`create` = 当前不存在（回退会重新创建）；
 *  · `delete` **不由 `files[]` 产出**：整文件删除走**另一条**清单
 *    （`RollbackWorkspacePreview.removals` = 会删的，`createdSkipped` = 拒删的）——
 *    那些路径不在该点的记录里，所以既不进这份逐文件统计、也读不出前后对照。
 *    保留该取值只为契约形状向前兼容 —— 界面不得为它编文案。
 */
type RollbackPreviewFileStatus = 'overwrite' | 'create' | 'delete';
/**
 * E1：逐文件的行级统计（简洁版预览弹窗 `preview.workspace.files` 的元素形状）。
 *
 * **只列真的会被改动的文件** —— 已与快照一致的条目一个都不列（「353 项里 0 项不同」⇒ 空数组）。
 * `added` / `removed` 可能是 `null`（单文件超上限 / 单张预览累计超限 / Myers 步数超限 /
 * 非文本 / 对象仓读不出），此时 `truncated` 为 true：界面说「行数未统计」，
 * **绝不写成 0**（0 是一个会被证伪的具体数字，而「不知道」不是）。
 */
interface RollbackPreviewFile {
  /** 绝对路径（界面只做展示）。 */
  path: string;
  status: RollbackPreviewFileStatus;
  /** 回退会让该文件**新增**的行数；null = 本次不给数字（见 truncated）。 */
  added: number | null;
  /** 回退会从该文件**删除**的行数；null = 同上。 */
  removed: number | null;
  /** true = 本次没有可信行数（added/removed 均为 null）。**宁可说「不知道」，也绝不谎报行数。** */
  truncated: boolean;
  /**
   * true = 该文件在留点**之后**是**别的会话**写的（写入归属台账证明；见 core/rollback-attribution.ts）。
   * 界面据此默认不勾选它（用户仍可勾上）。缺字段 / false = **没有归属证据**，
   * 而不是「本会话写的」——「未判定」与「确知是本会话」必须分开。
   */
  foreign?: boolean;
  /** 那些「别的会话」的会话 id（仅当 foreign 为 true） */
  foreignSessionId?: string;
  /** 那次写入的时间（毫秒；仅当 foreign 为 true） */
  foreignAt?: number;
  /**
   * true = 这次回退**不会改动它**（与其它对话的改动冲突 / 无法安全合并）。行级统计为 null ——
   * 「不改动」不是「0 行变化」，界面必须分开说。
   */
  skipped?: boolean;
  /** 不改动的机器原因（界面映射成字典键，绝不裸渲染） */
  mergeReason?: string;
}
interface RollbackWorkspacePreview {
  /** 将被写回（覆盖）的条目数 */
  overwrite?: RollbackCount;
  /** 与当前内容不同、确实会被改动 */
  different?: RollbackCount;
  /** 记录里的文件当前已不存在（回退会重新创建） */
  missing?: RollbackCount;
  /**
   * 该点**未记录**的条目总数。**不是**「之后新建」，也**不是**「会被删除」——
   * 会被删的是 {@link removals} / {@link removalsCount}。
   */
  createdAfter?: RollbackCount;
  /** 该点**未记录**的路径清单（含被拒删的；宿主上限 20 条）—— **不是**删除清单 */
  leftovers?: string[];
  leftoversTruncated?: boolean;
  /** **会被删除**的路径（= 未记录 + 过了安全判据；宿主上限 20 条） */
  removals?: string[];
  /** 会被删除的**真实总数**（不受清单上限影响） */
  removalsCount?: RollbackCount;
  /** 删除逐条清单不完整（条数超上限 / 遍历被截断） */
  removalsTruncated?: boolean;
  /** 按安全判据**拒删**的路径（.git / node_modules / 数据区 / 越界 / 过大 / 捕获不完整时的全部候选） */
  createdSkipped?: string[];
  /** 拒删路径的**真实总数** */
  createdSkippedCount?: RollbackCount;
  createdSkippedTruncated?: boolean;
  /**
   * 非 null = 该点捕获**不完整** ⇒ **一条都没删**（安全拒删：绝不误删既有文件）。
   * 界面必须如实说，绝不把它渲染成「无事可做 / 已一致」。
   */
  createdRefusedReason?: string | null;
  /** 记录在案的分块（绝对路径；界面只做展示，不做判定） */
  chunks?: string[];
  /**
   * E1：逐文件的行级统计 —— **只含会被改动的文件**（内容已一致的条目一个都不列）。
   *
   * 可选（`?`）是**刻意的向后兼容**：老响应 / 老宿主不认识这个字段，缺省必须回落
   * 「没有这条信息」，而不是被当成「空数组＝全部一致」或抛错 —— 界面据「字段是否存在」
   * 决定是否显示文件列表，绝不把「缺字段」与「确知为空」混成同一件事。
   */
  files?: RollbackPreviewFile[];
  /** 捕获时被跳过的条目总数（skipped + excludedDirs；逐条列表的上限截断不影响本计数） */
  skippedCount?: RollbackCount;
  /** 捕获是否被上限截断（超单文件上限 / 字节预算 / 文件数预算任一命中即为 true） */
  truncated?: boolean;
  available?: boolean;
  reasonCode?: string | null;
  guidance?: RollbackGuidance[];
}
interface RollbackSessionPreview {
  /** 回退目标边界：目标回合开始前最后一个事件的 seq（fork 的 inclusive 边界；无边界为 null） */
  from?: number | null;
  /** 该回合 turn/end 的 seq（无边界为 null） */
  to?: number | null;
  /** 该点对应的回合号 */
  turns?: number;
  /** 当前事件游标（seq） */
  cursorSeq?: number | null;
  /** 当前日志字节数 */
  cursorNowBytes?: number | null;
  /** 目标边界的字节数 */
  cursorTargetBytes?: number | null;
  /** 该段是否可回退（无边界 / 副本缺失 → false） */
  restorable?: boolean;
  /** 日志刚被写过（仅供参考：fork 只读，不会覆盖日志） */
  active?: boolean;
  reasonCode?: string | null;
  available?: boolean;
  guidance?: RollbackGuidance[];
}
interface RollbackPreviewResult {
  ok: boolean;
  code?: string;
  detail?: string;
  id: string;
  storage: RollbackStorageStatus;
  workspace?: RollbackWorkspacePreview | null;
  session?: RollbackSessionPreview | null;
  /** 该点的两态摘要（宿主回传；缺失时界面用列表行里的同一份摘要） */
  point?: RollbackPointSummary | null;
  /** 宿主给出的权威判定（本层在此基础上再要求「至少有一段可回退」） */
  canRestore?: boolean;
  canRemove?: boolean;
  summary?: RollbackPointSummary;
  guidance?: RollbackGuidance[];
  warnings?: RollbackGuidance[];
}
/** 单文件差异里一侧（与引擎 `RollbackFileDiffSide` 逐字同形：字段名/含义都一致）。 */
interface RollbackFileDiffSide {
  exists: boolean;
  bytes: number;
  /** 行数；null = 未读取（二进制 / 超限 / 不可读） */
  lines: number | null;
  binary: boolean;
  oversized: boolean;
  unreadable: boolean;
}
/** 无法逐行对比的原因（有值时 hunks 恒为空数组 —— 「不知道」不是「没有差异」）。 */
type RollbackFileDiffReason = 'missing-blob' | 'binary' | 'too-large' | 'unreadable';
/**
 * 单文件前后对照（引擎 `fileDiff` 的镜像；只列一条记录）。
 *
 * 方向：`before` = **当前磁盘**，`after` = **回退点快照**（点下回退之后该文件的样子）——
 * 与预览行数统计同一口径，界面左右双栏与之一致，别读反。
 */
interface RollbackFileDiffResult {
  ok: boolean;
  code?: string;
  detail?: string;
  id: string;
  path: string;
  status: RollbackPreviewFileStatus;
  before: RollbackFileDiffSide;
  after: RollbackFileDiffSide;
  hunks: DiffHunk[];
  added: number;
  removed: number;
  identical: boolean;
  degraded: boolean;
  reason?: RollbackFileDiffReason;
  /** true = 「回退后」一侧显示的是三方合并的结果（不是记录里的原文） */
  merged?: boolean;
  /** true = 这次回退不会改动它（冲突 / 无法安全合并）——此时两侧相同 */
  mergeSkipped?: boolean;
  /** 不改动的机器原因（界面映射成字典键） */
  mergeReason?: string;
}
interface RollbackSegmentResult {
  state: string;
  status: string;
  reasonCode?: string;
  /** 逐条事实（技术细节，非用户可见文案） */
  detail?: string[];
  restored?: number;
  failed?: number;
  /** 该点**未记录**的路径（含被拒删的；宿主上限 20 条）。**不是**删除清单 —— 那一份是 removedPaths */
  leftovers?: string[];
  leftoversTruncated?: boolean;
  /** 本次真的删掉的「该点未记录」路径数（用户 2026-10-11 定案 A） */
  removed?: number;
  /** 已删除路径（有界清单；与预览的 workspace.removals 同源同序） */
  removedPaths?: string[];
  /** 想删但按安全判据拒删的路径（越界 / 数据区 / .git / node_modules / 过大 / 捕获不完整），如实报告 */
  createdSkipped?: string[];
  /** 拒删路径的**真实总数**（不受清单上限影响） */
  createdSkippedCount?: RollbackCount;
  createdSkippedTruncated?: boolean;
  /** 非 null = 该点捕获**不完整** ⇒ 一条都没删（安全拒删） */
  createdRefusedReason?: string | null;
  /** 工作区段：实际写回的字节数（宿主回传才有） */
  writtenBytes?: number;
  /** 因归属隔离（B）跳过的记录条目数：该文件在留点后被**别的会话**写过（宿主回传才有） */
  foreignSkipped?: number;
  /** 因路径选择（A）跳过的记录条目数（宿主回传才有） */
  selectionSkipped?: number;
  /** 三方合并成功、写回「撤销本会话 + 保留对方改动」的条目数（宿主回传才有） */
  mergedCount?: number;
  mergedPaths?: string[];
  /** 冲突：两侧改到同一处 ⇒ 未写（宿主回传才有） */
  conflictCount?: number;
  conflictPaths?: string[];
  /** 无法安全撤销 ⇒ 未写（宿主回传才有） */
  unavailableCount?: number;
  unavailablePaths?: string[];
  /**
   * **落点无人认领**（时间窗证据表明那一刻没有任何会话活跃：手改 / 外部工具 / 另一个进程）
   * ⇒ 未写（宿主回传才有）。与 unavailableCount 分开：成因不同，用户要做的事也不同。
   */
  externalCount?: number;
  externalPaths?: string[];
  /** 写入前发现又被改过（并发）⇒ 未写（宿主回传才有） */
  concurrentCount?: number;
  concurrentPaths?: string[];
  /** 兼容形态：宿主只回传计数时也算得出来 */
  createdAfter?: RollbackCount;
  createdAfterTruncated?: boolean;
  /** 会话段：回退产生的 fork 子会话 id */
  childSessionId?: string;
  guidance?: RollbackGuidance[];
}
interface RollbackRewindResult {
  ok: boolean;
  outcome: string;
  code: string;
  detail?: string;
  id?: string;
  segments?: RollbackSegmentResult[];
  /** 因前段失败 / 未请求而未执行的段（只可能是两态） */
  skippedSegments?: string[];
  /** 会话回退结果：fork 出来的子会话 id（S3；原会话日志只读，绝不改写） */
  childSessionId?: string;
  /** 回退前自动留的救援点 id（S5 guard） */
  guardPointId?: string;
  storage?: RollbackStorageStatus;
  guidance?: RollbackGuidance[];
  warnings?: RollbackGuidance[];
}
interface RollbackRemoveResult {
  ok: boolean;
  code: string;
  detail?: string;
  id: string;
}
/** 回退输入（冻结 wire contract 的 rewind body）。 */
interface RollbackRewindOptions {
  /** fail-closed 确认门：必须**恰好** true（宿主缺省/假值一律 409 confirmation-required） */
  userConfirmed: boolean;
  mode?: RollbackMode;
  segments?: readonly RollbackState[];
  allowPartial?: boolean;
  preRewindGuard?: RollbackGuardPolicy;
  /**
   * 路径级选择性恢复（2026-10-17 定案 A）：只恢复这些路径。
   *
   * 缺省 = 全量口径（一字不变）。**空数组是无效输入**（宿主 400）—— 「一个都没勾」由界面拦住，
   * 绝不让它变成「整次回退静默 noop」。
   */
  onlyPaths?: readonly string[];
}
/** 端口：由 src/client/recovery/recovery-api.ts 实现（Partial 消费，缺失时界面如实说能力缺失）。 */
interface RollbackPointPort {
  rollbackPoints(): Promise<RollbackListResult>;
  rollbackPointStorage(): Promise<RollbackStorageStatus>;
  rollbackPoint(id: string): Promise<RollbackDetailResult>;
  rollbackPointPreview(id: string): Promise<RollbackPreviewResult>;
  /**
   * 只读：该点里**一个记录在案文件**的前后逐行对照（预览弹窗按需拉取；未命中记录一律拒绝）。
   * 可选实现：端口缺失该方法时，界面**不显示**「查看」（绝不给一个点了没反应的入口）。
   */
  rollbackPointFileDiff?(id: string, path: string): Promise<RollbackFileDiffResult>;
  restoreRollbackPoint(id: string, opts: RollbackRewindOptions): Promise<RollbackRewindResult>;
  removeRollbackPoint(id: string, userConfirmed: boolean): Promise<RollbackRemoveResult>;
  /**
   * 回合自动留点开关（issue #88：它跟配置备份/同步是两件事，必须能关）。
   * 可选实现：端口缺失时界面**不渲染**开关（绝不给一个点了没反应的入口）。
   */
  rollbackPrefs?(): Promise<RollbackPrefsResult>;
  setRollbackEnabled?(enabled: boolean): Promise<RollbackPrefsResult>;
  /**
   * 清理台账（issue #89 P1/P2：把已经涨上去的占用收回来）。
   * **只删自动点**；`includeGuards` 为 true 时连 guard 也删，protected 永不删。
   */
  purgeRollbackPoints?(opts: {
    includeGuards: boolean;
  }): Promise<RollbackPurgeResult>;
}
/** Recovery 浏览器半数据入口（实现 RecoveryPort 契约 + rollback-points 族）。 */
declare class RecoveryApi implements RecoveryPort, RollbackPointPort {
  readonly t: UiT;
  constructor(t: UiT);
  /** GET /recovery/status：列出未解决 operation + reconcile decision。 */
  status(): Promise<RecoveryStatus>;
  /**
   * GET /recovery/sessions：**只读**会话体检（本机存量会话的损坏/可见性分类）。
   *
   * 为什么走 recovery 族：它与「我的对话去哪了」是同一件事，且本族已是 prefix 路由 ——
   * 加一条子路径不新增围栏面（见 tests/route/route-parity.test.ts 的说明）。
   * `limit` 只影响返回给浏览器的行数（宿主仍会扫全量，摘要里的 total 因此是全量口径）。
   */
  sessions(limit?: number): Promise<SessionHealthResponse>;
  /**
   * POST /recovery/sessions/repair（T8）：应用内修复一份会话日志。
   *
   * apply=false = 只读预览（宿主会回传 expect 指纹与动作清单）；apply=true 必须带上该指纹 ——
   * 宿主据此拒绝「预览之后文件已被改过」的写入（TOCTOU）。任何拒绝都以 ok:false + reason 表达，
   * 不是 HTTP 错误，界面必须按 reason 显式说明原因。
   */
  repairSession(unitId: string, apply: boolean, expect?: {
    size: number;
    mtimeMs: number;
  }, allowLossy?: boolean): Promise<SessionRepairResult>;
  /**
   * GET /recovery/rollback-points：台账列表（按时间倒序）+ 存储栈状态 + 留存上限。
   *
   * 列表本身**只读**：SAFE MODE 下也能看（宿主侧只有 rewind / delete 被 423 拦下），
   * 因此界面必须能「看得见、但按钮说明为什么点不了」。
   * 存储栈不可用时宿主回 **503 + 同体**（`storage.available=false` + guidance）；`getJson` 对非 2xx
   * 抛 `ConfigManagerApiError`（`status`=503，`code` 取响应体 code），调用方按 status 区分「读不出来」
   * 与「本来就没有」。
   */
  rollbackPoints(): Promise<RollbackListResult>;
  /** GET /recovery/rollback-points/storage：存储栈探针（不可用 → 503 + guidance，同上）。 */
  rollbackPointStorage(): Promise<RollbackStorageStatus>;
  /** GET /recovery/rollback-points/<id>：单条详情（不存在 → 404 `record-not-found`）。 */
  rollbackPoint(id: string): Promise<RollbackDetailResult>;
  /**
   * GET /recovery/rollback-points/<id>/preview：**只读预览（零写入）**。
   *
   * 回传两态将覆盖多少项、其中多少项内容不同、多少项当前已不存在、多少项是该点**未记录**的
   * （`removals` = 会被删除的、`createdSkipped` = 按安全判据拒删的；两者都只是**读回来的清单**，
   * 本方法零写入），以及会话边界（from → to）与回合号；`canRestore` / `canRemove`
   * 是宿主给出的权威判定，界面据此决定按钮可用性（展示判定见 `src/ui/rollback-view.ts`）。
   */
  rollbackPointPreview(id: string): Promise<RollbackPreviewResult>;
  /**
   * GET /recovery/rollback-points/<id>/file-diff?path=...：**单个记录在案文件**的前后逐行对照。
   *
   * 只读、零写入；路径以 query 传递（宿主内再收窄一次：未命中该点记录一律 `file-not-recorded`，
   * 一个字节都不读）。非 2xx（存储栈 503 / 参数 400）由 getJson 抛 ConfigManagerApiError，
   * 由调用方按 status + code 出文案。
   */
  rollbackPointFileDiff(id: string, path: string): Promise<RollbackFileDiffResult>;
  /**
   * POST /recovery/rollback-points/<id>/rewind：回退（工作区文件覆盖 + 会话 fork 子会话）。
   *
   * **确认门是 fail-closed**：`userConfirmed` 必须**恰好** true（宿主缺省 / 假值一律
   * 409 `confirmation-required` + 零写入）。本方法绝不自动置 true —— 由确认弹窗的 onClick 传进来。
   * 409（confirmation-required / protected-point / record-incomplete）与 423（mutation-locked）
   * 都以 `ConfigManagerApiError` 抛出，`status` / `code` 保留，界面按 code 出文案（不靠状态码猜原因）。
   * 会话回退 **不改写原会话日志**：结果里回传 `childSessionId`（新子会话），原会话只读。
   */
  restoreRollbackPoint(id: string, opts: RollbackRewindOptions): Promise<RollbackRewindResult>;
  /**
   * POST /recovery/rollback-points/<id>/delete：删除一个回滚点（保护点由宿主拒绝）。
   * body 必须 `userConfirmed: true`（未确认 → 409 `confirmation-required`）；本方法不自动置 true。
   */
  removeRollbackPoint(id: string, userConfirmed: boolean): Promise<RollbackRemoveResult>;
  /**
   * GET /recovery/rollback-points/prefs（issue #88）：读开关。
   * `rollbackEnabled` = 磁盘偏好（用户意图，随 self 分区进备份）；
   * `rollbackActive` = 本进程此刻是否真的在留点（关闭后订阅已解绑）。两者正常一致。
   */
  rollbackPrefs(): Promise<RollbackPrefsResult>;
  /**
   * POST /recovery/rollback-points/prefs（issue #88）：写开关。
   * 宿主写盘成功后才切进程 gate —— 写失败却把功能打开，等于「界面说开着、实际不留点」。
   */
  setRollbackEnabled(enabled: boolean): Promise<RollbackPrefsResult>;
  /**
   * POST /recovery/rollback-points/cleanup（issue #89）：清理台账占用。
   * **只删自动点**；`includeGuards` 为 true 时连救援点也删（protected 永不删）。
   * 返回逐类删除计数与释放字节，界面照实说「删了多少 / 还剩多少」。
   */
  purgeRollbackPoints(opts: {
    includeGuards: boolean;
  }): Promise<RollbackPurgeResult>;
  /** POST /recovery/sessions/rollback（T8）：按台账 repairId 回滚（客户端不传路径）。 */
  rollbackSessionRepair(repairId: string): Promise<SessionRepairRollbackResult>;
  /**
   * POST /recovery/sessions/layout（E2）：**布局归位 / 重复 id 隔离**（写入口）。
   *
   * apply=false = **只读计划**（宿主不拿锁、不过门、零写入；响应带 needsKeep，界面据此要求用户
   * 选定保留哪一份）；apply=true = 应用（过 SAFE MODE + mutation lock；keep 必须覆盖全部 needsKeep，
   * 否则该 id 被显式拒绝而不是静默跳过）。
   *
   * 安全口径（**必须与界面文案一致**）：本入口在 **DSH 运行时**执行，与离线 CLI
   * `dcm sessions repair --fix` 的「须先停 DSH」不同 —— 靠宿主侧逐目标门前置 + 每次移动后
   * **索引刷新必须成功** + 失败逐条回滚兜底。任何拒绝都以 `ok:false + reason`（或逐条 reason 码）
   * 表达，**不是** HTTP 错误，界面必须逐条如实说明。
   */
  layoutRepairSessions(apply: boolean, keep?: Record<string, string>): Promise<SessionLayoutResponse>;
  /** GET /recovery/:operationId/preview：只读恢复预览（restore plan + verification plan）。 */
  preview(operationId: string): Promise<RecoveryPreview>;
  /** POST /recovery/:operationId/confirm：确认恢复（journal 保持 NEEDS_ATTENTION）。 */
  confirm(operationId: string, userConfirmed: boolean): Promise<RecoveryConfirmResult>;
  /** POST /recovery/:operationId/execute：执行恢复/回滚（NEEDS_ATTENTION → RECOVERING）。 */
  execute(operationId: string, userConfirmed: boolean): Promise<RecoveryExecuteResult>;
  /** POST /recovery/:operationId/verify：post-recovery verification（原子写 verification + terminal）。 */
  verify(operationId: string): Promise<RecoveryVerifyResult>;
  /** POST /recovery/:operationId/retry：验证失败后重跑 execute + verify。 */
  retry(operationId: string, userConfirmed: boolean): Promise<RecoveryExecuteResult>;
  /** POST /recovery/:operationId/dismiss：放弃恢复（quarantine，不销毁证据）。 */
  dismiss(operationId: string, userConfirmed: boolean): Promise<RecoveryDismissResult>;
  /**
   * POST /recovery/lock/recover（issue #31）：显式回收 stale 残留配置锁。
   * 无 operationId（残留锁没有 journal）；userConfirmed 与其它危险动作同规，
   * 调用方必须先经过显式确认弹窗。
   */
  recoverStaleLock(userConfirmed: boolean): Promise<RecoveryLockRecoverResult>;
  /**
   * POST /recovery/safe-mode/clear（issue #56）：显式解除仍然生效的 SAFE MODE。
   * 无 operationId（该状态下 active/ 通常已空，没有可操作对象）；userConfirmed 与其它
   * 危险动作同规，调用方必须先经过显式确认弹窗。宿主侧仍有未解决 incident 时拒绝
   * （ok=false + reason='unresolved-incidents'），界面据此如实提示而不是假装成功。
   */
  clearSafeMode(userConfirmed: boolean): Promise<RecoverySafeModeClearResult>;
}
/** 合法 kind 集合（§5 COMPLETE 清单 + 评审补 'profile-import'）。 */
declare const MIGRATION_KINDS: readonly ['import', 'restore', 'rollback', 'profile-create', 'profile-select', 'profile-switch', 'profile-delete', 'profile-rename', 'profile-save', 'profile-import', 'sync-apply', 'autosync', 'recovery', 'backup', 'backup-manual', 'snapshot-delete', 'snapshot-prune'];
/** §5 覆盖的操作 kind（COMPLETE 不变量；常量枚举，天然非敏感）。 */
type MigrationKind = (typeof MIGRATION_KINDS)[number];
/**
 * 操作结果。
 *
 * 'pending'（0.4.1）：操作**跑完了但仍有待裁决项**（自动同步上传成功、下行冲突未裁决；
 * 合并已应用一部分）。它不是 failed —— 网络/凭据/repo 都是好的；也不是 skipped ——
 * 那一轮确实做了事。旧实现把 partial 直接折成 'failed'，用户看到「自动同步 失败」而
 * 实际只需要在同步页确认一次冲突。读侧（parseEntry / query 解析）必须接受该值，
 * 否则含 pending 的历史条目会被整条丢弃。
 */
type MigrationResult = 'success' | 'failed' | 'skipped' | 'pending';
/** 触发来源（常量）。 */
type MigrationSource = 'api' | 'autosync' | 'backup-scheduler' | 'recovery' | 'cli' | 'internal';
/** 一条不可变的迁移历史记录（磁盘形态；schemaVersion 内联）。 */
interface MigrationHistoryEntry {
  schemaVersion: number;
  at: string;
  kind: MigrationKind;
  result: MigrationResult;
  /** 涉及分区 adapter id（常量集合）。 */
  sections: string[];
  /** Journal operation id（UUID，BOUND）。 */
  operationId?: string;
  /** 快照 id（UUID，BOUND）。 */
  snapshotId?: string;
  /** run-registry runId（UUID，BOUND）。 */
  runId?: string;
  source: MigrationSource;
  /** 非敏感摘要（redact + high-entropy 后）。 */
  summary: string;
  /** 失败原因（redact + high-entropy 后）。 */
  error?: string;
}
/**
 * 磁盘形态：schemaVersion + contentHash（对除 contentHash 外全字段的 SHA-256）。
 * contentHash 用于 **append-only 篡改检测**：合法 JSON 内改字段值（含 result/summary/at）
 * → 读回 hash 不符 → 该文件被识别为损坏并跳过（满足「篡改必须被拒绝或检测」）。
 * 仅是内联字段（非 MAC/签名 / 非第二套 integrity framework；审计史非对抗性安全边界）。
 */
interface StoredMigrationHistoryEntry extends Omit<MigrationHistoryEntry, 'schemaVersion'> {
  schemaVersion: number;
  contentHash: string;
}
/** 统计（纯函数）。 */
interface MigrationHistoryStats {
  total: number;
  byKind: Partial<Record<MigrationKind, number>>;
  byResult: Partial<Record<MigrationResult, number>>;
}
/** 列表查询返回体。 */
interface HistoryListResult {
  ok: boolean;
  entries: StoredMigrationHistoryEntry[];
  stats: MigrationHistoryStats;
  corrupted: string[];
  /** 目录内合法历史文件总数（含被 limit 窗口挡在外的旧条目；老宿主可能不返回）。 */
  total?: number;
  /** 本次实际读取条数（= 窗口大小；用于「仅显示最近 N 条」提示）。 */
  scanned?: number;
  /** 本次生效的 limit（0 = 全量）。 */
  limit?: number;
}
/** 自动清理策略现状（GET /history/retention）。 */
interface HistoryRetentionState {
  ok: boolean;
  /** 当前保留上限；0 = 不限制。 */
  maxEntries: number;
  /** 目录内当前条数。 */
  total: number;
  /** 缺省上限（UI「恢复默认」用）。 */
  defaultMaxEntries: number;
  allowedMin: number;
  allowedMax: number;
}
/** 保存策略后的结果（POST /history/retention）。 */
interface HistoryRetentionResult {
  ok: boolean;
  maxEntries: number;
  /** 本次立即清理删除的条数。 */
  removed: number;
  total: number;
}
/** 导出 JSON 返回体（markdown 走附件下载，不返回 JSON body）。 */
interface HistoryExportJsonResult {
  ok: boolean;
  generatedAt: string;
  text: string;
}
type HistoryExportFormat = 'json' | 'markdown';
/** History 浏览器半数据入口。 */
declare class HistoryApi {
  readonly t: UiT;
  constructor(t: UiT);
  private buildListUrl;
  /** GET /history：按 kind/result/时间/分区 过滤读取历史。 */
  list(params?: {
    kind?: MigrationKind | MigrationKind[];
    result?: MigrationResult | MigrationResult[];
    from?: number;
    to?: number;
    sections?: string[];
    /** 只读最近 N 条（缺省/0 = 全量；首页只取几十条避免全量读+回传）。 */
    limit?: number;
  }): Promise<HistoryListResult>;
  /** GET /history/retention：当前自动清理策略 + 目录现状。 */
  getRetention(): Promise<HistoryRetentionState>;
  /** POST /history/retention：改保留上限并立即清理一次（0 = 不限制）。 */
  setRetention(maxEntries: number): Promise<HistoryRetentionResult>;
  /**
   * 导出历史报告（markdown → 下载附件；json → { text }）。
   * 过滤参数与 list 相同。
   */
  exportReport(format: HistoryExportFormat, params?: {
    kind?: MigrationKind | MigrationKind[];
    result?: MigrationResult | MigrationResult[];
  }): Promise<HistoryExportJsonResult | {
    downloaded: true;
  }>;
  private buildExportUrl;
}
/** 崩溃归因分类（与 core/crash-report.ts 的 CrashKind 同构）。 */
type CrashKind = 'session-corrupt' | 'bundle-check' | 'patch-tree' | 'unknown';
/** 建议动作（与 core/crash-report.ts 的 CrashAdvice 同构）。 */
type CrashAdvice = 'none' | 'restore-last-good' | 'repair-session' | 'check-bundles' | 'check-patch-tree';
/** GET /crash 响应。 */
interface CrashReport {
  crashed: boolean;
  crashReason: CrashKind | null;
  lastGoodAt: string | null;
  advice: CrashAdvice;
}
/**
 * GET /rescue 响应。stale 为家目录指纹不匹配（换机 / 重建 home）后的自动降级标记；
 * applied = 救援已在当前进程生效（本进程启动于进入救援之后，即用户已经重启过）。
 */
interface RescueStatus {
  active: boolean;
  stale: boolean;
  enteredAt: string | null;
  applied: boolean;
}
/** POST /rescue 响应。 */
interface RescueActionResult {
  ok: boolean;
  active: boolean;
  enteredAt?: string;
  restored?: string[];
  needsRestart?: boolean;
  code?: string;
  message?: string;
}
/** 事故恢复（崩溃归因 + 救援模式）浏览器半数据入口。 */
declare class IncidentApi {
  readonly t: UiT;
  constructor(t: UiT);
  /** GET /crash：上次启动是否异常 + 归因 + 建议动作 + 最后正常时刻。 */
  crash(): Promise<CrashReport>;
  /** GET /rescue：救援模式状态。 */
  rescueStatus(): Promise<RescueStatus>;
  /**
   * POST /rescue {action:on, confirm:true}：进入救援模式。
   * confirm 必须由调用方在显式确认弹窗后传入 —— 本层绝不代填。
   */
  rescueOn(): Promise<RescueActionResult>;
  /** POST /rescue {action:off}：退出救援模式（从备份完整还原）。 */
  rescueOff(): Promise<RescueActionResult>;
}
/** String/symbol keyed dictionary type. */
type Dict<T = any, K extends string | symbol = string> = { [key in K]: T; };
/** Wrap a value in `Promise`, preserving the resolved type of existing promises. */
type Promisify<T> = Promise<T extends Promise<infer S> ? S : T>;
/** Accept a value or promise unless the value type is already promise-like. */
type Awaitable<T> = [T] extends [Promise<unknown>] ? T : T | Promise<T>;
/** The Standard Typed interface. This is a base type extended by other specs. */
interface StandardTypedV1<Input = unknown, Output = Input> {
  /** The Standard properties. */
  readonly "~standard": StandardTypedV1.Props<Input, Output>;
}
declare namespace StandardTypedV1 {
  /** The Standard Typed properties interface. */
  interface Props<Input = unknown, Output = Input> {
    /** The version number of the standard. */
    readonly version: 1;
    /** The vendor name of the schema library. */
    readonly vendor: string;
    /** Inferred types associated with the schema. */
    readonly types?: Types<Input, Output> | undefined;
  }
  /** The Standard Typed types interface. */
  interface Types<Input = unknown, Output = Input> {
    /** The input type of the schema. */
    readonly input: Input;
    /** The output type of the schema. */
    readonly output: Output;
  }
  /** Infers the input type of a Standard Typed. */
  type InferInput<Schema extends StandardTypedV1> = NonNullable<Schema["~standard"]["types"]>["input"];
  /** Infers the output type of a Standard Typed. */
  type InferOutput<Schema extends StandardTypedV1> = NonNullable<Schema["~standard"]["types"]>["output"];
}
/** The Standard Schema interface. */
interface StandardSchemaV1<Input = unknown, Output = Input> {
  /** The Standard Schema properties. */
  readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}
declare namespace StandardSchemaV1 {
  /** The Standard Schema properties interface. */
  interface Props<Input = unknown, Output = Input> extends StandardTypedV1.Props<Input, Output> {
    /** Validates unknown input values. */
    readonly validate: (value: unknown, options?: StandardSchemaV1.Options | undefined) => Result<Output> | Promise<Result<Output>>;
  }
  /** The result interface of the validate function. */
  type Result<Output> = SuccessResult<Output> | FailureResult;
  /** The result interface if validation succeeds. */
  interface SuccessResult<Output> {
    /** The typed output value. */
    readonly value: Output;
    /** A falsy value for `issues` indicates success. */
    readonly issues?: undefined;
  }
  interface Options {
    /** Explicit support for additional vendor-specific parameters, if needed. */
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }
  /** The result interface if validation fails. */
  interface FailureResult {
    /** The issues of failed validation. */
    readonly issues: ReadonlyArray<Issue>;
  }
  /** The issue interface of the failure output. */
  interface Issue {
    /** The error message of the issue. */
    readonly message: string;
    /** The path of the issue, if any. */
    readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
  }
  /** The path segment interface of the issue. */
  interface PathSegment {
    /** The key representing a path segment. */
    readonly key: PropertyKey;
  }
  /** The Standard types interface. */
  interface Types<Input = unknown, Output = Input> extends StandardTypedV1.Types<Input, Output> {}
  /** Infers the input type of a Standard. */
  type InferInput<Schema extends StandardTypedV1> = StandardTypedV1.InferInput<Schema>;
  /** Infers the output type of a Standard. */
  type InferOutput<Schema extends StandardTypedV1> = StandardTypedV1.InferOutput<Schema>;
}
/** Ordered collection of disposable values with O(1) deletion by value. */
declare class DisposableList<T extends WeakKey> {
  private sn;
  private map;
  private weak;
  get length(): number;
  push(value: T): () => boolean;
  delete(value: T): boolean;
  clear(): T[];
  [Symbol.iterator](): MapIterator<T>;
}
/** Shared symbols used to avoid public property-name collisions. */
declare const symbols: {
  shadow: symbol;
  caller: symbol;
  receiver: symbol;
  original: symbol;
  metadata: symbol;
  initHooks: symbol;
  checkProto: symbol;
  effect: typeof Context.effect;
  filter: typeof Context.filter;
  isolate: typeof Context.isolate;
  intercept: typeof Context.intercept;
  init: typeof Service.init;
  check: typeof Service.check;
  config: typeof Service.config;
  invoke: typeof Service.invoke;
  extend: typeof Service.extend;
  tracker: typeof Service.tracker;
  resolveConfig: typeof Service.resolveConfig;
};
/**
 * Service dependency declaration accepted by plugins and the `@Inject`
 * decorator.
 *
 * Array form requests services without intercept config. Object form maps each
 * service name to optional intercept config for the plugin context.
 */
type Inject<M = Dict> = (keyof M)[] | { [K in keyof M]?: M[K]; };
/** Context keys that correspond to services with typed intercept config. */
type InjectKey = keyof { [K in keyof Context & string as Context[K] extends {
  [symbols.config]: any;
} ? K : never]: any; };
/**
 * Decorator for declaring service dependencies on classes or class methods.
 *
 * On classes it contributes to the plugin's static `inject` map. On methods it
 * delays the method call until the declared services are available.
 */
/**
 * @param name — the required service name.
 * @param config — optional intercept config applied for that service.
 * @returns the class or method decorator.
 */
declare function Inject<K extends InjectKey>(name: K, config?: Context[K] extends {
  [symbols.config]: infer T;
} ? T : never): (value: any, decorator: ClassDecoratorContext<any> | ClassMethodDecoratorContext<any>) => void;
/** Utilities for normalizing plugin dependency declarations. */
declare namespace Inject {
  /**
   * Convert array/object/class-inherited inject metadata into a plain map.
   *
   * @param inject — the declaration to normalize; `null`/`undefined` add nothing.
   * @param result — the map to fill (service name → intercept config or `null`).
   * @returns `result`.
   */
  function resolve(inject: Inject | null | undefined, result?: Dict): Dict;
}
/** Supported plugin entrypoint shapes. */
type Plugin<T = any> = Plugin.Function<T> | Plugin.Constructor<T> | Plugin.Object<T>;
/** Types associated with plugin entrypoints and runtime records. */
declare namespace Plugin {
  /** Shared metadata understood by the plugin registry and related tooling. */
  interface Base<T = any> {
    /** Display name used for fiber diagnostics and logger names. */
    name?: string;
    /** Standard-schema validator applied to config before the plugin starts. */
    Config?: StandardSchemaV1<any, T>;
    /** Services the plugin requires; it only loads while all are available. */
    inject?: Inject;
    /** Service name(s) the plugin provides (read by `Service` and by loaders). */
    provide?: string | string[];
    /** Service names whose intercept config the plugin declares it consumes. */
    intercept?: Dict<boolean>;
  }
  interface Transform<S, T> {
    /** Marks the transform object as a schema/config transform. */
    schema?: true;
    /** Convert user-facing config to runtime config. */
    Config: (config: S) => T;
  }
  /** Function plugin called with `(ctx, config)`. */
  interface Function<T = any> extends Base<T> {
    (ctx: Context, config: T): any;
  }
  /** Class plugin constructed with `(ctx, config)`. */
  interface Constructor<T = any> extends Base<T> {
    new (ctx: Context, config: T): any;
  }
  /** Object plugin with an `apply(ctx, config)` method. */
  interface Object<T = any> extends Base<T> {
    apply(ctx: Context, config: T): any;
  }
  /** Mutable registry record shared by all fibers of one plugin callback. */
  interface Runtime {
    /** Display name copied from the first registered plugin shape. */
    name?: string;
    /** Every live fiber of this plugin (one per `ctx.plugin()` call). */
    fibers: DisposableList<Fiber>;
    /** The executable entrypoint all fibers share (registry identity key). */
    callback: globalThis.Function;
    /** Standard-schema validator applied to each fiber's config. */
    Config?: StandardSchemaV1;
  }
}
type Spread<T> = undefined extends T ? [config?: T] : [config: T];
type GetPluginParameters<P> = P extends ((ctx: Context, ...args: infer R) => any) ? R : P extends (new (ctx: Context, ...args: infer R) => any) ? R : P extends {
  apply(ctx: Context, ...args: infer R): any;
} ? R : never;
type GetPluginConfig<P> = P extends Plugin.Transform<infer S, any> ? S : GetPluginParameters<P>[0];
declare module './context.ts' {
  interface Context {
    /**
     * Run a callback once the requested services are available.
     *
     * Shorthand for `ctx.plugin({ inject, apply: callback })`: the callback
     * is unloaded and re-run whenever a required service changes.
     *
     * @param deps — required services, as an array or a name → config map.
     * @param callback — plugin body called with `(ctx, config)`.
     * @returns the fiber; awaiting it settles once loading finished.
     */
    inject(deps: Inject, callback: Plugin.Function<void>): Fiber & PromiseLike<Fiber>;
    /**
     * Load a plugin in the current context.
     *
     * @param plugin — a function, class, or `{ apply }` object plugin.
     * @param args — the plugin config, validated against its `Config` schema.
     * @returns the fiber; awaiting it settles once loading finished
     * (rejecting on config or startup errors).
     */
    plugin<P extends Plugin>(plugin: P, ...args: Spread<GetPluginConfig<P>>): Fiber & PromiseLike<Fiber>;
  }
}
/**
 * Plugin registry installed as `ctx.registry` and mixed into every context.
 *
 * It normalizes plugin shapes, tracks plugin runtimes, starts fibers, and
 * exposes map-like inspection over active plugin callbacks.
 */
declare class RegistryService {
  ctx: Context;
  private _counter;
  private _internal;
  constructor(ctx: Context);
  /** Allocate the next fiber uid (increments on every read). */
  get counter(): number;
  /** Number of registered plugin runtimes. */
  get size(): number;
  /**
   * Resolve a supported plugin shape to its executable callback.
   *
   * @param plugin — a function, class, or `{ apply }` object plugin.
   * @returns the callback identifying the plugin, or `undefined` if invalid.
   */
  resolve(plugin: Plugin): Function | undefined;
  /**
   * Look up the runtime record for a plugin.
   *
   * @param plugin — any supported plugin shape.
   * @returns the runtime, or `undefined` when the plugin is not registered.
   */
  get(plugin: Plugin): Plugin.Runtime | undefined;
  /**
   * Check whether a plugin has a registered runtime.
   *
   * @param plugin — any supported plugin shape.
   * @returns `true` when at least one fiber of the plugin exists.
   */
  has(plugin: Plugin): boolean;
  /**
   * Dispose every running fiber for a plugin and remove its runtime record.
   *
   * @param plugin — any supported plugin shape.
   * @returns the removed runtime, or `undefined` when none was registered.
   */
  delete(plugin: Plugin): Plugin.Runtime | undefined;
  /** Iterate the registered plugin callbacks. */
  keys(): MapIterator<Function>;
  /** Iterate the registered plugin runtimes. */
  values(): MapIterator<Plugin.Runtime>;
  /** Iterate `[callback, runtime]` pairs. */
  entries(): MapIterator<[Function, Plugin.Runtime]>;
  /**
   * Visit every registered runtime.
   *
   * @param callback — receives each runtime and its identifying callback.
   */
  forEach(callback: (value: Plugin.Runtime, key: Function) => void): void;
  /**
   * Start a callback once the requested dependencies are available.
   *
   * @param inject — required services, as an array or a name → config map.
   * @param callback — plugin body called with `(ctx, config)`.
   * @returns the fiber; awaiting it settles once loading finished.
   */
  inject(inject: Inject, callback: Plugin.Function<void>): Fiber & PromiseLike<Fiber>;
  /**
   * Start a plugin in the current context and return its fiber.
   *
   * Creates (or reuses) the plugin's runtime record, then starts a new fiber
   * under the current context. Throws if `plugin` is not a supported shape or
   * if the current fiber is already disposed.
   *
   * @param plugin — a function, class, or `{ apply }` object plugin.
   * @param config — the plugin config, validated against its `Config` schema.
   * @param getOuterStack — captures the caller stack for effect diagnostics.
   * @returns the fiber; awaiting it settles once loading finished.
   */
  plugin(plugin: Plugin, config?: any, getOuterStack?: () => string[]): Fiber & PromiseLike<Fiber>;
}
declare module './context.ts' {
  interface Context {
    /**
     * Read a service from the store without the inject requirement.
     *
     * @param name — the service name.
     * @param strict — when `true` (default), only return implementations
     * whose providing fiber is currently active.
     * @returns the service value, or `undefined` when not (yet) provided.
     */
    get<K extends string & keyof this>(name: K, strict?: boolean): undefined | this[K];
    /** Same as above for service names outside the typed `Context` surface. */
    get(name: string, strict?: boolean): any;
    /**
     * Overwrite a provided service's value.
     *
     * Only the fiber that provided the service may set it; setting an
     * unprovided name throws.
     *
     * @param name — the service name.
     * @param value — the new service value.
     */
    set<K extends string & keyof this>(name: K, value: undefined | this[K]): void;
    /** Same as above for service names outside the typed `Context` surface. */
    set(name: string, value: any): void;
    /**
     * Register a service implementation owned by the current fiber.
     *
     * The service becomes visible to dependents in the same isolation scope
     * once the fiber is active; it is unregistered (waking dependents) when
     * the returned disposer runs or the fiber unloads. Throws if the name is
     * already provided in this scope or declared as an accessor.
     *
     * @param name — the service name.
     * @param value — the service value.
     * @returns a disposer that unregisters the service.
     */
    provide<K extends string & keyof this>(name: K, value: undefined | this[K]): () => void;
    /** Same as above for service names outside the typed `Context` surface. */
    provide(name: string, value?: any): () => void;
    /**
     * Define a computed context property backed by get/set hooks.
     *
     * The accessor is removed when the current fiber unloads. Throws if the
     * name is already declared.
     *
     * @param name — the context property name.
     * @param options — the `get` hook and optional `set` hook.
     */
    accessor(name: string, options: Omit<Property.Accessor, 'type'>): void;
    /**
     * Expose selected members of a service directly on `ctx`.
     *
     * Each mixed-in key becomes an accessor that forwards to the service
     * (binding methods to it), so e.g. `ctx.on` forwards to `ctx.events.on`.
     * Mixins are removed when the current fiber unloads.
     *
     * @param name — the context property holding the source service.
     * @param mixins — keys to forward, or a source-key → ctx-key map.
     */
    mixin<K extends string & keyof this>(name: K, mixins: (keyof this & keyof this[K])[] | Dict<string>): void;
    /** Same as above with a source object instead of a context property name. */
    mixin<T extends {}>(source: T, mixins: (keyof this & keyof T)[] | Dict<string>): void;
  }
}
/** Context property definition known by the reflection service. */
type Property = Property.Service | Property.Accessor;
/** Property definition variants understood by `ReflectService`. */
declare namespace Property {
  /** Service property backed by a provided implementation. */
  interface Service {
    /** Discriminator. */
    type: 'service';
  }
  /** Computed context property backed by custom get/set hooks. */
  interface Accessor {
    /** Discriminator. */
    type: 'accessor';
    /** Compute the property value; `error` carries the caller stack for diagnostics. */
    get: (this: Context, receiver: any, error: Error) => any;
    /** Optional setter; return `false` to reject the write. */
    set?: (this: Context, value: any, receiver: any, error: Error) => boolean;
  }
}
/** Concrete service implementation record stored in the root reflect service. */
interface Impl {
  /** Unique identity of this provision. */
  uid: number;
  /** The service name. */
  name: string;
  /** The providing context, including its service isolation. */
  ctx: Context;
  /** Fibers retaining this implementation until their teardown finishes. */
  dependents: Set<Fiber>;
  /** Wake a provision disposer after its final dependent unloads. */
  release?: () => void;
  /** The current service value. */
  value?: any;
  /** Optional availability predicate consulted before dependents may load. */
  check?: () => boolean;
  isolate: symbol;
}
/**
 * Reflection and service-resolution layer installed as `ctx.reflect`.
 *
 * This service powers the context proxy, service registration, accessors, and
 * the mixins that expose core service methods directly on `ctx`.
 */
declare class ReflectService {
  ctx: Context;
  /** Proxy traps implementing service resolution for every context object. */
  static handler: ProxyHandler<Context>;
  /** Service implementations, keyed by isolation label. */
  store: Dict<Impl, symbol>;
  /** Declared context properties (services and accessors), by name. */
  props: Dict<Property>;
  private _implCounter;
  constructor(ctx: Context);
  /**
   * Read a service from the store without the inject requirement.
   *
   * @param name — the service name.
   * @param strict — when `true`, only return implementations whose providing
   * fiber is currently active.
   * @returns the service value, or `undefined` when not (yet) provided.
   */
  get(name: string, strict?: boolean): any;
  _getImpl(name: string, strict?: boolean): Impl | undefined;
  /**
   * Overwrite a provided service's value.
   *
   * @param name — the service name.
   * @param value — the new service value.
   * @param error — carrier for the caller stack in diagnostics.
   * @returns `true` on success.
   * @throws when `name` was never provided, or was provided by another fiber.
   */
  set(name: string, value: any, error?: Error): boolean;
  /**
   * Register a service implementation owned by the current fiber.
   *
   * See the `ctx.provide()` overload above for the full contract.
   *
   * @param name — the service name.
   * @param value — the service value.
   * @param check — optional availability predicate for dependents.
   * @returns a disposer that unregisters the service.
   */
  provide(name: string, value?: any, check?: () => boolean): Disposable<Promise<void>>;
  /**
   * Re-evaluate every fiber that requires one of the given services.
   *
   * @param names — the service names that changed.
   * @param filter — restricts notification to matching isolation scopes.
   */
  notify(names: string[], filter?: (ctx: Context, name: string) => boolean): void;
  /**
   * Define a computed context property backed by get/set hooks.
   *
   * @param name — the context property name.
   * @param options — the `get` hook and optional `set` hook.
   * @returns a disposer that removes the accessor.
   */
  accessor(name: string, options: Omit<Property.Accessor, 'type'>): Disposable<Promise<void>>;
  /**
   * Expose selected members of a service directly on `ctx`.
   *
   * See the `ctx.mixin()` overload above for the full contract.
   *
   * @param source — a context property name or a source object.
   * @param mixins — keys to forward, or a source-key → ctx-key map.
   * @returns a disposer that removes all created accessors.
   */
  mixin(source: any, mixins: string[] | Dict<string>): Disposable<Promise<void>>;
  /**
   * Attach this context's tracing wrapper to a value.
   *
   * @param value — the value to wrap.
   * @returns the traceable wrapper (or the value itself when not applicable).
   */
  trace<T>(value: T): T;
  /**
   * Wrap a callback so calls trace `this` and arguments to this context.
   *
   * @param callback — the function to wrap.
   * @returns a proxy delegating to `callback` with traced values.
   */
  bind<T extends Function>(callback: T): T;
}
declare module './context.ts' {
  interface Context extends Pick<Fiber, 'effect'> {
    /** The fiber (plugin runtime instance) that owns this context. */
    fiber: Fiber;
  }
}
interface AsyncDisposable<T extends Awaitable<void> = Awaitable<void>> extends PromiseLike<() => T> {
  (): T;
}
/**
 * Function returned by an effect to release resources during disposal.
 *
 * Disposers run in reverse registration order when the owning fiber unloads;
 * they may be async, in which case unloading awaits them.
 */
type Disposable<T = any> = () => T;
/**
 * Effect body result accepted by `ctx.effect()` and plugin startup.
 *
 * Either a single disposer, a promise of one, or a (possibly async) iterable
 * yielding several — generator effects register each yielded disposer as it
 * is produced.
 */
type Effect<T = any> = SyncEffect<T> | AsyncEffect<T>;
type SyncEffect<T = any> = Disposable<T> | Iterable<Disposable<T>, void, void>;
type AsyncEffect<T = any> = Promise<Disposable<T>> | AsyncIterable<Disposable<T>, void, void>;
/** Tree node used to expose nested effect labels for diagnostics. */
interface EffectMeta {
  /** Human-readable effect label, e.g. `ctx.on("event")` or `ctx.provide("name")`. */
  label: string;
  /** Metadata of nested effects registered while this effect ran. */
  children: EffectMeta[];
}
/**
 * Lifecycle state for one plugin fiber.
 *
 * `PENDING` — waiting for required services; `LOADING` — the plugin callback
 * is running; `ACTIVE` — loaded and providing; `FAILED` — the callback or its
 * config threw; `UNLOADING` — disposers are running; `DISPOSED` — the fiber
 * was removed and cannot restart.
 */
declare const enum FiberState {
  PENDING = 0,
  LOADING = 1,
  ACTIVE = 2,
  FAILED = 3,
  DISPOSED = 4,
  UNLOADING = 5
}
/**
 * Runtime instance of one plugin application.
 *
 * A fiber tracks dependency state, raw and effective config, lifecycle effects, and
 * cleanup for the plugin context returned by `ctx.plugin()`.
 */
declare class Fiber {
  parent: Context;
  inject: Dict<any>;
  runtime: Plugin.Runtime | null;
  /** Unique id within the registry; 0 for the root fiber, `null` once disposed. */
  uid: number | null;
  /** The context this fiber's plugin runs in (extends the parent context). */
  readonly ctx: Context;
  /** Raw plugin input retained for the next activation. */
  config: any;
  /** Current lifecycle state; transitions emit `internal/status`. */
  state: FiberState;
  /** Dispose this fiber: unload the plugin, then settle once cleanup finished. */
  readonly dispose: () => Promise<void>;
  /** Required implementations retained through dependent teardown. */
  committed: Readonly<Dict<Impl>> | undefined;
  /** Service implementations owned by this fiber, including isolated provisions. */
  readonly provisions: Set<Impl>;
  /** The in-flight load/unload transition, if one is currently running. */
  inertia: Promise<void> | undefined;
  readonly _hooks: Dict<DisposableList<Function>>;
  readonly _disposables: DisposableList<Disposable<any>>;
  protected context: Context;
  private _error;
  private _revision;
  private _configRevision;
  private _effectiveConfig;
  private _runner;
  private _store;
  private _release;
  /**
   * Create a fiber. Plugin authors normally obtain fibers from `ctx.plugin()`
   * rather than constructing them directly.
   *
   * @param parent — the context the plugin was loaded from.
   * @param config — raw config, validated against the runtime's schema.
   * @param inject — resolved dependency map (service name → intercept config).
   * @param runtime — the shared plugin runtime, or `null` for the root fiber.
   * @param getOuterStack — captures the caller stack for effect diagnostics.
   */
  constructor(parent: Context, config: any, inject: Dict<any>, runtime: Plugin.Runtime | null, getOuterStack: () => string[]);
  /** The plugin's display name, inherited from the nearest named ancestor, else `'root'`. */
  get name(): string;
  /**
   * Throw if the fiber has already been disposed.
   *
   * @returns nothing when the fiber is still active.
   * @throws {CordisError} `INACTIVE_EFFECT` when the fiber's uid has been cleared.
   */
  assertActive(): void;
  private _execute;
  /**
   * Register a cleanup-aware effect on this fiber.
   *
   * `execute` runs immediately; the disposers it produces are collected and
   * run (in reverse order) either when the returned disposer is called or
   * when the fiber unloads, whichever comes first. Calling the disposer twice
   * is a no-op. Throws `CordisError('INACTIVE_EFFECT')` if the fiber is
   * already disposed, and `TypeError` if `execute` returns an invalid shape.
   *
   * @param execute — the effect body; see {@link Effect} for accepted shapes.
   * @param label — effect label shown in `getEffects()` diagnostics.
   * @returns a disposer that tears the effect down and settles once done.
   */
  effect(execute: () => SyncEffect, label?: string): Disposable<Promise<void>>;
  /** Same as above for async effects; the disposer is also awaitable. */
  effect(execute: () => Effect, label?: string): AsyncDisposable<Promise<void>>;
  /**
   * Return metadata for currently registered effects.
   *
   * @returns one {@link EffectMeta} tree per labeled live effect.
   */
  getEffects(): EffectMeta[];
  private _getState;
  private _updateState;
  _checkImpl(name: string): boolean | undefined;
  _refresh(): void;
  private _setEpoch;
  /** Raw input retained for the next activation, without evaluating expressions or validating it. */
  get rawConfig(): unknown;
  /** Retain raw input without changing the running config or triggering an update. */
  set rawConfig(config: unknown);
  /**
   * The object passed to plugin activation or the latest successful update that retained the instance.
   * Candidate resolution does not publish it; volatile updates retain its references.
   * Undefined before activation and readable after unload; callers requiring a live instance check `state`.
   */
  get effectiveConfig(): unknown;
  /**
   * Evaluate and validate a candidate using this fiber's `internal/config` hooks and runtime schema.
   * Does not publish the result, replace raw input, or commit running volatile references.
   * Required injections must be available when a hook uses them.
   * @param config Raw candidate input.
   * @returns The candidate's resolved config, retaining the schema's result identity.
   * @throws {ValidationError} when the runtime schema rejects the candidate; hook errors propagate.
   */
  resolveConfig(config: unknown): unknown;
  private _reload;
  private _unload;
  /**
   * Wait for current lifecycle work and rethrow startup errors.
   *
   * @returns this fiber, once it has settled into a stable state.
   * @throws the config-validation or plugin-startup error, if any.
   */
  await(): Promise<this>;
  /**
   * Dispose and immediately reload this plugin with its current config.
   *
   * @returns a promise resolving once the reload settled.
   * @throws {CordisError} `INACTIVE_EFFECT` when the fiber is already disposed.
   */
  restart(): Promise<void>;
  /**
   * Resolve a candidate, retain its raw config and apply it through the update waterfall.
   * @param config Raw config; pending fibers defer resolution until activation.
   * @param noSave Suppress the persistence notification when true.
   * @returns The awaited update/restart result, or undefined when a synchronous listener handles it.
   * @throws {ValidationError} when an active fiber's candidate is invalid.
   */
  update(config: any, noSave?: boolean): Awaitable<void>;
}
/** Extract the parameter tuple from a function type. */
type Parameters<F> = F extends ((...args: infer P) => any) ? P : never;
/** Extract the return type from a function type. */
type ReturnType$1<F> = F extends ((...args: any) => infer R) ? R : never;
/** Extract the explicit `this` type from a function type. */
type ThisType<F> = F extends ((this: infer T, ...args: any) => any) ? T : never;
/**
 * Event dispatch strategy used by the event service.
 *
 * `emit` runs synchronous listeners without awaiting them, `parallel` awaits
 * all listeners together, `serial` awaits them in order until one bails,
 * `bail` stops on the first synchronous bail value, and `waterfall` composes
 * listeners around a final `next` callback.
 */
type DispatchMode = 'emit' | 'parallel' | 'serial' | 'bail' | 'waterfall';
declare module './context.ts' {
  interface Context {
    /**
     * Dispatch an event, running all listeners concurrently.
     *
     * @param name — the event name.
     * @param args — arguments passed to every listener.
     * @returns a promise resolving once every listener has settled.
     */
    parallel<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): Promise<void>;
    /** Same as above, with an explicit `this` for listeners (also used for filtering). */
    parallel<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): Promise<void>;
    /**
     * Dispatch an event synchronously, ignoring listener return values.
     *
     * @param name — the event name.
     * @param args — arguments passed to every listener.
     */
    emit<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): void;
    /** Same as above, with an explicit `this` for listeners (also used for filtering). */
    emit<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): void;
    /**
     * Dispatch an event, awaiting listeners in order until one bails.
     *
     * @param name — the event name.
     * @param args — arguments passed to each listener.
     * @returns the first bail value (non-null, non-false, non-undefined), if any.
     */
    serial<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): Promisify<ReturnType$1<Events[K]>>;
    /** Same as above, with an explicit `this` for listeners (also used for filtering). */
    serial<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): Promisify<ReturnType$1<Events[K]>>;
    /**
     * Dispatch an event, calling listeners in order until one bails.
     *
     * @param name — the event name.
     * @param args — arguments passed to each listener.
     * @returns the first bail value (non-null, non-false, non-undefined), if any.
     */
    bail<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): ReturnType$1<Events[K]>;
    /** Same as above, with an explicit `this` for listeners (also used for filtering). */
    bail<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): ReturnType$1<Events[K]>;
    /**
     * Dispatch an event whose last argument is a `next` continuation.
     *
     * Each listener wraps the rest of the chain: calling `next()` invokes the
     * next listener (finally the built-in behavior); not calling it vetoes.
     *
     * @param name — the event name.
     * @param args — listener arguments; the final one is the innermost `next`.
     * @returns the outermost listener's return value.
     */
    waterfall<K extends keyof Events>(name: K, ...args: Parameters<Events[K]>): ReturnType$1<Events[K]>;
    /** Same as above, with an explicit `this` for listeners (also used for filtering). */
    waterfall<K extends keyof Events>(thisArg: NoInfer<ThisType<Events[K]>>, name: K, ...args: Parameters<Events[K]>): ReturnType$1<Events[K]>;
    /**
     * Register an event listener owned by the current fiber.
     *
     * @param name — the event name to listen for.
     * @param listener — called with the dispatch arguments.
     * @param options — listener options; a boolean is shorthand for `prepend`.
     * @returns a disposer removing the listener; `true` if it was still registered.
     */
    on<K extends keyof Events>(name: K, listener: Events[K], options?: boolean | EventOptions): () => boolean;
    /**
     * Same as `on()`, but the listener disposes itself after its first call.
     *
     * @param name — the event name to listen for.
     * @param listener — called at most once with the dispatch arguments.
     * @param options — listener options; a boolean is shorthand for `prepend`.
     * @returns a disposer removing the listener; `true` if it was still registered.
     */
    once<K extends keyof Events>(name: K, listener: Events[K], options?: boolean | EventOptions): () => boolean;
  }
}
/** Options accepted by `ctx.on()` and `ctx.once()`. */
interface EventOptions {
  /** Add the listener before existing listeners for the same event. */
  prepend?: boolean;
  /** Receive the event regardless of context filter checks. */
  global?: boolean;
}
/** Registered listener record stored by the event service. */
interface Hook extends EventOptions {
  ctx: Context;
  callback: (...args: any[]) => any;
}
/**
 * Event bus installed as `ctx.events` and mixed into every context.
 *
 * The service supports concurrent, synchronous, serial, bail, and waterfall
 * dispatch and automatically disposes listeners with their owning fiber.
 */
declare class EventsService {
  private ctx;
  _hooks: Record<keyof any, Hook[]>;
  constructor(ctx: Context);
  private _resolve;
  /**
   * Resolve bound callbacks using the event's context filter.
   * @param type Dispatch mode reported to observers.
   * @param args Dispatch arguments, consumed through the event name.
   * @returns Matching callbacks bound to the dispatch receiver.
   * DSH retains callback enumeration for per-listener error containment.
   */
  dispatch(type: string, args: any[]): ((...args: any[]) => any)[];
  /**
   * Run listeners concurrently and wait for all of them.
   *
   * @param args — optional `this`, the event name, then listener arguments.
   * @returns a promise resolving once every listener has settled.
   */
  parallel(...args: any[]): Promise<void>;
  /**
   * Run listeners synchronously without waiting for returned promises.
   *
   * @param args — optional `this`, the event name, then listener arguments.
   */
  emit(...args: any[]): void;
  /**
   * Run listeners in order, awaiting each, until one returns a bail value.
   *
   * @param args — optional `this`, the event name, then listener arguments.
   * @returns the first bail value (see {@link isBailed}), if any.
   */
  serial(...args: any[]): Promise<any>;
  /**
   * Run listeners synchronously until one returns a bail value.
   *
   * @param args — optional `this`, the event name, then listener arguments.
   * @returns the first bail value (see {@link isBailed}), if any.
   */
  bail(...args: any[]): any;
  /**
   * Compose listeners around the final `next` callback.
   *
   * The last dispatch argument is treated as the innermost `next`. Listeners
   * run outermost-first; a listener that does not call `next()` vetoes the
   * rest of the chain, including the built-in behavior.
   *
   * @param args — optional `this`, the event name, listener arguments, then `next`.
   * @returns the outermost listener's return value.
   */
  waterfall(...args: any[]): any;
  private register;
  private unregister;
  /**
   * Register an event listener owned by the current fiber.
   *
   * The listener is removed automatically when the fiber unloads. Throws
   * `CordisError('INACTIVE_EFFECT')` if the fiber is already disposed.
   *
   * @param name — the event name to listen for.
   * @param listener — called with the dispatch arguments.
   * @param options — listener options; a boolean is shorthand for `prepend`.
   * @returns a disposer removing the listener; `true` if it was still registered.
   */
  on(name: string | symbol, listener: (...args: any) => any, options?: boolean | EventOptions): any;
  /**
   * Register an event listener that disposes itself after the first call.
   *
   * @param name — the event name to listen for.
   * @param listener — called at most once with the dispatch arguments.
   * @param options — listener options; a boolean is shorthand for `prepend`.
   * @returns a disposer removing the listener; `true` if it was still registered.
   */
  once(name: string | symbol, listener: (...args: any) => any, options?: boolean | EventOptions): any;
}
/**
 * Built-in framework events used by core services and extension points.
 *
 * Plugin and status events track fiber lifecycle, service events observe
 * dependency registration, update/get/set/listener events allow core services
 * to intercept runtime operations, and `internal/dispatch` exposes event-bus
 * diagnostics before public events are delivered.
 */
interface Events {
  [key: symbol]: (...args: any[]) => any;
  /** A plugin fiber was created or its uid was cleared on disposal. */
  'internal/plugin'(fiber: Fiber): void;
  /** A fiber changed lifecycle state; receives the fiber and its previous state. */
  'internal/status'(fiber: Fiber, oldValue: FiberState): void;
  /** A service binding was refreshed in the matching isolation scope. */
  'internal/service'(this: Context, name: string, value: any): void;
  /**
   * Apply resolved config; omitting `next()` keeps the current instance.
   * @param resolvedConfig - the evaluated and validated candidate.
   * @param next - restarts the fiber and waits for its lifecycle work.
   * @mode waterfall
   */
  'internal/update'(this: Fiber, resolvedConfig: any, next: () => Awaitable<void>): Awaitable<void>;
  /**
   * Persist original config from a programmatic update, before its lifecycle transition.
   * @param fiber - the updated fiber.
   * @param originalConfig - the raw candidate; omitted when update uses noSave.
   * @mode emit
   */
  'internal/commit'(fiber: Fiber, originalConfig: any): void;
  /**
   * Resolve plugin config after injections are active; candidate resolution does not publish it.
   * @param fiber - the fiber whose candidate is being resolved.
   * @param next - obtains the raw candidate from inner listeners.
   * @mode waterfall
   */
  'internal/config'(fiber: Fiber, next: () => any): any;
  /** Waterfall: a service is being read through the context proxy. */
  'internal/get'(ctx: Context, name: string, error: Error, next: () => any): any;
  /** Waterfall: a service is being written through the context proxy. */
  'internal/set'(ctx: Context, name: string, value: any, error: Error, next: () => boolean): boolean;
  /** Bail: a listener is being registered; a non-null result replaces registration. */
  'internal/listener'(this: Context, name: string, listener: any, prepend: boolean): void;
  /** An event is being dispatched to listeners (fired for non-internal events only). */
  'internal/dispatch'(mode: DispatchMode, name: string | symbol, args: any[], thisArg: any): void;
}
declare module './context.ts' {
  interface Intercept {
    logger: LoggerService.Intercept;
  }
}
/** Logger method name and severity category. */
type LoggerType = 'error' | 'info' | 'warn' | 'debug';
/** Callable shape for one logger severity method. */
type LoggerMethod = (format: any, ...param: any[]) => void;
/** Formatter used to resolve a printf-style placeholder. */
type Formatter = (value: any, exporter: Exporter, message: Message) => any;
/** Structured log record delivered to exporters. */
interface Message {
  sn: number;
  ts: number;
  name: string;
  type: LoggerType;
  level: number;
  args: any[];
  fiber?: WeakRef<Fiber>;
}
/** Sink that receives structured log messages. */
interface Exporter {
  colors?: number | false;
  maxLength?: number;
  levels?: Record<string, number>;
  formatters?: Record<string, Formatter>;
  export(message: Message): void;
}
/** Options used when creating a named logger facade. */
interface LoggerOptions {
  /** The logger name shown with each message. */
  name: string;
  /** Message fields merged into every record from this logger. */
  meta?: Partial<Message>;
  /** Default maximum level exported when an exporter has no own threshold. */
  level?: number;
}
/** Logger facade identity, inherited message metadata, and optional minimum level. */
interface Logger extends LoggerOptions {}
/** Logger facade severity methods. */
interface Logger extends Record<LoggerType, LoggerMethod> {}
/** Logger facade for one named subsystem. */
declare class Logger {
  private service;
  static color(exporter: Exporter, code: number, value: any, decoration?: string): string;
  static code(name: string, level?: false | number): number;
  static format(exporter: Exporter, message: Message): string;
  constructor(options: LoggerOptions, service: LoggerService);
  private _method;
}
/** Logger service configuration merged from context intercepts. */
declare namespace LoggerService {
  interface Intercept {
    name?: string;
    level?: number;
  }
}
/** Callable `ctx.logger` service shape. */
interface LoggerService extends Record<LoggerType, LoggerMethod> {
  (name?: string): Logger;
}
/**
 * Built-in logging service.
 *
 * Call `ctx.logger()` to create a named logger, or call `ctx.logger.info()`
 * directly to log with the current fiber-derived name.
 */
declare class LoggerService {
  bufferSize: number;
  buffer: Message[];
  ctx: Context;
  _snMessage: number;
  _snExporter: number;
  exporters: Map<number, Exporter>;
  constructor(ctx: Context);
  /**
   * Register an exporter and dispose it with the current fiber.
   *
   * @param exporter — the sink that receives structured log messages.
   * @returns a disposer that removes the exporter.
   */
  exporter(exporter: Exporter): Disposable<Promise<void>>;
  private _resolveConfig;
  [symbols.invoke](name?: string): Logger;
}
/**
 * Public shape of a Cordis context.
 *
 * The concrete `Context` class is proxied at runtime, so this interface is
 * augmented by core services and plugins to describe the properties that may
 * be read from `ctx`.
 */
interface Context {
  /** Isolation map: service name → scope label. Lookups for a name resolve within its label. */
  [symbols.isolate]: Dict<symbol>;
  /** Intercept map: service name → config merged into that service's per-plugin config. */
  [symbols.intercept]: Dict;
  /** The root context of the application (every child context shares it). @experimental */
  root: this;
  /** Base URL used to resolve relative plugin/module specifiers, if the runtime sets one. */
  baseUrl?: string | undefined;
  /** The event bus. Its methods are also mixed onto `ctx` (`ctx.on`, `ctx.emit`, ...). */
  events: EventsService;
  /** The logging service. Call `ctx.logger(name)` for a named logger. */
  logger: LoggerService;
  /** The reflection layer backing the context proxy (`ctx.get`, `ctx.provide`, ...). */
  reflect: ReflectService;
  /** The plugin registry. Its methods are mixed onto `ctx` (`ctx.plugin`, `ctx.inject`). */
  registry: RegistryService;
}
/**
 * Root and child dependency containers for Cordis plugins.
 *
 * A context is a proxy: normal property reads go through the service resolver,
 * while `extend()`, `isolate()`, and `intercept()` create scoped child
 * contexts without mutating their parent.
 */
declare class Context {
  /** Symbol key under which a disposer exposes its {@link EffectMeta} diagnostics tree. */
  static readonly effect: unique symbol;
  /** Symbol key for a context's listener filter, consulted on every event dispatch. */
  static readonly filter: unique symbol;
  /** Symbol key of the isolation map (see the `Context[symbols.isolate]` property). */
  static readonly isolate: unique symbol;
  /** Symbol key of the intercept map (see the `Context[symbols.intercept]` property). */
  static readonly intercept: unique symbol;
  /**
   * Returns true for Cordis context proxies and context prototypes.
   *
   * Works across realms and across multiple copies of cordis, because the
   * brand is keyed by a global symbol rather than by `instanceof`.
   *
   * @param value — the value to test.
   * @returns `true` if `value` is a Cordis context, narrowing its type.
   */
  static is(value: any): value is Context;
  /** Create the root context and install the built-in services. */
  constructor();
  /**
   * Create a child context with extra metadata on top of the current scope.
   *
   * The child prototypally inherits every property of this context; own
   * properties of `meta` shadow the inherited ones. The parent is not mutated.
   *
   * @param meta — own properties (including symbol keys) to define on the child.
   * @returns a child context inheriting from this one.
   */
  extend(meta?: {}): this;
  /**
   * Create a child context with an independent service scope for `name`.
   *
   * Below the returned context, reads and writes of the service `name`
   * resolve against the new label instead of the parent's, so a different
   * implementation can be provided without affecting the parent scope.
   * Passing the same `label` to two `isolate()` calls joins their scopes.
   *
   * @param name — the service name to isolate.
   * @param label — scope label to join; defaults to a fresh unique symbol.
   * @returns a child context whose `name` service resolves in the new scope.
   */
  isolate(name: string, label?: symbol): this;
  /**
   * Add service-specific intercept config for plugins started below this
   * context.
   *
   * Plugins loaded under the returned context see `config` merged into the
   * service's resolved config (ancestor entries first; see
   * `Service[symbols.resolveConfig]`). The parent context is not affected.
   *
   * @param name — the service name whose config to intercept.
   * @param config — the intercept config to merge for that service.
   * @returns a child context carrying the additional intercept entry.
   */
  intercept<K extends InjectKey>(name: K, config: Context[K] extends {
    [symbols.config]: infer T;
  } ? T : never): this;
  intercept(name: string, config: any): this;
}
/**
 * Base class for services that expose a named API on `ctx`.
 *
 * Subclasses call `super(ctx, name)` from their constructor. The service is
 * registered immediately and is automatically removed with the owning fiber.
 */
declare abstract class Service<out T = never> {
  protected ctx: Context;
  /** Symbol key of an instance method run after construction (class plugins). */
  static readonly init: unique symbol;
  /** Symbol key of the availability predicate passed to `ctx.provide()`. */
  static readonly check: unique symbol;
  /** Symbol key of the phantom intercept-config type parameter. */
  static readonly config: unique symbol;
  /** Symbol key of the call body making a service callable (e.g. `ctx.logger()`). */
  static readonly invoke: unique symbol;
  /** Symbol key of the helper deriving an extended service instance. */
  static readonly extend: unique symbol;
  /** Symbol key of the tracker metadata used for context tracing. */
  static readonly tracker: unique symbol;
  /** Symbol key of the intercept-config resolution helper below. */
  static readonly resolveConfig: unique symbol;
  [symbols.config]: T;
  /** The service name this instance is registered under. */
  name: string;
  /**
   * Register this instance as `name` in the current context.
   *
   * Calls `ctx.reflect.provide(name, this, this[Service.check])`, so the
   * service is unregistered automatically when the owning fiber unloads.
   * Services with a `[Service.invoke]` body return a callable instance.
   *
   * @param ctx — the context to register in (stored as `this.ctx`).
   * @param name — the service name; defaults to the static `provide` field.
   */
  constructor(ctx: Context, name: string);
  protected [symbols.filter](ctx: Context): boolean;
  protected [symbols.extend](props?: any): any;
  /**
   * Merge intercept config from ancestors with optional base and head values.
   *
   * Entries added closer to the root apply first; `base` is prepended and
   * `head` appended. Uses `Config.merge` when the service declares one,
   * otherwise a shallow `Object.assign`.
   *
   * @param base — lowest-precedence config merged before all intercepts.
   * @param head — highest-precedence config merged after all intercepts.
   * @returns the merged config.
   */
  [symbols.resolveConfig](base?: T, head?: T): T;
  static [Symbol.hasInstance](instance: any): boolean;
}
/** The slot runtime is bundled by DSH; its former standalone package is retired. */
type ClientContext = Context & {
  slots: Pick<SlotCore, 'register' | 'spec'> & {
    inject(key: string, callback: () => (() => void) | Iterable<() => void>): () => void;
  };
};
/** 本插件 Client 半的注入业务面：每个 settings.section 注册项都拿到同一个 api 实例 */
interface ConfigManagerSectionInjected {
  api: ConfigManagerApi;
  /** 远程同步 API（备份与迁移页第 4 个 tab 使用，主 section 注册时注入） */
  syncApi: SyncApi;
  /** 远程同步 locale（config-manager-sync 命名空间，主 section 注册时注入） */
  syncT: import('@deepseek-ai/dsh-client-ui-slots').TranslateNS<'config-manager-sync'>;
  /** 配置市场 API（备份与迁移页第 5 个 tab 使用，主 section 注册时注入） */
  marketApi: MarketApi;
  /** 「我的配置」API（MarketPanel 的「我的配置」子视图使用，主 section 注册时注入） */
  myConfigsApi: MyConfigsApi;
  /** 配置市场 locale（config-manager-market 命名空间，主 section 注册时注入） */
  marketT: import('@deepseek-ai/dsh-client-ui-slots').TranslateNS<'config-manager-market'>;
  /** Recovery API（Phase 5：引导式恢复工作流；主 section 注册时注入） */
  recoveryApi: RecoveryApi;
  /** Recovery locale（config-manager-recovery 命名空间，主 section 注册时注入） */
  recoveryT: import('@deepseek-ai/dsh-client-ui-slots').TranslateNS<'config-manager-recovery'>;
  /** Migration History API（Phase 6：统一审计史；主 section 注册时注入） */
  historyApi: HistoryApi;
  /** 事故恢复 API（崩溃归因 + 救援模式；主 section 注册时注入，RecoveryPanel 消费） */
  incidentApi: IncidentApi;
  /** Migration History locale（config-manager-history 命名空间，主 section 注册时注入） */
  historyT: import('@deepseek-ai/dsh-client-ui-slots').TranslateNS<'config-manager-history'>;
  /**
   * 客户端展示层翻译器（`src/ui/i18n.ts` 的 UiT）：行内/报告类文案用它，设置页文案用 t。
   * **两本字典键域不同**，同名键（如 library.title）在两边各写一次不算重复。
   */
  uiT: UiT;
}
declare const zh$4: {
  readonly 'section.label': '备份与迁移';
  readonly 'section.description': '导出 / 导入 / 迁移 DSH 配置（备份不含密钥，加密备份可选）';
  readonly 'section.settings': '设置';
  readonly 'section.ui': 'UI 偏好';
  readonly 'section.providers': 'Provider 与模型';
  readonly 'section.plugins': '插件清单';
  readonly 'section.mcp': 'MCP 服务器';
  readonly 'section.prompts': '提示词';
  readonly 'section.skills': '技能';
  readonly 'section.agentPresets': 'Agent 预设';
  readonly 'section.agentInstructions': '全局指令';
  readonly 'section.workspaces': '工作区';
  readonly 'section.pluginFiles': '插件散落配置';
  readonly 'section.credentialsStatus': '凭据状态';
  readonly 'section.secrets': '密钥';
  readonly 'section.sessions': '历史会话';
  readonly 'section.self': '配置管理器设置';
  readonly 'section.pluginData': '插件数据目录';
  readonly 'section.pluginAssets': '插件大文件';
  readonly 'view.about': '关于';
  readonly 'about.snippet.environment': '### 环境 / Environment';
  readonly 'about.releaseNotes.rateLimited': 'GitHub API 速率限制（Rate limit exceeded），请稍后再试或直接在 GitHub 上查看。';
  readonly 'about.releaseNotes.fetchFailed': 'GitHub API 请求失败 ({status} {statusText})';
  readonly 'about.releaseNotes.timeout': 'GitHub API 请求超时（{seconds} 秒无响应），请检查网络或代理后重试。';
  readonly 'about.snippet.plugin': '- 插件版本 / Plugin: {version}';
  readonly 'about.snippet.dsh': '- DSH 版本 / DSH: {version}';
  readonly 'about.snippet.platform': '- 平台 / Platform: {platform}';
  readonly 'about.snippet.pluginDir': '- 插件清单目录 / Plugin dir: {dir}';
  readonly 'common.close': '关闭';
  readonly 'common.cancel': '取消';
  readonly 'common.labelSeparator': '：';
  readonly 'common.back': '上一步';
  readonly 'common.next': '下一步';
  readonly 'common.retry': '重试';
  readonly 'common.saveFailed': '浏览器存储写入失败：当前进度仍在本页内存中，刷新会丢失';
  readonly 'common.loading': '加载中…';
  readonly 'common.unknownError': '未知错误';
  readonly 'common.parens': '（{text}）';
  readonly 'about.cli.help': '列出全部 CLI 命令与用法（离线可用）';
  readonly 'about.cli.snapshots': '列出本机回滚快照（无需 DSH 运行）';
  readonly 'about.cli.restore': '恢复到导入前状态（离线）';
  readonly 'about.cli.reinstall': '一键重装 DSH（救援）';
  readonly 'common.listSeparator': '、';
  readonly 'toast.copied': '已复制到剪贴板';
  readonly 'toast.copyFailed': '复制失败，请手动选择文本复制';
  readonly 'overview.health.ok': '配置状态良好';
  readonly 'overview.health.noBackup': '尚无任何备份';
  readonly 'overview.health.scheduleFailed': '上次定时备份失败，建议检查备份设置';
  readonly 'overview.health.recovery': '存在未解决的恢复事项，需要处理';
  readonly 'overview.health.autoBackupOff': '自动备份已关闭，目前只有手动备份';
  readonly 'overview.health.recoveryAction': '前往「事故恢复」处理';
  readonly 'overview.metric.backups': '备份文件';
  readonly 'overview.metric.snapshots': '安全快照';
  readonly 'overview.metric.schedule': '定时备份';
  readonly 'overview.metric.sync': '远程同步';
  readonly 'overview.state.on': '开启';
  readonly 'overview.state.off': '关闭';
  readonly 'overview.meta.lastBackup': '最近：{time}';
  readonly 'overview.meta.noBackup': '尚无记录';
  readonly 'overview.meta.scheduleOn': '已开启 · 上次 {time}';
  readonly 'overview.meta.scheduleOff': '未开启（建议开启自动保护）';
  readonly 'overview.meta.scheduleFail': '上次备份失败';
  readonly 'overview.meta.syncOn': '已配置 · 上次 {time}';
  readonly 'overview.meta.syncOff': '未配置';
  readonly 'overview.meta.syncUnavailable': '读取超时';
  readonly 'overview.meta.never': '从未运行';
  readonly 'overview.time.now': '刚刚';
  readonly 'overview.time.min': '{n} 分钟前';
  readonly 'overview.time.hour': '{n} 小时前';
  readonly 'overview.time.day': '{n} 天前';
  readonly 'overview.quick.backup': '立即备份';
  readonly 'overview.quick.backupDone': '备份完成';
  readonly 'overview.quick.backupSkippedDisabled': '已跳过：定时备份未启用（没有生成任何备份文件）';
  readonly 'overview.quick.backupSkippedRunning': '已跳过：上一次备份仍在进行中';
  readonly 'overview.quick.backupSkippedConflict': '已跳过：另一项任务正在执行（防重）';
  readonly 'overview.quick.backupSkippedLocked': '已跳过：另一个任务正在使用环境锁，稍后重试即可';
  readonly 'overview.quick.backupSkippedLockStale': '已跳过：存在残留环境锁（上次任务异常退出留下，重试与重启都不会自愈）——请到「事故恢复」回收';
  readonly 'overview.quick.backupSkippedLockUnavailable': '已跳过：环境锁暂时不可用（锁目录读写失败或状态未知），请稍后重试并查看宿主日志';
  readonly 'overview.quick.backupSkippedSafeMode': '已跳过：插件处于 SAFE MODE（外部操作失败后自动阻断写入）——请到「事故恢复」处理后重试';
  readonly 'overview.quick.backupSkippedOther': '已跳过：备份服务当前无法执行（详情见宿主日志）';
  readonly 'overview.quick.backupFailed': '备份失败：{message}';
  readonly 'overview.activity.title': '最近活动';
  readonly 'overview.activity.colTime': '时间';
  readonly 'overview.activity.colEvent': '动作';
  readonly 'overview.activity.colDetail': '详情';
  readonly 'overview.activity.colResult': '结果';
  readonly 'overview.activity.empty': '暂无操作记录';
  readonly 'overview.activity.openMerge': '有冲突分区等你裁决：点这一行到同步页处理';
  readonly 'overview.activity.unavailable': '活动记录读取失败（这不是「没有记录」）';
  readonly 'overview.loadFailed': '有 {count} 项数据读取失败：{message} —— 下面的指标可能不完整';
  readonly 'overview.accessMode.title': '当前访问方式不被允许读取本机数据。';
  readonly 'overview.accessMode.origin': '页面地址：{origin}。';
  readonly 'overview.accessMode.hint': '面板只接受本机回环访问，或宿主已信任的地址与已登录会话。改法：用 ssh -L 3080:127.0.0.1:3080 隧道后从 localhost 打开；或以 dsh web --host 127.0.0.1 启动后在本机访问；若本就在可信地址上，重新打开 dsh web 打印的访问链接（会话可能已过期）。';
  readonly 'overview.empty.title': '开始保护你的配置';
  readonly 'overview.empty.step1': '创建第一份备份';
  readonly 'overview.empty.step2': '导出 ZIP 带走';
  readonly 'overview.empty.step3': '新机器导入回来';
  readonly 'overview.kind.import': '导入';
  readonly 'overview.kind.restore': '恢复';
  readonly 'overview.kind.rollback': '回滚';
  readonly 'overview.kind.profile-create': '新建档案';
  readonly 'overview.kind.profile-select': '设置下次启动档案';
  readonly 'overview.kind.profile-switch': '切换配置档案';
  readonly 'overview.kind.profile-delete': '删除配置档案';
  readonly 'overview.kind.profile-rename': '重命名配置档案';
  readonly 'overview.kind.profile-save': '保存配置档案';
  readonly 'overview.kind.profile-import': '导入配置档案';
  readonly 'overview.kind.sync-apply': '同步应用';
  readonly 'overview.kind.autosync': '自动同步';
  readonly 'overview.kind.recovery': '恢复事项';
  readonly 'overview.kind.backup': '定时备份';
  readonly 'overview.kind.backup-manual': '手动备份';
  readonly 'overview.kind.snapshot-delete': '删除快照';
  readonly 'overview.kind.snapshot-prune': '清理快照';
  readonly 'overview.kind.other': '其他操作';
  readonly 'export.encrypt': '加密备份';
  readonly 'export.encryptHint': '用密码加密整个备份文件（AES-256-GCM）。密码仅用于本次加密，不会写入备份或任何配置文件；导入时必须输入该密码才能解锁。';
  readonly 'export.password': '备份加密密码';
  readonly 'export.passwordConfirm': '确认密码';
  readonly 'export.passwordMismatch': '两次输入的密码不一致';
  readonly 'export.passwordRequired': '加密备份必须设置密码';
  readonly 'export.includeSecrets': '导出密钥';
  readonly 'export.includeSecretsHint': '把真实密钥（凭据值）写入备份。密钥必须以加密形式保存：勾选时会自动选中「加密备份」；取消「加密备份」会同时取消「导出密钥」。';
  readonly 'export.run': '开始导出';
  readonly 'export.download': '下载备份文件';
  readonly 'export.saved': '已保存到下载目录：{name}';
  readonly 'export.selectionWarnings': '以下分区为设备相关数据，跨设备导入时可能不适用：';
  readonly 'export.fileName': '自定义文件名';
  readonly 'export.fileNameHint': '留空自动命名（dsh-config-<日期>.zip）；无需手动输入 .zip 后缀，保存时自动补全。仅允许字母数字、空格、- _ .。';
  readonly 'export.fileNameInvalid': '文件名不合法：仅允许字母数字、空格、- _ .，不能包含路径分隔符。';
  readonly 'export.note': '备注';
  readonly 'export.notePlaceholder': '例如：迁移前的完整备份 / 2026-08 存档';
  readonly 'export.compositionTitle': '本次将导出';
  readonly 'export.compositionPartial': '将导出 {sections} 个分区 · 已读取 {units} 个条目 · 约 {size}（含未读取分区，实际不少于该值）';
  readonly 'export.compositionEmpty': '没有勾选任何可导出的内容';
  readonly 'picker.title': '选择要导出的内容';
  readonly 'picker.search': '搜索分区或条目…';
  readonly 'picker.selectAll': '全选';
  readonly 'picker.selectNone': '全不选';
  readonly 'picker.expand': '展开';
  readonly 'picker.collapse': '收起';
  readonly 'picker.partial': '部分';
  readonly 'picker.blankSession': '新会话';
  readonly 'picker.highRisk': '高风险';
  readonly 'picker.highRiskHint': '该分区来自公共仓库、未经官方审核：勾选后会在本机安装插件 / 写入文件 / 注入全局指令。导入前会创建可回滚快照，风险由你确认。';
  readonly 'picker.locked': '捆绑';
  readonly 'picker.lockedHint': '与同组条目必须一起导出（例如 pnpm patch 声明与其补丁文件），取消任一都会整组取消。';
  readonly 'picker.selectedOf': '已选 {selected}/{total}';
  readonly 'picker.fileCount': '{count} 个文件';
  readonly 'picker.summary': '将导出 {sections} 个分区 · {units} 个条目 · 约 {size}';
  readonly 'picker.loading': '正在读取可导出的条目…';
  readonly 'picker.loadingItems': '正在读取条目…';
  readonly 'picker.loadingSection': '读取中…';
  readonly 'picker.empty': '没有匹配的分区或条目';
  readonly 'picker.unitsUnavailable': '部分分区的条目清单读取失败，这些分区将整体导出。';
  readonly 'picker.sectionLoadFailed': '读取失败 · 将整体导出';
  readonly 'picker.deviceSpecific': '设备相关';
  readonly 'picker.sensitive': '敏感';
  readonly 'picker.showAll': '显示全部（共 {count} 条）';
  readonly 'picker.summaryImport': '{sections} 个分区 · {units} 个条目';
  readonly 'picker.pluginRoot': '插件';
  readonly 'picker.pluginLeafPlugin': '插件清单条目';
  readonly 'picker.pluginLeafConfig': '数据目录（配置）';
  readonly 'picker.pluginLeafAssets': '大文件（壁纸 / 数据库）';
  readonly 'picker.pluginAreaUnread': '未读取';
  readonly 'picker.pluginAreaAbsent': '无内容';
  readonly 'picker.bucketPlugins': '插件分区的其他条目（补丁行 / pnpm-workspace.yaml）';
  readonly 'picker.bucketLooseFiles': '未归属到插件的配置（~/.dsh 根）';
  readonly 'picker.groupHint.extensions': '只列出能证明归属的条目：某个插件不在这里，不代表本机没有它的配置。';
  readonly 'group.general': '通用';
  readonly 'group.ai': 'AI';
  readonly 'group.extensions': '插件与扩展';
  readonly 'group.mcp': 'MCP / 工具';
  readonly 'group.customization': '定制';
  readonly 'group.automation': '自动化';
  readonly 'group.workspace': '工作区';
  readonly 'group.ui': '界面';
  readonly 'group.optional': '可选数据';
  readonly 'import.nothingSelected': '未勾选任何内容';
  readonly 'import.excludedByUser': '取消勾选 {count} 项（未导入、未入快照）';
  readonly 'import.consult.hint': '只读分析：先看结论与依据，确认后再选择要导入的内容。';
  readonly 'consult.title': '迁移前咨询';
  readonly 'library.pullTitle': '拉取远端快照';
  readonly 'library.pulling': '正在拉取并导入…';
  readonly 'library.downloadTitle': '下载远端快照';
  readonly 'library.downloading': '正在拉取并下载…';
  readonly 'library.pullBadge': '同步中';
  readonly 'import.consult.unavailable': '暂时无法生成咨询报告（不影响继续导入）。';
  readonly 'import.picker.title': '选择要导入的内容';
  readonly 'import.picker.hint': '不勾选的条目不会被导入、也不会进快照；随时可以回到这一步修改。';
  readonly 'import.stage.select': '选择';
  readonly 'import.stage.analyze': '分析';
  readonly 'import.stage.decide': '预览与决策';
  readonly 'import.stage.confirm': '确认';
  readonly 'import.stage.execute': '执行';
  readonly 'import.stage.done': '完成';
  readonly 'import.stepper.label': '第 {current} 步，共 {total} 步：{label}';
  readonly 'import.select.title': '选择备份文件';
  readonly 'import.select.hint': '选择本机导出的 dsh-config-*.zip 备份文件开始导入。分析阶段只读，不会修改任何配置。';
  readonly 'import.select.browse': '选择 ZIP 文件';
  readonly 'import.select.reselect': '重新选择';
  readonly 'import.select.cancel': '取消选择';
  readonly 'import.select.file': '已选择：{name}';
  readonly 'import.compatibility.title': '兼容性';
  readonly 'import.compatibility.score': '兼容性评分：{score}';
  readonly 'import.compatibility.hint': '评分只看备份格式、DSH 版本方向、平台与包内缺失分区，不阻断导入；具体原因见下方逐条说明。';
  readonly 'import.preview.title': '导入预览';
  readonly 'import.preview.willChange': '将变更 {count} 项';
  readonly 'import.preview.unchanged': '已一致跳过 {count} 项';
  readonly 'import.preview.settings': '设置更新 {count}';
  readonly 'import.preview.plugins': '插件待安装 {count}';
  readonly 'import.preview.mcp': 'MCP 新增 {count}';
  readonly 'import.preview.prompts': '提示词 {count}';
  readonly 'import.preview.paths': '路径映射 {count}';
  readonly 'import.preview.rebase': '已自动重定基（备份来自另一台机器的基础路径）：{from} → {to}；这一步不需要手工映射';
  readonly 'import.preview.secrets': '密钥待补录 {count}';
  readonly 'import.preview.conflicts': '冲突 {count}';
  readonly 'import.preview.restart': '导入后需重启 DSH 生效';
  readonly 'import.confirm.execute': '确认导入';
  readonly 'import.confirm.warning': '导入会修改当前 DSH 配置，执行前自动创建快照。';
  readonly 'import.confirm.warningNoRollback': '导入会修改当前 DSH 配置，执行前自动创建快照；已取消整体回滚 —— 单项失败会继续，已写入内容不回退。';
  readonly 'import.confirm.encrypted': '将用备份密码解密并恢复 {count} 个凭据。';
  readonly 'import.rollbackOnError': '失败时整体回滚（推荐）';
  readonly 'import.log.title': '导入日志';
  readonly 'import.log.empty': '等待命令输出…';
  readonly 'import.log.newOutput': '↓ 新输出';
  readonly 'import.log.counts': '成功 {ok} · 跳过 {skip} · 警告 {warn} · 失败 {fail}';
  readonly 'import.log.filterProblems': '只看问题';
  readonly 'import.log.filterAll': '显示全部';
  readonly 'import.log.problemsEmpty': '本次没有失败或警告的项';
  readonly 'import.done': '完成';
  readonly 'import.skipCurrent': '跳过当前插件';
  readonly 'import.skipPending': '正在跳过…';
  readonly 'import.retrySkipped': '重试失败/跳过的项 ({count})';
  readonly 'import.secrets.title': '补录密钥';
  readonly 'import.secrets.hint': '以下凭据未随备份导出（安全设计）。如需在目标 DSH 使用，请手动补录；留空将跳过。';
  readonly 'import.secrets.optional': '（可选）';
  readonly 'import.secrets.required': '（必需）';
  readonly 'import.secrets.none': '无需补录密钥';
  readonly 'import.decrypt.badge': '加密备份';
  readonly 'import.decryptArchive.title': '解锁加密备份';
  readonly 'import.decryptArchive.hint': '此备份已整体加密（整个文件被密码保护）。输入导出时设置的密码即可解密并继续导入——备份内的加密凭据也会用同一密码自动恢复，全程只需输入这一次密码；密码仅本次使用，绝不落盘。';
  readonly 'import.decryptArchive.passwordPlaceholder': '输入备份加密密码';
  readonly 'import.decryptArchive.unlock': '解锁并继续';
  readonly 'import.decrypt.previewHint': '加密备份：凭据已由解锁密码自动恢复，无需再次输入密码。';
  readonly 'import.conflicts.title': '解决冲突';
  readonly 'import.conflicts.keepCurrent': '保留当前';
  readonly 'import.conflicts.useImported': '使用备份';
  readonly 'import.conflicts.review': '稍后决定';
  readonly 'import.conflicts.severityError': '错误';
  readonly 'import.conflicts.detailCurrent': '当前';
  readonly 'import.conflicts.detailImported': '备份';
  readonly 'import.conflicts.empty': '无冲突项';
  readonly 'import.conflicts.unresolved': '还有 {count} 项未决策';
  readonly 'import.conflicts.keepCurrentAll': '全部保留当前配置';
  readonly 'import.conflicts.useImportedAll': '全部使用备份配置';
  readonly 'import.paths.title': '路径映射';
  readonly 'import.paths.hint': '备份中的绝对路径在目标机器可能不存在，请为每条路径指定新位置（留空将跳过该路径）。';
  readonly 'import.paths.old': '原路径';
  readonly 'import.paths.new': '新路径';
  readonly 'import.paths.kind.missing': '需指定新位置';
  readonly 'import.paths.kind.platformMismatch': '跨平台路径';
  readonly 'import.paths.kind.homeMismatch': '基础路径不同';
  readonly 'import.paths.unresolved': '还有 {count} 条路径未映射（留空将跳过该路径，可以继续）';
  readonly 'import.paths.empty': '无需映射路径';
  readonly 'import.paths.browse': '选择本机路径';
  readonly 'import.paths.picker.title': '选择本机路径';
  readonly 'import.paths.picker.up': '上一层';
  readonly 'import.paths.picker.home': '主目录';
  readonly 'import.paths.picker.thisPc': '此电脑';
  readonly 'import.paths.picker.useCurrent': '使用当前目录';
  readonly 'import.paths.picker.empty': '这个目录里没有可进入的项';
  readonly 'import.paths.picker.truncated': '只显示前 {count} 项';
  readonly 'import.paths.picker.notFound': '这个路径不存在（已为你打开上一级）';
  readonly 'import.paths.picker.denied': '没有读取这个目录的权限';
  readonly 'import.paths.picker.notAbsolute': '请填绝对路径（如 D:\\ 或 /）';
  readonly 'import.paths.picker.failed': '读取这个目录失败';
  readonly 'home.schedule.title': '定时备份';
  readonly 'snapshots.status': '状态';
  readonly 'snapshots.delete': '删除';
  readonly 'snapshots.deleted': '已删除快照';
  readonly 'snapshots.deleteConfirmTitle': '删除快照';
  readonly 'snapshots.deleteConfirm': '确认删除 {time} 创建的快照？该导入前回滚点将被永久删除，不可恢复。';
  readonly 'snapshots.status.pending': '进行中';
  readonly 'snapshots.status.done': '已完成';
  readonly 'snapshots.status.rolled-back': '已回滚';
  readonly 'snapshots.status.unknown': '未知';
  readonly 'snapshots.planTitle': '恢复计划预览';
  readonly 'snapshots.noActions': '该快照无可用恢复动作（或全部跳过）。';
  readonly 'snapshots.execute': '执行恢复';
  readonly 'snapshots.executing': '恢复执行中…';
  readonly 'snapshots.confirmTitle': '确认恢复';
  readonly 'snapshots.confirmRestore': '确认执行恢复？会先把当前文件备份到一个安全位置，再删除导入期间新增的插件。';
  readonly 'snapshots.reportTitle': '恢复报告';
  readonly 'snapshots.reportDone': '完成';
  readonly 'snapshots.restored': '已还原';
  readonly 'snapshots.removedPlugins': '已卸载插件';
  readonly 'snapshots.manualHints': '需人工处理';
  readonly 'snapshots.failed': '失败';
  readonly 'snapshots.skipped': '跳过';
  readonly 'snapshots.plan.changed': '将被还原 {count}';
  readonly 'snapshots.plan.added': '新增 {count}';
  readonly 'snapshots.plan.deleted': '将被删除 {count}';
  readonly 'snapshots.plan.plugins': '卸载插件 {count}';
  readonly 'snapshots.plan.hints': '需人工处理 {count}';
  readonly 'snapshots.plan.skips': '无动作 {count}';
  readonly 'snapshots.plan.noStats': '未统计行数';
  readonly 'snapshots.plan.statsTruncated': '部分文件未统计行数';
  readonly 'snapshots.plan.group.changes': '将被还原';
  readonly 'snapshots.plan.group.deletes': '将被删除';
  readonly 'snapshots.plan.group.plugins': '卸载插件';
  readonly 'snapshots.plan.group.hints': '需人工处理';
  readonly 'snapshots.plan.group.skips': '无动作';
  readonly 'snapshots.plan.status.modified': '修改';
  readonly 'snapshots.plan.status.added': '新增';
  readonly 'snapshots.plan.status.deleted': '删除';
  readonly 'snapshots.plan.status.plugin': '卸载插件';
  readonly 'snapshots.plan.status.hint': '人工提示';
  readonly 'snapshots.plan.status.skip': '跳过';
  readonly 'snapshots.plan.beforeLabel': '本机';
  readonly 'snapshots.plan.afterLabel': '快照';
  readonly 'snapshots.plan.loadingDiff': '正在读取差异…';
  readonly 'snapshots.plan.diffIdentical': '两侧内容一致';
  readonly 'snapshots.plan.diffBinary': '二进制文件';
  readonly 'snapshots.plan.diffTooLarge': '文件过大（{size}）';
  readonly 'snapshots.plan.diffUnreadable': '无法读取该文件';
  readonly 'snapshots.plan.diffMissingBlob': '快照内缺少该文件内容';
  readonly 'snapshots.plan.diffEscape': '路径越界，已拒绝读取';
  readonly 'snapshots.plan.diffNotApplicable': '非文件内容变更';
  readonly 'snapshots.plan.diffDegraded': '差异过大，已按整块显示';
  readonly 'snapshots.plan.statSkipped.tooLarge': '体积超上限';
  readonly 'snapshots.plan.statSkipped.binary': '二进制';
  readonly 'snapshots.plan.statSkipped.budget': '超出数量上限';
  readonly 'snapshots.plan.statSkipped.unreadable': '未统计';
  readonly 'backupSchedule.title': '定时全量备份';
  readonly 'backupSchedule.hint': '恒不含 secret、不加密；要加密的备份请手动导出。';
  readonly 'backupSchedule.enabled': '启用定时备份';
  readonly 'backupSchedule.enabledHint': '每次启动先跑一次（距上次运行不足 1 小时则跳过）。';
  readonly 'backupSchedule.interval': '备份间隔';
  readonly 'backupSchedule.interval.6h': '每 6 小时';
  readonly 'backupSchedule.interval.12h': '每 12 小时';
  readonly 'backupSchedule.interval.24h': '每 24 小时';
  readonly 'backupSchedule.interval.7d': '每 7 天';
  readonly 'backupSchedule.interval.custom': '自定义（每周固定时刻）';
  readonly 'backupSchedule.customHint': '错过的时间点不补跑。';
  readonly 'backupSchedule.weekday': '星期';
  readonly 'backupSchedule.hour': '小时';
  readonly 'backupSchedule.minute': '分钟';
  readonly 'backupSchedule.weekday.sunday': '周日';
  readonly 'backupSchedule.weekday.monday': '周一';
  readonly 'backupSchedule.weekday.tuesday': '周二';
  readonly 'backupSchedule.weekday.wednesday': '周三';
  readonly 'backupSchedule.weekday.thursday': '周四';
  readonly 'backupSchedule.weekday.friday': '周五';
  readonly 'backupSchedule.weekday.saturday': '周六';
  readonly 'backupSchedule.save': '保存设置';
  readonly 'backupSchedule.saved': '设置已保存';
  readonly 'backupSchedule.runNow': '立即备份';
  readonly 'backupSchedule.lastRun': '上次运行';
  readonly 'backupSchedule.never': '从未运行';
  readonly 'backupSchedule.status.success': '成功';
  readonly 'backupSchedule.status.skipped': '已跳过';
  readonly 'backupSchedule.status.failed': '失败';
  readonly 'backupSchedule.consecutiveFailures': '定时备份连续失败 {count} 次，请检查配置（磁盘空间 / 权限 / 分区导出错误）';
  readonly 'backupSchedule.loading': '加载定时备份设置…';
  readonly 'backupSchedule.error': '定时备份设置加载失败';
  readonly 'retention.title': '保留策略';
  readonly 'retention.hint': '快照与定时备份共用；置顶快照与未收敛的恢复点恒豁免自动清理。';
  readonly 'retention.keepLast': '最近保留';
  readonly 'retention.keepLastHint': '按时间保留最近 N 份；0 = 不按「最近」保留';
  readonly 'retention.keepMonthly': '每月保留';
  readonly 'retention.keepMonthlyHint': '每月额外保留最新 1 份，最多覆盖 N 个月；0 = 关闭';
  readonly 'retention.keepYearly': '每年保留';
  readonly 'retention.keepYearlyHint': '每年额外保留最新 1 份，最多覆盖 N 年；0 = 关闭';
  readonly 'retention.unit': '份';
  readonly 'retention.months': '个月';
  readonly 'retention.years': '年';
  readonly 'retention.tiersOff': '仅保留最近 N 份';
  readonly 'backupFiles.hint': '定时备份自动保留最近 10 个，更早的会被删除。';
  readonly 'backupFiles.empty': '暂无备份文件';
  readonly 'backupFiles.delete': '删除';
  readonly 'backupFiles.deleteConfirmTitle': '删除备份文件';
  readonly 'backupFiles.deleteConfirm': '确认删除备份文件「{name}」？此操作不可恢复。';
  readonly 'backupFiles.deleted': '已删除备份文件「{name}」';
  readonly 'backupFiles.inspect': '查看 / 对比';
  readonly 'backupFiles.inspectLoading': '正在分析备份内容…';
  readonly 'backupFiles.inspectEmpty': '该备份无法分析（文件损坏或格式不支持）';
  readonly 'backupFiles.inspectSections': '包含的分区';
  readonly 'backupFiles.inspectDiff': '与此备份的差异（只读预览）';
  readonly 'backupFiles.inspectItems': '变更明细';
  readonly 'backupFiles.inspectGroup.conflicts': '冲突（需决策）';
  readonly 'backupFiles.inspectGroup.changes': '变更（将写入）';
  readonly 'backupFiles.inspectGroup.paths': '路径映射（需处理）';
  readonly 'backupFiles.inspectGroup.skipped': '已一致（无需处理）';
  readonly 'backupFiles.inspectGroup.others': '其他';
  readonly 'report.import.title': '导入结果';
  readonly 'report.needsRestart': '插件 / MCP 变更将在重启 DSH 后生效。';
  readonly 'nextSteps.title': '接下来需要处理';
  readonly 'nextSteps.done': '全部完成，无需额外处理';
  readonly 'nextSteps.restart.hint': '需重启 DSH 后生效（{count}）：';
  readonly 'nextSteps.secrets.hint': '未随备份导出、需在本机补录的凭据（{count}）：';
  readonly 'nextSteps.unresolved.hint': '未成功应用（{count}），可用下方按钮重试：';
  readonly 'starPrompt.title': '喜欢 Config Manager 吗？';
  readonly 'starPrompt.body': '如果你觉得这个插件有用，欢迎到 GitHub 点个 ⭐ Star 支持一下——你的支持是持续维护的最大动力！';
  readonly 'starPrompt.star': '去点 Star';
  readonly 'starPrompt.dismiss': '不再提示';
  readonly 'about.official': '官方';
  readonly 'about.version': '版本 {version}';
  readonly 'about.dshVersion': 'DSH {version}';
  readonly 'about.links': '相关链接';
  readonly 'about.star': '⭐ 在 GitHub 上点赞';
  readonly 'about.repo': 'GitHub 仓库';
  readonly 'about.docs': '使用文档';
  readonly 'about.issues': '反馈问题';
  readonly 'about.copyEnv': '复制环境信息';
  readonly 'about.authorLabel': '作者';
  readonly 'about.loading': '正在获取版本信息…';
  readonly 'about.retryStatus': '重新获取';
  readonly 'about.releaseNotes': '更新内容';
  readonly 'about.diag.label': '插件清单来源';
  readonly 'about.diag.profileDir': '目录：{path}';
  readonly 'about.diag.profile': 'profile：{profile}';
  readonly 'about.diag.pluginCount': '已识别插件：{count} 个';
  readonly 'about.diag.manifestUnreadable': '读不到 package.json：插件清单为空（核对 profile 与 DSH_HOME）';
  readonly 'about.diag.hint': '若与实际不符，请据此检查当前档案的启动方式（宿主 profileContext / 启动参数 --profile / 环境变量 DSH_PROFILE）与 DSH_HOME 环境变量。';
  readonly 'about.releaseNotes.title': '版本更新内容';
  readonly 'about.releaseNotes.loading': '正在获取更新内容…';
  readonly 'about.releaseNotes.loadingMore': '正在加载更多版本…';
  readonly 'about.releaseNotes.empty': '暂无发布记录';
  readonly 'about.releaseNotes.retry': '重试';
  readonly 'about.releaseNotes.viewOnGithub': '在 GitHub 上查看全部 Releases';
  readonly 'about.releaseNotes.viewSingleOnGithub': '在 GitHub 上查看此版本';
  readonly 'about.releaseNotes.allLoaded': '已加载全部版本记录';
  readonly 'about.releaseNotes.prerelease': '预发布';
  readonly 'about.releaseNotes.latest': '最新';
  readonly 'about.releaseNotes.noBody': '该版本暂无详细更新说明。';
  readonly 'about.releaseNotes.confirm': '确认';
  readonly 'about.releaseNotes.neverShow': '永不提示';
  readonly 'about.cli.title': 'CLI 救援工具';
  readonly 'about.cli.hint': 'GUI 运行在 DSH 内部——DSH 无法启动时，独立安装的 CLI（dsh-config-manager）是第一救援手段：列快照 / 离线恢复 / 一键重装 DSH，全程无需 DSH 运行。安装一次即可在任何机器上用：';
  readonly 'about.cli.docs': 'CLI 使用文档';
  readonly 'about.access.title': '访问范围';
  readonly 'about.access.hint': '本面板只接受两种来源：本机回环地址（127.0.0.1 / localhost），或宿主已信任的地址与已登录的 dsh web 会话。用 dsh web --host <局域网地址> 启动后从别的机器打开时，页面能加载但读不到本机数据——改用 ssh -L 3080:127.0.0.1:3080 隧道从 localhost 打开即可。CLI 与 agent 工具不受此限制。';
  readonly 'profiles.title': '档案';
  readonly 'profiles.subtitle': '管理 DSH 自带的 profile（$DSH_HOME/profiles/<name>）：每个档案 = 一套插件组合（bundles）+ 依赖 + patch 层，用 dsh --profile <name> 启动。';
  readonly 'profiles.loading': '加载档案中…';
  readonly 'profiles.empty': '还没有任何档案';
  readonly 'profiles.refresh': '刷新';
  readonly 'profiles.machine.title': '本机概况';
  readonly 'profiles.machine.dshVersion': 'DSH 版本';
  readonly 'profiles.machine.dataDir': '数据目录';
  readonly 'profiles.machine.plugins': '已装插件';
  readonly 'profiles.machine.disk': '磁盘占用';
  readonly 'profiles.machine.pluginsValue': '{count} 个';
  readonly 'profiles.machine.diskValue': '{size} · {files} 个文件';
  readonly 'profiles.machine.unknown': '未知';
  readonly 'profiles.dataDir.title': '数据目录';
  readonly 'profiles.dataDir.hint': '以下目录都在当前档案的数据目录下；清理入口在「维护与诊断」的磁盘占用卡。';
  readonly 'profiles.dataDir.exports': '备份文件';
  readonly 'profiles.dataDir.snapshots': '导入前快照';
  readonly 'profiles.dataDir.sync': '同步覆盖与工作副本';
  readonly 'profiles.dataDir.rollbackPoints': '工作区与会话回滚';
  readonly 'profiles.dataDir.rowValue': '{size} · {files} 个文件';
  readonly 'profiles.current': '当前运行';
  readonly 'profiles.running.title': '运行状态';
  readonly 'profiles.running.none': '没有正在运行的实例';
  readonly 'profiles.running.port': '端口 {port}';
  readonly 'profiles.running.open': '打开';
  readonly 'profiles.running.badge': ':{port} 运行中';
  readonly 'profiles.running.portBadge': ':{port}';
  readonly 'profiles.running.originCurrent': '当前实例';
  readonly 'profiles.running.originOwned': '本插件启动';
  readonly 'profiles.running.originExternal': '其他实例';
  readonly 'profiles.running.badgePlain': '运行中';
  readonly 'profiles.stop': '停止';
  readonly 'profiles.stop.hint': '停止本插件启动的这个实例（先请它自己退出，优雅期超时才强制终止进程树）';
  readonly 'profiles.stop.hintExternal': '该档案的实例由另一个 DSH 实例（或手动启动）运行——停止会结束那个进程';
  readonly 'profiles.stop.currentHint': '这就是你正在用的这个实例：不能在它自己的界面里停自己，请关闭该窗口/终端（或到启动它的那个实例里停止）';
  readonly 'profiles.stopMessageExternal': '确认停止档案「{name}」的实例（端口 {port}）？它由另一个 DSH 实例（或手动启动）运行，停止会关闭那个实例。';
  readonly 'profiles.stopTitle': '停止实例';
  readonly 'profiles.stopMessage': '确认停止档案「{name}」的实例（端口 {port}）？该实例里正在进行的会话会被中断。';
  readonly 'profiles.stop.done': '已停止档案「{name}」的实例';
  readonly 'profiles.stop.forced': '已停止档案「{name}」的实例（进程未在优雅期内退出，已结束其进程树）';
  readonly 'profiles.stop.gone': '档案「{name}」的实例早已不在（残留记录已清理）';
  readonly 'profiles.copy': '复制命令';
  readonly 'profiles.copied': '已复制重启命令';
  readonly 'profiles.launch': '启动';
  readonly 'profiles.launch.hint': '用该档案另起一个独立 DSH 实例（自动挑空闲端口、自动打开浏览器）；当前实例不受影响。只支持 Web 形态档案。';
  readonly 'profiles.launch.notWeb': '「{name}」不是 Web 形态，不能作为独立实例启动。请在终端运行：';
  readonly 'profiles.launch.managed': '「{name}」由桌面版独占，命令行无法启动。请在桌面端应用里打开它并安装插件。';
  readonly 'profiles.launch.started': '已启动档案「{name}」的独立实例（端口 {port}）';
  readonly 'profiles.launch.pending': '档案「{name}」的进程已启动（端口 {port}），但 {seconds} 秒内未确认就绪 —— 请看日志确认：';
  readonly 'profiles.launch.open': '打开新实例';
  readonly 'profiles.launch.copyUrl': '复制 URL';
  readonly 'profiles.launch.copiedUrl': '已复制认证 URL';
  readonly 'profiles.launch.warn.notReady': '未能确认 Web 服务已就绪（可能仍在启动，或启动失败）';
  readonly 'profiles.launch.warn.urlNotFound': '没能从启动日志里抓到带 token 的认证 URL — 请从日志里复制 URL 打开';
  readonly 'profiles.launch.log': '日志';
  readonly 'profiles.create.title': '新建档案';
  readonly 'profiles.create.hint': '在 $DSH_HOME/profiles/<name> 下创建标准 profile（package.json + cordis.patch.yml + pnpm-workspace.yaml）；第三方插件需要在该档案里单独安装。';
  readonly 'profiles.create.nameLabel': '档案名';
  readonly 'profiles.create.placeholder': '例如 writing / rescue';
  readonly 'profiles.create.templateLabel': '起步模板';
  readonly 'profiles.create.action': '创建档案';
  readonly 'profiles.create.done': '已创建档案「{name}」';
  readonly 'profiles.nameRequired': '请输入档案名';
  readonly 'profiles.nameTooLong': '档案名最长 64 个字符';
  readonly 'profiles.nameInvalid': '档案名不合法：禁止路径分隔符（/ \\）、"."、".." 与 "node_modules"';
  readonly 'profiles.nameReserved': '「{name}」是 DSH 保留名（web / headless / sdk / sdk-minimal / acp / desktop），不能手动创建';
  readonly 'profiles.list.title': '全部档案';
  readonly 'profiles.list.count': '共 {count} 个';
  readonly 'profiles.row.summary': '{bundles} 个层 · patch {patch} 条 · 依赖 {deps}';
  readonly 'profiles.detail.info': '档案信息';
  readonly 'profiles.bundles.count': '{count} 个 bundle 层';
  readonly 'profiles.shape.web': 'Web';
  readonly 'profiles.shape.headless': 'Headless';
  readonly 'profiles.shape.generic': '自定义';
  readonly 'profiles.shape.incomplete': '未完成的副本';
  readonly 'profiles.incomplete.from': '从「{name}」复制';
  readonly 'profiles.incomplete.startedAt': '开始于 {time}';
  readonly 'profiles.incomplete.dir': '目录 {path}';
  readonly 'profiles.incomplete.hint': '这是一次被中断的档案复制：没有 package.json，无法启动。确认不需要后可直接删除（只删这个目录，不影响其它档案）。';
  readonly 'profiles.list.incompleteCount': '未完成副本 {count} 个（不可启动）';
  readonly 'profiles.delete.incompleteMessage': '确认删除未完成的副本「{name}」？将物理删除整个目录（含已拷入的部分文件），不可恢复。';
  readonly 'profiles.issue.manifestInvalid': 'package.json 损坏';
  readonly 'profiles.issue.patchTooLarge': 'patch 文件过大（未展示原文）';
  readonly 'profiles.bundles': '插件层（bundles）';
  readonly 'profiles.deps': '依赖';
  readonly 'profiles.patchReload.live': 'patch 热生效';
  readonly 'profiles.patchReload.startup': 'patch 仅启动应用';
  readonly 'profiles.patchEntries': '{count} 条 patch';
  readonly 'profiles.bundles.none': '（无）';
  readonly 'profiles.nodeModules.yes': '已装 node_modules';
  readonly 'profiles.nodeModules.no': '未装 node_modules';
  readonly 'profiles.updatedAt': '更新于 {time}';
  readonly 'profiles.dir': '目录';
  readonly 'profiles.detail': '详情';
  readonly 'profiles.detailTitle': '档案详情：{name}';
  readonly 'profiles.detail.manifest': 'package.json';
  readonly 'profiles.detail.patch': 'cordis.patch.yml';
  readonly 'profiles.detail.patchMissing': '（无 patch 文件）';
  readonly 'profiles.detail.patchTooLarge': '（patch 文件过大，未加载原文）';
  readonly 'profiles.rename': '重命名';
  readonly 'profiles.renameTitle': '重命名档案';
  readonly 'profiles.renameMessage': '将档案「{name}」重命名为：';
  readonly 'profiles.rename.done': '已重命名为「{name}」';
  readonly 'profiles.delete': '删除';
  readonly 'profiles.deleteTitle': '删除档案';
  readonly 'profiles.deleteMessage': '确认删除档案「{name}」？将物理删除整个目录（含 node_modules），不可恢复。';
  readonly 'profiles.delete.done': '已删除档案「{name}」';
  readonly 'profiles.deleteCurrentWarning': '这是当前运行中的档案：删除后本次运行仍可用，但重启会失败。';
  readonly 'profiles.deleteCurrentConfirm': '仍要删除当前档案';
  readonly 'profiles.duplicate': '复制';
  readonly 'profiles.duplicateTitle': '复制档案';
  readonly 'profiles.duplicateMessage': '把档案「{name}」复制成一份新档案：';
  readonly 'profiles.duplicate.nameLabel': '副本档案名';
  readonly 'profiles.duplicate.includeModules': '同时复制 node_modules（副本立刻可用）';
  readonly 'profiles.duplicate.includeModulesHint': '同体积 · 约 30 秒 · 不勾选则副本启动前需装依赖';
  readonly 'profiles.duplicate.onlyManifest': '无 node_modules：仅复制清单与 patch';
  readonly 'profiles.duplicate.done': '已复制为档案「{name}」';
  readonly 'profiles.duplicate.warn.depsNotInstalled': '副本没有带 node_modules：直接启动会因解析不到 bundle 而失败，先在副本目录安装依赖：';
  readonly 'profiles.duplicate.copiedInstall': '已复制安装命令';
  readonly 'profiles.error.exists': '同名档案已存在';
  readonly 'profiles.error.notFound': '档案不存在（可能已被删除）';
  readonly 'profiles.error.currentProfile': '该操作不能作用于当前运行中的档案';
  readonly 'profiles.error.invalidName': '档案名不合法';
  readonly 'profiles.error.reservedName': 'DSH 保留名不能手动创建';
  readonly 'profiles.error.unknownTemplate': '未知的起步模板';
  readonly 'profiles.error.notLaunchable': '该档案不是 Web 形态，没有浏览器界面（请用终端运行 dsh --profile <名>）';
  readonly 'profiles.error.managedProfile': '「desktop」档案由 DeepSeek Harness Desktop 应用独占管理：删掉或改名会让桌面端下次启动时按 web 模板重建一个空档案（已装插件全部消失）。请在桌面端应用里管理它。';
  readonly 'profiles.error.launcherUnavailable': '定位不到 dsh 启动器（非标准启动方式），请手动运行 dsh --profile <名>';
  readonly 'profiles.error.launchFailed': '档案实例启动失败';
  readonly 'profiles.error.alreadyRunning': '该档案的实例已经在运行（先停止再启动）';
  readonly 'profiles.error.notRunning': '该档案没有正在运行的实例（可能已被手动关闭）';
  readonly 'profiles.error.stopFailed': '停止实例失败';
  readonly 'profiles.error.instanceRunning': '该档案的实例正在运行，请先停止再删除';
  readonly 'profiles.error.deleteFailed': '删除失败：档案目录被占用或权限不足，档案仍在磁盘上';
  readonly 'profiles.error.generic': '操作失败：{message}';
  readonly 'import.compatibility.sections': '{count} 个分区';
  readonly 'import.compatibility.plugins': '已装 {installed} · 待装 {toInstall}';
  readonly 'import.compatibility.paths': '{count} 项路径处理';
  readonly 'import.compatibility.secrets': '{count} 项密钥补录';
  readonly 'import.compatibility.score.excellent': '优秀';
  readonly 'import.compatibility.score.good': '良好';
  readonly 'import.compatibility.score.partial': '部分兼容';
  readonly 'import.compatibility.score.unsupported': '不支持';
  readonly 'import.compatibility.sectionsTitle': '备份包含的分区';
  readonly 'nav.home': '首页';
  readonly 'nav.export': '导出';
  readonly 'nav.import': '导入';
  readonly 'nav.sync': '同步';
  readonly 'nav.market': '市场';
  readonly 'shell.running.restore': '快照恢复';
  readonly 'shell.status.idle': '就绪';
  readonly 'shell.status.running': '{count} 个任务进行中';
  readonly 'shell.status.recovery': '恢复待处理';
  readonly 'shell.status.runningAction': '查看进行中的任务';
  readonly 'runs.loading': '正在读取任务列表…';
  readonly 'runs.loadFailed': '读取任务列表失败：{message}';
  readonly 'runs.empty': '近期没有任何任务（运行中的任务会实时出现在这里）';
  readonly 'runs.retentionHint': '刚结束的任务只保留 30 分钟。';
  readonly 'runs.runningBadge': '{count} 个进行中';
  readonly 'runs.awaitingBadge': '{count} 个等待你选择';
  readonly 'runs.awaitingDecision': '等待你选择';
  readonly 'runs.decideNow': '去选择';
  readonly 'runs.cancelAction': '终止…';
  readonly 'runs.counts': '成功 {ok} · 警告 {warn} · 失败 {fail} · 跳过 {skip}';
  readonly 'runs.kind.export': '导出';
  readonly 'runs.kind.import': '导入';
  readonly 'runs.kind.autosync': '自动同步';
  readonly 'runs.kind.sync-apply': '从远端合并';
  readonly 'runs.kind.backup-schedule': '定时备份';
  readonly 'runs.kind.restore': '快照恢复';
  readonly 'runs.kind.profile-switch': '档案切换';
  readonly 'runs.kind.recovery': '事故恢复';
  readonly 'runs.status.running': '进行中';
  readonly 'runs.status.done': '已完成';
  readonly 'runs.status.failed': '失败';
  readonly 'runs.progress.running': '执行中';
  readonly 'runs.progress.done': '已完成';
  readonly 'runs.progress.failed': '已失败';
  readonly 'runs.cancelTitle': '终止这个任务';
  readonly 'runs.cancelCost': '已应用 {applied} 项、未执行 {pending} 项';
  readonly 'runs.cancelCostUnknown': '已应用项数未知（宿主未上报进度计数）';
  readonly 'runs.cancel.rollback': '回滚到导入前';
  readonly 'runs.cancel.rollbackDesc': '撤销本次导入已应用的全部改动，回到导入前的快照状态';
  readonly 'runs.cancel.keep': '保留已应用项';
  readonly 'runs.cancel.keepDesc': '只停掉未执行的部分，已经写进配置的内容留在本机；随后会自动做一次启动安全审计';
  readonly 'runs.cancelKeepWarn': '「保留」会留下一笔未完成的导入：审计只能压低 DSH 启动失败的概率，不能保证。若 DSH 起不来，用「事故恢复 / SAFE MODE」或离线 CLI 处理。';
  readonly 'runs.recommended': '推荐';
  readonly 'runs.cancelAbort': '继续运行';
  readonly 'runs.cancelConfirm': '确认终止';
  readonly 'runs.cancelRequestedToast': '已请求终止：将在当前计划项完成后暂停';
  readonly 'runs.cancelWaiting': '已请求终止 · 等当前步骤结束 · 已等 {minutes} 分钟';
  readonly 'runs.cancelWaitingJustNow': '已请求终止 · 等当前步骤结束';
  readonly 'runs.cancelStuck': '长时间没有到达安全点。若出现「跳过当前插件」请先点它；仍不行请重启 DSH —— 环境锁由本进程持有，重启即释放，不重启时其他写操作会一直被拒（423）。';
  readonly 'runs.lock.title': '环境锁';
  readonly 'runs.lock.needsAction': '需要处理';
  readonly 'runs.lock.held': '使用中';
  readonly 'runs.lock.attentionDesc': '残留锁（持有进程已不存在）或锁状态无法判定：重试/重启都不会自愈，需显式回收。';
  readonly 'runs.lock.heldDesc': '被另一项任务持有，会自行释放；若它就是上方卡住的那次导入，只能重启 DSH。';
  readonly 'runs.lock.recover': '回收残留锁';
  readonly 'runs.lock.recoverOk': '已回收残留锁';
  readonly 'runs.lock.recoverRefused': '未回收（{state}）：只有「持有者已确证死亡」的残留锁才允许回收，活锁会自行释放';
  readonly 'runs.lock.recoverFailed': '回收失败：{message}';
  readonly 'runs.lock.readFailed': '读不到环境锁状态：{message}';
  readonly 'runs.skipRequestedToast': '已请求跳过当前插件';
  readonly 'runs.decisionAcceptedToast': '已提交你的选择';
  readonly 'runs.decisionTooLateToast': '来不及了：等待超时已按安全侧默认（回滚）继续';
  readonly 'runs.actionFailed': '操作失败：{message}';
  readonly 'runs.unsupported': '该任务不支持手动终止';
  readonly 'overview.result.success': '成功';
  readonly 'overview.result.failed': '失败';
  readonly 'overview.result.skipped': '跳过';
  readonly 'overview.result.pending': '待裁决';
  readonly 'overview.activity.copy': '复制';
  readonly 'overview.activity.redacted': '（文件名已脱敏）';
  readonly 'overview.sections.entries': '{count} 项';
  readonly 'overview.nav.activity': '活动';
  readonly 'overview.nav.about': '关于';
  readonly 'nav.more': '更多';
  readonly 'palette.label': '命令面板';
  readonly 'palette.shortcut': '⌘/Ctrl+K';
  readonly 'palette.hint': '↑↓ 选择 · ↵ 执行 · Esc 关闭';
  readonly 'task.title.about': '关于';
  readonly 'task.title.export': '导出配置';
  readonly 'task.title.history': '迁移历史';
  readonly 'task.title.import': '导入配置';
  readonly 'task.title.market': '逛市场';
  readonly 'task.title.publish': '发布到市场';
  readonly 'task.title.runs': '活动记录';
  readonly 'task.back': '← 返回{page}';
  readonly 'common.infoHint': '查看说明';
  readonly 'about.update.title': '插件更新';
  readonly 'about.update.offline': '检查更新会访问 npm registry；离线或受限网络下失败属正常，不影响其它功能。';
  readonly 'about.update.current': '当前版本 {version}';
  readonly 'about.update.upToDate': '已是最新版本';
  readonly 'about.update.available': '有新版本 {latest}';
  readonly 'about.update.failed': '检查失败：{error}';
  readonly 'about.update.commandHint': '装完需重启 DSH';
  readonly 'about.update.copyCommand': '复制升级命令';
  readonly 'about.update.noCommand': '未识别到当前档案，或该档案由桌面端独占管理 —— 请在 DSH 的插件页更新本插件。';
  readonly 'about.update.check': '检查更新';
  readonly 'about.update.recheck': '重新检查';
  readonly 'about.update.apply': '立即更新';
  readonly 'about.update.applied': '已更新到 {version}，重启 DSH 后生效';
  readonly 'about.update.dialog.title': '更新到 {version}';
  readonly 'about.update.dialog.from': '当前版本 {current}';
  readonly 'about.update.dialog.loadingNotes': '正在获取更新说明…';
  readonly 'about.update.dialog.notesFailed': '获取更新说明失败：{error}（不影响更新）';
  readonly 'about.update.dialog.noNotes': '未找到 v{version} 的发布说明，可直接更新。';
  readonly 'about.update.dialog.notExact': '未找到 v{version} 的发布说明，以下为最新一条发布内容。';
  readonly 'about.update.dialog.viewOnGithub': '在 GitHub 查看全部版本';
  readonly 'about.update.dialog.viewReleaseOnGithub': '在 GitHub 查看此版本';
  readonly 'about.update.dialog.install': '立即更新';
  readonly 'about.update.dialog.installing': '正在更新，请稍候…';
  readonly 'about.update.dialog.done': '更新完成：已安装 v{version}。';
  readonly 'about.update.dialog.restart': '需完全退出并重启 DSH 才会生效';
  readonly 'about.update.code.invalidVersion': '版本号无效，未能更新。';
  readonly 'about.update.code.profileUnknown': '无法识别当前档案，请在 DSH 的插件页更新本插件。';
  readonly 'about.update.code.unsupportedProfile': '桌面端档案由桌面应用独占管理，请在 DSH 的插件页更新本插件。';
  readonly 'about.update.code.nonRegistryInstall': '当前是本机/开发来源安装（link/file/git），不会用 registry 版本覆盖它 —— 请在来源目录更新。';
  readonly 'about.update.code.notNewer': '目标版本不高于当前版本，无需更新。';
  readonly 'about.update.code.installFailed': '更新失败：{error}';
  readonly 'palette.group.action': '动作';
  readonly 'palette.group.library': '产物库';
  readonly 'palette.group.navigate': '前往';
  readonly 'palette.group.rescue': '处置';
  readonly 'palette.group.view': '视图';
  readonly 'palette.placeholder': '输入命令或搜索…';
  readonly 'palette.empty': '没有匹配的命令';
  readonly 'shell.runs.title': '运行';
  readonly 'environment.title': '环境';
  readonly 'environment.tab.profiles': '档案';
  readonly 'environment.tab.maintenance': '维护与诊断';
  readonly 'profiles.version.dsh': 'DSH {version}';
  readonly 'profiles.version.format': '会话格式 v{version}';
  readonly 'profiles.format.newer': '对话在此实例不可见';
  readonly 'profiles.format.older': '对话在该档案不可见';
  readonly 'nextSteps.sessionsRestart.hint': '写入 {count} 个会话文件；DSH 只在启动时建立会话列表与工作区投影 —— 桌面端退出应用重开，CLI 档案重启 dsh。';
  readonly 'import.source.title': '来源与兼容性';
  readonly 'import.source.dsh': 'DSH 版本：{source} → 本机 {target}';
  readonly 'import.source.platform': '平台：{source} → 本机 {target}';
  readonly 'import.source.schema': '备份格式：v{version}';
  readonly 'import.source.reasons': '判定依据';
  readonly 'import.sessionFormat.skipped': '本次按「跳过」处置未导入 {count} 条会话（格式版本高于本机 DSH，导入了也看不到）';
  readonly 'import.sessionFormat.retryPlan': '重新生成计划';
  readonly 'import.sessionFormat.option.abort': '中止导入（推荐）';
  readonly 'import.sessionFormat.hint.abort': '在计划阶段就停下，不写入任何内容。';
  readonly 'import.sessionFormat.option.skip': '跳过这些会话';
  readonly 'import.sessionFormat.hint.skip': '这些会话默认不勾选（可在内容选择器改回），其余分区照常导入。';
  readonly 'import.sessionFormat.option.guide': '仅提示，照常导入';
  readonly 'import.sessionFormat.hint.guide': '会话文件照常写入，但本机 DSH 里看不到这些对话。';
  readonly 'import.sessionFormat.title': '本机读不了的会话';
  readonly 'import.sessionFormat.blocked': '已按「中止」停止，未写入任何内容 —— 改选「跳过」或「仅提示」后重新生成计划。';
  readonly 'import.sessionFormat.summary': '包内 {count} 条会话是 v{newer} 格式，本机只支持 v{target}：DSH 会静默跳过，不报错也不出现在工作区';
  readonly 'import.sessionFormat.sampled': '格式体检是抽查：已检查 {checked} 条，另有 {skipped} 条未检查（未检查的按可读处理，不参与本次处置）';
  readonly 'import.sessionFormat.guide.upgrade': '把本档案的 DSH 升级到支持 v{newer} 的版本（当前支持 v{target}）后重新导入；或在导出机用不高于 v{target} 的 DSH 重新导出。';
  readonly 'import.sessionFormat.guide.doctor': '离线体检本机存量会话（只读）：';
  readonly 'import.sessionFormat.guide.copy': '复制离线体检命令';
  readonly 'backupFiles.encryptedHint': '整包加密的备份：导入时需先输入备份密码解锁（文件本身没有损坏）';
  readonly 'library.expand': '展开 {name}';
  readonly 'library.moreActions': '更多操作';
  readonly 'backupFiles.inspectEncrypted': '这是整包加密的备份，无法直接查看内容：请点「导入」——向导会先让你输入备份密码解锁，解锁后即可看到包含的分区与差异。';
  readonly 'library.source.all': '全部';
  readonly 'library.kind.snapshot': '本机快照';
  readonly 'library.kind.backupFile': '备份文件';
  readonly 'library.kind.remote': '远端快照';
  readonly 'library.remoteDevice': '由 {device} 推送';
  readonly 'library.kind.market': '市场配置';
  readonly 'library.title': '产物库';
  readonly 'library.searchPlaceholder': '搜索文件名 / 备注 / 快照 id';
  readonly 'library.sourceFailed': '{count} 个来源读取失败';
  readonly 'library.snapshotsUnreadable': '快照目录读取失败：可能有快照读不出';
  readonly 'snapshots.planChanged': '环境在预览后发生了变化，恢复已取消 —— 请重新预览确认';
  readonly 'library.snapshotReferencedByRecovery': '该快照是事故恢复的回滚点，已拒绝删除（请先处理恢复事项）';
  readonly 'library.snapshotReferenceUnreadable': '读不到恢复引用清单，已保守拒绝删除（请重试）';
  readonly 'library.retry': '重试';
  readonly 'library.emptyFiltered': '没有匹配的产物';
  readonly 'library.delete': '删除';
  readonly 'library.remoteDeleteTitle': '删除远端快照';
  readonly 'library.remoteDeleteConfirm': '确认删除远端快照 {time}？该文件将从远端仓库中删除，不可恢复。';
  readonly 'library.remoteDeleteBaseline': '注意：这是当前的同步基线（本机上次同步到的那份）。删除不会改动本机配置，但下次同步会重新比对远端最新快照。';
  readonly 'library.remoteDeleted': '已删除远端快照';
  readonly 'library.summary.count': '共 {count} 个';
  readonly 'library.summary.filtered': '{shown} / {total} 个';
  readonly 'library.new.export': '手动导出';
  readonly 'library.new.import': '从文件导入';
  readonly 'library.new.market': '逛市场';
  readonly 'import.reason.crossPlatform': '跨平台：备份来自 {source}，本机是 {target}';
  readonly 'palette.rescue.recovery': '事故恢复';
  readonly 'palette.rescue.mode': '救援模式';
  readonly 'palette.rescue.rollback': '回滚点（工作区 + 会话回退）';
  readonly 'import.reason.schemaUnsupported': '包内 schema 版本 v{version} 超出本插件支持范围';
  readonly 'import.reason.missingSections': '备份声明但包内缺失 {count} 个分区：{sections}';
  readonly 'import.reason.sourceNewer': '备份来自更新的 DSH（{source} → 本机 {target}）：可能有本机不认识的配置';
  readonly 'import.reason.sourceOlder': '备份来自更旧的 DSH（{source} → 本机 {target}）：向后兼容';
  readonly 'foreign.source.title': '从其它 agent 导入';
  readonly 'foreign.source.hint': '读取本机已装的其它 agent 配置，先看清将导入什么，再交给既有的导入向导（分析只读，零写入）。';
  readonly 'foreign.source.loading': '正在检测本机配置…';
  readonly 'foreign.source.empty': '未检测到任何可导入的其它 agent 配置。';
  readonly 'foreign.source.unknown': '未识别的来源。';
  readonly 'foreign.source.claude-code': 'Claude Code';
  readonly 'foreign.source.hermes': 'Hermes';
  readonly 'foreign.source.cursor': 'Cursor';
  readonly 'foreign.source.codex': 'Codex CLI';
  readonly 'foreign.source.copilot': 'GitHub Copilot CLI';
  readonly 'foreign.source.antigravity': 'Google Antigravity';
  readonly 'foreign.source.gemini': 'Gemini CLI';
  readonly 'foreign.source.reasonix': 'Reasonix';
  readonly 'foreign.source.opencode': 'OpenCode';
  readonly 'foreign.source.mimocode': 'MimoCode';
  readonly 'foreign.source.zcode': 'ZCode';
  readonly 'foreign.source.grokbuild': 'Grok Build';
  readonly 'foreign.source.openclaw': 'OpenClaw';
  readonly 'foreign.source.pi': 'Pi';
  readonly 'foreign.source.kimi': 'Kimi CLI';
  readonly 'foreign.source.kilocode': 'Kilo Code';
  readonly 'foreign.source.qoder': 'Qoder';
  readonly 'foreign.source.chatgpt': 'ChatGPT';
  readonly 'foreign.source.workbuddy': 'WorkBuddy';
  readonly 'foreign.source.qwen': '千问办公';
  readonly 'foreign.source.continue': 'Continue';
  readonly 'foreign.source.cline': 'Cline';
  readonly 'foreign.source.goose': 'Goose';
  readonly 'foreign.source.dsh4': 'DSH 会话日志（V4 代次）';
  readonly 'foreign.source.zed': 'Zed';
  readonly 'foreign.source.crush': 'Crush';
  readonly 'foreign.source.teleagent': 'TeleAgent';
  readonly 'foreign.source.trae': 'Trae';
  readonly 'foreign.source.vibe': 'Vibe';
  readonly 'foreign.source.dsh': 'DSH 会话日志（V0-V3 代次）';
  readonly 'foreign.action.import': '开始导入';
  readonly 'foreign.action.refresh': '重新检测';
  readonly 'foreign.importFailed': '导入失败：{reason}';
  readonly 'foreign.previewTitle': '将导入的内容';
  readonly 'foreign.previewSections': '包含分区：{sections}';
  readonly 'foreign.previewDryRun': '只读预览 · 零写入';
  readonly 'foreign.previewReset': '来源已变化：上一次的产包结果作废，请重新「开始导入」。';
  readonly 'foreign.lossy.title': '已知有损';
  readonly 'foreign.lossy.hint': '下面三条是「外部配置 → bundle → 导入」这条流水线的既有行为：都不阻断导入，兼容性评分也不会为它们给出原因。';
  readonly 'foreign.lossy.applies': '本包适用';
  readonly 'foreign.lossy.notApplies': '本包不涉及';
  readonly 'foreign.credentialRefs': '需补录凭据 {count} 项（值未带出）';
  readonly 'foreign.credentialRefsNone': '无需补录凭据';
  readonly 'foreign.skipped': '未迁移 {count} 项';
  readonly 'foreign.skip.unsupported-hooks': 'settings 的 hooks：DSH 无对等结构，未迁移';
  readonly 'foreign.skip.unsupported-commands': '斜杠命令：与 DSH 提示词不是同一语义，本次未迁移';
  readonly 'foreign.skip.credentials-not-migrated': '凭据字段只记录名字，值不读取也不迁移';
  readonly 'foreign.skip.skill-missing-file': '技能目录缺少 SKILL.md，未迁移';
  readonly 'foreign.skip.skill-invalid-frontmatter': '技能 frontmatter 非法（缺 name/description 或不是合法 YAML），DSH 会静默丢弃，故未迁移';
  readonly 'foreign.skip.skill-invalid-name': '技能名含非法字符或路径穿越，未迁移';
  readonly 'foreign.skip.mcp-server-empty': 'MCP 条目既无 command 也无 url，未迁移';
  readonly 'foreign.skip.mcp-type-sse-coerced': 'MCP type=sse：按带 url 的 http 处理';
  readonly 'foreign.skip.mcp-credential-redacted': 'MCP 值里发现凭据字段：值已丢弃，只保留字段名与引用名';
  readonly 'foreign.skip.source-unreadable': '外部文件读不到、超限或解析失败';
  readonly 'foreign.skip.source-empty-file': '配置文件存在但为空（0 字节）：如实上报，不产出空分区';
  readonly 'foreign.skip.source-location-overridden': '配置位置被环境变量覆盖，按覆盖后的位置读取';
  readonly 'foreign.skip.session-cwd-derived': '会话记录里没有 cwd：按源侧目录名推导出工作目录，且该目录在本机确实存在（推不出来的一律按「缺少 cwd」跳过）';
  readonly 'foreign.skip.source-needs-explicit-path': '该来源没有自动探测位置：必须显式提供导出文件路径（自动探测永远不会命中）';
  readonly 'foreign.skip.session-format-version-unknown': '本机 DSH 会话格式版本未知：不猜版本，整批会话未迁移';
  readonly 'foreign.skip.session-format-unsupported': '本机 DSH 会话格式版本不受支持，该会话未迁移';
  readonly 'foreign.skip.session-missing-cwd': '会话记录缺少 cwd，无法归位到工作区';
  readonly 'foreign.skip.session-unsafe-id': '会话文件名不能作为安全路径段，未迁移';
  readonly 'foreign.skip.session-empty': '会话没有任何可迁移的事件';
  readonly 'foreign.skip.session-unparsable': '会话存在解析不出来的行，未迁移';
  readonly 'foreign.skip.unsupported-session-record': '该类型的会话记录本版不迁移';
  readonly 'foreign.skip.session-id-conflict': '同 id 会话已存在：不覆盖，跳过并保留本机既有的那条';
  readonly 'foreign.skip.skill-id-conflict': '技能重名：先到先得，其余跳过';
  readonly 'foreign.skip.sessions-not-migrated': '该来源的对话存储形态本版不迁移（只报告，不产出会话分区）';
  readonly 'foreign.skip.memory-report-only': '记忆文件只报告、不导入（正文不进备份包）';
  readonly 'foreign.skip.skill-category-flattened': '技能带分类层级：已压平为 DSH 的单层技能目录';
  readonly 'foreign.skip.legacy-rules-file': '旧式规则文件：DSH 无对等结构，只报告';
  readonly 'foreign.skip.instructions-merged': '多份指令源被合并为一个全局指令文件';
  readonly 'foreign.skip.instructions-override-selected': '命中更高优先级的指令文件（override），按它导入';
  readonly 'foreign.skip.trae-db-key-invalid': 'Trae 加密会话库的密钥对不上（换版或密钥被覆盖）：页面头校验不通过，本次未读出任何会话';
  readonly 'foreign.skip.trae-db-too-large': 'Trae 加密会话库超出本来源的体积上限：未解密，未读出任何会话（全局 1 GiB 上限未改动）';
  readonly 'foreign.skip.trae-db-decrypt-failed': 'Trae 加密会话库无法解密：文件被截断、不是 SQLCipher 形态或读取失败，本次未读出任何会话';
  readonly 'foreign.skip.trae-db-schema-mismatch': 'Trae 加密会话库解密成功但表结构不符（缺 chat_session / history_v2 或必需列）：不猜字段，本次未读出任何会话';
  readonly 'foreign.conflict.policy': '同 id 冲突不覆盖本机内容：跳过并逐条报告';
};
/** 字典键联合（注册处 compile-time 校验） */
type ConfigManagerKey = keyof typeof zh$4;
/**
 * 远程同步设置区块（config-manager-sync）表面文案：zh 为源语言，en 镜像每个键。
 * 独立命名空间、独立文件：不触碰共享的 locales.ts（并行会话已改），零冲突。
 * 键集合经 `SyncKey` 类型在 client/index.ts 注册处做编译期校验。
 */
declare const zh$3: {
  readonly 'section.label': '远程同步';
  readonly 'section.description': '通过 Git 私有仓库在设备间同步可移植配置（密钥默认不同步；勾选「导出密钥」并加密后可随加密快照迁移）';
  readonly privateRepoHint: '安全要求：同步仓库必须为私有仓库（public 仓库会公开你的配置内容）。认证 token 仅用于仓库访问，绝不写入同步文件、提交内容或日志。';
  readonly 'config.title': '仓库配置';
  readonly 'config.repoUrl': '仓库地址';
  readonly 'config.repoUrlHint': 'Git 私有仓库地址（https / ssh / 本地路径）。认证 token 请使用下方凭据字段，不要拼入地址。';
  readonly 'config.gitSubdir': '仓库内子目录';
  readonly 'config.gitSubdirHint': '留空 = 直接用仓库根目录（旧行为）。填了就把同步内容放进该子目录（如「DSH备份」或「tools/dsh」）：多个工具共用一个私有仓库时各自独立。切换子目录不会搬动已有快照 —— 换前缀前先重建工作副本。';
  readonly 'config.gitSubdirPlaceholder': 'DSH备份（可选）';
  readonly 'config.token': '认证 token';
  readonly 'config.tokenHint': '将安全写入 DSH credentials（引用名 {ref}），不会写入同步文件或日志。留空表示沿用已保存的凭据。';
  readonly 'config.tokenSaved': '凭据已配置';
  readonly 'config.tokenMissing': '未配置令牌：可拉取公开仓库，无法推送';
  readonly 'config.tokenPlaceholder': 'ghp_…（可选）';
  readonly 'config.savedTick': '已保存';
  readonly 'channel.title': '同步通道';
  readonly 'channel.git': 'Git 私有仓库';
  readonly 'channel.webdav': 'WebDAV 服务器';
  readonly 'channel.s3': '对象存储（S3 兼容）';
  readonly 'channel.gist': 'GitHub Gist';
  readonly 'channel.open': '配置';
  readonly 'channel.expand': '展开通道详情';
  readonly 'channel.collapse': '收起通道详情';
  readonly 'channel.clear': '断开配置';
  readonly 'channel.clearConfirmTitle': '断开同步通道配置？';
  readonly 'channel.clearConfirmMessage': '将删除「{channel}」的本机配置、已保存的凭据与自动同步开关。远端快照与本机备份不受影响；断开后可重新配置。';
  readonly 'channel.clearConfirm': '断开配置';
  readonly 'channel.clearBusy': '还有保存请求没完成，稍后再点一次断开（最多等 5 秒）';
  readonly 'channel.clearGitSignOut': 'Git 通道的访问令牌会被一并删除：GitHub 登录状态随之失效，需要重新登录（不会自动恢复）。';
  readonly 'channel.configured': '已配置';
  readonly 'channel.notConfigured': '未配置';
  readonly 'channel.currentUrl': '当前地址';
  readonly 'addChannel.title': '添加通道';
  readonly 'addChannel.git': '把配置推进你自己的 Git 仓库（GitHub 仓库可在弹窗里直接登录）';
  readonly 'addChannel.webdav': '同步到 WebDAV 空间：坚果云、Nextcloud、ownCloud、Seafile、群晖、Box';
  readonly 'addChannel.s3': '同步到对象存储桶：AWS S3、阿里云 OSS、腾讯云 COS、MinIO、七牛 Kodo';
  readonly 'addChannel.gist': '用单个 GitHub Gist 存快照，不必新建仓库';
  readonly 'workdir.title': '工作副本';
  readonly 'workdir.hint': '同步使用的 Git 工作副本。每次同步都会让它的 origin 跟随当前仓库地址；改地址后若仍失败，可在这里重指向或重新克隆。';
  readonly 'workdir.path': '路径';
  readonly 'workdir.origin': 'origin';
  readonly 'workdir.match': '已跟随仓库地址';
  readonly 'workdir.mismatch': '仍指向旧地址';
  readonly 'workdir.missing': '尚未创建（首次同步时克隆）';
  readonly 'workdir.unknown': '读不出工作副本状态';
  readonly 'workdir.relink': '重指向仓库地址';
  readonly 'workdir.adopt': '采纳远端历史';
  readonly 'workdir.adoptHint': '把远端的提交历史合并进本机工作副本（用于「换了仓库或远端历史被重写」后无法合并的情况）。不会改写本地提交，合并后可 git revert 撤销；一旦冲突会自动撤销这次合并，工作副本回到操作前。';
  readonly 'workdir.reclone': '重新克隆工作副本';
  readonly 'workdir.recloneConfirmTitle': '重新克隆工作副本？';
  readonly 'workdir.recloneConfirmMessage': '将删除本机工作副本目录并从远端重新克隆。本机配置与远端快照都不受影响，但工作副本里尚未推送的本地提交会被丢弃 —— 需要时请先在同步页执行一次推送。';
  readonly 'workdir.recloneConfirm': '重新克隆';
  readonly 'workdir.remoteSnapshots': '远端快照数';
  readonly 'workdir.backlogAhead': '有本地提交还没上传到远端';
  readonly 'workdir.backlogNeverSynced': '本地领先，但远端从未收到过快照 —— 这条通道可能一直没在真正备份';
  readonly 'toast.workdirRelinked': '工作副本已重指向当前仓库地址';
  readonly 'toast.workdirAdopted': '已采纳远端历史（本地提交未改写，已生成一次合并提交）';
  readonly 'toast.workdirRecloned': '工作副本已重新克隆';
  readonly 'toast.workdirResetFailed': '重建工作副本失败';
  readonly 'syncStatus.lastSync': '上次同步';
  readonly 'syncStatus.sections': '可同步分区';
  readonly 'webdav.title': 'WebDAV 配置';
  readonly 'webdav.url': '服务器地址';
  readonly 'webdav.urlHint': 'WebDAV 服务器根地址（https://…）。同步快照与索引存放于该地址的 dsh-config-manager/ 子目录下。请勿在地址中包含用户名/密码。';
  readonly 'webdav.username': '用户名';
  readonly 'webdav.password': '密码';
  readonly 'webdav.passwordHint': '将安全写入 DSH credentials（引用名 {ref}），不会写入同步文件或日志。留空表示沿用已保存的凭据。';
  readonly 'webdav.passwordSaved': '凭据已配置';
  readonly 'webdav.passwordPlaceholder': '密码（可选）';
  readonly 'webdav.preset.custom': 'Custom URL';
  readonly 'webdav.preset.jianguoyun': '坚果云 (Jianguoyun)';
  readonly 'webdav.preset.nextcloud': 'Nextcloud';
  readonly 'webdav.preset.owncloud': 'ownCloud';
  readonly 'webdav.preset.seafile': 'Seafile';
  readonly 'webdav.preset.synology': 'Synology NAS (WebDAV)';
  readonly 'webdav.preset.box': 'Box';
  readonly 'github.title': 'GitHub 登录';
  readonly 'github.description': '通过 GitHub OAuth 设备码流程授权：无需手动输入 token，在浏览器中确认授权后，token 自动写入 DSH credentials。授权范围是「整个账号」：GitHub OAuth App 无法收窄到单个仓库，组织仓库还需组织管理员批准。只想授权一个仓库 → 改用上方 token 字段填细粒度 PAT（Repository access 选 Only select repositories，Permissions → Contents 设为 Read and write；创建页 github.com/settings/personal-access-tokens/new）。';
  readonly 'github.cancel': '取消';
  readonly 'github.tokenInvalid': 'GitHub 登录已失效，请重新登录。';
  readonly 'github.userCode': '一次性授权代码';
  readonly 'github.openAuth': '打开 GitHub 授权页面';
  readonly 'repoPicker.label': '从我的仓库中选择';
  readonly 'repoPicker.hint': '列出你 GitHub 账号下已有的私有仓库（按最近更新排序），选中即填入下方仓库地址；也可以直接在下方手填地址（ssh / 本地路径 / 不在列表里的仓库）。列表需要先登录 GitHub；新建的仓库一律为私有 —— 公开仓库会公开你的配置内容。';
  readonly 'repoPicker.placeholder': '手动填写地址（或从上方选择）';
  readonly 'repoPicker.refresh': '刷新列表';
  readonly 'repoPicker.refreshed': '已刷新：{count} 个私有仓库';
  readonly 'repoPicker.forkBadge': 'Fork';
  readonly 'repoPicker.empty': '没有可用的私有仓库';
  readonly 'repoPicker.loadFailed': '仓库列表加载失败，可重试或直接手填地址。';
  readonly 'repoPicker.updatedAt': '更新于 {time}';
  readonly 'repoPicker.create': '＋ 新建私有仓库';
  readonly 'repoPicker.createTitle': '新建私有仓库';
  readonly 'repoPicker.name': '仓库名';
  readonly 'repoPicker.namePlaceholder': '如 dsh-configs';
  readonly 'repoPicker.description': '描述';
  readonly 'repoPicker.descriptionPlaceholder': '可选，如「我的配置仓库（dsh-config-manager 自动发布）」';
  readonly 'repoPicker.createSubmit': '创建并选用';
  readonly 'repoPicker.createCancel': '取消';
  readonly 'repoPicker.created': '已创建私有仓库 {name}，地址已填入。';
  readonly 'repoPicker.createFailed': '新建仓库失败';
  readonly 'repoPicker.nameRequired': '请填写仓库名。';
  readonly 'repoPicker.nameInvalid': '仓库名只能包含字母、数字、点、下划线、连字符（最长 100 字符，不能以点开头）。';
  readonly 'push.title': '推送结果';
  readonly 'sections.title': '同步分区';
  readonly 'warnings.title': '分区告警';
  readonly 'syncflow.title': '从远端合并到本机';
  readonly 'syncflow.button': '从远端合并到本机';
  readonly 'syncflow.upToDate': '已是最新，无需同步';
  readonly 'syncflow.syncing': '正在同步…';
  readonly 'syncflow.checkingRemote': '正在检查远端变更…';
  readonly 'syncflow.syncFailed': '同步失败';
  readonly 'syncflow.snapshotOption': '（{date} · {count} 分区）';
  readonly 'syncflow.selectSnapshot': '选择历史快照';
  readonly 'syncflow.refreshSnapshots': '刷新快照列表';
  readonly 'syncflow.latestSnapshot': '最新快照';
  readonly 'syncflow.noSnapshots': '远端暂无快照';
  readonly 'syncflow.snapshotDevice': '由 {device} 推送';
  readonly 'syncflow.confirmImport': '确认导入';
  readonly 'syncflow.cancel': '取消';
  readonly 'syncflow.adoptRemote': '采用远端';
  readonly 'syncflow.adoptHint': '勾选 = 导入该项；取消 = 跳过';
  readonly 'syncflow.needsReviewBadge': '需人工决策';
  readonly 'syncflow.empty': '远端快照与本地一致（无变更）';
  readonly 'syncflow.listScope': '列表逐项确认 {review} 项 · 其余 {auto} 项自动采用';
  readonly 'syncflow.keepLocalAll': '全部保留当前配置';
  readonly 'syncflow.useRemoteAll': '全部使用备份配置';
  readonly 'syncflow.bulkHint': '批量作用于上面 {n} 项';
  readonly 'syncflow.bulkErrorNote': '错误项需逐项处理';
  readonly 'syncflow.conflictUseLocal': '保留当前';
  readonly 'syncflow.conflictUseRemote': '使用备份';
  readonly 'syncflow.conflictUnresolved': '冲突项 {itemId} 尚未选择解决方式（保留当前 / 使用备份）';
  readonly 'syncflow.diff': '差异';
  readonly 'syncflow.importDone': '已导入 {n} 个分区';
  readonly 'syncflow.importFailed': '导入失败（已整体回滚）';
  readonly 'syncflow.importedSections': '已写入';
  readonly 'syncflow.importWarnings': '导入告警';
  readonly 'syncflow.rollback': '回滚到应用前';
  readonly 'syncflow.rollbackDone': '已回滚到应用前';
  readonly 'syncflow.rollbackPartialToast': '回滚未完成：{n} 项没能恢复';
  readonly 'syncflow.rollbackIncomplete': '回滚未完成：{n} 项无法自动恢复（配置可能停留在中间状态）';
  readonly 'syncflow.rollbackFailedItems': '未回滚项（需人工处理）';
  readonly 'syncflow.importRollbackIncomplete': '导入失败，且整体回滚未完成：有改动没能恢复（见下方告警）';
  readonly 'syncflow.needsRestart': '部分改动需要重启 DSH 后生效';
  readonly 'syncflow.pushPreviewTitle': '确认推送';
  readonly 'syncflow.pushPreviewSections': '将推送的分区';
  readonly 'syncflow.pushChanged': '有改动';
  readonly 'syncflow.pushUnchanged': '无改动';
  readonly 'syncflow.pushConfirm': '确认推送';
  readonly 'syncflow.pushForce': '内容未变化也新建快照（强制推送）';
  readonly 'syncflow.pushFirstBaseline': '远端暂无快照：本次将创建首个同步基线';
  readonly 'syncflow.remoteEmptyGuide': '远端还没有任何快照：这是首次同步，先点「推送到远端」把本机配置推上去（推送会创建第一个快照），之后才能拉取。';
  readonly 'mode.title': '同步分区';
  readonly 'mode.selectedCount': '已勾选 {n} / {total}';
  readonly 'mode.deletePlugins': '跟随远端删除插件';
  readonly 'mode.deletePluginsHint': '远端快照里已经没有、本机也没改过的插件会被卸载（判断依据是共同祖先里还有它 —— 那只可能是别处删掉了）。卸载只发生在插件分区真正被应用的那一轮；失败逐项提示、其余同步照常完成。desktop 保留档案与宿主自己不会被删。';
  readonly 'mode.atLeastOne': '请至少勾选一个同步分区';
  readonly 'mode.sectionPortable': '可移植 · 默认同步';
  readonly 'mode.sectionRecommended': '推荐';
  readonly 'mode.sectionDeviceSpecific': '设备相关 · 默认不同步';
  readonly 'mode.sectionPlatformSpecific': '平台相关 · 默认不同步';
  readonly 'mode.mcpHint': 'MCP 服务器按 patch 行写回（导入时落回原层）。按包安装的 stdio 服务器（npx / uvx / pipx）配置本身可跨机；若 command / args / cwd 里是绝对路径，或目标机没装对应运行时，导入分析会给出提示 —— 配置会照常写入，但服务器在目标机可能起不来。';
  readonly 'mode.sessionsLimit': '同步最近多少个会话';
  readonly 'mode.sessionsLimitHint': '历史会话内容敏感，默认只带最近的 5 个（0 = 只勾选不带会话）；单位是一个会话目录，同一会话的全部日志一起走。';
  readonly 'mode.sessionsPick': '选择具体对话';
  readonly 'mode.sessionsPickCount': '已点名 {n} 个对话';
  readonly 'mode.sessionsPickTitle': '选择要同步的历史对话';
  readonly 'mode.sessionsPickHint': '点名后只同步勾中的对话（优先于上面的数量上限）；一个都不勾 = 回到「最近 N 个」模式。';
  readonly 'mode.sessionsPickReset': '改为「最近 N 个」';
  readonly 'mode.gistSessionsWarn': '当前通道是 GitHub Gist，且勾选了「历史会话」：gist 会一次取回全部文件内容、单文件超限即截断、文件数还有上限，大分区同步可能失败或内容被截断。建议改用 Git / WebDAV / 对象存储通道同步历史会话，或取消勾选该分区。';
  readonly 'mode.persistHint': '分区选择已保存到本机：自动同步和手动推送都会使用此配置（重启后仍生效）。';
  readonly 'mode.choose': '选择';
  readonly 'mode.pickerTitle': '选择同步分区';
  readonly 'mode.pickerHint': '改动即时生效并保存（关闭弹窗即完成）。';
  readonly 'mode.pickerBack': '返回分区列表';
  readonly 'mode.pickerDone': '完成';
  readonly 'mode.settingsTitle': '同步设置';
  readonly 'mode.settingsOpen': '设置';
  readonly 'mode.tabContent': '同步内容';
  readonly 'mode.tabAutosync': '自动同步';
  readonly 'mode.tabSecurity': '加密与密码';
  readonly 'mode.encryptOn': '加密已开';
  readonly 'mode.encryptOff': '未加密';
  readonly 'mode.security': '加密与密钥导出';
  readonly 'mode.encrypt': '加密备份';
  readonly 'mode.encryptHint': '用密码加密同步快照（AES-256-GCM）。密码存在本机 DSH 凭据库（~/.dsh/.credentials.yaml）长期复用：不写进同步文件、日志或备份（除非同时勾选「导出密钥」）。自动同步没有密码，遇到加密快照会跳过并在同步历史提示。';
  readonly 'mode.password': '加密密码';
  readonly 'mode.passwordConfirm': '确认密码';
  readonly 'mode.passwordMismatch': '两次输入的密码不一致';
  readonly 'mode.passwordRequired': '加密必须设置密码';
  readonly 'mode.passwordPlaceholder': '已保存（留空即沿用）';
  readonly 'mode.passwordClearNotice': '取消勾选会删除已保存的密码';
  readonly 'mode.includeSecrets': '导出密钥';
  readonly 'mode.includeSecretsHint': '把真实凭据值（~/.dsh/.credentials.yaml）写入加密快照，可在另一台机器上随同步一并写回本机凭据；勾选时自动选中加密，密钥绝不进入未加密快照。';
  readonly 'mode.decryptPassword': '解密密码（加密快照拉取/同步用，可选）';
  readonly 'mode.decryptPasswordHint': '输入后保存在本机凭据库，下次拉取自动使用；只有拉取的快照确实加密时才会用到 —— 未加密的备份不会使用密码。';
  readonly 'mode.decryptPasswordSaved': '已保存到本机';
  readonly 'mode.decryptPasswordPlaceholder': '已保存（留空即沿用）';
  readonly 'mode.clearSavedPassword': '删除已保存密码';
  readonly 'autosync.title': '自动同步';
  readonly 'autosync.description': '开启后，DSH 在后台保持配置一致：本地配置有改动时自动上传，检测到远端有新快照时才自动拉取合并；定时器仅作兜底轮询，无变化不重复动作。仅在无冲突且无需人工干预时才自动写入本地。';
  readonly 'autosync.enable': '启用';
  readonly 'autosync.interval': '兜底轮询间隔';
  readonly 'autosync.intervalHint': '兜底检查节奏：间隔到点 / DSH 启动时检查远端是否有新快照，有才拉取合并。启用「本地改动即时同步」后，保存配置会立刻触发一轮，不必等这里。';
  readonly 'autosync.realtime': '本地改动即时同步';
  readonly 'autosync.realtimeHint': '监听本机可同步的配置（settings.yaml、cordis.patch.yml、skills、profiles 下的插件清单等），保存后立即上传；关闭则只在兜底间隔到点时检查。';
  readonly 'autosync.autoApplyTier': '自动应用范围';
  readonly 'autosync.autoApplyTierHint': '决定远端改动能自动写回本机的范围：「仅低风险分区」= settings / ui / providers / prompts / skills 等；「含 plugins 与 mcp」= 连中风险分区也自动落盘（缺省）。凭据、插件数据类分区永不自动写入。';
  readonly 'autosync.tierLow': '仅低风险分区';
  readonly 'autosync.tierMedium': '含 plugins 与 mcp（推荐）';
  readonly 'autosync.conflictPolicy': '双侧都改时';
  readonly 'autosync.conflictPolicyHint': '本机与远端都改了同一分区时：「保留本机并推上去」= 本机版本成为新的远端最新（被覆盖的远端快照仍在历史里，可回滚）；「保留冲突待我确认」= 上下行都停下，等你在同步页裁决。';
  readonly 'autosync.conflictLocal': '保留本机并推上去';
  readonly 'autosync.conflictAsk': '保留冲突待我确认';
  readonly 'autosync.interval5m': '5 分钟';
  readonly 'autosync.interval15m': '15 分钟';
  readonly 'autosync.interval30m': '30 分钟';
  readonly 'autosync.interval60m': '60 分钟';
  readonly 'autosync.interval6h': '6 小时';
  readonly 'autosync.interval12h': '12 小时';
  readonly 'autosync.interval24h': '24 小时';
  readonly 'autosync.statusNever': '从未运行';
  readonly 'autosync.nextRun': '下次约 {time} 后';
  readonly 'autosync.due': '已到同步时间，即将执行';
  readonly 'autosync.success': '成功';
  readonly 'autosync.skipped': '已跳过';
  readonly 'autosync.failed': '失败';
  readonly 'autosync.partial': '部分成功';
  readonly 'autosync.skipReasonLabel': '跳过原因';
  readonly 'autosync.skipReasonConflictCount': '{reason}（远端另有 {n} 个分区待确认，可在同步页手动处理）';
  readonly 'autosync.pendingMerge': '待裁决 {n} 个分区（自 {time}）';
  readonly 'autosync.lastMessage': '本轮消息';
  readonly 'history.title': '同步历史';
  readonly 'history.refresh': '刷新';
  readonly 'history.empty': '尚无同步历史';
  readonly 'history.emptyHint': '完成首次推送 / 从远端合并 / 自动同步后，这里会显示记录。';
  readonly 'history.colTime': '时间';
  readonly 'history.colDetail': '详情';
  readonly 'history.kindAutosync': '自动同步';
  readonly 'history.sectionCount': '分区';
  readonly 'history.detail': '明细';
  readonly 'history.autosyncPull': '下载';
  readonly 'history.autosyncPush': '上传';
  readonly 'history.autosyncBoth': '双向';
  readonly 'history.autosyncReasonConflict': '冲突';
  readonly 'history.autosyncReasonBaselineAdopted': '基线已自动收养（上次推送在记录基线前被打断）';
  readonly 'history.autosyncReasonNoRemote': '无远端快照';
  readonly 'history.autosyncReasonNotConfigured': '未配置仓库';
  readonly 'history.autosyncReasonNetwork': '网络问题';
  readonly 'history.autosyncReasonEncrypted': '远端快照已加密，自动同步跳过（请手动同步）';
  readonly 'history.autosyncReasonMutationLocked': '环境锁被另一个任务占用（稍后重试即可）';
  readonly 'history.autosyncReasonLockStale': '存在残留环境锁（上次任务异常退出留下，重试与重启都不会自愈）——请到「事故恢复」回收';
  readonly 'history.autosyncReasonLockUnavailable': '环境锁暂时不可用（锁目录读写失败或状态未知），稍后重试';
  readonly 'history.autosyncReasonSafeMode': '处于 SAFE MODE（外部操作失败后自动阻断写入）——请到「事故恢复」处理后重试';
  readonly 'history.autosyncReasonUnknown': '未知';
  readonly 'history.autosyncReasonConflictKeptLocal': '已按策略保留本机并覆盖远端';
  readonly 'history.autosyncReasonUpToDate': '无变化（本地与远端一致）';
  readonly 'history.autosyncReasonWarning': '部分内容未落地（详情见本轮告警）';
  readonly 'history.autosyncReasonUnchanged': '远端无新快照，无需合并';
  readonly 'history.autosyncConflicted': '跳过冲突分区：{sections}';
  readonly 'history.autosyncApplied': '应用分区：{sections}';
  readonly 'history.autosyncError': '错误：{error}';
  readonly 'history.channelGit': 'GitHub';
  readonly 'history.channelWebdav': 'WebDAV';
  readonly 'history.channelS3': 'S3';
  readonly 'history.channelGist': 'Gist';
  readonly 'history.stats.total': '共 {count} 条';
  readonly 'history.stats.autosync': '自动同步 {count}';
  readonly 'history.stats.failed': '失败 {count}';
  readonly 'history.stats.skipped': '跳过 {count}';
  readonly 'history.stats.summary': '同步历史统计';
  readonly 'toast.autosyncLoadFailed': '读取自动同步状态失败';
  readonly 'toast.configSaveFailed': '保存通道配置失败';
  readonly 'toast.channelCleared': '{channel} 配置已断开';
  readonly 'toast.githubCodeCopied': '已复制一次性授权代码 {code}';
  readonly 'toast.githubCodeCopyFailed': '自动复制失败，请手动复制上面的一次性授权代码';
  readonly 'toast.channelClearFailed': '断开通道配置失败';
  readonly 'toast.selectionSaveFailed': '同步设置保存失败';
  readonly 'toast.pushPreviewFailed': '推送预览失败';
  readonly 'toast.pushFailed': '推送失败';
  readonly 'toast.pushDone': '推送完成';
  readonly 'toast.pushSkipped': '内容未变化，已跳过';
  readonly 'toast.syncStartFailed': '从远端合并失败';
  readonly 'toast.autosyncUpdateFailed': '自动同步设置更新失败';
  readonly 'toast.autosyncUpdated': '自动同步设置已更新';
  readonly 'toast.snapshotsLoadFailed': '读取远端快照失败';
  readonly 'toast.snapshotsRefreshed': '远端快照列表已刷新';
  readonly 'toast.snapshotsUnreadable': '远端有 {n} 个快照读不出来（列表不完整），详见下方说明';
  readonly 'snapshots.unreadableHint': '远端存在 {n} 个无法解析的快照，它们不会出现在列表里：{files}';
  readonly 'load.failed': '加载同步状态失败';
  readonly 'common.close': '关闭';
  readonly 'common.labelSeparator': '：';
  readonly 'common.parens': '（{text}）';
  readonly 'common.listSeparator': '、';
  readonly 'common.retry': '重试';
  readonly 'common.loading': '加载中…';
  readonly 'common.infoHint': '查看说明';
  readonly 'common.cancel': '取消';
  readonly 'syncflow.importPartialToast': '部分成功：{n} 项未生效，请查看结果明细';
  readonly 'syncflow.importPartial': '部分成功：{n} 项未生效（其余已写入，未整体回滚）';
  readonly 'syncflow.ineffectiveItems': '未生效项';
  readonly 'syncflow.compat.excellent': '兼容性：优秀';
  readonly 'syncflow.compat.good': '兼容性：良好（备份来自更旧的 DSH）';
  readonly 'syncflow.compat.partial': '兼容性：部分兼容（跨平台 / 分区缺失 / 版本超前，需人工确认）';
  readonly 'syncflow.compat.unsupported': '兼容性：不受支持（格式版本超出范围）';
  readonly 'cloud.s3Title': '对象存储（S3 兼容）';
  readonly 'cloud.gistTitle': 'GitHub Gist';
  readonly 'cloud.provider': '兼容商';
  readonly 'cloud.provider.s3': 'AWS S3';
  readonly 'cloud.provider.oss': '阿里云 OSS';
  readonly 'cloud.provider.cos': '腾讯云 COS';
  readonly 'cloud.provider.minio': 'MinIO';
  readonly 'cloud.provider.kodo': '七牛 Kodo';
  readonly 'cloud.endpoint': '端点 Endpoint';
  readonly 'cloud.endpointHint': '不含桶名与凭据，例如 https://s3.us-east-1.amazonaws.com。';
  readonly 'cloud.region': '区域 Region';
  readonly 'cloud.regionHint': 'V4 签名作用域，例如 us-east-1 / cn-hangzhou。';
  readonly 'cloud.bucket': '存储桶 Bucket';
  readonly 'cloud.bucketHint': '3-63 位小写字母、数字、点或连字符，首尾须为字母或数字。';
  readonly 'cloud.prefix': '对象键前缀（可选）';
  readonly 'cloud.prefixHint': '留空 = 根前缀；首尾斜杠会被忽略。';
  readonly 'cloud.accessKeyId': 'AccessKey ID';
  readonly 'cloud.accessKeyIdHint': '标识符（非密钥，会写入配置文件）；Secret 请填在下方密钥框。';
  readonly 'cloud.pathStyle': '使用 path-style 寻址';
  readonly 'cloud.pathStyleHint': 'MinIO 等自建服务通常需要；不勾选则跟随兼容商缺省。';
  readonly 'cloud.secret': 'Secret AccessKey';
  readonly 'cloud.secretHint': '值只写入 DSH 凭据槽位（{ref}）：不进配置文件、不进日志、不回传浏览器；留空表示沿用已保存的密钥。';
  readonly 'cloud.secretSaved': '密钥已保存';
  readonly 'cloud.secretPlaceholder': '••••••••';
  readonly 'cloud.gistId': 'Gist ID';
  readonly 'cloud.gistIdHint': 'gist 地址末段的十六进制 id（如 https://gist.github.com/<用户>/<id>）。';
  readonly 'cloud.gistLargeSectionHint': 'gist 通道不做内容外置：一次请求就把全部文件内容取回、单文件超限会被截断，且文件数有上限 —— 历史会话这类大分区不适合走 gist，请改用 Git / WebDAV / 对象存储通道。';
  readonly 'cloud.apiBaseUrl': 'API 根地址（可选）';
  readonly 'cloud.apiBaseUrlHint': '留空 = https://api.github.com；GitHub Enterprise 可改为自建地址。';
  readonly 'cloud.filePrefix': '文件名前缀（可选）';
  readonly 'cloud.filePrefixHint': 'gist 内的文件名前缀，留空 = dsh-sync。';
  readonly 'cloud.token': 'Gist token';
  readonly 'cloud.tokenHint': '值只写入 DSH 凭据槽位（{ref}）：不进配置文件、不进日志、不回传浏览器；留空表示沿用已保存的 token。';
  readonly 'cloud.tokenSaved': 'token 已保存';
  readonly 'cloud.tokenPlaceholder': 'ghp_… 或 gho_…';
  readonly 'cloud.invalidTitle': '还有必填项或格式问题没解决：';
  readonly 'cloud.providerUnknown': '兼容商不在支持列表内';
  readonly 'cloud.endpointRequired': '请填写端点地址';
  readonly 'cloud.endpointInvalid': '端点地址必须是 http(s) 且不含空白 / 查询串 / 锚点';
  readonly 'cloud.endpointUserinfo': '端点地址不得包含用户名或密码';
  readonly 'cloud.regionRequired': '请填写区域（region）';
  readonly 'cloud.bucketRequired': '请填写存储桶名';
  readonly 'cloud.bucketInvalid': '桶名不合规：3-63 位小写字母、数字、点或连字符，首尾为字母或数字，且不得含 “..”';
  readonly 'cloud.prefixInvalid': '对象键前缀不得含反斜杠、“//” 或 “..”';
  readonly 'cloud.accessKeyIdRequired': '请填写 AccessKey ID';
  readonly 'cloud.gistIdRequired': '请填写 Gist ID';
  readonly 'cloud.gistIdInvalid': 'Gist ID 必须是 5-64 位十六进制串';
  readonly 'cloud.apiBaseUrlInvalid': 'API 根地址必须是 http(s) 且不含用户名/密码';
  readonly 'cloud.secretWriterRequired': '宿主未提供凭据写入通道，无法保存密钥';
  readonly 'cloud.credentialsWriteFailed': '密钥写入 DSH 凭据失败（配置未保存）';
  readonly 'merge.title': '远程合并';
  readonly 'merge.subtitle': '读取远端快照做三方合并（本地 / 远端 / 共同基准），列出需要你裁决的分区；预览阶段零写入。';
  readonly 'merge.loading': '正在读取远端快照并合并…';
  readonly 'merge.reload': '重新预览';
  readonly 'merge.empty': '没有需要合并的内容';
  readonly 'merge.noAncestor': '没有共同基准快照：合并退化为两方比较，两侧不一致的分区一律按冲突处理，需要你逐个裁决。';
  readonly 'merge.summary.auto': '可自动应用';
  readonly 'merge.summary.review': '待裁决';
  readonly 'merge.summary.conflicts': '冲突';
  readonly 'merge.summary.skipped': '无变化';
  readonly 'merge.section.title': '分区裁决';
  readonly 'merge.scopeNotice': '冲突按分区整体裁决（本版不做逐条裁决）。';
  readonly 'merge.decision.useRemote': '采用远端';
  readonly 'merge.decision.keepLocal': '保留本地';
  readonly 'merge.decision.merge': '自动合并';
  readonly 'merge.decision.skip': '无变化';
  readonly 'merge.decision.conflict': '需裁决';
  readonly 'merge.kind.key': '键';
  readonly 'merge.kind.file': '文件';
  readonly 'merge.reason.bothModified': '两侧都改动了同一位置';
  readonly 'merge.reason.modifyDelete': '一侧改动、另一侧删除';
  readonly 'merge.reason.deleteModify': '一侧删除、另一侧改动';
  readonly 'merge.reason.noAncestor': '没有共同基准，无法判断谁改动了';
  readonly 'merge.reason.binary': '二进制内容无法安全合并';
  readonly 'merge.reason.format': '内容格式不支持自动合并';
  readonly 'merge.reason.array': '数组无法按位置合并';
  readonly 'merge.reason.section': '整个分区冲突';
  readonly 'merge.conflictCount': '{n} 处冲突';
  readonly 'merge.autoMergedCount': '已自动并入 {n} 处改动';
  readonly 'merge.col.local': '本地';
  readonly 'merge.col.remote': '远端';
  readonly 'merge.col.ancestor': '基准';
  readonly 'merge.preview.empty': '（空）';
  readonly 'merge.action.useLocal': '采用本地';
  readonly 'merge.action.useRemote': '采用远端';
  readonly 'merge.action.useMerged': '采用自动合并';
  readonly 'merge.action.current': '当前裁决';
  readonly 'merge.bulk.keepLocal': '全部采用本地';
  readonly 'merge.bulk.useRemote': '全部采用远端';
  readonly 'merge.bulk.useMerged': '全部采用自动合并';
  readonly 'merge.bulk.leavePending': '冲突留到下次';
  readonly 'merge.bulk.hint': '「全部采用自动合并」只对真有自动合并结果的分区生效；「冲突留到下次」把需要你裁决的分区全部移出本次操作（不写入、不推进基线），下次同步它们还会出现。';
  readonly 'merge.bulk.title': '批量';
  readonly 'merge.apply': '执行合并';
  readonly 'merge.apply.summary': '已裁决 {decided} / 待裁决 {needs} 个分区';
  readonly 'merge.apply.willApply': '本次会应用 {n} 个分区';
  readonly 'merge.result.title': '合并结果';
  readonly 'merge.result.applied': '已应用分区';
  readonly 'merge.result.skipped': '已跳过';
  readonly 'merge.result.warnings': '警告';
  readonly 'merge.result.restoreId': '回滚点';
  readonly 'merge.result.rolledBack': '已整体回滚';
  readonly 'merge.result.rollbackIncomplete': '整体回滚不完整：有项未恢复（见警告）';
  readonly 'merge.result.pending': '仍有 {n} 个分区待裁决（跳过 ≠ 已解决，下次同步仍会出现）';
  readonly 'merge.result.rollback': '一键回滚';
  readonly 'merge.result.rolledBackTo': '已回滚到 {id}';
  readonly 'merge.result.failed': '{n} 项失败';
  readonly 'merge.result.ineffective': '{n} 项未生效';
  readonly 'merge.error.previewFailed': '合并预览失败';
  readonly 'merge.toast.applyFailed': '执行合并失败';
  readonly 'merge.toast.applied': '合并已执行';
  readonly 'merge.toast.rollbackFailed': '回滚失败';
  readonly 'merge.toast.previewFailed': '读取远程合并预览失败';
  readonly 'probe.run': '测试连接';
  readonly 'probe.hint': '只读自检：凭据 / 端点 / 目标容器 / 目录可达。WebDAV 通道可能幂等创建上级目录（那正是它要修的故障）；不会推送或改动任何快照。';
  readonly 'probe.createdCollections': '已在远端自动创建目录：{list}';
  readonly 'probe.snapshotCount': '远端现有快照：{count} 份';
  readonly 'probe.unsupported': '该通道不提供连通性自检';
  readonly 'mode.tabAutosyncSecurity': '设置';
  readonly 'mode.pluginsGroup': '插件';
  readonly 'mode.decryptGroup': '解密密码';
  readonly 'mode.decryptPasswordShort': '解密密码';
  readonly 'mode.securityHint': '这一段管两件事：加密备份把同步快照上密码，导出密钥把本机真实凭据一起放进加密快照。两者都需要加密开启；密码与凭据都存本机凭据库，不进同步文件、日志或备份。';
  readonly 'mode.passwordHint': '两个框填一致才会保存；失焦即落库，之后留空表示沿用已保存的密码。取消勾选「加密备份」会删掉已存密码。';
  readonly 'mode.pluginsGroupHint': '这一段的设置只作用于「插件」分区：远端已删、本机没改过的插件会被卸载，失败逐项提示、其余同步照常完成。';
};
/** 字典键联合（注册处 compile-time 校验） */
type SyncKey = keyof typeof zh$3;
/**
 * 配置市场区块（config-manager-market）表面文案：zh 为源语言，en 镜像每个键。
 * 独立命名空间、独立文件：与 config-manager / config-manager-sync 平行，不触碰共享字典。
 *
 * 双层文案分工（与 SyncSettingsView 同款）：
 *  - 本命名空间（TranslateNS<'config-manager-market'>）= React 壳文案（标题 / 表单 / 按钮 / 列表控件）；
 *  - 纯渲染模型文案（market-view.ts 产出，如供应链警示、状态行、条目徽章文本）走共享
 *    `src/ui/i18n.ts` 的 `market.*` 键（UiT），由 MarketApi.t 提供 —— 与 sync-view.ts 用 `sync.*` 同构。
 *
 * 键集合经 `MarketKey` 类型在 client/index.ts 注册处做编译期校验。
 */
declare const zh$2: {
  readonly 'section.label': '配置市场';
  readonly 'section.description': '浏览并下载社区共享的配置（公开 Git 仓库；下载内容一律视为不可信，导入前必经校验与确认）';
  readonly 'config.title': '市场仓库';
  readonly 'config.refresh': '拉取最新';
  readonly 'config.refreshed': '已拉取最新市场目录';
  readonly 'list.browse': '浏览';
  readonly 'list.browsed': '已重新浏览市场';
  readonly 'list.loading': '正在读取市场…';
  readonly 'list.noItems': '该市场暂无条目。';
  readonly 'list.installMissing': '市场列表里没有这个条目（可能已被移除），已为你打开市场列表';
  readonly 'list.searchPlaceholder': '搜索名称 / 作者 / 描述…';
  readonly 'list.categoriesAll': '全部类别';
  readonly 'list.sectionsAll': '全部分区';
  readonly 'list.sectionsUnknown': '另有 {count} 个条目未下载，无法按分区匹配';
  readonly 'list.sourceAll': '全部来源';
  readonly 'list.sourceOfficial': '官方配置';
  readonly 'list.sourcePersonal': '个人配置';
  readonly 'list.sortDefault': '默认排序';
  readonly 'list.sortUpdated': '最新更新';
  readonly 'list.sortStars': '⭐ 最多';
  readonly 'list.sortName': '名称 A–Z';
  readonly 'list.stars': '⭐ {count}';
  readonly 'list.count': '共 {count} 个条目';
  readonly 'list.filtered': '（筛选后 {count} 个）';
  readonly 'list.cacheCached': '已缓存';
  readonly 'list.cacheFresh': '刚刚拉取';
  readonly 'list.cacheNone': '未缓存';
  readonly 'list.download': '查看详情';
  readonly 'detail.title': '条目详情';
  readonly 'detail.version': '版本 {version}';
  readonly 'detail.errors': '校验错误：';
  readonly 'detail.emptySections': '该条目未包含任何可导入分区';
  readonly 'detail.needReview': '需要人工确认';
  readonly 'detail.previewHint': '只读预览，尚未改动本机';
  readonly 'detail.impact.willChange': '将变更 {count} 项';
  readonly 'detail.impact.unchanged': '已一致 {count} 项';
  readonly 'detail.impact.conflicts': '冲突 {count}';
  readonly 'detail.impact.secrets': '需补录密钥 {count}';
  readonly 'detail.impact.paths': '路径映射 {count}';
  readonly 'detail.impact.restart': '需重启 DSH 生效';
  readonly 'detail.import': '确认导入';
  readonly 'detail.back': '返回列表';
  readonly 'review.highRiskHint': '已勾选高风险分区（{sections}）：未经官方审核的公共仓库条目，会在本机安装插件 / 写入文件 / 注入全局指令。';
  readonly 'review.changeCount': '已选 {selected}/{total} 项';
  readonly 'review.changeWillChange': '将改动 {count} 项';
  readonly 'review.changeUnchanged': '已一致 {count} 项';
  readonly 'review.changeEmpty': '该条目没有可勾选的内容项。';
  readonly 'review.rowWillChange': '将改动';
  readonly 'review.rowUnchanged': '已一致';
  readonly 'review.rowExcluded': '不导入';
  readonly 'review.conflictHint': '有 {count} 项冲突待决策；未决策项保留本机内容。';
  readonly 'review.nothingSelected': '未勾选任何内容，无法导入';
  readonly 'review.rollback': '回滚到导入前快照';
  readonly 'review.rollbackHint': '把本机配置恢复到本次导入之前。';
  readonly 'review.snapshotMissing': '本次导入没有可用快照，无法回滚。';
  readonly 'review.rollbackConfirmTitle': '回滚到导入前快照？';
  readonly 'review.rollbackConfirmMessage': '将把本机配置恢复为「{item}」导入前的状态（快照 {id}）。本次导入写入的内容会被覆盖。';
  readonly 'review.rollbackConfirm': '确认回滚';
  readonly 'review.rollbackDone': '已回滚到导入前快照';
  readonly 'review.rollbackReport': '回滚报告';
  readonly 'review.rollbackRestored': '已恢复 {count} 项';
  readonly 'review.rollbackRemovedPlugins': '移除插件 {count} 个';
  readonly 'review.rollbackFailed': '失败 {count} 项';
  readonly 'review.rollbackManual': '需人工处理 {count} 项';
  readonly 'review.step.preview': '预览';
  readonly 'review.step.select': '选择内容';
  readonly 'review.step.conflicts': '冲突';
  readonly 'review.step.confirm': '确认';
  readonly 'review.step.result': '结果';
  readonly 'review.stepAria': '第 {current} 步，共 {total} 步';
  readonly 'review.filterAria': '按内容筛选';
  readonly 'review.filter.all': '全部';
  readonly 'review.filter.willChange': '将改动';
  readonly 'review.filter.highRisk': '高风险';
  readonly 'review.filter.unselected': '未勾选';
  readonly 'review.filterEmpty': '当前筛选下没有条目。';
  readonly 'review.sectionUnits': '已选 {selected}/{total} 个条目';
  readonly 'review.excludedCount': '已取消 {count} 项';
  readonly 'review.next': '下一步';
  readonly 'review.back': '上一步';
  readonly 'review.confirmHint': '导入前自动创建可回滚快照';
  readonly 'review.resultOk': '成功写入 {count} 项';
  readonly 'review.resultFailed': '失败 {count} 项';
  readonly 'review.reviewAgain': '返回重新选择';
  readonly 'import.done': '导入完成：{count} 项写入';
  readonly 'import.failed': '导入失败（{count} 项失败）';
  readonly 'import.needsRestart': '部分改动需重启 DSH 后生效';
  readonly 'detail.failed': '下载失败，详情见右下角提示';
  readonly 'myconfigs.tab.browse': '浏览市场';
  readonly 'myconfigs.tab.myconfigs': '我的配置';
  readonly 'myconfigs.login.hint': '登录后即可一键上传配置到你的公开仓库（自动创建 <login>/dsh-configs）并提交官方市场收录（目标仓库固定，不可修改）。';
  readonly 'myconfigs.login.checking': '正在检查登录状态…';
  readonly 'myconfigs.login.loggedInAs': '已登录：{login}';
  readonly 'myconfigs.login.targetRepo': '收录目标（固定）：{repo}';
  readonly 'myconfigs.login.repoMissing': '配置仓库尚未创建，首次上传将自动创建（公开）';
  readonly 'myconfigs.login.repoReady': '配置仓库：{repo}';
  readonly 'myconfigs.login.cancel': '取消登录';
  readonly 'myconfigs.login.userCode': '一次性代码：{code}';
  readonly 'myconfigs.login.openAuth': '打开授权页';
  readonly 'myconfigs.upload.title': '一键上传';
  readonly 'myconfigs.upload.selectHint': '选择导出的配置 zip（先在「导出」tab 生成备份文件，再回到这里选择）。市场通道永不携带秘密——包含密钥的备份将被拒绝。';
  readonly 'myconfigs.upload.select': '选择 ZIP…';
  readonly 'myconfigs.upload.reselect': '重新选择';
  readonly 'myconfigs.upload.selected': '{name}';
  readonly 'myconfigs.upload.validateOk': '校验通过：内容合法、不含密钥';
  readonly 'myconfigs.upload.validateSecrets': '包含密钥：市场通道永不携带秘密，拒绝上传';
  readonly 'myconfigs.upload.validateInvalid': '内容校验未通过，无法上传';
  readonly 'myconfigs.upload.form.name': '名称';
  readonly 'myconfigs.upload.form.description': '描述（可选）';
  readonly 'myconfigs.upload.form.categories': '类别（可选，逗号分隔）';
  readonly 'myconfigs.upload.form.autoTitle': '自动生成';
  readonly 'myconfigs.upload.mode.title': '发布模式';
  readonly 'myconfigs.upload.mode.migrate': '迁移（保留全部内容）';
  readonly 'myconfigs.upload.mode.share': '分享（自动排除敏感内容）';
  readonly 'myconfigs.upload.mode.shareHint': '分享模式将自动排除设备/平台相关分区（凭据状态 / 会话 / MCP / 工作区等），并对隐私内容强制拦截——发现任何敏感痕迹将拒绝发布，而不是仅警告。';
  readonly 'myconfigs.upload.run': '上传配置包';
  readonly 'myconfigs.update.title': '更新配置';
  readonly 'myconfigs.update.hint': '版本自动 +1';
  readonly 'myconfigs.update.run': '一键更新';
  readonly 'myconfigs.update.selectZip': '选择新 ZIP…';
  readonly 'myconfigs.result.title': '上传/更新完成';
  readonly 'myconfigs.result.version': '版本 {version}';
  readonly 'myconfigs.result.sha256': 'SHA-256：{hash}';
  readonly 'myconfigs.result.sections': '分区：{sections}';
  readonly 'myconfigs.result.repo': '配置仓库';
  readonly 'myconfigs.result.openRepo': '打开仓库';
  readonly 'myconfigs.result.pr': '收录 PR #{number}';
  readonly 'myconfigs.result.openPr': '查看 PR';
  readonly 'myconfigs.result.listingPending': '已上传 ✓ 正在后台提交收录（fork + 收录 PR），稍后列表状态自动更新';
  readonly 'myconfigs.result.listingFailed': '收录失败';
  readonly 'myconfigs.result.relist': '重新提交收录';
  readonly 'myconfigs.list.title': '已上传';
  readonly 'myconfigs.list.empty': '尚未上传任何配置';
  readonly 'myconfigs.list.loading': '正在读取…';
  readonly 'myconfigs.list.refresh': '刷新';
  readonly 'myconfigs.list.summary': '共 {total} 条 · {listed} 已收录 · {pending} 待审核 · {none} 未收录';
  readonly 'myconfigs.list.openRepo': '打开仓库';
  readonly 'myconfigs.item.update': '更新';
  readonly 'myconfigs.item.install': '装回本地';
  readonly 'myconfigs.item.openPr': '查看收录 PR';
  readonly 'myconfigs.install.failed': '下载失败，详情见右下角提示';
  readonly 'myconfigs.delete.run': '删除';
  readonly 'myconfigs.delete.confirm': '确认删除';
  readonly 'myconfigs.delete.confirmTitle': '删除条目';
  readonly 'myconfigs.delete.confirmText': '确认删除？该操作会从配置仓库永久删除该条目的索引与文件（不可恢复）';
  readonly 'myconfigs.delete.delistStarted': '已删除本地条目，并自动提交「下架 PR」（官方市场移除需人工合并，期间市场可能仍显示该条目）';
  readonly 'myconfigs.delete.prClosed': '已删除本地条目，并关闭该条目的待审核收录 PR';
  readonly 'disclaimer.title': '免责声明';
  readonly 'disclaimer.upload.text': '你即将把配置上传到你的公开仓库（<login>/dsh-configs）并提交官方市场收录申请。\n\n上传后内容将对所有人公开可见，且需经过人工审核才能进入官方市场。请确保：\n· 内容不包含任何真实密钥 / 凭据（环境变量引用如 $VAR 是安全的）；\n· 内容不包含个人隐私或本地环境信息；\n· 你有权分享这些配置。';
  readonly 'disclaimer.download.text': '你即将从公共网络市场下载配置并导入本地。\n\n下载内容属于不可信输入：未经官方审核、可能包含风险（安装插件 / 写入文件 / 修改设置）。\n· 选择内容页逐项列出「本次将改动什么」，并就地标出高风险分区，请核对后再确认；\n· 各分区（含高风险）默认已勾选：取消勾选即不导入、也不进快照；\n· 导入会先自动创建快照，导入后可一键回滚；\n· 请核对来源与内容后再确认导入。';
  readonly 'disclaimer.install.text': '你即将把配置从你的公开仓库装回本地。\n\n该内容属于你此前上传的配置，但同样会经过安全校验与内容选择（默认全选）：\n· 选择页会就地标出高风险分区，取消勾选即不导入、也不进快照；\n· 导入前自动创建快照，导入后可一键回滚。';
  readonly 'disclaimer.confirm': '我已了解，继续';
  readonly 'disclaimer.dontAsk': '不再提示（该操作以后不再显示免责声明）';
  readonly 'myconfigs.error.loadStatus': '登录状态读取失败';
  readonly 'common.cancel': '取消';
  readonly 'common.labelSeparator': '：';
  readonly 'common.close': '关闭';
  readonly 'common.retry': '重试';
  readonly 'common.loading': '加载中…';
  readonly 'common.unknownError': '未知错误';
  readonly 'common.infoHint': '查看说明';
};
/** 字典键联合（注册处 compile-time 校验） */
type MarketKey = keyof typeof zh$2;
/**
 * Recovery 区块（config-manager-recovery）表面文案：zh 为源语言，en 镜像每个键。
 * 独立命名空间、独立文件：不触碰共享的 locales.ts（并行会话已改），零冲突。
 * 键集合经 `RecoveryKey` 类型在 client/index.ts 注册处做编译期校验。
 *
 * 覆盖（§10.2 / Step 8 要求）：Recovery Required / Rollback Recommended / Recovery In Progress /
 * Verification / Verified / Partial Match / Mismatch / Verification Error / Needs Attention /
 * Preview / Confirm / Execute / Verify / Retry / Dismiss / Quarantine / Snapshot / Operation /
 * Environment / Manual Action Required。
 */
declare const zh$1: {
  readonly 'common.cancel': '取消';
  readonly 'common.retry': '重试';
  readonly 'common.unknownError': '未知错误';
  readonly 'common.expand': '展开';
  readonly 'common.collapse': '收起';
  readonly 'view.recovery': '恢复';
  readonly 'recovery.banner': '配置修改已被保护：存在未完成的恢复事项。请先处理后继续。';
  readonly 'recovery.bannerAction': '去处理';
  readonly 'recovery.requiredHint': '有需要处理的恢复事项';
  readonly 'recovery.rollbackRecommended': '建议回滚';
  readonly 'recovery.rollbackContinue': '续跑回滚';
  readonly 'recovery.verified': '已验证';
  readonly 'recovery.partialMatch': '部分匹配';
  readonly 'recovery.mismatch': '不匹配';
  readonly 'recovery.verificationError': '验证错误';
  readonly 'recovery.needsAttention': '需要人工处理';
  readonly 'recovery.incident.title': '发生了什么';
  readonly 'recovery.incident.operationId': '操作 ID';
  readonly 'recovery.incident.operationType': '操作类型';
  readonly 'recovery.incident.createdAt': '发生时间';
  readonly 'recovery.incident.reason': '原因';
  readonly 'recovery.incident.decision': '建议';
  readonly 'recovery.incident.state': '状态';
  readonly 'recovery.incident.state.recovering': '恢复中';
  readonly 'recovery.incident.state.needsAttention': '需人工处理';
  readonly 'recovery.incident.state.rolledBack': '已回滚';
  readonly 'recovery.incident.state.recovered': '已恢复';
  readonly 'recovery.incident.state.committed': '已完成';
  readonly 'recovery.incident.state.unknown': '未知';
  readonly 'recovery.decision.unknown': '未知';
  readonly 'recovery.verify.verdict.unknown': '未知';
  readonly 'recovery.currentState.safeMode': '已进入安全模式（会修改配置的操作已暂停）';
  readonly 'recovery.currentState.itemsOnly': '存在需要处理的恢复事项（写操作未被暂停）';
  readonly 'recovery.live.title': '正在执行的操作';
  readonly 'recovery.incident.liveBlocked': '该操作仍在进行中，现在不能恢复也不能放弃，请等它结束。';
  readonly 'recovery.incident.blockReason.noSnapshot': '本次操作没有绑定可信恢复快照，因此无法执行恢复。';
  readonly 'recovery.incident.blockReason.needsAttention': '该事项被判定为需要人工处理，无法自动恢复。';
  readonly 'recovery.currentState.hasSnapshot': '存在可信恢复快照';
  readonly 'recovery.currentState.noSnapshot': '无可信恢复快照';
  readonly 'recovery.snapshot.title': '恢复快照';
  readonly 'recovery.snapshot.createdAt': '快照时间';
  readonly 'recovery.snapshot.verdict': '快照校验';
  readonly 'recovery.snapshot.verdict.trusted': '可信（与本次操作绑定）';
  readonly 'recovery.snapshot.verdict.manual': '手动/本地快照（本次操作外）';
  readonly 'recovery.snapshot.verdict.legacy': '旧快照（需显式确认）';
  readonly 'recovery.snapshot.verdict.wrongEnv': '环境不匹配';
  readonly 'recovery.snapshot.verdict.corrupt': '损坏';
  readonly 'recovery.snapshot.verdict.invalid': '非法';
  readonly 'recovery.snapshot.verdict.unsafe': '路径不安全';
  readonly 'recovery.snapshot.verdict.unknown': '未知';
  readonly 'recovery.environment.title': '环境';
  readonly 'recovery.environment.compatible': '环境匹配';
  readonly 'recovery.environment.incompatible': '环境不匹配（可能来自其他机器/安装）';
  readonly 'recovery.preview.title': '恢复预览';
  readonly 'recovery.preview.hint': '只读预览 · 零写入 · 确认后才执行恢复';
  readonly 'recovery.preview.loading': '正在生成预览…';
  readonly 'recovery.confirm.title': '确认恢复';
  readonly 'recovery.confirm.message': '恢复/回滚是危险操作。确认执行？系统会先把当前文件备份到一个安全位置。';
  readonly 'recovery.confirm.rollbackContinue': '继续完成刚才中断的撤销（已完成的部分会自动跳过，不重复执行）。';
  readonly 'recovery.confirm.retry': '验证失败后重试恢复。确认再次执行？';
  readonly 'recovery.confirm.dismiss': '放弃恢复？该操作会被隔离保存，相关快照与操作记录会保留，但不会自动恢复。';
  readonly 'recovery.confirm.dismissTitle': '放弃恢复';
  readonly 'recovery.execute': '执行恢复';
  readonly 'recovery.executing': '恢复执行中…';
  readonly 'recovery.retry': '重试';
  readonly 'recovery.dismiss': '放弃恢复';
  readonly 'recovery.verify.title': '验证结果';
  readonly 'recovery.verify.manualHints': '需人工处理';
  readonly 'recovery.verify.terminal.rolledBack': '已回滚';
  readonly 'recovery.verify.terminal.recovered': '已恢复';
  readonly 'recovery.verify.terminal.needsAttention': '需要人工处理';
  readonly 'recovery.completed': '恢复完成';
  readonly 'recovery.empty': '暂无需要处理的恢复事项。';
  readonly 'recovery.loading': '正在检查恢复状态…';
  readonly 'recovery.runningHint': '恢复/回滚正在执行，请勿关闭页面。';
  readonly 'recovery.lock.title': '残留配置锁';
  readonly 'recovery.lock.detailStale': '上次异常退出留下的配置锁（持有进程已不存在）。重启 DSH 不会自动清除，必须在此回收；回收后写操作立即恢复。';
  readonly 'recovery.lock.detailUnknown': '配置锁状态无法可靠判定（可能是崩溃残留）。回收前会再次确认其持有进程确已不存在；无法确认时不会删除任何内容。';
  readonly 'recovery.lock.action': '回收残留锁';
  readonly 'recovery.lock.busy': '正在回收…';
  readonly 'recovery.lock.done': '已回收残留配置锁，操作已恢复';
  readonly 'recovery.lock.refused': '未判定为残留锁，已拒绝回收（未做任何改动）';
  readonly 'recovery.lock.confirmTitle': '回收残留配置锁';
  readonly 'recovery.lock.confirmMessage': '将再次确认该锁的持有进程确已不存在，然后原子移除这把锁。若无法确认（例如锁仍被活跃进程持有），操作会被拒绝且不做任何改动。';
  readonly 'recovery.crash.title': '上次启动未正常完成';
  readonly 'recovery.crash.lastGood': '最后正常状态：{time}';
  readonly 'recovery.crash.reason.session-corrupt': '会话文件损坏';
  readonly 'recovery.crash.reason.bundle-check': '插件 bundle 无法解析';
  readonly 'recovery.crash.reason.patch-tree': '插件加载失败（挂载树冲突）';
  readonly 'recovery.crash.reason.unknown': '原因未知';
  readonly 'recovery.crash.advice.none': '本模块没有额外建议动作。';
  readonly 'recovery.crash.advice.restore-last-good': '用最近一次备份恢复到该状态';
  readonly 'recovery.crash.advice.repair-session': '先修复损坏的会话文件（下方「需要处理的会话」）';
  readonly 'recovery.crash.advice.check-bundles': '进入救援模式，或检查 package.json 的 dsh.profile.bundles';
  readonly 'recovery.crash.advice.check-patch-tree': '进入救援模式后逐个禁用插件排查';
  readonly 'recovery.rescue.title': '救援模式';
  readonly 'recovery.rescue.desc': 'DSH 因插件起不来时，把插件挂载收窄到「DSH 核心 + 本插件」：改写两层 cordis.patch.yml，并把 dsh.profile.bundles 里的其它用户插件临时移出。不卸载任何包，退出时从备份完整还原。';
  readonly 'recovery.rescue.short': '停用依赖校验，仅在插件自身无法启动时使用';
  readonly 'recovery.refresh': '刷新';
  readonly 'recovery.rescue.inactive': '救援模式未开启';
  readonly 'recovery.rescue.activeBadge': '已开启';
  readonly 'recovery.rescue.active': '救援模式已开启（{time}）—— 请重启 DSH 使其生效。';
  readonly 'recovery.rescue.applied': '救援模式已开启（{time}）—— 本次启动只挂载了 DSH 核心与本插件。';
  readonly 'recovery.rescue.appliedHint': '其它插件本次未加载；退出后同样需重启 DSH。';
  readonly 'recovery.rescue.restartHint': '操作后需要重启 DSH 才能生效。';
  readonly 'recovery.rescue.enter': '进入救援模式';
  readonly 'recovery.rescue.exit': '退出救援模式';
  readonly 'recovery.rescue.confirmTitle': '进入救援模式';
  readonly 'recovery.rescue.confirm': '进入救援模式会改写 profile 的 cordis.patch.yml、置空 home 的 cordis.patch.yml，并把 dsh.profile.bundles 收窄为 DSH 核心与本插件（其它用户插件本次启动不挂载；包本身不删除）。退出时会从备份逐字节还原。请重启 DSH 使其生效。是否继续？';
  readonly 'recovery.rescue.on': '已进入救援模式';
  readonly 'recovery.rescue.off': '已退出救援模式';
  readonly 'recovery.rescue.stale': '救援标记已失效（换机或重建 home）';
  readonly 'sessions.title': '会话体检';
  readonly 'sessions.readOnly': '扫描只读';
  readonly 'sessions.desc': '扫描本机存量会话，按四档严重级逐条给出结论：会让 DSH 起不来 / 会话读不出来（无法加载）/ 下次请求会失败 / 看不见。扫描本身只读，不改动任何字节。应用内可修的只有两类：零损失 —— 重放重复行、可证明的合成收尾块（丢弃即恢复）；有损 —— 序列空洞、不可解析行（会截断，必须逐条显式确认，绝不批量）。两类都先预览、自动备份、可回滚。其余类别的真实出路有三条：① 会话布局归位（会话目录与首帧 cwd 不一致时搬回正确位置）；② 重复 id 隔离（保留哪一份由你指定，其余移入隔离目录）—— 这两类既可在本面板直接执行（会话体检弹窗里的「会话布局归位」入口 —— 在 DSH 运行时执行、靠门前置与逐条回滚兜底），也可以用离线 dcm sessions repair --fix；③ 容器或首帧读不出来、格式超前、未登记工作区、子代理缺父 —— 本工具不修（离线 CLI 也修不了），需人工处置或 DSH 侧动作。';
  readonly 'common.infoHint': '查看说明';
  readonly 'sessions.scanning': '体检中…';
  readonly 'sessions.scan': '开始体检';
  readonly 'sessions.noRoot': '本机没有会话数据目录（还没产生过会话，或 DSH home 不是这个）。';
  readonly 'sessions.empty': '没有发现任何会话。';
  readonly 'sessions.metric.total': '会话总数';
  readonly 'sessions.metric.attention': '需要处理';
  readonly 'sessions.metric.format': '会话格式';
  readonly 'sessions.severityShort.blocksStartup': '阻断启动';
  readonly 'sessions.severityShort.unloadable': '不可加载';
  readonly 'sessions.severityShort.nextRequestFails': '下次请求失败';
  readonly 'sessions.severityShort.invisible': '看不见';
  readonly 'sessions.rescan': '重新体检';
  readonly 'sessions.section.attention': '需要处理的会话';
  readonly 'sessions.section.attentionNone': '列表里没有需要处理的会话。';
  readonly 'sessions.issues.more': '还有 {count} 条';
  readonly 'sessions.hidden.healthyShort': '正常已隐藏 {count}';
  readonly 'sessions.repair.availableShort': '可应用内修复 {count} 条';
  readonly 'sessions.repair.noneShort': '本次没有可应用内修复的会话。';
  readonly 'sessions.unverified': '未深校验 {count} · 已深校验 {verified}';
  readonly 'sessions.untested': '超上限未体检 {count}';
  readonly 'sessions.unreadableEntries': '读不出 {count}';
  readonly 'sessions.issue.duplicateId': '同一会话 id 出现在多个工作区';
  readonly 'sessions.issue.locationMismatch': '日志位置与所属工作区不一致';
  readonly 'sessions.issue.headerUnreadable': '会话头读不出来';
  readonly 'sessions.issue.tornTail': '末尾帧被截断（DSH 会自愈）';
  readonly 'sessions.issue.corruptFrame': '容器里有非法帧';
  readonly 'sessions.issue.unparsableEvent': '有事件无法解析';
  readonly 'sessions.issue.replayDuplicateRows': '重复写入的行（可零损失清理）';
  readonly 'sessions.issue.syntheticCloser': '合成收尾块与真实续写冲突';
  readonly 'sessions.issue.seqGap': '事件序号有空洞';
  readonly 'sessions.issue.missingMessageId': '消息缺少 id';
  readonly 'sessions.issue.emptyToolCallId': '工具调用 id 为空';
  readonly 'sessions.issue.danglingToolCall': '工具调用没有配对结果';
  readonly 'sessions.issue.toolResultIdMismatch': '工具结果与调用 id 不一致';
  readonly 'sessions.issue.duplicateToolCallId': '同一步里工具调用 id 重复';
  readonly 'sessions.issue.invalidSettlement': '助手段落的结算字段非法';
  readonly 'sessions.issue.closedTurnContinued': '已关闭的轮次被继续';
  readonly 'sessions.issue.formatNewer': '会话格式高于本机 DSH（会被静默跳过）';
  readonly 'sessions.issue.unregisteredWorkspace': '没有工作区记录指向它';
  readonly 'sessions.issue.subagentWithoutParent': '子代理会话缺少父对话';
  readonly 'sessions.issue.unknown': '未识别的问题';
  readonly 'sessions.severity.blocksStartup': '会让 DSH 起不来';
  readonly 'sessions.severity.invisible': '看不见';
  readonly 'sessions.severity.nextRequestFails': '下次请求会失败';
  readonly 'sessions.severity.ok': '正常';
  readonly 'sessions.severity.unloadable': '会话不可加载';
  readonly 'sessions.subagent': '子代理';
  readonly 'sessions.blank': '新会话';
  readonly 'sessions.truncated': '还有 {count} 条未显示';
  readonly 'sessions.repair.title': '怎么修';
  readonly 'sessions.repair.desc': '容器非法 / header 不可读 / 格式超前这类应用内不动的问题，先在终端预览再落盘；需要写入时建议先关闭 DSH。';
  readonly 'sessions.repair.copy': '复制命令';
  readonly 'recovery.safeMode.done': '已解除安全模式，配置修改已恢复';
  readonly 'recovery.safeMode.refused': '仍有未处理的恢复事项，已拒绝解除（请先处理下方事项）';
  readonly 'recovery.safeMode.title': '安全模式仍在生效';
  readonly 'recovery.safeMode.detail': '上一次中断的恢复事项已经结案（隔离保存），但「配置修改保护」还没有解除：所有写操作（同步、导入、保存设置）仍会被 423 拒绝，重启 DSH 也不会自动解除。确认下面没有其他待处理的恢复事项后，可在此显式解除。';
  readonly 'recovery.safeMode.busy': '正在解除…';
  readonly 'recovery.safeMode.action': '解除安全模式';
  readonly 'recovery.safeMode.confirmTitle': '解除安全模式';
  readonly 'recovery.safeMode.confirmMessage': '解除后，会修改配置的操作（同步 / 导入 / 保存设置）立即恢复可用。仅当该次中断确实已被放弃、且没有其他未处理的恢复事项时才应解除。是否继续？';
  readonly 'sessions.repair.none': '本次没有可应用内修复的会话。应用内可修：重放重复行 / 可证明的合成收尾块（零损失）、seq 空洞与不可解析行（截断，有损，需确认）；其余问题见下方离线命令。';
  readonly 'common.close': '关闭';
  readonly 'sessions.dialog.open': '打开会话体检';
  readonly 'sessions.dialog.lastScan.total': '共 {count} 条';
  readonly 'sessions.dialog.lastScan.issues': '需处理 {count} 条';
  readonly 'sessions.dialog.lastScan.repairs': '修复记录 {count} 条';
  readonly 'sessions.repair.action': '修复';
  readonly 'sessions.repair.available': '有 {count} 条会话可应用内修复；点行内「修复」先看计划，或用右上角「一键修复全部」按顺序处理。';
  readonly 'sessions.repair.repairAll': '一键修复全部（{count}）';
  readonly 'sessions.repair.allDone': '已修复 {ok} 条；{failed} 条未修复（逐条原因见下，修好的已从列表移除）。';
  readonly 'sessions.repair.batch.ok': '已修复';
  readonly 'sessions.repair.batch.failed': '未修复';
  readonly 'sessions.repair.batch.dropped': '丢弃 {rows} 行';
  readonly 'sessions.repair.batch.transportError': '请求失败：{message}';
  readonly 'sessions.repair.actionLossless': '零损失';
  readonly 'sessions.repair.actionLossy': '有损';
  readonly 'sessions.repair.applyLossy': '截断并修复';
  readonly 'sessions.repair.plan.lossy': '这个计划含有损动作：截断点之后的事件会被丢弃（无法从日志里恢复，但备份可以一键回滚）。确认后再点「截断并修复」。';
  readonly 'sessions.repair.plan.title': '修复计划：{session}';
  readonly 'sessions.repair.plan.summary': '丢弃 {rows} 行重复事件 · {before} → {after}';
  readonly 'sessions.repair.plan.backup': '写入前自动备份，可在「修复记录」里回滚';
  readonly 'sessions.repair.apply': '确认修复';
  readonly 'sessions.repair.applied': '已修复：丢弃 {rows} 行重复事件';
  readonly 'sessions.repair.rolledBack': '已回滚到修复前的内容';
  readonly 'sessions.repair.rollback': '回滚';
  readonly 'sessions.repair.rollbackConfirmTitle': '回滚这次修复';
  readonly 'sessions.repair.rollbackConfirmMessage': '将把会话 {session} 的日志换回修复前的备份内容。若你在这之后又改过这条会话，回滚会被拒绝（绝不覆盖更新的内容）。是否继续？';
  readonly 'sessions.repair.rollbackConfirm': '确认回滚';
  readonly 'sessions.repair.history.title': '修复记录（可回滚）';
  readonly 'sessions.repair.history.applied': '已修复';
  readonly 'sessions.repair.history.rolledBack': '已回滚';
  readonly 'sessions.repair.history.dropped': '丢弃 {rows} 行';
  readonly 'sessions.repair.history.unreadable': '修复台账读不出来，本次无法显示或回滚历史修复（备份文件仍在会话目录里）。';
  readonly 'sessions.zip.action': '下载原始日志 (ZIP)';
  readonly 'sessions.zip.hint': '由 DSH 自己打包这条会话的原始日志（含子会话与附件）；不经过本插件，孤儿/多代日志一并带上。';
  readonly 'sessions.zip.reason.serviceMissing': '当前 DSH 的会话导出通道不可用：持久化后端缺少必需的服务（session-query / session-persistence / attachments）。这条入口已停用（状态 {status}）。';
  readonly 'sessions.zip.reason.authRequired': '无法确认导出通道的可用性：本机自请求被认证挡在门外（状态 {status}）。这不代表本机不支持导出 —— 请重启 DSH 后再试。';
  readonly 'sessions.zip.reason.readFailed': '导出通道在线，但这条会话的日志读取失败（状态 {status}）。请先用上方体检/修复处理这条会话。';
  readonly 'sessions.zip.reason.networkError': '探测导出通道时拿不到响应（连不上或超时）。入口保持可用：真正点下载时若仍失败，会由 DSH 给出具体原因。';
  readonly 'sessions.zip.reason.unexpectedStatus': '导出通道返回了未预期的状态（{status}）。入口保持可用，但下载可能失败。';
  readonly 'sessions.zip.done': '已开始下载：{name}';
  readonly 'sessions.zip.failed': '下载失败';
  readonly 'sessions.repair.reason.unknownUnit': '这条会话在会话库里找不到了（可能刚被移动或删除）。';
  readonly 'sessions.repair.reason.notFound': '会话日志文件不在了。';
  readonly 'sessions.repair.reason.locked': '会话目录里有 session.lock —— 可能正被使用，已拒绝写入。';
  readonly 'sessions.repair.reason.busy': '日志最近 30 秒内被写过（可能在活跃使用中）。等它安静下来再修。';
  readonly 'sessions.repair.reason.changed': '预览之后文件被改过，已拒绝按旧计划写入。请重新体检并再次预览。';
  readonly 'sessions.repair.reason.repairNotFound': '修复台账里没有这条记录（可能已被清理）。';
  readonly 'sessions.repair.reason.alreadyRolledBack': '这次修复已经回滚过了。';
  readonly 'sessions.repair.reason.unavailable': '当前运行时缺少 zstd 能力，无法修复；请改用离线 CLI。';
  readonly 'sessions.repair.reason.unreadable': '日志读不出来。';
  readonly 'sessions.repair.reason.corruptContainer': '容器结构不可证明自洽（写前校验不过）—— 已拒绝修复，绝不「修得更狠」。';
  readonly 'sessions.repair.reason.tornTail': '只有末尾撕裂帧（DSH 自己会截断自愈），无需修复。';
  readonly 'sessions.repair.reason.invalidHeader': '首帧 header 不是合法单行 JSON —— 应用内不重建 header。';
  readonly 'sessions.repair.reason.nothingToFix': '没有发现可零损失修复的重放重复行。';
  readonly 'sessions.repair.reason.lossyRequired': '这条会话只能做有损修复（截断），需要你显式确认后才会执行。';
  readonly 'sessions.repair.reason.verificationRefused': '写前校验未通过，已拒绝修复。';
  readonly 'sessions.repair.reason.writeFailed': '写入失败（临时文件 / 备份 / 换入出错），原文件未改动。';
  readonly 'sessions.repair.reason.postcheckFailed': '写后复验未通过，已用备份还原。';
  readonly 'sessions.repair.reason.backupInvalid': '备份不可用或不可信，已拒绝回滚。';
  readonly 'sessions.repair.reason.unknown': '修复未成功（原因未知），原文件保持原样。';
  readonly 'sessions.repair.reason.verifyFailed': '写后真 codec 复验未通过：这次修复没有被接受（是否已自动回滚见下方复验结论）。';
  readonly 'sessions.repair.reason.targetChanged': '回滚前发现目标又被改过（指纹不一致），已拒绝覆盖 —— 绝不覆盖别人的内容。';
  readonly 'sessions.repair.verify.current': '复验通过：DSH 现役读盘路径此刻就能直接读这条会话。';
  readonly 'sessions.repair.verify.migrated': '复验通过：只有迁移链能还原它（不是 DSH 的现役读盘路径）——「迁移链可还原」不等于「现役读盘可读」。';
  readonly 'sessions.repair.verify.unverified': '未验证：本机跑不了真 codec 复验，所以 DSH 现在能否读它并没有被证明 —— 未验证不等于已验证（写入是否生效另说）。';
  readonly 'sessions.repair.verify.rollbackFailed': '危险态：复验失败后自动回滚没有成功，目标当前仍是修复后的字节，需要人工处理。';
  readonly 'sessions.repair.rejectedNext': '原文件没有被改动。可以再点一次「开始体检」看最新状态；如果原因与「文件被改过/正在被写入」有关，等这条会话安静下来再试。';
  readonly 'rollback.title': '工作区 + 会话回滚';
  readonly 'rollback.desc': '每个回合结束自动留一个回滚点：工作区快照 + 会话游标，不需要手动拍点。回退只覆盖该点记录在案的工作区路径，并删除「能证明是留点之后新建」且通过安全判据的路径（.git / node_modules / 插件数据区 / 超出单文件上限一律拒删；留点时被预算挡下的既有文件也在证明名单里，不会被当成新建；证明名单本身不完整时一条都不删）；会话回退在目标回合之前的稳定边界 fork 一个新子会话，原会话日志只读、绝不被改写。';
  readonly 'rollback.list.empty': '还没有回滚点';
  readonly 'rollback.summary': '共 {points} 个回滚点 · {sessions} 个会话';
  readonly 'rollback.refresh': '刷新';
  readonly 'rollback.dialog.title': '回滚点台账';
  readonly 'rollback.dialog.open': '查看回滚点';
  readonly 'rollback.sessions.title': '有回滚点的对话';
  readonly 'rollback.col.time': '时间';
  readonly 'rollback.col.session': '会话';
  readonly 'rollback.col.turn': '回合';
  readonly 'rollback.col.states': '两态';
  readonly 'rollback.turn': '第 {n} 回合';
  readonly 'rollback.turnUnknown': '回合未知';
  readonly 'rollback.badge.incomplete': '两态不全';
  readonly 'rollback.badge.protected': '受保护（只进不出）';
  readonly 'rollback.apiMissing': '当前宿主没有回滚点能力（插件版本过旧）：界面不假装可用';
  readonly 'rollback.switch.label': '启用回合自动留点';
  readonly 'rollback.switch.hint': '关闭后不再订阅会话事件、不再写台账，聊天里的「↺ 回退」入口一并收起；已有回滚点仍可查看、回退与清理。';
  readonly 'rollback.switch.reading': '读取中…';
  readonly 'rollback.switch.diverged': '磁盘已开启，本进程未生效';
  readonly 'rollback.switch.apply': '立即生效';
  readonly 'rollback.ledger.summary': '台账 {records} 个点 · {size}';
  readonly 'rollback.ledger.budget': '已按字节预算（{budget}）淘汰 {evicted} 个自动点';
  readonly 'rollback.ledger.overBudget': '台账已到 {size}，超过 {budget} 的字节预算，但已经没有可自动淘汰的点了（通常是单个回滚点本身大于预算）—— 再增长请手动清理。';
  readonly 'rollback.cleanup': '清理台账';
  readonly 'rollback.cleanup.confirmTitle': '清理回滚点台账';
  readonly 'rollback.cleanup.confirmMessage': '删除全部自动回滚点（救援点与受保护点按下面的勾选处置），并回收它们的内容副本。工作区文件与会话日志不会被改动。';
  readonly 'rollback.cleanup.includeGuards': '同时删除救援点（回退前的自动救援点，删了不可撤销）';
  readonly 'rollback.cleanup.done': '已删除 {records} 个回滚点，释放 {size}';
  readonly 'rollback.cleanup.none': '没有可删除的回滚点（自动点为空）';
  readonly 'rollback.retention.hint': '自动点：每会话最多 {perSession} 个、全局最多 {total} 个，超出只淘汰最旧的自动点。回退前的救援点不占这两个额度、也不被它们淘汰，但用户删不掉，所以另有自己的两道上限：每会话最多 {guardsPerSession} 个、全局最多 {guards} 个（无论按哪道算，超出都淘汰最旧的救援点）。';
  readonly 'rollback.autopoint.hint': '回滚点由每个回合结束时自动留：工作区快照 + 会话游标（没有「手动拍点」入口）。';
  readonly 'rollback.state.workspace': '工作区';
  readonly 'rollback.state.session': '会话';
  readonly 'rollback.state.unknown': '未知状态';
  readonly 'rollback.mode.label': '回退范围';
  readonly 'rollback.mode.filesAndSession': '工作区文件 + 会话';
  readonly 'rollback.mode.filesOnly': '只回退工作区文件';
  readonly 'rollback.mode.sessionOnly': '只回退会话';
  readonly 'rollback.mode.unknown': '未知回退范围';
  readonly 'rollback.kind.auto': '自动留点';
  readonly 'rollback.kind.guard': '回退前救援点（可回退、不可删）';
  readonly 'rollback.kind.guardShort': '救援点';
  readonly 'rollback.kind.unknown': '未知来源';
  readonly 'rollback.code.ok': '成功';
  readonly 'rollback.code.deleted': '已删除';
  readonly 'rollback.code.confirmation-required': '需要显式确认才能回退';
  readonly 'rollback.code.protected-point': '该回滚点被拒绝：受保护点不可回退、不可删除；救援点可作为回退目标，但用户不可删除';
  readonly 'rollback.code.record-not-found': '找不到该回滚点';
  readonly 'rollback.code.record-incomplete': '该回滚点两态不全，缺省不允许回退';
  readonly 'rollback.code.invalid-input': '请求参数不合法';
  readonly 'rollback.code.created-removals-limit': '待删除的「留点之后新建」路径超过上限：为免只删一半，本次回退整体拒绝、一条都没动（工作区与会话都未被改动）';
  readonly 'rollback.code.no-boundary': '该回合之前没有可用的稳定边界（会话回退不可用）';
  readonly 'rollback.code.storage-unavailable': '回滚点存储不可用';
  readonly 'rollback.code.mutation-locked': '有另一个写操作正在进行（或已进安全模式）：稍后重试';
  readonly 'rollback.code.method-not-allowed': '该端点不支持这个请求方法';
  readonly 'rollback.code.ledger-unreadable': '回滚点台账读不出来（已按空台账继续，未静默）';
  readonly 'rollback.code.ledger-write-failed': '回滚点台账写不进去';
  readonly 'rollback.code.invalid-path': '记录里的路径越界（不在记录在案的分块内），已拒绝该条';
  readonly 'rollback.code.object-missing': '内容副本缺失，已拒绝该条';
  readonly 'rollback.code.object-hash-mismatch': '内容副本与记录指纹不一致，已拒绝该条';
  readonly 'rollback.code.restore-failed': '回退失败（详见逐条细节）';
  readonly 'rollback.code.verify-failed': '回退后逐文件校验未通过，已整体回滚到回退前状态';
  readonly 'rollback.code.nothing-to-restore': '该回滚点没有可恢复的内容';
  readonly 'rollback.code.no-recorded-files': '该回退点没有记录任何文件';
  readonly 'rollback.code.file-not-recorded': '这个路径不在该回滚点的记录里';
  readonly 'rollback.code.guard-failed': '回退前的救援点没能留下，已中止（零写入）';
  readonly 'rollback.code.session-missing': '会话日志不存在';
  readonly 'rollback.code.session-out-of-root': '会话日志不在本机会话根内，已拒绝';
  readonly 'rollback.code.session-too-large': '会话日志超过上限：只记下了游标（回退不依赖副本）';
  readonly 'rollback.code.session-active': '这条对话正在运行（会话日志刚被写过）：此时带文件段的回退会被拒绝、工作区一个字节都不动；只回溯消息不受影响（回退只 fork 子会话，不改写原日志）';
  readonly 'rollback.code.subagent-session': '这是子代理会话（origin=subagent），插件不为它自动留回滚点：它的工作区与父对话相同，留点只会挤占你自己对话的台账空间。';
  readonly 'rollback.preview.sessionActive': '这条对话正在运行：本轮结束前只回溯消息（不改动工作区），避免与正在写盘的工具抢文件。等本轮结束后重新打开本弹窗，即可连文件一起回退。';
  readonly 'rollback.sessionActive.denied': '这条对话正在运行：本次一个文件都没有改动。请等本轮结束，或改成「只回溯消息」再试。';
  readonly 'rollback.code.session-fork-unavailable': '当前宿主没有提供会话 fork 能力，因此不能回退会话';
  readonly 'rollback.code.fork-failed': 'fork 子会话失败，会话段未回退';
  readonly 'rollback.code.capture-failed': '该态留点失败';
  readonly 'rollback.code.capture-truncated': '该态留点到达上限被截断（已如实标注）';
  readonly 'rollback.code.capture-degraded': '该态留点不完整（有读不到或期间被改写的内容，已逐条留痕）';
  readonly 'rollback.code.no-chunks': '没有给出工作区路径分块';
  readonly 'rollback.code.chunk-not-absolute': '工作区分块必须是绝对路径';
  readonly 'rollback.code.chunk-not-found': '工作区分块不存在或不可用';
  readonly 'rollback.code.unknown': '未识别的错误码（技术细节见下方）';
  readonly 'rollback.guidance.mountStorage': '回滚点存储栈缺失：把 @deepseek-ai/dsh-storage、dsh-storage-json、dsh-storage-domain 组合进当前 profile 后重试';
  readonly 'rollback.guidance.fixDataDir': '插件数据目录不可写：{detail}';
  readonly 'rollback.guidance.readOnlyFallback': '存储不可用期间：留点与回退都会干净失败，但现状列表仍可查看（不会崩，也不会假装成功）';
  readonly 'rollback.guidance.probeDetail': '探测细节：{detail}';
  readonly 'rollback.guidance.workspaceRolledBack': '工作区写回失败后已整体回滚到回退前状态（会话段本次未执行）';
  readonly 'rollback.guidance.forkUnavailable': '当前宿主没有提供会话 fork 能力：会话段未回退（原会话日志未被改写）';
  readonly 'rollback.guidance.sessionForked': '已 fork 新子会话：{detail}（原会话日志只读、未被改写）';
  readonly 'rollback.guidance.sessionNotAttached': '新子会话没能挂回原工作区（会出现在侧栏「未分组」下；回退本身已生效）';
  readonly 'rollback.guidance.unknown': '未识别的指引（技术细节见下方）';
  readonly 'rollback.warn.ledgerUnreadable': '回滚点台账读不出来（已按空台账继续，未静默）';
  readonly 'rollback.warn.trackMissing': '有一态没留到：该态本次不能回退';
  readonly 'rollback.warn.trackDegraded': '有一态留得不完整（回退可能不完整）';
  readonly 'rollback.warn.protected': '该回滚点受保护（只进不出）：不可回退、不可删除';
  readonly 'rollback.warn.guardFailed': '回退前的救援点没留成（已记告警后继续）';
  readonly 'rollback.warn.createdRefused': '本次不删除任何「留点后新建」的路径：捕获时的证明名单不完整（有整目录被忽略 / 路径索引缺失 / 目录读不出 / 留点被时间预算中断），无法证明哪些是新建的';
  readonly 'rollback.warn.unknown': '未识别的告警（技术细节见下方）';
  readonly 'rollback.preview': '预览回退';
  readonly 'rollback.preview.title': '回退预览';
  readonly 'rollback.preview.hint': '只读预览 · 零写入 · 确认后才执行回退';
  readonly 'rollback.preview.loading': '正在生成预览…';
  readonly 'rollback.preview.empty': '该回滚点没有可回退的内容。';
  readonly 'rollback.preview.none': '该点没有可回退的内容';
  readonly 'rollback.preview.reason.guard': '宿主这次没有允许回退该救援点（救援点通常可作为回退目标；详见下方细节）';
  readonly 'rollback.preview.reason.incomplete': '该点两态不全：需要显式允许部分回退';
  readonly 'rollback.preview.reason.hostRefused': '宿主拒绝了这次回退（原因见下方细节）';
  readonly 'rollback.preview.segments': '只勾可回退的段（只有工作区与会话两态）';
  readonly 'rollback.preview.overwrite': '覆盖 {n} 项';
  readonly 'rollback.preview.different': '其中 {n} 项内容不同';
  readonly 'rollback.preview.missing': '{n} 项当前已不存在（会被重新创建）';
  readonly 'rollback.preview.createdAfter': '{n} 项在留点时并不存在（留点之后新建；回退只会删除其中通过安全判据的）';
  readonly 'rollback.preview.notice.skipped': '{n} 项在留点时被跳过（未记录；已计入证明名单 ⇒ 不参与删除判据）';
  readonly 'rollback.preview.notice.truncated': '该点捕获被上限截断（超单文件上限 / 字节预算 / 文件数预算）；删除判据另看证明名单（路径索引）是否完整';
  readonly 'rollback.preview.files.title': '将被回退的文件：';
  readonly 'rollback.preview.select.foreign': '其它对话改过';
  readonly 'rollback.preview.select.toggle': '「{path}」：勾上则这次回退恢复它';
  readonly 'rollback.result.foreignSkipped': '{n} 个文件在留点后被其它对话改过，这次没有回退它们';
  readonly 'rollback.result.merged': '{n} 个文件已合并：撤销本次对话的改动，保留其它对话的改动';
  readonly 'rollback.result.conflict': '{n} 个文件两侧改到同一处，已保持原样 —— 需要你手工处理';
  readonly 'rollback.result.unavailable': '{n} 个文件无法安全撤销（缺少中间版本 / 二进制 / 差异过大），已保持原样';
  readonly 'rollback.result.concurrent': '{n} 个文件在回退过程中又被改过，已保持原样';
  readonly 'rollback.result.unclaimed': '{n} 个文件无法判定属于哪个对话（改动时没有任何对话在运行），已保持原样';
  readonly 'rollback.result.selectionSkipped': '{n} 个文件按你的勾选跳过了';
  readonly 'rollback.preview.files.empty': '工作区与该回退点一致，无需恢复';
  readonly 'rollback.preview.files.unavailable': '该回退点的工作区态没有可用的记录（原因：{reason}），无需恢复';
  readonly 'rollback.preview.files.unavailableSession': '该回退点的工作区态没有可用的记录（原因：{reason}）；会话仍会回退到该点之前';
  readonly 'rollback.preview.files.noFilesSession': '该回退点没有记录任何文件；会话仍会回退到该点之前';
  readonly 'rollback.preview.files.consistentSession': '工作区与该回退点一致（会话仍会回退到该点之前）';
  readonly 'rollback.preview.file.added': '+{n}';
  readonly 'rollback.preview.file.removed': '−{n}';
  /** 整文件删除（用户 2026-10-12 第 6 条）：写「删除」而不是 `+0 −N` —— 那是两件事。 */
  readonly 'rollback.preview.file.deleted': '删除';
  readonly 'rollback.preview.file.skipped': '不会改动（与其它对话的改动冲突，或无法安全合并）';
  readonly 'rollback.diff.merged': '合并结果：撤销本对话的改动，保留其它对话的改动';
  readonly 'rollback.diff.skipped': '回退不改动：与其它对话的改动冲突或无法安全合并';
  readonly 'rollback.preview.file.unknown': '行数未统计';
  readonly 'rollback.preview.file.unknownHint': '这些文件的行数没有统计出来（文件过大、不是文本或内容副本读不出来）—— 回退仍会照常覆盖它们。';
  readonly 'rollback.diff.viewHint': '查看差异：{path}';
  readonly 'rollback.diff.loading': '正在读取差异…';
  readonly 'rollback.diff.before': '当前';
  readonly 'rollback.diff.after': '回退后';
  readonly 'rollback.diff.identical': '与回退点一致，回退不改动它';
  readonly 'rollback.diff.degraded': '差异较大：按整块替换展示（结果完整，但不是最小编辑）';
  readonly 'rollback.diff.reason.missingBlob': '这份内容副本读不出来，无法逐行对照（回退仍会尝试写回它）';
  readonly 'rollback.diff.reason.binary': '不是文本文件，没有逐行差异可看';
  readonly 'rollback.diff.reason.tooLarge': '文件超过展示上限，没有逐行差异可看（回退仍会照常覆盖它）';
  readonly 'rollback.diff.reason.unreadable': '当前文件读不出来（权限不足，或它不是普通文件），无法逐行对照';
  readonly 'rollback.diff.reason.unknown': '无法逐行对照：宿主未给出原因';
  readonly 'rollback.diff.failed': '差异读取失败';
  readonly 'rollback.preview.result.noop': '工作区与该回退点一致，无需恢复';
  readonly 'rollback.preview.result.noRecord': '该回退点没有可用的记录（原因：{reason}），无需恢复';
  readonly 'rollback.preview.result.noFiles': '该回退点没有记录任何文件，无需恢复';
  readonly 'rollback.preview.result.code': 'code：{code}';
  readonly 'rollback.preview.cursorBytes': '会话日志 {now} → {target} 字节';
  readonly 'rollback.group.label': '会话：{session}';
  readonly 'rollback.group.count': '{n} 个回滚点';
  readonly 'rollback.group.unknownSession': '未知会话';
  readonly 'rollback.row.files': '文件 {n} 个';
  readonly 'rollback.row.sessionCursor': '有会话游标';
  readonly 'rollback.row.noSessionCursor': '无会话游标（只能回退工作区）';
  readonly 'rollback.row.sessionShort': '会话可回退';
  readonly 'rollback.row.workspaceShort': '仅工作区';
  readonly 'rollback.row.notice.skipped': '{n} 项在留点时被跳过（未记录；已计入证明名单 ⇒ 不会被当成新建删掉）';
  readonly 'rollback.row.notice.truncated': '该点留点达到上限被截断（计数仍如实；删除判据另看证明名单是否完整）';
  readonly 'rollback.row.notice.skippedShort': '跳过 {n} 项';
  readonly 'rollback.row.notice.truncatedShort': '已截断';
  readonly 'rollback.preview.cursor': '会话边界 {from} → {to}';
  readonly 'rollback.preview.turns': '回退到第 {n} 回合之前';
  readonly 'rollback.preview.active': '该会话日志刚被写过（仅供参考：回退只 fork 子会话，不改写原日志）';
  readonly 'rollback.rewind': '回退到此处';
  readonly 'rollback.rewind.confirm': '我确认：按所选范围回退。工作区会写回该点记录在案的路径，并删除能证明是「留点之后新建」且通过安全判据的路径（.git / node_modules / 插件数据区 / 超出单文件上限一律拒删；证明名单不完整时一条都不删）；会话在目标回合之前的稳定边界 fork 新子会话，原会话日志不改写。';
  readonly 'rollback.rewind.allowPartial': '允许部分回退（该回滚点两态不全）';
  readonly 'rollback.guard.require': '回退前必须留救援点（留不下就整体中止，零写入）';
  readonly 'rollback.guard.warn': '回退前留救援点（留不下记告警后继续）';
  readonly 'rollback.guard.off': '跳过回退前救援点';
  readonly 'rollback.guard.unknown': '未知的救援点策略';
  readonly 'rollback.rewind.result.counts': '恢复 {restored} 项 · 删除 {removed} 项 · 失败 {failed} 项 · 留点之后新建 {leftovers} 项';
  readonly 'rollback.rewind.result.child': '已回到该消息之前（当前对话：{id}）';
  readonly 'rollback.rewind.archive.done': '原会话已收进「已归档」（需要时可在那儿恢复）';
  readonly 'rollback.rewind.freshSession': '这是这条对话的第一条消息之前：已为你新建一条空会话（这条消息的文字可从上面那条气泡复制）';
  readonly 'rollback.rewind.freshSessionFailed': '这是第一条消息之前、没有可回退的对话边界，而本客户端没能新建空会话 —— 请手动点「新会话」';
  readonly 'rollback.rewind.archive.unavailable': '本客户端没有可用的归档入口，所以原会话仍留在会话列表里（内容未被改写）';
  readonly 'rollback.rewind.archive.active': '原会话还有进行中的工作，暂时不能归档 —— 它仍留在会话列表里（内容未被改写）';
  readonly 'rollback.rewind.archive.failed': '原会话归档失败，它仍留在会话列表里（内容未被改写）';
  readonly 'rollback.rewind.result.guard': '回退前救援点：{id}';
  readonly 'rollback.rewind.result.skipped': '未执行的段：{list}';
  readonly 'rollback.segment.restored': '已恢复';
  readonly 'rollback.segment.skipped': '已跳过';
  readonly 'rollback.segment.failed': '失败';
  readonly 'rollback.segment.unknown': '未知状态';
  readonly 'rollback.outcome.restored': '全部恢复';
  readonly 'rollback.outcome.partial': '部分恢复';
  readonly 'rollback.outcome.failed': '回退失败';
  readonly 'rollback.outcome.denied': '已拒绝（零写入）';
  readonly 'rollback.outcome.unknown': '未知结论';
  readonly 'rollback.delete': '删除回滚点';
  readonly 'rollback.delete.done': '已删除回滚点';
  readonly 'rollback.delete.confirmTitle': '删除这个回滚点？';
  readonly 'rollback.delete.confirmMessage': '只删除台账记录与内容副本，不会改动工作区与会话。受保护点与回退前救援点由引擎一律拒绝删除；救援点超出每会话上限 20 个或全局上限 50 个时会自动淘汰最旧的。';
  readonly 'rollback.delete.protected': '该回滚点不可删除：受保护点与救援点一律被引擎拒绝（救援点超出每会话上限 20 个或全局上限 50 个时自动淘汰最旧的）';
  readonly 'rollback.storage.unavailable': '回滚点存储不可用（现状列表仍可查看）';
  readonly 'recovery.incomplete.title': '未完成的档案副本';
  readonly 'recovery.incomplete.hint': '这些目录带「复制进行中」标记但没有 package.json，是复制被中断留下的半截副本；不能启动，只能删除（只列出有标记的目录 —— 用户手工建的目录不会出现在这里）。';
  readonly 'recovery.incomplete.from': '来源：{name}';
  readonly 'recovery.incomplete.startedAt': '开始于 {time}';
  readonly 'recovery.incomplete.dir': '目录：{dir}';
  readonly 'recovery.incomplete.delete': '删除残留';
  readonly 'recovery.incomplete.deleteConfirm': '我确认：物理删除该残留目录（不可恢复）';
  readonly 'recovery.incomplete.locked': '安全模式阻断写操作，未执行删除：{reason}';
  readonly 'recovery.incomplete.unlock': '解除安全模式';
  readonly 'recovery.incomplete.unreadable.title': '未能读取残留列表';
  readonly 'recovery.incomplete.unreadable.hint': '本次枚举残留目录失败 —— 这不等于「没有残留」。请确认档案目录可读后重试。';
  readonly 'sessions.layout.title': '会话布局归位（写动作）';
  readonly 'sessions.layout.desc': '修复「会让 DSH 起不来」的两类问题：会话目录与首帧 cwd 不一致时把会话搬回正确位置（只搬目录，不改写首帧），以及同一会话 id 出现在多个目录时只保留你选定的那一份、其余移入隔离目录（可人工找回）。';
  readonly 'sessions.layout.runtimeNote': '在 DSH 运行时直接改盘（离线 CLI 要求先停 DSH）；索引刷新不可用时一条也不执行。';
  readonly 'sessions.layout.quarantineNote': '其余副本移入隔离目录（.cm-repair-quarantine-*，可人工找回）；本入口不删除任何会话。';
  readonly 'sessions.layout.preview': '预览计划';
  readonly 'sessions.layout.previewing': '预览中…';
  readonly 'sessions.layout.planEmpty': '计划里没有需要执行的动作。';
  readonly 'sessions.layout.apiMissing': '当前接口不支持布局归位（缺少 layoutRepairSessions）；请更新插件后重试 —— 本机未做任何改动。';
  readonly 'sessions.layout.planTitle': '布局归位计划（只读，尚未改动任何文件）';
  readonly 'sessions.layout.planReadOnly': '只读预览 · 零写入';
  readonly 'sessions.layout.noCandidates': '本机没有需要归位或隔离的会话。';
  readonly 'sessions.layout.summary': '归位 {move} · 隔离 {quarantine}';
  readonly 'sessions.layout.planSkipped': '只报告 {count} 条';
  readonly 'sessions.layout.onlyReported': '只报告';
  readonly 'sessions.layout.keepTitle': '重复 id：请选定保留哪一份';
  readonly 'sessions.layout.keepHint': '选中的那一份本轮不动；其余副本移入隔离目录。未选定之前不能执行。';
  readonly 'sessions.layout.keepMissing': '还有 {count} 个未选定';
  readonly 'sessions.layout.apply': '执行布局归位';
  readonly 'sessions.layout.applying': '执行中…';
  readonly 'sessions.layout.resultTitle': '布局归位结果';
  readonly 'sessions.layout.done': '归位 {moved} · 隔离 {quarantined} · 失败 {failed} · 只报告 {skipped}';
  readonly 'sessions.layout.refreshHint': '执行后会重新扫描列表；失败项已逐条尝试回滚（回滚失败的项会单独标红，绝不显示为已复原），可重试或改用离线 CLI。';
  readonly 'sessions.layout.close': '关闭';
  readonly 'sessions.layout.kind.ok': '位置已正确';
  readonly 'sessions.layout.kind.move': '搬目录归位';
  readonly 'sessions.layout.kind.rewriteMove': '改写首帧后归位（离线 CLI 路径）';
  readonly 'sessions.layout.kind.skip': '只报告';
  readonly 'sessions.layout.kind.keep': '保留（不动）';
  readonly 'sessions.layout.kind.quarantine': '隔离副本';
  readonly 'sessions.layout.kind.unknown': '未知动作';
  readonly 'sessions.layout.status.moved': '已归位';
  readonly 'sessions.layout.status.quarantined': '已隔离';
  readonly 'sessions.layout.status.kept': '已保留';
  readonly 'sessions.layout.status.skipped': '只报告（未执行）';
  readonly 'sessions.layout.status.failed': '失败（未改动）';
  readonly 'sessions.layout.status.rolledBack': '失败，已回滚到原状态';
  readonly 'sessions.layout.status.rollbackFailed': '失败，且回滚未成功（需人工处理）';
  readonly 'sessions.layout.reason.noCwd': '首帧没有 cwd，无法判定目标目录';
  readonly 'sessions.layout.reason.inconsistentGenerations': '同一会话多份 generation 的 cwd 不一致（不猜哪份为准）';
  readonly 'sessions.layout.reason.locked': '会话目录里有 session.lock（可能正被使用）';
  readonly 'sessions.layout.reason.alreadyPlaced': '位置已经正确';
  readonly 'sessions.layout.reason.needsMove': '需要搬目录';
  readonly 'sessions.layout.reason.needsRewriteMove': '需要先改写首帧 cwd 再搬（离线 CLI 路径）';
  readonly 'sessions.layout.reason.duplicateId': '同一会话 id 出现在多个目录';
  readonly 'sessions.layout.reason.busy': '日志最近 30 秒内被写过（可能在活跃使用中）';
  readonly 'sessions.layout.reason.missingKeep': '没有选定保留哪一份，已拒绝执行（其余副本一律不动）';
  readonly 'sessions.layout.reason.keepNotACandidate': '选定的那一份不在扫描到的副本里，已拒绝执行';
  readonly 'sessions.layout.reason.targetExists': '目标位置已经有这个会话，未搬动';
  readonly 'sessions.layout.reason.quarantineExists': '隔离目录里已有同名副本，未搬动';
  readonly 'sessions.layout.reason.rewriteFailed': '改写首帧 cwd 失败，因此没有搬目录';
  readonly 'sessions.layout.reason.missingTargetKey': '计划里缺少目标 projectKey，未搬动';
  readonly 'sessions.layout.reason.moveFailed': '搬目录失败';
  readonly 'sessions.layout.reason.reindexFailed': '会话索引刷新失败（已回滚该条）';
  readonly 'sessions.layout.reason.notFound': '会话目录或日志已不在了';
  readonly 'sessions.layout.reason.ioError': '读写失败';
  readonly 'sessions.layout.reason.reindexUnavailable': '当前宿主没有提供索引刷新能力，因此一条也没有执行（未做任何改动）';
  readonly 'sessions.layout.reason.sessionsRootUnreadable': '会话根读不出来，无法规划（未做任何改动）';
  readonly 'sessions.layout.reason.unknown': '未知原因（未做任何改动）';
};
/** 字典键联合（注册处 compile-time 校验）。 */
type RecoveryKey = keyof typeof zh$1;
type KindKey = `history.kind.${MigrationKind}`;
type ResultKey = `history.result.${MigrationResult}`;
type CommonKey = 'history.subtitle' | 'history.empty' | 'history.loading' | 'history.corruptedBanner' | 'history.corruptedCount' | 'history.stats.total' | 'history.stats.success' | 'history.stats.failed' | 'history.stats.skipped' | 'history.filter.kind' | 'history.filter.result' | 'history.filter.recent' | 'history.filter.recent.all' | 'history.filter.recent.50' | 'history.filter.recent.200' | 'history.search.placeholder' | 'history.export.json' | 'history.export.markdown' | 'history.exported' | 'history.exporting' | 'history.exportError' | 'history.refresh' | 'history.refreshError' | 'history.retention.label' | 'history.retention.hint' | 'history.retention.unlimited' | 'history.retention.units' | 'history.retention.current' | 'history.retention.runNow' | 'history.retention.running' | 'history.retention.cleaned' | 'history.retention.noop' | 'history.retention.saveError' |
/** 说明按钮的可访问名（2026-11-14 起 ⓘ 已下线、代码不再消费；键与四本字典口径一并保留，免得下游按键取文案时缺项） */
'common.infoHint';
type HistoryKey = KindKey | ResultKey | CommonKey;
/**
 * 聊天内「↺ 回退」入口（config-manager-chat）的独立字典：zh 为源语言，en 镜像每个键。
 * 独立命名空间、独立文件：不触碰共享的 locales.ts，也不与 recovery 字典混住。
 *
 * `ChatKey` 由 client/index.ts 在 ctx.locale.register 处做编译期校验（漏键/多键即编译失败）。
 *
 * 键域纪律（**为什么这本字典刻意只有几行**）：
 *  - 与设置页同一批 `rollback.*` 词汇（三选一 mode / code / outcome / segment / 预览计数 /
 *    结果行）由 **config-manager-recovery** 字典单一所有（T2 产出）。组件同时拿到
 *    `t`（本字典）与 `rt`（recovery 字典）：两个入口说同一句话，改一处两边一起变，
 *    这里**不复制**那些键值（复制即两处真相）。
 *  - 本文件只写「聊天入口独有」的话：回合尾按钮、该回合还没有回滚点、子会话打开与降级。
 *
 * ⚠️ 新增本字典 = 新增一本目录，必须由 captain 登记进 i18n 守卫的归属清单
 * （`tests/helpers/i18n-scan.ts` 的 KNOWN_CATALOG_FILES + `tests/i18n-hardcoded-guard.test.ts`
 * S11 的 knownFiles 与 `all.length` 计数），否则 `node --test tests/i18n-hardcoded-guard.test.ts`
 * 会把本文件里的 zh 串判成硬编码缺陷（A1）。本任务的写作用域不含 tests/**，故登记动作归 captain。
 */
declare const zh: {
  /**
   * 回退入口的**无障碍文案**（2026-10-10 起屏幕上只有图标、没有文字标签；
   * 这颗按钮的 aria-label/title 用它，「回退按钮只有一个 icon」不等于「按钮没有名字」）。
   */
  readonly 'chat.entry.label': '回退';
  /** 该回合还没有回滚点（留点发生在回合结束时） */
  readonly 'chat.entry.noPoint': '这个回合还没有回滚点';
  /** 打开对话框后先读台账 + 只读预览（零写入） */
  readonly 'chat.entry.loading': '正在读取回滚点与该回合的只读预览…';
  /** 子会话行的动作按钮 */
  readonly 'chat.open.child': '打开子会话';
  /** 自动打开的进行态 */
  readonly 'chat.open.opening': '正在打开子会话…';
  /** 降级①（T9-F1）：**有**导航入口，但重拉列表后仍没有它 —— 这句话被证实过，不假装已打开 */
  readonly 'chat.open.degraded': '子会话 {id} 还没有出现在会话列表里，自动打开没有成功：请手动打开它（如实降级，不假装已打开）';
  /** 降级②（T9-F1）：**有**入口、列表里也有（或列表读不出来），但这次导航调用失败 —— 与①是两个原因 */
  readonly 'chat.open.failed': '会话导航调用失败，子会话 {id} 没有自动打开（子会话已创建）：请手动打开它';
  /** 降级③（T9-F1）：**本客户端没有可用的会话导航入口**（DSH 版本不提供）；绝不能说成「还没出现在列表里」 */
  readonly 'chat.open.unavailable': '本客户端没有可用的会话导航入口（当前 DSH 版本不提供），所以没有自动打开：子会话 {id} 已创建，请手动打开它';
  /** 不可回退但宿主没给原因键时的兜底（T9-F3）：说「原因未知」，**不得**说成「没有可回退的内容」 */
  readonly 'chat.preview.reasonUnknown': '这个回滚点当前不可回退，但宿主没有给出原因（原因未知）';
  /** 预览对话框的说明行（Cursor「Confirm Undo」风格的第二张截图：一句话说清这次动作会做什么） */
  readonly 'chat.preview.summary': '这次回退会做以下改动：';
  /**
   * 顶部选择框（用户 2026-10-12 第 1 条）：要不要**连文件一起**退回去。
   * 勾 = 文件 + 对话一起退（默认）；取消 = 只退对话，工作区一个字节都不动。
   */
  readonly 'chat.preview.revertFiles': '回退文件的更改';
  /**
   * 顶部**汇总**（2026-10-12 第二轮）：这一屏的第一决策信息 —— 用户先判规模，再逐行核文件。
   * 三个数字的口径与「文件行」逐条一致（同一份 `rollbackPreviewScope`）：
   *  `{n}` 个文件 = 会被改动的文件数；`+A`/`−D` **只累加两侧都可信的行数**
   *  （任一侧读不出来的文件两列都不计 —— 被计成 0 就是一个会被证伪的断言）；
   *  删除集是**另一条**清单（`{n} 项删除`），单独计数、不与上面混加。
   * 注意：这不是「chat.preview.summary」那句话（那句描述性文案按 DESIGN §7 已下线，且被源级守卫钉住）；
   * 这里是**数字**，数字留、句子走。
   */
  readonly 'chat.preview.scope.files': '{n} 个文件';
  /** 取消勾选（只退对话）时的汇总：数字与用户无关，改写一句「文件不动」；清单仍在下面、且不再变半透明 */
  readonly 'chat.preview.scope.off': '只回退对话，文件不改动';
  /** 文件行上悬停出现的「查看」（在看得到的前提下才出现：没有侧栏能力时换成下面那句） */
  /** 「查看」= 名字本身：无障碍名必须带**这个文件**的全路径（列表里同名按钮一屏好几个） */
  readonly 'chat.preview.viewHint': '查看差异：{path}';
  /** 没有右侧栏能力（旧 DSH / 侧栏服务缺失）→ 如实降级为弹窗内展示，不假装打开过 */
  readonly 'chat.preview.viewInline': '本客户端没有右侧栏，差异改为在这里展示';
  readonly 'chat.preview.viewFailed': '打开右侧栏失败：{detail}';
  /** 回退请求在途 */
  readonly 'chat.rewind.running': '正在回退…';
  /**
   * 简洁版预览对话框的**主按钮**文案（用户 2026-10-10：底部只有主按钮「回退」与「取消」）。
   * 与设置页回滚卡的 `rollback.rewind`（'回退到此处'）刻意分开：聊天入口的语境是
   * 「回到这条消息之前」，按钮只写「回退」——同一句话在两张卡上不再被两个语境共用。
   */
  readonly 'chat.rewind.submit': '回退';
  /** 关闭对话框（Modal.Header 的 closeLabel 必须是已翻译文案） */
  readonly 'chat.close': '关闭';
  /** 复制动作（与 native 复制的 aria-label 同义） */
  readonly 'chat.entry.copy': '复制这条消息';
  /** 复制成功的 1 秒反馈 */
  readonly 'chat.entry.copied': '已复制';
  /** content 里我们无法理解的块（宿主叫「附加内容块」；这里必须原样兜底上屏，不得静默丢弃） */
  readonly 'chat.entry.extraBlock': '附加内容块';
  /** 兜底块过长时的截断说明（{total} = 原始字符数） */
  readonly 'chat.entry.truncated': '已截断，共 {total} 字符';
  /** owner 没给图片渲染位（宿主版本差异）：图片我们绝不自己渲染，如实说 */
  readonly 'chat.entry.noImageRenderer': '宿主没有提供图片渲染位，这条消息里的图片无法显示';
  /** 引用会话汇总行（宿主 ui-chat 的 message.referenceSummary，逐字同义；★ 非 ui-primitives 依赖） */
  readonly 'chat.entry.referenceSummary': '引用会话 · {labels}';
  /** 汇总行里多个 label 之间的分隔符（宿主 message.referenceSeparator：zh 用顿号、en 用逗号空格） */
  readonly 'chat.entry.referenceSeparator': '、';
  /** 禁用①：节点里取不到可核实的回合号（与宿主同一条读法：location.kind 必须是 turn/step） */
  readonly 'chat.entry.disabled.noTurn': '取不到可核实的回合号（当前 DSH 版本未提供），无法在聊天里回退';
  /** 禁用②：回合还在进行中 —— 真的还没到留点那一刻 */
  readonly 'chat.entry.disabled.turnOpen': '这个回合还没结束，还没有回滚点';
  /** 禁用③：缺少 sessionId，无法按「同会话」匹配 */
  readonly 'chat.entry.disabled.noSession': '取不到会话标识，无法匹配回滚点';
  /**
   * 禁用④：还没读到，或**收尾后的有界重试窗口还开着**（列表读到空只是暂态 —— 引擎在收尾后
   * 还要几秒才写完点，真机 7.8 s）。窗口内**不得**说「没有回滚点」，所以这里如实说「正在读取」。
   */
  readonly 'chat.entry.disabled.pointsPending': '正在读取回滚点…';
  /** 禁用⑤：已读到列表、确实没有「同会话 + 同回合」的点 */
  readonly 'chat.entry.disabled.noPoint': '这个回合还没有回滚点';
  /** 禁用⑥：收尾状态既不是 closed 也不是 open（读不到 / unknown）——不能证明已收尾，也不说成没结束 */
  readonly 'chat.entry.disabled.turnUnknown': '这个回合的收尾状态未知，暂不可回退';
};
type ChatKey = keyof typeof zh;
type ConfigManagerSectionProps = PropsRuntime<'settings.section'> & ConfigManagerSectionInjected & {
  t: TranslateNS<'config-manager'>;
};
interface ExportViewProps {
  api: ConfigManagerApi;
  t: TranslateNS<'config-manager'>;
}
interface ImportWizardViewProps {
  api: ConfigManagerApi;
  t: TranslateNS<'config-manager'>;
}
interface SyncPanelProps {
  api: SyncApi;
  t: TranslateNS<'config-manager-sync'>;
  /**
   * config-manager 命名空间的翻译器：仅用于**分区显示名**（section-labels 的 sectionLabeler）。
   * 分区名只经 common/section-labels.ts 的单一映射，禁止在本文件里另建一套（术语漂移）。
   */
  cmT: TranslateNS<'config-manager'>;
}
interface MarketPanelProps {
  api: MarketApi;
  /** 「我的配置」API（/me/* 端点：登录态/一键上传/查看已上传/一键更新；登录复用 SyncApi.github*） */
  myConfigsApi: MyConfigsApi;
  /** 确认导入复用的主 ConfigManagerApi（executeImportPlan：安全阀 + 回滚） */
  importApi: ConfigManagerApi;
  /** GitHub 登录 API（「我的配置」登录卡复用 sync github device flow，同 token 槽） */
  syncApi: SyncApi;
  t: TranslateNS<'config-manager-market'>;
  /**
   * config-manager 字典（级联树 / 分区显示名 / 冲突决策列表 / 报告行）。
   * 市场面板的 `api.t` 是 UiT（另一套键空间），不能顶替它。
   */
  cmT: TranslateNS<'config-manager'>;
  /**
   * 产物库行内「安装」带过来的市场条目 id：面板就绪后**直达该条目**的下载 / 审阅流程。
   * 缺省（页面路径、从「逛市场」按钮进入）= 只打开列表，行为不变。
   */
  openItemId?: string;
  /**
   * 直达的「市场子视图」（v3）：⌘K「发布到市场」与产物库「发布到市场」把 payload 带进来，
   * 面板挂载时直接落在「我的配置」。缺省 = 按上次持久化的子视图（行为不变）。
   */
  initialSubView?: 'browse' | 'myconfigs';
}
interface AboutPanelProps {
  api: ConfigManagerApi;
  t: TranslateNS<'config-manager'>;
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Config Manager 表面文案。 */
    'config-manager': ConfigManagerKey;
    /** 远程同步设置区块文案（m-sync-ui）。 */
    'config-manager-sync': SyncKey;
    /** 配置市场区块文案（m-market-ui）。 */
    'config-manager-market': MarketKey;
    /** Recovery 区块文案（Phase 5）。 */
    'config-manager-recovery': RecoveryKey;
    /** Migration History 区块文案（Phase 6）。 */
    'config-manager-history': HistoryKey;
    /** 聊天内「↺ 回退」入口文案（T4；只放聊天入口独有的话）。 */
    'config-manager-chat': ChatKey;
  }
}
/** 必需服务（fiber inject 等待 —— slots/locale 必须先就绪）。 */
export declare const inject: string[];
/**
 * 注册 Config Manager 设置页。
 * @param ctx - client root context（slots + locale 服务）。
 */
export declare function apply(ctx: ClientContext): void;
export type { AboutPanelProps, ChatKey, ConfigManagerApiError, ConfigManagerKey, ConfigManagerSectionProps, DownloadResult, ExportViewProps, HistoryKey, ImportWizardViewProps, MarketKey, MarketPanelProps, RecoveryKey, ServiceStatus, SyncKey, SyncPanelProps, UploadResponse };

		return module.exports;
	}
});
//# sourceMappingURL=client.d.ts.map