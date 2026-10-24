import { verifiedIdentity, type UserIdentity } from '../../security/permission-service';
import type { IdentityProvider } from '../../security/production-authorization';
export const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
export interface UserInfoRuntime {
  getOAuthToken(): string;
  fetch(url: string, options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions): Pick<GoogleAppsScript.URL_Fetch.HTTPResponse, 'getResponseCode' | 'getContentText' | 'getHeaders'>;
}
export interface ProbedGoogleIdentity { issuer: 'https://accounts.google.com'; subject: string; email: string }
type IdentityProbeReason = 'OAUTH_TOKEN_UNAVAILABLE' | 'OAUTH_TOKEN_MISSING' | 'OAUTH_TOKEN_INVALID' |
  'USERINFO_REQUEST_FAILED' | 'USERINFO_RESPONSE_INVALID' | 'USERINFO_HTTP_DENIED' |
  'USERINFO_CONTENT_TYPE_INVALID' | 'USERINFO_BODY_INVALID' | 'USERINFO_JSON_INVALID' | 'IDENTITY_FIELDS_INVALID';
type RequestFailure = 'AUTHORIZATION_REQUIRED' | 'NETWORK_FAILURE' | 'OTHER_REQUEST_ERROR';
/** Apps Script has no documented stable fetch exception code. Match known message prefixes
 * conservatively; localized/unknown errors stay OTHER. Never stringify or retain the exception.
 */
function classifyRequestFailure(error: unknown): RequestFailure {
  try {
    const message = typeof error === 'string' ? error : error && typeof error === 'object' && 'message' in error ? error.message : undefined;
    if (typeof message !== 'string' || message.length > 4096) return 'OTHER_REQUEST_ERROR';
    const text = message.replace(/^(?:Exception|Error):\s*/i, '');
    if (/^(?:Authorization is required to perform that action\.|You do not have permission to call (?:UrlFetchApp\.fetch|fetch)\b|Access denied:\s*UrlFetchApp\b)/i.test(text)) return 'AUTHORIZATION_REQUIRED';
    if (/^(?:(?:DNS|SSL|Network) error\b|Address unavailable\b|Timeout\b|Connection (?:timed out|reset|refused)\b|Socket (?:timeout|closed)\b)/i.test(text)) return 'NETWORK_FAILURE';
  } catch { /* Even unusual exception objects must not escape or be logged. */ }
  return 'OTHER_REQUEST_ERROR';
}
/** Fixed metadata only; never retain an upstream exception, body or credential. */
export class IdentityProbeError extends Error {
  constructor(readonly reason: IdentityProbeReason, readonly httpStatus?: number,
    readonly requestFailure?: RequestFailure) { super('ACCESS_DENIED'); }
}
/** Only for an undeployed editor-only administrative project. Not visitor authentication for an
 * execute-as-owner Web App. The caller never supplies token, subject, email or roles.
 */
export class GoogleAdminIdentityProvider implements IdentityProvider {
  constructor(private readonly runtime: UserInfoRuntime, private readonly now: () => number = Date.now) {}
  probe(): ProbedGoogleIdentity {
    try { return this.probeForReadiness(); }
    catch { throw Error('ACCESS_DENIED'); }
  }
  /** Diagnostic detail is consumed only by the guarded manual readiness entrypoint. */
  probeForReadiness(): ProbedGoogleIdentity {
    let reason: IdentityProbeReason = 'OAUTH_TOKEN_UNAVAILABLE';
    let httpStatus: number | undefined;
    try {
      const token = this.runtime.getOAuthToken();
      reason = 'OAUTH_TOKEN_MISSING';
      if (token === '' || token == null) throw Error();
      reason = 'OAUTH_TOKEN_INVALID';
      if (typeof token !== 'string' || !token || token.length > 16384 || /\s/.test(token)) throw Error();
      reason = 'USERINFO_REQUEST_FAILED';
      const response = this.runtime.fetch(USERINFO_URL, { method: 'get', headers: { Authorization: `Bearer ${token}` },
        validateHttpsCertificates: true, followRedirects: false, muteHttpExceptions: true });
      reason = 'USERINFO_RESPONSE_INVALID';
      const status = response.getResponseCode();
      if (!Number.isInteger(status) || status < 100 || status > 599) throw Error();
      reason = 'USERINFO_HTTP_DENIED';
      if (status !== 200) { httpStatus = status; throw Error(); }
      reason = 'USERINFO_CONTENT_TYPE_INVALID';
      const headers = response.getHeaders();
      const contentType = Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1];
      if (typeof contentType !== 'string' || !/^application\/json(?:\s*;|$)/i.test(contentType)) throw Error();
      reason = 'USERINFO_BODY_INVALID';
      const text = response.getContentText(); if (typeof text !== 'string' || text.length > 16384) throw Error();
      reason = 'USERINFO_JSON_INVALID';
      const info = JSON.parse(text);
      reason = 'IDENTITY_FIELDS_INVALID';
      if (!info || typeof info !== 'object' || Array.isArray(info) ||
        typeof info.sub !== 'string' || !/^[A-Za-z0-9._-]{1,255}$/.test(info.sub) ||
        typeof info.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(info.email) || info.email_verified !== true ||
        (info.iss !== undefined && info.iss !== 'https://accounts.google.com')) throw Error();
      return Object.freeze({ issuer: 'https://accounts.google.com' as const, subject: info.sub, email: info.email });
    } catch (error) { throw new IdentityProbeError(reason, httpStatus,
      reason === 'USERINFO_REQUEST_FAILED' ? classifyRequestFailure(error) : undefined); }
  }
  current(): UserIdentity {
    const identity = this.probe();
    // Runtime identity is deliberately short-lived and not a persisted ERP browser session.
    return verifiedIdentity(identity.issuer, identity.subject, this.now() + 60000);
  }
}
