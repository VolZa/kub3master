export type AdminEnvironment = 'PRODUCTION' | 'TEST';
export type AdminConfigurationStatus = 'NOT_CONFIGURED' | 'INVALID' | 'SCRIPT_ID_MISMATCH' | 'CONFIGURED';
export interface AdminTargetConfiguration {
  version: 1;
  environment: AdminEnvironment;
  scriptIds: Record<AdminEnvironment, string | null>;
  environmentUrls: Record<AdminEnvironment, string | null>;
}
export interface AdminSection {
  readonly id: 'MASTER' | 'MANUFACTURING' | 'ADMINISTRATION';
  readonly title: string;
  readonly enabled: false;
}
/** Public shell metadata only. No identity, installation properties or resource state. */
export interface AdminBootstrap {
  readonly environment: AdminEnvironment;
  readonly applicationStatus: 'BLOCKED';
  readonly configurationStatus: AdminConfigurationStatus;
  readonly sections: readonly AdminSection[];
  readonly generationStatus: 'NOT_CONNECTED';
  readonly resetAllowed: false;
}
