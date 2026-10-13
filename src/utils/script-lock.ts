/**
 * Path: C:/www/26/03/kub3master-ts/src/utils/script-lock.ts
 * Module: Shared concurrency
 * Layer: Infrastructure
 * Responsibility: verify caller-owned lock and release public lock ownership in finally.
 */
export function requireScriptLock(lock: GoogleAppsScript.Lock.Lock): void {
  if (!lock.hasLock()) throw new Error('Caller-owned ScriptLock required');
}
export function withScriptLock<T>(action: (lock: GoogleAppsScript.Lock.Lock) => T): T {
  const lock = LockService.getScriptLock();
  if (lock.hasLock()) throw new Error('Public API must not be called under an already held ScriptLock');
  if (!lock.tryLock(30000)) throw new Error('Cannot acquire ScriptLock');
  try { return action(lock); } finally { lock.releaseLock(); }
}
