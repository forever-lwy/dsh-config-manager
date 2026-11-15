/**
 * 把一处键名风险转成用户可见文案。
 *
 * @param ref 计划项对应的 patch 行 id（`lineId`），用于让用户定位到具体是哪一行
 * @param hazard `findPatchKeyHazards` 的命中项
 */
export function patchKeyHazardMessage(msg, ref, hazard) {
    const path = hazard.path === '' ? '-' : hazard.path;
    return hazard.effect === 'parse-fail'
        ? msg('adapter.patchKeyParseFail', { ref, path })
        : msg('adapter.patchKeyAmbiguous', { ref, key: hazard.key, path });
}
//# sourceMappingURL=patch-key-guard.js.map