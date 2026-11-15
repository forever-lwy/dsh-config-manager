import { consoleScriptCspHash } from './client-script.js';
/** HTML 响应（content-type + no-store + referrer-policy + CSP 只在这一处维护）。 */
export function writeHtml(res, status, html) {
    res.writeHead(status, {
        'content-type': 'text/html; charset=utf-8',
        'referrer-policy': 'same-origin',
        'cache-control': 'no-store',
        'x-frame-options': 'DENY',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; "
            + "script-src " + consoleScriptCspHash() + "; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    });
    res.end(html);
}
//# sourceMappingURL=http.js.map