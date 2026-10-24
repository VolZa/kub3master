import { PermissionService } from '../../security/permission-service';
import { PropertyUserRepository } from '../../security/property-user-repository';
import { GoogleAdminIdentityProvider, type UserInfoRuntime } from './admin-identity';
import { SpreadsheetInspectionError, INSPECTION_DETAILS, type InspectionAccessFailure, type InspectionApiReason, type InspectionHeaderFlags, type InspectionDetail } from './spreadsheet-risk-inspector';
import { TEST_CONFIG_KEY, TEST_INSTALLATION_KEY, ROLES, readTestConfiguration, validId, validSheetNames, type FileRole, type Sources } from './test-configuration';
import { PRODUCTION_SCRIPT_ID } from './test-sources';
import type { PropertiesPort, SafetyEvidence, SpreadsheetPort } from './test-reset';

export const TEST_USERS_KEY = 'KUB_TEST_USERS_V1';
export interface AdminPreflightPorts {
  properties: Pick<PropertiesPort, 'getProperty'>;
  scriptId(): string;
  /** Must be null for this editor-only build. This guard is not a general deployment inventory. */
  webAppUrl(): string | null;
  identity: UserInfoRuntime;
  sources: Sources;
  spreadsheets: SpreadsheetPort;
  sourceFile(id: string): { id: string; mimeType: string; trashed: boolean };
  dependencies: { inspect(id: string): SafetyEvidence };
  now(): number;
}
export interface SourcePreflight extends Partial<InspectionHeaderFlags> {
  role: FileRole; status: 'PASS' | 'BLOCKED'; blockers: string[]; sheetNames: string[]; hazardLocations: string[];
  fingerprint?: string;
  inspectionFailure?: 'DRIVE_ACCESS_FAILED' | 'SOURCE_FILE_INVALID' | 'SPREADSHEET_INSPECTION_FAILED' |
    'SPREADSHEET_ACCESS_FAILED' | 'SHEET_READ_FAILED' | 'RISK_SCAN_LIMIT' | 'SNAPSHOT_INVALID';
  inspectionAccessFailure?: InspectionAccessFailure;
  inspectionApiReason?: InspectionApiReason;
  inspectionDetail?: InspectionDetail;
  dependencies: Pick<SafetyEvidence, 'externalConnections' | 'boundScripts' | 'triggers'>;
}
export interface PreflightResult {
  status: 'PASS' | 'BLOCKED'; operation: 'READ_ONLY_PREFLIGHT'; resetAllowed: false; configKey: typeof TEST_CONFIG_KEY;
  configState: 'UNINITIALIZED' | 'ACTIVE'; activeGenerationId: string | null; sources: SourcePreflight[];
  remainingResetBlockers: string[];
}
export function requireTestInstallation(properties: Pick<PropertiesPort, 'getProperty'>, script: string, webAppUrl: string | null,
  expectedScriptId?: string): string {
  if (!validId(script) || script === PRODUCTION_SCRIPT_ID || webAppUrl !== null ||
    expectedScriptId !== undefined && script !== expectedScriptId) throw Error('TEST_CONTEXT_REQUIRED');
  let marker; try { const raw = properties.getProperty(TEST_INSTALLATION_KEY); marker = raw ? JSON.parse(raw) : undefined; }
  catch { throw Error('TEST_CONTEXT_REQUIRED'); }
  if (marker?.version !== 1 || marker.environment !== 'TEST' || marker.scriptId !== script) throw Error('TEST_CONTEXT_REQUIRED');
  return script;
}
export class TestAdminDiagnostics {
  private readonly permissions: PermissionService;
  private readonly identityProvider: GoogleAdminIdentityProvider;
  constructor(private readonly p: AdminPreflightPorts) {
    // Reuse existing strict UserRepository parser, mapping ONLY the isolated TEST directory key.
    const users = new PropertyUserRepository({ getProperty: key => key === 'KUB_SECURITY_USERS_V1' ? p.properties.getProperty(TEST_USERS_KEY) : null });
    this.permissions = new PermissionService(users, p.now, 'TEST');
    this.identityProvider = new GoogleAdminIdentityProvider(p.identity, p.now);
  }
  private requireAdmin() { return this.permissions.require(this.identityProvider.current(), 'USER_MANAGE'); }
  private installation(): string {
    return requireTestInstallation(this.p.properties, this.p.scriptId(), this.p.webAppUrl());
  }
  identity() {
    const scriptId = this.installation();
    const user = this.requireAdmin();
    return { status: 'PASS' as const, operation: 'ADMIN_IDENTITY' as const, scriptId,
      issuer: user.issuer, subject: user.subject, permission: 'USER_MANAGE' as const, resetAllowed: false as const };
  }
  preflight(): PreflightResult {
    return this.inspectSources(false);
  }
  /** Only the guarded manual readiness entrypoint opts into source failure detail. */
  preflightForReadiness(): PreflightResult {
    return this.inspectSources(true);
  }
  private inspectSources(readinessDiagnostics: boolean): PreflightResult {
    const scriptId = this.installation(); this.requireAdmin();
    const ids = ROLES.map(r => this.p.sources[r].id);
    if (ids.some(v => !validId(v)) || new Set(ids).size !== 3 || ROLES.some(r => !validSheetNames([...this.p.sources[r].requiredSheets]))) throw Error('SOURCE_CONFIGURATION_INVALID');
    const config = readTestConfiguration(this.p.properties.getProperty(TEST_CONFIG_KEY), scriptId, this.p.sources);
    const sources = ROLES.map((role): SourcePreflight => {
      const source = this.p.sources[role];
      const result: SourcePreflight = { role, status: 'BLOCKED', blockers: [], sheetNames: [], hazardLocations: [],
        dependencies: { externalConnections: 'UNKNOWN', boundScripts: 'UNKNOWN', triggers: 'UNKNOWN' } };
      let failure: SourcePreflight['inspectionFailure'] = 'DRIVE_ACCESS_FAILED';
      try {
        const file = this.p.sourceFile(source.id);
        failure = 'SOURCE_FILE_INVALID';
        if (file.id !== source.id || file.trashed || file.mimeType !== 'application/vnd.google-apps.spreadsheet') throw Error();
        failure = 'SPREADSHEET_INSPECTION_FAILED';
        const snapshot = this.p.spreadsheets.inspect(source.id, ids);
        failure = 'SNAPSHOT_INVALID';
        if (snapshot.id !== source.id || !validSheetNames(snapshot.sheets)) throw Error();
        result.sheetNames = snapshot.sheets;
        if (snapshot.fingerprint) result.fingerprint = snapshot.fingerprint;
        if (source.requiredSheets.some(s => !snapshot.sheets.includes(s))) result.blockers.push('SOURCE_SHEETS_MISSING');
        if (!Array.isArray(snapshot.hazards)) throw Error();
        result.hazardLocations = snapshot.hazards.slice(0, 20);
        if (snapshot.hazards.length) result.blockers.push('EXTERNAL_REFERENCE_RISK');
      } catch (error) {
        result.blockers.push('SOURCE_INSPECTION_FAILED');
        if (readinessDiagnostics) result.inspectionFailure = failure === 'SPREADSHEET_INSPECTION_FAILED' && error instanceof SpreadsheetInspectionError
          ? error.reason : failure;
        if (readinessDiagnostics) result.inspectionDetail = failure === 'SPREADSHEET_INSPECTION_FAILED' && error instanceof SpreadsheetInspectionError &&
          error.detail !== undefined && INSPECTION_DETAILS.includes(error.detail) ? error.detail : 'UNKNOWN';
        if (readinessDiagnostics && failure === 'SPREADSHEET_INSPECTION_FAILED' && error instanceof SpreadsheetInspectionError &&
          error.reason === 'SPREADSHEET_ACCESS_FAILED' && error.accessFailure !== undefined) result.inspectionAccessFailure = error.accessFailure;
        if (readinessDiagnostics && failure === 'SPREADSHEET_INSPECTION_FAILED' && error instanceof SpreadsheetInspectionError &&
          error.reason === 'SPREADSHEET_ACCESS_FAILED' && error.accessFailure === 'HTTP_403') {
          if (error.apiReason !== undefined) result.inspectionApiReason = error.apiReason;
          if (error.headerFlags !== undefined) {
            result.hasContentLength = error.headerFlags.hasContentLength;
            result.isJsonContentType = error.headerFlags.isJsonContentType;
            result.hasContentEncoding = error.headerFlags.hasContentEncoding;
          }
        }
      }
      try {
        const review = this.p.dependencies.inspect(source.id);
        if (!review || review.fileId !== source.id) throw Error();
        for (const k of ['externalConnections', 'boundScripts', 'triggers'] as const) {
          if (!['SAFE', 'UNSAFE', 'UNKNOWN'].includes(review[k])) throw Error();
          result.dependencies[k] = review[k];
          if (review[k] !== 'SAFE') result.blockers.push(`${k === 'boundScripts' ? 'BOUND_SCRIPTS' : k === 'triggers' ? 'TRIGGERS' : 'EXTERNAL_CONNECTIONS'}_${review[k]}`);
        }
        if (Object.values(result.dependencies).includes('SAFE') && !review.evidenceId?.trim()) result.blockers.push('DEPENDENCY_EVIDENCE_MISSING');
      } catch {
        result.dependencies = { externalConnections: 'UNKNOWN', boundScripts: 'UNKNOWN', triggers: 'UNKNOWN' };
        result.blockers.push('DEPENDENCY_INSPECTION_UNAVAILABLE');
      }
      result.status = result.blockers.length ? 'BLOCKED' : 'PASS';
      return result;
    });
    this.requireAdmin(); // Recheck enrollment/revocation before returning diagnostics.
    return { status: sources.every(s => s.status === 'PASS') ? 'PASS' : 'BLOCKED', operation: 'READ_ONLY_PREFLIGHT', resetAllowed: false,
      configKey: TEST_CONFIG_KEY, configState: config.active ? 'ACTIVE' : 'UNINITIALIZED', activeGenerationId: config.active?.id ?? null, sources,
      remainingResetBlockers: ['SOURCE_DEPENDENCY_EVIDENCE_REQUIRED', 'LIVE_TEST_ADMIN_NOT_VERIFIED',
        'TEST_BUSINESS_WRITE_PATHS_BLOCKED', 'REAL_RESET_NOT_AUTHORIZED'] };
  }
}
