/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/legacy-save-quarantine.ts
 * Module: BOM
 * Layer: Infrastructure guard
 * Responsibility: deny destructive legacy saves in GAS while retaining explicit mock-only compatibility tests.
 */
let compatibilityDepth = 0;
export function assertLegacyBOMCompatibility(): void {
  if (!compatibilityDepth) throw new Error('LEGACY_BOM_SAVE_DISABLED: використовуйте Safe Commit');
}
export function withLegacyBOMCompatibilityForTests<T>(action: () => T): T {
  if (typeof process === 'undefined' || process.env.VITEST !== 'true') throw new Error('Legacy compatibility is restricted to local Vitest mocks');
  compatibilityDepth++;
  try { return action(); } finally { compatibilityDepth--; }
}
