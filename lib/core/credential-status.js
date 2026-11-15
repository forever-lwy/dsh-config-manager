/**
 * ref 在**目标机**是否已配置。
 * 凭据服务不可用 / ref 不合法 → false（保守：仍按「需要补录」处理）。
 */
export async function isCredentialConfigured(ctx, ref) {
    try {
        return (await ctx.credentials.describe(ref)).configured === true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=credential-status.js.map