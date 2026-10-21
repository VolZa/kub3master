import { PermissionService, type Permission, type UserIdentity, type UserRepository } from './permission-service';
export interface IdentityProvider { current(): UserIdentity | undefined }
/** null is an explicit policy hold, not an implicit permission for the owner. */
export const wrapperPermissions = Object.freeze({
  onOpen: 'BOM_EDIT', onEdit: null, openForm: 'BOM_EDIT', openFormTable: 'BOM_EDIT', includeBOMCommitClient_: 'BOM_EDIT', doGet: 'REPORT_VIEW',
  submitBOM: 'BOM_EDIT', resumeBOM: 'BOM_EDIT', runTableParser: 'BOM_EDIT', buildBOMFromText: 'BOM_EDIT',
  createManufacturingFromWeb: null,
  getManufacturingHouseOptions: 'REPORT_VIEW', getManufacturingProductOptions: 'REPORT_VIEW', getManufacturingPlacementOptions: 'REPORT_VIEW',
  generateMaterialConsumptionReportWeb: 'REPORT_GENERATE', getCurrentMaterialReportWeb: 'REPORT_VIEW', saveMaterialConsumptionReportWeb: 'REPORT_SAVE',
  listSavedMaterialReportsWeb: 'REPORT_LIST', renameSavedMaterialReportWeb: 'REPORT_RENAME', deleteSavedMaterialReportWeb: 'REPORT_DELETE',
} satisfies Record<string, Permission | null>);

export class HandlerAuthorization {
  private readonly permissions: PermissionService;
  constructor(private readonly identity: IdentityProvider, users: UserRepository, now: () => number = Date.now) {
    this.permissions = new PermissionService(users, now);
  }
  require(permission: Permission) {
    try { return this.permissions.require(this.identity.current(), permission); }
    catch { throw new Error('ACCESS_DENIED'); }
  }
  wrapper(name: string) {
    if (!Object.prototype.hasOwnProperty.call(wrapperPermissions, name)) throw new Error('ACCESS_DENIED');
    const permission = wrapperPermissions[name as keyof typeof wrapperPermissions];
    if (permission === null) throw new Error('ACCESS_DENIED');
    this.require(permission);
  }
}
// Immutable production composition. No setter, browser-controlled provider or test-user fallback.
const production = new HandlerAuthorization({ current: () => undefined }, { find: () => undefined });
export function requirePermission(permission: Permission): void { production.require(permission); }
export function requireWrapperPermission(name: string): void { production.wrapper(name); }

/** Dependency injection for isolated server composition tests, not a public GAS registration API. */
export function authorizeHandlers(functions: Record<string, Function>, authorization: Pick<HandlerAuthorization, 'wrapper'> = production): Record<string, Function> {
  return Object.fromEntries(Object.entries(functions).map(([name, handler]) => [name, function(this: unknown, ...args: unknown[]) {
    authorization.wrapper(name);
    return handler.apply(this, args);
  }]));
}
