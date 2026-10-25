import type { Permission } from '../../../security/permission-service';
import type { LocalAuthenticationPorts, LoginResult, LoginStartResult } from './ports';
import { SessionResolver } from './session-resolver';
import { SessionAuthorizationAdapter } from './authorization-adapter';
import { LoginOrchestrator } from './login-orchestrator';

/** Local composition only; no entrypoint/build integration or production config. No default adapters.
 * Tests alone supply synthetic verification and the in-memory reference model. */
export function composeLocalAuthentication(ports?: LocalAuthenticationPorts) {
  if (!ports || !ports.verifier) return Object.freeze({
    startLogin: async (_request: unknown): Promise<LoginStartResult> => ({ status: 'BLOCKED', code: 'NOT_CONFIGURED' }),
    completeLogin: async (_request: unknown): Promise<LoginResult> => ({ status: 'BLOCKED', code: 'NOT_CONFIGURED' }),
    authorize: (_request: unknown, _permission: Permission): { readonly status: 'AUTHORIZED' | 'DENIED' } => ({ status: 'DENIED' }),
  });
  const resolver = new SessionResolver(ports), authorization = new SessionAuthorizationAdapter(resolver, ports), login = new LoginOrchestrator(ports, resolver);
  return Object.freeze({ startLogin: (request: unknown) => login.startLogin(request), completeLogin: (request: unknown) => login.completeLogin(request),
    authorize: (request: unknown, permission: Permission) => authorization.authorize(request, permission) });
}
