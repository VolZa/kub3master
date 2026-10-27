import type { Permission } from '../../../security/permission-service';
import type { LocalAuthenticationPorts, LoginResult, LoginStartResult, RecoveryResult } from './ports';
import { SessionResolver } from './session-resolver';
import { SessionAuthorizationAdapter } from './authorization-adapter';
import { LoginOrchestrator } from './login-orchestrator';
import { durableAdmissionGate } from '../identity-contracts/durable-store-contracts';

function blockedAuthentication() {
  return Object.freeze({
    startLogin: async (_request: unknown): Promise<LoginStartResult> => ({ status: 'BLOCKED', code: 'NOT_CONFIGURED' }),
    completeLogin: async (_request: unknown): Promise<LoginResult> => ({ status: 'BLOCKED', code: 'NOT_CONFIGURED' }),
    recoverOperation: async (_query: unknown): Promise<RecoveryResult> => ({ status: 'BLOCKED', code: 'NOT_CONFIGURED' }),
    authorize: async (_request: unknown, _permission: Permission): Promise<{ readonly status: 'AUTHORIZED' | 'DENIED' }> => ({ status: 'DENIED' }),
  });
}
/** No positive remote composition path exists in this slice, regardless of injected port claims.
 * Not connected to ADMIN, no persistent adapter, no real authentication/crypto configuration. */
export function composeRemoteDurableAuthentication(configuration?: unknown) {
  return Object.freeze({ ...blockedAuthentication(), securityGate: durableAdmissionGate(configuration) });
}

/** Local composition only; no entrypoint/build integration or production config. No default adapters.
 * Tests alone supply synthetic verification and the in-memory reference model. */
export function composeLocalAuthentication(ports?: LocalAuthenticationPorts) {
  if (!ports || !ports.verifier || !ports.receipts || !ports.commandDigests || !ports.backendOrigin || !ports.readDeadline || !ports.keyPolicy)
    return blockedAuthentication();
  const resolver = new SessionResolver(ports), authorization = new SessionAuthorizationAdapter(resolver, ports), login = new LoginOrchestrator(ports, resolver);
  return Object.freeze({ startLogin: (request: unknown) => login.startLogin(request), completeLogin: (request: unknown) => login.completeLogin(request),
    recoverOperation: (query: unknown) => login.recoverOperation(query),
    authorize: (request: unknown, permission: Permission) => authorization.authorize(request, permission) });
}
