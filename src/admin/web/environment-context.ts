import type { AdminConfigurationStatus, AdminEnvironment } from './contracts';

const environments = ['PRODUCTION', 'TEST'] as const;
const scriptId = (value: unknown): value is string => typeof value === 'string' &&
  /^[A-Za-z0-9_-]{20,200}$/.test(value) && !/REPLACE|PLACEHOLDER/i.test(value);
const deploymentUrl = (value: unknown): value is string => typeof value === 'string' &&
  /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/.test(value);
function object(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}
export function requireBuildEnvironment(value: unknown): AdminEnvironment {
  if (value !== 'PRODUCTION' && value !== 'TEST') throw Error('ADMIN_TARGET_BLOCKED');
  return value;
}
/** Trusted build configuration only. Never consumes request parameters or Script Properties. */
export function resolveAdminEnvironment(environment: AdminEnvironment, configuration: unknown, actualScriptId: unknown) {
  requireBuildEnvironment(environment);
  const state = (configurationStatus: AdminConfigurationStatus, switchUrl: string | null = null) =>
    Object.freeze({ environment, configurationStatus, switchUrl });
  if (configuration === null || configuration === undefined) return state('NOT_CONFIGURED');
  if (!object(configuration, ['version', 'environment', 'scriptIds', 'environmentUrls']) ||
    configuration.version !== 1 || configuration.environment !== environment ||
    !object(configuration.scriptIds, environments) || !object(configuration.environmentUrls, environments)) return state('INVALID');
  const ids = configuration.scriptIds, urls = configuration.environmentUrls;
  if (environments.some(env => ids[env] !== null && !scriptId(ids[env]) || urls[env] !== null && !deploymentUrl(urls[env])) ||
    ids.PRODUCTION !== null && ids.PRODUCTION === ids.TEST ||
    urls.PRODUCTION !== null && urls.PRODUCTION === urls.TEST) return state('INVALID');
  if (environments.some(env => ids[env] === null)) return state('NOT_CONFIGURED');
  if (!scriptId(actualScriptId) || actualScriptId !== ids[environment]) return state('SCRIPT_ID_MISMATCH');
  const other = environment === 'PRODUCTION' ? 'TEST' : 'PRODUCTION';
  return state('CONFIGURED', urls[other] as string | null);
}
