/**
 * S3 兼容系通道（批次3 Q2）的**模块内双语消息目录**（zh 源 / en 镜像）。
 *
 * 为什么不写进 \`src/core/messages.ts\`：批次3 的写作用域只含 \`src/sync/s3|gist|sync-config.ts\`，
 * 而 \`src/core/*\` 属他人 in-flight 工作区。本目录与 core 的同名目录**同形同纪律**
 * （zh 为源、en 为 \`Record<keyof typeof zh, string>\` —— 缺键/多键即编译错误、{param} 插值、
 * 未知键回退 zh 再回退键名），因此后续把键并入 \`src/core/messages.ts\` 是逐行搬迁，无需改写调用点。
 *
 * 纪律：**任何用户可见字符串都不得写在通道实现里**（含错误消息）；密钥值永不进消息
 * （脱敏由通道层在拼消息前完成）。
 */
import type { MsgFunc } from '../../core/msg-types.ts';
export declare const s3Zh: {
    readonly 'sync.s3.providerUnknown': '未知的 S3 兼容通道: {provider}';
    readonly 'sync.s3.endpointRequired': '对象存储 endpoint 必须是非空字符串（自建网关请填完整 http(s) 地址）';
    readonly 'sync.s3.endpointInvalid': '无法解析对象存储 endpoint（必须是合法 http(s) URL）: {url}';
    readonly 'sync.s3.endpointUserinfo': '请勿在 endpoint 中包含用户名/密码（AccessKey 走凭据字段，不会拼入地址）';
    readonly 'sync.s3.regionRequired': '通道 {provider} 必须提供 region（V4 签名的作用域需要它）';
    readonly 'sync.s3.bucketRequired': 'bucket 必须是非空字符串';
    readonly 'sync.s3.bucketInvalid': '桶名不合法: {bucket}（3-63 位小写字母/数字/点/连字符，首尾必须是字母或数字）';
    readonly 'sync.s3.prefixInvalid': '对象键前缀不合法: {prefix}（不得以 / 开头，不得含 .. 或反斜杠）';
    readonly 'sync.s3.accessKeyIdRequired': 'accessKeyId 必须是非空字符串';
    readonly 'sync.s3.credentialsRequired': 'credentials 必须提供 getSecretAccessKey()';
    readonly 'sync.s3.invalidSnapshotId': '非法快照 id: {id}（仅允许字母数字开头，字符限 . _ -）';
    readonly 'sync.s3.snapshotMissing': '快照 {id} 不存在（{url}）';
    readonly 'sync.s3.requestFailed': '{method} {url} 失败 (HTTP {status}): {err}';
    readonly 'sync.s3.requestError': '{method} {url} 请求出错: {err}';
    readonly 'sync.s3.timeout': '{method} {url} 请求超时（{timeout}ms）';
    readonly 'sync.s3.indexInvalid': '{url} 解析失败或结构非法: {err}';
    readonly 'sync.s3.snapshotInvalid': '快照 {id} 解析失败或结构非法: {err}';
    readonly 'sync.s3.indexMissingWithContent': '远端已有内容但索引 {url} 缺失（HTTP 404）：拒绝以空集合覆盖权威索引，本次上传已中止（零写入）';
    readonly 'sync.s3.providerNoteS3': 'AWS S3（默认 us-east-1；AWS 中国区/自建网关请覆盖 endpoint）';
    readonly 'sync.s3.providerNoteOss': '阿里云 OSS（region 必填，如 cn-hangzhou；签名方言 OSS4，头名 x-oss-*）';
    readonly 'sync.s3.providerNoteCos': '腾讯云 COS（region 必填，如 ap-guangzhou；2024 年后新建桶只支持 virtual-host 寻址）';
    readonly 'sync.s3.providerNoteMinio': 'MinIO / 自建网关（endpoint 必填；默认 path-style，配了域名才用 virtual-host）';
    readonly 'sync.s3.providerNoteKodo': '七牛 Kodo S3 兼容（region 必填，如 cn-east-1；endpoint 可覆盖）';
    readonly 'sync.s3.unknownSignatureDialect': '未知签名方言: {id}';
    readonly 'sync.s3.blobHashInvalid': '内容哈希形状非法，拒绝写入 blob 仓: {hash}';
    readonly 'sync.s3.concurrentWrite': '远端索引已被其它设备更新（HTTP {status}）：本次写入已中止，请重新同步后再试';
    readonly 'sync.s3.probeOk': '连接正常（远端 {count} 份快照）';
    readonly 'sync.s3.probeRegionRedirect': '端点把请求重定向到区域 {region}：请把 region 改成该值后重试';
    readonly 'sync.s3.probeRedirectNoRegion': '端点返回了重定向（HTTP {status}）但没有给出区域：请核对 endpoint 与 region';
    readonly 'sync.s3.probeBucketMissing': '桶不存在或无权访问（HTTP 404）：请核对 bucket 名与 endpoint';
    readonly 'sync.s3.probeAccessDenied': '访问被拒绝（HTTP 403）：请核对 AccessKey、密钥与桶权限';
};
export declare const s3En: Record<keyof typeof s3Zh, string>;
/**
 * 构造「目录驱动」的 MsgFunc（s3 与 gist 两个新通道共用这一份）。
 * en → en 目录（缺键回退 zh）；其余 → zh；未知键回退键名（绝不抛错）。
 */
export declare function makeCatalogMsg(zh: Record<string, string>, en: Record<string, string>, lang?: string): MsgFunc;
/** 缺省（zh）S3 通道翻译器。 */
export declare const s3Msg: MsgFunc;
/**
 * 把「宿主传入的翻译器」与本地目录**合并**（t79）：
 *  - **宿主优先**：宿主（`ConfigManagerHostContext.this.msg = makeMsg(language)`，见 src/index.ts:1500）
 *    掌握 core 全量键与当前语言，它认得就照它；
 *  - **本地兜底**：`sync.s3.*` 这类键**只存在于本模块**（core 目录里一个都没有），宿主必然查不到
 *    —— 直接用它会出现「界面显示裸键名」（makeMsg 的未知键回退就是键名本身）。回退本地目录即可拿到文案；
 *  - 两边都没有 ⇒ 仍回退键名（保持 makeMsg 的既有边界，绝不抛错）。
 *
 * 同一个 helper 也供 WebDAV 侧使用（`composeMsg(options.msg, zhMsg)`：宿主缺键时回退 core zh，而不是裸键名）。
 * 已知取舍：宿主语言为 en 时，本地目录的键仍出 zh 文案（本地目录缺语言上下文）—— 比裸键名好，
 * 但不等同于完整 en 本地化；要彻底解决得把语言传进传输层（越界，登记为观察）。
 */
export declare function composeMsg(host: MsgFunc | undefined, local: MsgFunc): MsgFunc;
