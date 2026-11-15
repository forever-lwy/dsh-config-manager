// 通道枚举：唯一声明处是**零依赖**的 utils/shared-constants.ts（宿主 sync-config.ts 只是 re-export）。
import { SYNC_CHANNELS, S3_COMPAT_PROVIDERS } from '../utils/shared-constants.js';
/* ---------------------------------------------------------------- 常量 */
/** 表单改动 → 自动保存的防抖时长（ms）。 */
export const SYNC_CONFIG_SAVE_DEBOUNCE_MS = 600;
/* ------------------------------------------------------------ 请求体组装 */
/**
 * 组装通道鉴权字段（git：repoUrl/token；webdav：url/username/password；s3 / gist：云端点非密字段
 * + 仅内存的密钥；全部扁平顶层，与宿主 parseSyncBody 同形）。
 *
 * `trimToken` 是搬家前就存在的**既有差异**，本次只做搬迁、保持行为完全一致：
 * - git 的 push / 一键同步路径沿用输入原值（不 trim）；
 * - git 的「保存配置」路径对 token 做 trim。
 * 用显式参数把差异固定下来，避免以后有人「顺手统一」而改变行为。
 *
 * **云端点密钥（s3 Secret / gist token）不受这条历史差异影响，两条路径一律 trim**：
 * 它们是本次新增的通道（没有兼容包袱），而密钥里夹带粘贴来的空白/换行会直接让签名校验失败 ——
 * 那种失败在界面上只会显示成「远端拒绝」，用户无从自查。
 *
 * 凭据铁律：密钥只以 `secret` 字段出现在**本次请求体内**；空串一律不携带（= 沿用已保存的密钥，
 * 绝不覆盖）。响应与配置文件里只有 `secretStored` 布尔。
 */
function channelAuthBody(form, opts) {
    if (form.channel === 'webdav') {
        const url = form.webdavUrl.trim();
        return {
            transport: 'webdav',
            url: url !== '' ? url : undefined,
            username: form.webdavUsername.trim() !== '' ? form.webdavUsername.trim() : undefined,
            password: form.webdavPassword !== '' ? form.webdavPassword : undefined,
        };
    }
    if (form.channel === 's3') {
        // 前缀与端点尾部斜杠先归一（与宿主 parseCloudS3Body 的 normalize 同口径）：粘贴噪声不算错误
        const prefix = form.s3Prefix.trim().replace(/^\/+/, '').replace(/\/+$/, '');
        const secret = form.s3Secret.trim();
        return {
            transport: 's3',
            provider: form.s3Provider,
            endpoint: form.s3Endpoint.trim().replace(/\/+$/, ''),
            region: form.s3Region.trim(),
            bucket: form.s3Bucket.trim(),
            accessKeyId: form.s3AccessKeyId.trim(),
            ...(prefix === '' ? {} : { prefix }),
            // pathStyle 只在用户**显式勾选**时携带 true；不勾 = 不携带（跟随兼容商变体默认，宿主语义）
            ...(form.s3PathStyle ? { pathStyle: true } : {}),
            // 密钥一律用 trim 后的值（见函数头：云端点是新通道，没有 git 那条历史差异）
            ...(secret === '' ? {} : { secret }),
        };
    }
    if (form.channel === 'gist') {
        const apiBaseUrl = form.gistApiBaseUrl.trim();
        const filePrefix = form.gistFilePrefix.trim().replace(/^\/+/, '').replace(/\/+$/, '');
        const token = form.gistToken.trim();
        return {
            transport: 'gist',
            gistId: form.gistId.trim(),
            ...(apiBaseUrl === '' ? {} : { apiBaseUrl }),
            ...(filePrefix === '' ? {} : { filePrefix }),
            // 宿主 gist 分支接受 token 或 secret 两个字段名，这里统一用 secret（与 s3 同一口径、同样 trim）
            ...(token === '' ? {} : { secret: token }),
        };
    }
    const subdir = form.gitSubdir.trim();
    return {
        transport: 'git',
        repoUrl: form.repoUrl.trim(),
        // 空串不携带：宿主按「缺省 = 仓库根」解析，旧配置与旧宿主都能吃这份载荷
        ...(subdir === '' ? {} : { subdir }),
        token: form.token.trim() !== '' ? (opts.trimToken ? form.token.trim() : form.token) : undefined,
    };
}
/** push / pull / 一键同步的公共请求体（仅通道鉴权字段；空串不携带，密码仅内存）。 */
export function buildSyncChannelBody(form) {
    return channelAuthBody(form, { trimToken: false });
}
/**
 * 「保存配置」请求体：该通道远端**未就绪** → null（自动保存跳过）。
 *
 * 四通道共用 `channelRemoteReady` 一条判据（git/webdav = 地址非空；s3/gist = 表单全部校验通过）——
 * 拿一个必然被宿主 400 的载荷去自动保存，只会让用户每敲一个字符就吃一条失败提示。
 */
export function buildSyncConfigBody(form) {
    if (!channelRemoteReady(form))
        return null;
    return channelAuthBody(form, { trimToken: true });
}
/* ------------------------------------------------ 云端点通道（s3 / gist）表单逻辑 */
/**
/**
 * S3 兼容商清单（t88：**不再是客户端副本**，直接用零依赖共享常量 S3_COMPAT_PROVIDERS；
 * 宿主 sync-config.ts 只是它的 re-export）。下面的穷尽检查保留为双保险：
 * 宿主若新增兼容商而共享清单没同步，编译仍然失败；结构/运行时守卫见 sync-config.test.ts 的 t88。
 */
export const S3_PROVIDERS = S3_COMPAT_PROVIDERS;
const s3ProvidersAreExhaustive = true;
void s3ProvidersAreExhaustive;
/** 缺省兼容商（AWS S3）。 */
export const DEFAULT_S3_PROVIDER = 's3';
/** 桶名（与宿主同口径）：3-63 位小写字母/数字/点/连字符，首尾为字母或数字。 */
const BUCKET_NAME_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
/** gist id（与宿主同口径）：GitHub 的十六进制串。 */
const GIST_ID_RE = /^[0-9a-f]{5,64}$/i;
/**
 * 端点校验（http(s)、无空白、无 userinfo、无 query/hash）→ 码或 null。
 * 与宿主 `validateCloudEndpoint` **同口径**：客户端先校验只为「填错立刻可见 + 不拿必然 400 的
 * 载荷去打宿主」；宿主仍是最终权威，拒绝时回同一个码，UI 映射同一条文案。
 */
export function validateCloudEndpoint(endpoint) {
    if (endpoint.trim() === '')
        return 'cloud.endpointRequired';
    const raw = endpoint.trim();
    if (/\s/.test(raw))
        return 'cloud.endpointInvalid';
    let parsed;
    try {
        parsed = new URL(raw);
    }
    catch {
        return 'cloud.endpointInvalid';
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
        return 'cloud.endpointInvalid';
    if (parsed.username !== '' || parsed.password !== '')
        return 'cloud.endpointUserinfo';
    if (parsed.search !== '' || parsed.hash !== '')
        return 'cloud.endpointInvalid';
    return null;
}
/** region 校验：非空、无空白。 */
export function validateCloudRegion(region) {
    if (region.trim() === '' || /\s/.test(region.trim()))
        return 'cloud.regionRequired';
    return null;
}
/** 桶名校验（同宿主规则）。 */
export function validateCloudBucket(bucket) {
    if (bucket.trim() === '')
        return 'cloud.bucketRequired';
    const b = bucket.trim();
    if (!BUCKET_NAME_RE.test(b) || b.includes('..'))
        return 'cloud.bucketInvalid';
    return null;
}
/** 对象键前缀校验（首尾斜杠先归一，再判非法形态；空 = 根前缀，合法）。 */
export function validateCloudPrefix(prefix) {
    const p = prefix.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (p === '')
        return null;
    if (p.includes('\\') || p.includes('//') || p.includes('..'))
        return 'cloud.prefixInvalid';
    if (/[\u0000-\u001f\u007f]/.test(p))
        return 'cloud.prefixInvalid';
    return null;
}
/** gist id 校验（同宿主规则）。 */
export function validateGistId(gistId) {
    if (gistId.trim() === '')
        return 'cloud.gistIdRequired';
    if (!GIST_ID_RE.test(gistId.trim()))
        return 'cloud.gistIdInvalid';
    return null;
}
/** GitHub API 根校验（http(s)、无 userinfo）。 */
export function validateCloudApiBaseUrl(url) {
    if (url.trim() === '')
        return 'cloud.apiBaseUrlInvalid';
    let parsed;
    try {
        parsed = new URL(url.trim());
    }
    catch {
        return 'cloud.apiBaseUrlInvalid';
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
        return 'cloud.apiBaseUrlInvalid';
    if (parsed.username !== '' || parsed.password !== '')
        return 'cloud.apiBaseUrlInvalid';
    return null;
}
/** s3 表单的全部问题（顺序 = 字段出现顺序：provider → endpoint → region → bucket → prefix → accessKeyId）。 */
export function validateS3Form(form) {
    const issues = [];
    if (!S3_PROVIDERS.includes(form.s3Provider)) {
        issues.push({ field: 'provider', code: 'cloud.providerUnknown' });
    }
    const endpoint = validateCloudEndpoint(form.s3Endpoint);
    if (endpoint !== null)
        issues.push({ field: 'endpoint', code: endpoint });
    const region = validateCloudRegion(form.s3Region);
    if (region !== null)
        issues.push({ field: 'region', code: region });
    const bucket = validateCloudBucket(form.s3Bucket);
    if (bucket !== null)
        issues.push({ field: 'bucket', code: bucket });
    const prefix = validateCloudPrefix(form.s3Prefix);
    if (prefix !== null)
        issues.push({ field: 'prefix', code: prefix });
    if (form.s3AccessKeyId.trim() === '')
        issues.push({ field: 'accessKeyId', code: 'cloud.accessKeyIdRequired' });
    return issues;
}
/** gist 表单的全部问题（gistId 必填；两个可选字段**填了才校验**，空 = 用缺省）。 */
export function validateGistForm(form) {
    const issues = [];
    const gistId = validateGistId(form.gistId);
    if (gistId !== null)
        issues.push({ field: 'gistId', code: gistId });
    if (form.gistApiBaseUrl.trim() !== '') {
        const api = validateCloudApiBaseUrl(form.gistApiBaseUrl);
        if (api !== null)
            issues.push({ field: 'apiBaseUrl', code: api });
    }
    const filePrefix = validateCloudPrefix(form.gistFilePrefix);
    if (filePrefix !== null)
        issues.push({ field: 'filePrefix', code: filePrefix });
    return issues;
}
/** 按通道校验表单；git / webdav 走「地址非空」一条规则（见 channelRemoteReady），故返回空表。 */
export function validateCloudForm(form) {
    if (form.channel === 's3')
        return validateS3Form(form);
    if (form.channel === 'gist')
        return validateGistForm(form);
    return [];
}
/** 每个字段的首条问题（内联提示用；字段顺序稳定 = 上面的问题顺序）。 */
export function cloudFieldIssues(form) {
    const out = {};
    for (const issue of validateCloudForm(form)) {
        if (out[issue.field] === undefined)
            out[issue.field] = issue.code;
    }
    return out;
}
/**
 * /sync/status 的云端点视图 → 表单字段（**只回填非密字段**）。
 *
 * 密钥（AccessKey Secret / gist token）永远不在响应里：宿主只回 `secretStored` 布尔，
 * 该布尔供界面显示「密钥已保存」徽章（由组件直接读 statusInfo），不映射成任何表单值。
 */
export function cloudFormFromStatus(info) {
    return {
        s3Provider: info.s3?.provider ?? DEFAULT_S3_PROVIDER,
        s3Endpoint: info.s3?.endpoint ?? '',
        s3Region: info.s3?.region ?? '',
        s3Bucket: info.s3?.bucket ?? '',
        s3Prefix: info.s3?.prefix ?? '',
        s3AccessKeyId: info.s3?.accessKeyId ?? '',
        s3PathStyle: info.s3?.pathStyle ?? false,
        gistId: info.gist?.gistId ?? '',
        gistApiBaseUrl: info.gist?.apiBaseUrl ?? '',
        gistFilePrefix: info.gist?.filePrefix ?? '',
    };
}
/**
 * 通道「远端是否就绪」（四通道**唯一**判定；按钮可用性与自动保存共用同一条规则）：
 * - git = repoUrl 非空；webdav = url 非空（与拆分前逐字一致）；
 * - s3 / gist = 表单**全部校验通过**（必填 + 格式）—— 半截的云端点配置没有任何可用动作。
 */
export function channelRemoteReady(form) {
    if (form.channel === 'webdav')
        return form.webdavUrl.trim() !== '';
    if (form.channel === 'git')
        return form.repoUrl.trim() !== '';
    return validateCloudForm(form).length === 0;
}
/**
 * push / 预览的完整请求体 = 通道鉴权 + 分区选择 + 加密选项。安全不变量：
 * - **sessions 必须显式放行**：只有勾选了 sessions 才携带 `sessions`（否则会话绝不随同步上行）；
 * - **includeSecrets ⇒ encrypt**：勾了「导出密钥」即使没勾加密，也强制 `encrypt: true`（密钥绝不明文上行）。
 */
export function buildSyncPushBody(form, settings) {
    const sections = [...settings.syncSections];
    const selection = sections.length > 0 ? { sections } : {};
    // 显式点名（include）优先于数量上限（limit）：非空时只带用户勾中的对话
    const sessionsOpt = sections.includes('sessions')
        ? {
            sessions: {
                limit: settings.sessionsLimit,
                ...(settings.sessionsInclude.length > 0 ? { include: [...settings.sessionsInclude] } : {}),
            },
        }
        : {};
    const cryptoOpts = settings.encrypt || settings.includeSecrets
        ? { encrypt: true, encryptPassword: settings.encryptPassword, includeSecrets: settings.includeSecrets }
        : {};
    return { ...buildSyncChannelBody(form), ...selection, ...sessionsOpt, ...cryptoOpts };
}
/**
 * 同步分区选择请求体（POST /sync/selection）。既有语义：
 * - mode 恒 `advanced`（勾选集合就是同步范围，UI 已无模式概念）；
 * - 未给出的字段沿用当前通道既有值；
 * - 密码字段：**非空才携带**（空 = 沿用本机凭据库里已保存的密码）；
 * - `clear*` 删除标记与密码写入可同时出现（Host 侧以删除优先）。
 */
export function buildSelectionRequest(channel, current, patch = {}) {
    return {
        transport: channel,
        mode: 'advanced',
        sections: [...(patch.sections ?? current.syncSections)],
        sessionsLimit: patch.sessionsLimit ?? current.sessionsLimit,
        sessionsInclude: [...(patch.sessionsInclude ?? current.sessionsInclude)],
        encrypt: patch.encrypt ?? current.encrypt,
        includeSecrets: patch.includeSecrets ?? current.includeSecrets,
        deletePlugins: patch.deletePlugins ?? current.deletePlugins,
        ...(patch.encryptPassword !== undefined && patch.encryptPassword !== ''
            ? { encryptPassword: patch.encryptPassword }
            : {}),
        ...(patch.decryptPassword !== undefined && patch.decryptPassword !== ''
            ? { decryptPassword: patch.decryptPassword }
            : {}),
        ...(patch.clearEncryptPassword === true ? { clearEncryptPassword: true } : {}),
        ...(patch.clearDecryptPassword === true ? { clearDecryptPassword: true } : {}),
    };
}
/* ------------------------------------------------------------ 派生计算 */
/** 勾选/取消某个同步分区（不产生重复项；取消时按 id 过滤）。 */
export function toggleSectionSelection(current, id, checked) {
    if (!checked)
        return current.filter((s) => s !== id);
    return current.includes(id) ? [...current] : [...current, id];
}
/** 勾选是否非空（勾选集合就是同步范围 → 空集合禁止推送）。 */
export function hasSelectedSections(settings) {
    return settings.syncSections.length > 0;
}
/* ------------------------------------------------ 历史会话逐项勾选（P0-3） */
/**
 * 本次勾选是否需要会话单元清单（= 勾了 sessions 才需要）。
 *
 * 为什么是个函数而不是让组件直接判：仓库的结构守卫禁止「sessions 显式放行规则」散落在
 * React 壳里（src/client/sync/SyncSettingsView.test.ts 的 t42 分层守卫），且这条规则
 * 属于业务判断 —— 放在 ui 层可 node 直测，组件只消费结论。
 */
export function needsSessionInventory(sections) {
    return sections.includes('sessions');
}
/**
 * 打开会话选择器时的初始勾选：
 * - 已有显式点名（include 非空）→ 原样返回（绝不覆盖用户的结果）；
 * - 否则取清单**前 N 条**作为「最新 N 个」的可视化预选 —— 清单由宿主按会话最新活动
 *   时间倒序返回（/export-preview 注入 unitActivityTimes），所以前 N 条就是引擎会带走的那几个。
 *
 * 为什么要有这一步：sessionsInclude 为空时引擎按「最新 N 个」筛选，用户看不到是哪几个。
 * 预选把它们显式呈现出来，从「数量」平滑过渡到「点名」，也让「不勾任何 = 回到最新 N 个」
 * 这条回退语义有据可依。
 */
export function initialSessionPicks(unitIds, include, limit) {
    if (include.length > 0)
        return [...include];
    return unitIds.slice(0, Math.max(limit, 0));
}
/** sessionsInclude（白名单）→ ContentPicker 的 Selection（excluded = 清单里没被点名的那些）。 */
export function sessionPickerSelection(unitIds, picks) {
    const set = new Set(picks);
    return { sections: ['sessions'], excluded: unitIds.filter((id) => !set.has(id)) };
}
/**
 * ContentPicker 的 Selection → sessionsInclude（按清单顺序，结果稳定可复现）。
 *
 * 绕开 buildExportRequest 的「整分区全选 = 不下发白名单」压缩：同步侧的 include 空数组
 * 有**独立语义**（= 回到「最新 N 个」），不能被“全选”悄悄吞掉。
 */
export function pickedSessionIds(sel, unitIds) {
    if (!sel.sections.includes('sessions'))
        return [];
    return unitIds.filter((id) => !sel.excluded.includes(id));
}
/**
 * 「加密备份」开关的联动（既有语义，搬家不改）：
 * - 打开：只改 encrypt（密钥导出的勾选保持用户原样）；
 * - 关闭：一并取消「导出密钥」、清空两个密码输入框、复位「已保存」标记，并**删除本机凭据库里保存的加密密码**
 *   （用户主动取消勾选即清除保存的密码，密钥绝不明文进同步通道）。
 */
export function encryptToggle(next, settings) {
    const includeSecrets = next ? settings.includeSecrets : false;
    return {
        channelPatch: {
            encrypt: next,
            includeSecrets,
            ...(next ? {} : { encryptPassword: '', encryptPasswordConfirm: '', encryptPasswordSaved: false }),
        },
        selectionPatch: {
            encrypt: next,
            includeSecrets,
            ...(next ? {} : { clearEncryptPassword: true }),
        },
    };
}
/** 「导出密钥」开关的联动：勾选时自动打开加密（密钥绝不明文进同步通道）。 */
export function includeSecretsToggle(next, settings) {
    const encrypt = next ? true : settings.encrypt;
    return {
        channelPatch: { includeSecrets: next, encrypt },
        selectionPatch: { includeSecrets: next, encrypt },
    };
}
/**
 * 加密推送校验（加密/导出密钥已勾选时）：
 * - 输入框填了 → 必须与确认框一致（半截密码不算数）；
 * - 输入框留空 → 必须本机凭据库里已有密码（留空即沿用）。
 */
export function computeEncryptInvalid(settings) {
    if (!settings.encrypt && !settings.includeSecrets)
        return false;
    if (settings.encryptPassword !== '')
        return settings.encryptPassword !== settings.encryptPasswordConfirm;
    return !settings.encryptPasswordSaved;
}
/** GitHub device flow 是否进行中（请求设备码 / 等待授权 / 轮询）：进行中禁用 push/pull。 */
export function isGithubFlowInFlight(phase) {
    return phase === 'starting' || phase === 'waiting' || phase === 'polling';
}
/**
 * GitHub 轮询的下一步决策：pending → 继续等待并按服务端建议（缺省 interval，最小 1 秒）排期；
 * success → 成功（组件刷新状态）；其余终止态（denied/expired/error）→ 错误态、不再排期。
 */
export function githubPollDecision(poll, fallbackIntervalSec) {
    if (poll.status === 'pending') {
        const delayMs = poll.pollDelayMs ?? Math.max(fallbackIntervalSec, 1) * 1000;
        return { phase: 'waiting', delayMs };
    }
    return { phase: poll.status === 'success' ? 'success' : 'error', delayMs: null };
}
/**
 * /sync/status → 单通道设置回填。既有语义：
 * - 模式恒 advanced；
 * - 分区初始值由调用方算好传入（推荐分区规则住在 sync-view.ts 的 initialSyncSections，
 *   本模块不重复实现；用户主动清空 → 传空数组，保持为空，绝不悄悄填回来）；
 * - 密码「已保存」来自本机凭据库，只回布尔；库里没有 → 复位 false。
 */
export function channelBackfillFromStatus(input) {
    const { selection, autosync, credentials, persistedSections, sessionsLimit } = input;
    return {
        syncMode: 'advanced',
        syncSections: [...persistedSections],
        sessionsLimit,
        sessionsInclude: [...(selection?.sessionsInclude ?? [])],
        encrypt: selection?.encrypt ?? false,
        includeSecrets: selection?.includeSecrets ?? false,
        deletePlugins: selection?.deletePlugins ?? false,
        encryptPasswordSaved: credentials?.encryptPasswordConfigured ?? false,
        decryptPasswordSaved: credentials?.decryptPasswordConfigured ?? false,
        autosyncEnabled: autosync?.enabled ?? false,
        autosyncInterval: autosync?.interval ?? '30m',
    };
}
/**
 * 一次保存请求的入口决策（对应 doSaveConfig 开头）：
 * - 已在途 → 记下最新待发改动并返回 `'queue'`（防重入，不并发发请求）；
 * - 空闲 → 置在途并返回 `'send'`（待发改动**原样保留**，与原实现一致）。
 */
export function saveQueueOnRequest(state, requested) {
    if (state.inFlight)
        return { state: { inFlight: true, pending: requested }, action: 'queue' };
    return { state: { inFlight: true, pending: state.pending }, action: 'send' };
}
/**
 * 请求结束（成功/失败都走）后的收敛（对应 finally）：清在途，返回需要在途期间排入的
 * 待发改动（非 null 则由调用方立即补发，保证「保存中又改」的内容不丢）。
 */
export function saveQueueOnSettled(state) {
    return { state: { inFlight: false, pending: null }, next: state.pending };
}
/**
 * flush（手动点保存 / 防抖到点）：优先用**待发改动**，否则按当前表单值重建；
 * 无论走哪条都清空待发（一次性消费）。
 */
export function saveQueueOnFlush(state, rebuilt) {
    return { state: { ...state, pending: null }, payload: state.pending ?? rebuilt };
}
const AUTOSYNC_INTERVAL_LABEL_KEYS = {
    '5m': 'autosync.interval5m',
    '15m': 'autosync.interval15m',
    '30m': 'autosync.interval30m',
    '60m': 'autosync.interval60m',
    '6h': 'autosync.interval6h',
    '12h': 'autosync.interval12h',
    '24h': 'autosync.interval24h',
};
/** 间隔 → 文案键；未知值 → null（组件保留原样展示，与搬家前的 default 分支一致）。 */
export function autosyncIntervalKey(iv) {
    return AUTOSYNC_INTERVAL_LABEL_KEYS[iv] ?? null;
}
/**
 * 初始通道解析：store 切片缺省 'git'，无法区分「持久化过 git」与「从未持久化」——
 * 无明确记录时回退 localStorage 记住的选择（升级前遗留），避免冲掉用户选择。
 */
export function resolveInitialChannel(persistedChannel, rememberedChannel) {
    return persistedChannel !== 'git' ? persistedChannel : (rememberedChannel ?? 'git');
}
/**
 * 上次同步时间（ISO 字符串，来自 GET /sync/status 的 lastSyncAt）→ 展示文本。
 *
 * 既有语义原样保留：**只有 undefined** 显示占位符 `—`；空串等异常输入交给
 * `Date` 自己处理（与搬家前的 `new Date(x).toLocaleString()` 完全一致 —— 顺手改成
 * 「空串也显示 —」会改变展示行为，留作独立小项）。
 */
export function formatSyncStatusTimestamp(lastSyncAt, locale) {
    if (lastSyncAt === undefined)
        return '—';
    return locale === undefined ? new Date(lastSyncAt).toLocaleString() : new Date(lastSyncAt).toLocaleString(locale);
}
/** 远端地址预览（列表/事实行用）：超长截断到 max 字符（不省略号，保持既有展示）。 */
/* ---------------------------------------------------------------- 工作副本（issue #79） */
/**
 * 工作副本自检结果的状态字典键（issue #79）。
 *
 * 入参用**结构类型**（status.workDir 的形状），判定只有这一份实现：
 *  - 自检读不出来（error）→ unknown（读不到 ≠ 不存在）
 *  - 无 .git → missing（首次同步才会 clone）
 *  - origin 已跟随 repoUrl → match；否则 mismatch（改地址后最需要看见的那一条）
 */
export function workdirStateKey(workDir) {
    if (workDir === undefined)
        return null;
    if (workDir.error !== undefined)
        return 'workdir.unknown';
    const facts = workDir.facts;
    if (facts === undefined)
        return 'workdir.unknown';
    if (!facts.exists)
        return 'workdir.missing';
    return facts.match ? 'workdir.match' : 'workdir.mismatch';
}
/** 工作副本状态 → 徽章语义（ok = 已跟随；warn = 仍指旧地址 / 读不出；info = 尚未创建）。 */
export function workdirStateBadgeKind(state) {
    switch (state) {
        case 'workdir.match': return 'ok';
        case 'workdir.mismatch': return 'warn';
        // 读不出 ≠ 不存在：不能给「正常」的绿色，也不该给「失败」的红色
        case 'workdir.unknown': return 'warn';
        case 'workdir.missing': return 'info';
        default: return null;
    }
}
/** 是否需要给用户「重指向仓库地址」入口（只在自检成功、目录存在且地址不一致时）。 */
export function needsWorkdirRelink(workDir) {
    return workdirStateKey(workDir) === 'workdir.mismatch';
}
/** 是否可以「重新克隆工作副本」（自检成功、目录存在且确实是 git 工作副本时才允许）。 */
export function canRecloneWorkdir(workDir) {
    return workDir !== undefined && workDir.error === undefined && workDir.facts?.exists === true;
}
/**
 * 是否可以「采纳远端历史」（issue #104）：前提与「重新克隆」相同（自检成功、目录里确实是 git
 * 工作副本），区别只在破坏性 —— adopt 不删任何本地提交，可以 revert。
 *
 * 为什么**不**要求 workDir.match：issue #104 的触发路径恰恰是 mismatch（用户把仓库地址改成另一个
 * 仓库后，自检看到 origin 仍指旧地址）。adopt 内部第一步就是 reconcileOrigin + fetch 当前配置地址，
 * 所以 mismatch 正是该给这个入口的时候。地址还没跟上时先 relink 也行，但两键并不互斥。
 */
export function canAdoptWorkdir(workDir) {
    return canRecloneWorkdir(workDir);
}
export function workdirBacklog(workDir) {
    if (workDir === undefined || workDir.error !== undefined)
        return { kind: 'unknown' };
    const ahead = workDir.facts?.ahead;
    const remoteSnapshots = workDir.facts?.remoteSnapshots;
    if (typeof ahead !== 'number' || typeof remoteSnapshots !== 'number')
        return { kind: 'unknown' };
    if (ahead <= 0)
        return { kind: 'clean', ahead, remoteSnapshots };
    if (remoteSnapshots === 0)
        return { kind: 'never-synced', ahead };
    return { kind: 'ahead', ahead, remoteSnapshots };
}
/**
 * 「这一步该按哪个方向」—— 动作行只留一个 primary（issue 115：两个按钮并排、首次使用看不出该按哪个）。
 *
 * 判定只用**已确证**的远端事实，没证据就回落下行：一键同步先拉远端再三方合并、逐项确认，
 * 不会拿本机默认值覆盖远端历史；上行推送才是产生新快照、改写远端历史的那个动作。
 * 唯一让上行成为 primary 的情形是「远端确证零快照」（git 工作副本自检 remoteSnapshots === 0）：
 * 此时同步无事可做，用户要的就是第一次备份。判定入口收在本函数里（channel 一并传入），
 * 组件不用在调用点再判一次通道 —— 判据只有一处。
 */
export function pickSyncPrimary(statusInfo, channel) {
    // 只有 git 通道会做工作副本自检；别的通道没有这份事实，一律回落下行。
    if (channel !== 'git')
        return 'sync';
    const backlog = workdirBacklog(statusInfo?.workDir);
    if (backlog.kind === 'never-synced')
        return 'push';
    if (backlog.kind === 'clean' && backlog.remoteSnapshots === 0)
        return 'push';
    return 'sync';
}
export function formatSyncUrlPreview(url, max = 60) {
    return url.slice(0, max);
}
//# sourceMappingURL=sync-settings-view.js.map