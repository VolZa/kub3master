import { PermissionService, type UserIdentity, type UserRepository } from '../../security/permission-service';
import { TEST_CONFIG_KEY, TEST_INSTALLATION_KEY, ROLES, readTestConfiguration, validId, type FileRole } from '../test-reset/test-configuration';
import { PRODUCTION_SCRIPT_ID, TEST_RESET_SOURCES } from '../test-reset/test-sources';

export interface RuntimePorts {
  properties: { getProperty(key: string): string | null };
  scriptId(): string;
  identity: { current(): UserIdentity | undefined };
  users: UserRepository;
  now(): number;
}
/** Server-only composition port. Never accept these dependencies from RPC arguments. */
export class TestRuntimeResolver {
  private readonly permissions: PermissionService;
  constructor(private readonly p: RuntimePorts) { this.permissions = new PermissionService(p.users, p.now, 'TEST'); }
  resolve() {
    this.permissions.require(this.p.identity.current(), 'USER_MANAGE');
    const script = this.p.scriptId();
    if (!validId(script) || script === PRODUCTION_SCRIPT_ID) throw Error('TEST_CONTEXT_REQUIRED');
    let marker;
    try { marker = JSON.parse(this.p.properties.getProperty(TEST_INSTALLATION_KEY) ?? 'null'); }
    catch { throw Error('TEST_CONTEXT_REQUIRED'); }
    if (marker?.version !== 1 || marker.environment !== 'TEST' || marker.scriptId !== script) throw Error('TEST_CONTEXT_REQUIRED');
    const raw = this.p.properties.getProperty(TEST_CONFIG_KEY);
    if (raw === null || raw.length > 9000) throw Error('TEST_ACTIVE_CONFIGURATION_REQUIRED');
    const config = readTestConfiguration(raw, script, TEST_RESET_SOURCES);
    // v1/v1.2 canonical contract: active is the committed Generation, not pending.files.
    if (!config.active) throw Error('TEST_ACTIVE_GENERATION_REQUIRED');
    const active = config.active;
    const ids = Object.fromEntries(ROLES.map(r => [r, active.files[r].id])) as Record<FileRole, string>;
    return { generation: active.id, ids, token: JSON.stringify([script, config.folderId, active]) };
  }
  target(role: FileRole) {
    if (!ROLES.includes(role)) throw Error('TEST_ROUTE_BLOCKED');
    const state = this.resolve(); return { ...state, id: state.ids[role] };
  }
}
