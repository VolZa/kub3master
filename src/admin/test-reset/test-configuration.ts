/** Shared read-only schema. This module has no Google service access or mutation capabilities. */
export const TEST_CONFIG_KEY = 'KUB_TEST_ENV_V1';
export const TEST_INSTALLATION_KEY = 'KUB_TEST_INSTALLATION_V1';
export const ROLES = ['MASTER', 'OPERATIONAL', 'REPORTING'] as const;
export type FileRole = typeof ROLES[number];
export interface TestFile { id: string; sourceId: string; sheets: string[] }
export interface Generation { id: string; createdAt: string; files: Record<FileRole, TestFile>; evidence: Record<FileRole, string> }
export type PreparationState = 'NOT_PREPARED' | 'PREPARING' | 'PENDING_REVIEW' | 'REVIEW_FAILED' | 'READY_FOR_ACTIVATION';
export interface PendingFile { id: string; name: string }
export interface PendingGeneration {
  id: string; createdAt: string; baseActiveId: string | null;
  state: Exclude<PreparationState, 'NOT_PREPARED'>;
  files: Partial<Record<FileRole, PendingFile>>;
  sheets: Record<FileRole, string[]>; sourceHashes: Record<FileRole, string>;
  inFlight: FileRole | 'FOLDER' | null; failure?: string;
  review?: { at: string; commitment: string; hashes: Record<FileRole, string>; evidenceIds: Record<FileRole, string> };
}
export interface TestConfig { version: 1; environment: 'TEST'; scriptId: string; folderId: string | null; active: Generation | null; previous: Generation | null; pending?: PendingGeneration | null }
export type Sources = Readonly<Record<FileRole, { id: string; requiredSheets: readonly string[] }>>;
export const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{3,200}$/.test(value);
export const validSheetNames = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(n => typeof n === 'string' && n.length > 0) && new Set(v).size === v.length;
const invalid = (): never => { throw Error('TEST_CONFIG_INVALID'); };
export function validateGeneration(value: any, sources: Sources): asserts value is Generation {
  if (!value || !validId(value.id) || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) || !value.files || !value.evidence) invalid();
  const ids: string[] = [];
  for (const role of ROLES) {
    const file = value.files[role];
    if (!file || !validId(file.id) || file.sourceId !== sources[role].id || ROLES.some(r => sources[r].id === file.id) ||
      !validSheetNames(file.sheets) || sources[role].requiredSheets.some(s => !file.sheets.includes(s)) ||
      typeof value.evidence[role] !== 'string' || !value.evidence[role]) invalid();
    ids.push(file.id);
  }
  if (new Set(ids).size !== 3) invalid();
}
export function readTestConfiguration(raw: string | null, scriptId: string, sources: Sources): TestConfig {
  if (raw === null) return { version: 1, environment: 'TEST', scriptId, folderId: null, active: null, previous: null };
  let state: TestConfig; try { state = JSON.parse(raw); } catch { return invalid(); }
  if (!state || state.version !== 1 || state.environment !== 'TEST' || state.scriptId !== scriptId ||
    !(state.folderId === null || validId(state.folderId)) || !(state.active === null || typeof state.active === 'object') ||
    !(state.previous === null || typeof state.previous === 'object')) invalid();
  if (state.active) validateGeneration(state.active, sources);
  if (state.previous) validateGeneration(state.previous, sources);
  if ((state.active || state.previous) && !state.folderId || state.previous && !state.active) invalid();
  if (state.active && state.previous && (state.active.id === state.previous.id ||
    ROLES.some(r => ROLES.some(s => state.active!.files[r].id === state.previous!.files[s].id)))) invalid();
  if (state.pending !== undefined && state.pending !== null) {
    const p = state.pending, used = new Set(ROLES.map(r => sources[r].id));
    for (const g of [state.active, state.previous]) if (g) ROLES.forEach(r => used.add(g.files[r].id));
    if (!validId(p.id) || [state.active?.id, state.previous?.id].includes(p.id) || p.baseActiveId !== (state.active?.id ?? null) ||
      !Number.isFinite(Date.parse(p.createdAt)) || !['PREPARING', 'PENDING_REVIEW', 'REVIEW_FAILED', 'READY_FOR_ACTIVATION'].includes(p.state) ||
      !p.files || Object.keys(p.files).some(k => !ROLES.includes(k as FileRole)) || !p.sheets || !p.sourceHashes ||
      !(p.inFlight === null || p.inFlight === 'FOLDER' || ROLES.includes(p.inFlight)) ||
      (p.state !== 'PREPARING' && (p.inFlight !== null || ROLES.some(r => !p.files[r])))) invalid();
    for (const r of ROLES) {
      if (!validSheetNames(p.sheets[r]) || sources[r].requiredSheets.some(s => !p.sheets[r].includes(s)) || !/^[a-f0-9]{64}$/.test(p.sourceHashes[r])) invalid();
      const f = p.files[r];
      if (f && (!validId(f.id) || used.has(f.id) || f.name !== `ERP_KUB_TEST_${r}_${p.id}`)) invalid();
      if (f) used.add(f.id);
    }
    if (p.inFlight !== 'FOLDER' && p.inFlight !== null && p.files[p.inFlight] || Object.keys(p.files).length && !state.folderId) invalid();
    if (p.review) {
      if (!Number.isFinite(Date.parse(p.review.at)) || !/^[a-f0-9]{64}$/.test(p.review.commitment) || !p.review.hashes || !p.review.evidenceIds ||
        ROLES.some(r => !/^[a-f0-9]{64}$/.test(p.review!.hashes[r]) || typeof p.review!.evidenceIds[r] !== 'string' || p.review!.evidenceIds[r].length > 100)) invalid();
    }
    if (p.state === 'READY_FOR_ACTIVATION' && !p.review) invalid();
    if (p.state === 'READY_FOR_ACTIVATION' && ROLES.some(r => !p.review!.evidenceIds[r].trim() || p.review!.hashes[r] !== p.sourceHashes[r])) invalid();
  }
  return state;
}
