import type { MsgFunc } from '../../core/msg-types.ts';
export declare const gistZh: {
    readonly 'sync.gist.gistIdRequired': 'gistId 必须是非空字符串（在 GitHub 上新建一个（私密）gist 后填入其 id）';
    readonly 'sync.gist.gistIdInvalid': 'gistId 不合法: {id}（GitHub gist id 是十六进制串）';
    readonly 'sync.gist.apiBaseUrlInvalid': '无法解析 GitHub API 根地址（必须是合法 http(s) URL，且不含用户名/密码）: {url}';
    readonly 'sync.gist.tokenRequired': 'credentials 必须提供 getToken()';
    readonly 'sync.gist.filePrefixInvalid': 'gist 文件名前缀不合法: {prefix}（不得为空、不得含斜杠或 ..）';
    readonly 'sync.gist.invalidSnapshotId': '非法快照 id: {id}（仅允许字母数字开头，字符限 . _ -）';
    readonly 'sync.gist.gistMissing': 'Gist {id} 不存在或当前令牌无权访问（HTTP {status}）';
    readonly 'sync.gist.fileMissing': 'Gist 里缺少快照文件 {file}（可能被手工删除）';
    readonly 'sync.gist.contentTruncated': 'Gist 文件 {file} 内容被截断，raw 下载也失败: {err}';
    readonly 'sync.gist.rawFetchFailed': '下载 gist 文件原文失败（{url}，HTTP {status}）';
    readonly 'sync.gist.tooManyRedirects': '{url} 重定向超过 {n} 次上限，疑似跳转循环';
    readonly 'sync.gist.requestFailed': '{method} {url} 失败 (HTTP {status}): {err}';
    readonly 'sync.gist.requestError': '{method} {url} 请求出错: {err}';
    readonly 'sync.gist.timeout': '{method} {url} 请求超时（{timeout}ms）';
    readonly 'sync.gist.indexInvalid': '{url} 解析失败或结构非法: {err}';
    readonly 'sync.gist.snapshotInvalid': '快照 {id} 解析失败或结构非法: {err}';
    readonly 'sync.gist.indexConflict': '索引在写入期间被他人改动，本次未能安全合并（已重试 {attempts} 次）：请稍后重试';
    readonly 'sync.gist.probeOk': '连接正常（Gist 可读写，远端 {count} 份快照）';
    readonly 'sync.gist.probeForeignContent': '该 Gist 里已有 {count} 个不属于本插件的文件：请确认这是你的同步专用 Gist（前缀 {prefix}），否则可能覆盖别人的数据';
};
export declare const gistEn: Record<keyof typeof gistZh, string>;
/** 缺省（zh）Gist 通道翻译器。 */
export declare const gistMsg: MsgFunc;
