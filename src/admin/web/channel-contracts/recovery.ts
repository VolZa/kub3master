import { CHANNEL, type OperationBinding, type OperationReceipt, type RemoteOperationTimes, type RejectionCode } from './contracts';
import { object, hex, time, matchesContext } from './channel-policy';
import { invalid } from './encoding';

export const REJECTIONS: readonly RejectionCode[] = Object.freeze(['ACCESS_DENIED', 'INVALID', 'REPLAY', 'EXPIRED', 'CONFLICT',
  'UNAVAILABLE', 'CAPACITY_EXCEEDED', 'CONTEXT_MISMATCH']);
/** GAS command time may differ from backend/DB clocks by <=5s. Historical recovery is not freshness.
 * COMMITTED with unavailable exact DB time remains committed; never invent a commit timestamp. */
export function remoteTimes(value: unknown, commandCreatedAt: number, trustedNow: number): Readonly<RemoteOperationTimes> {
  const v = object(value, ['commandCreatedAt', 'backendDecisionAt', 'databaseCommittedAt']);
  const created = time(v.commandCreatedAt), decision = time(v.backendDecisionAt), now = time(trustedNow);
  if (created !== time(commandCreatedAt) || created - decision > CHANNEL.futureSkewMs ||
    decision - created > CHANNEL.commandAgeMs + CHANNEL.futureSkewMs || decision - now > CHANNEL.futureSkewMs) return invalid();
  const commit = object(v.databaseCommittedAt, ['status', 'value']);
  if (commit.status === 'UNAVAILABLE') {
    if (commit.value !== null) return invalid();
    return Object.freeze({ commandCreatedAt: created, backendDecisionAt: decision,
      databaseCommittedAt: Object.freeze({ status: 'UNAVAILABLE', value: null }) });
  }
  if (commit.status !== 'KNOWN') return invalid(); const at = time(commit.value);
  if (decision - at > CHANNEL.futureSkewMs || at - now > CHANNEL.futureSkewMs) return invalid();
  return Object.freeze({ commandCreatedAt: created, backendDecisionAt: decision,
    databaseCommittedAt: Object.freeze({ status: 'KNOWN', value: at }) });
}
/** Untrusted receipt shape/binding only. Not authenticated evidence or authorization. */
export function inspectReceipt(value: unknown, expected: OperationBinding, trustedNow: number): Readonly<OperationReceipt> {
  const v = object(value, ['environment', 'applicationAudience', 'expectedScriptId', 'operationId', 'operationKind', 'commandDigest',
    'commandCreatedAt', 'backendDecisionAt', 'databaseCommittedAt', 'outcome', 'receiptId', 'objectId', 'revision', 'code', 'retainUntil']);
  matchesContext(v as unknown as OperationBinding, expected);
  if (!['ACCEPT_ASSERTION', 'ISSUE_SESSION'].includes(expected.operationKind) || v.operationKind !== expected.operationKind ||
    hex(v.operationId) !== hex(expected.operationId) || hex(v.commandDigest) !== hex(expected.commandDigest)) return invalid();
  const times = remoteTimes({ commandCreatedAt: v.commandCreatedAt, backendDecisionAt: v.backendDecisionAt,
    databaseCommittedAt: v.databaseCommittedAt }, expected.commandCreatedAt, trustedNow);
  const until = time(v.retainUntil);
  if (until <= trustedNow || until <= times.backendDecisionAt ||
    times.databaseCommittedAt.status === 'KNOWN' && until <= times.databaseCommittedAt.value) return invalid();
  if (v.outcome === 'COMMITTED') {
    hex(v.objectId); if (!Number.isSafeInteger(v.revision) || (v.revision as number) < 1 || v.code !== null) return invalid();
  } else if (v.outcome === 'REJECTED') {
    if (v.objectId !== null || v.revision !== null || !REJECTIONS.includes(v.code as RejectionCode)) return invalid();
  } else return invalid();
  return Object.freeze({ environment: expected.environment, applicationAudience: expected.applicationAudience,
    expectedScriptId: expected.expectedScriptId, operationId: expected.operationId, operationKind: expected.operationKind,
    commandDigest: expected.commandDigest, ...times, outcome: v.outcome, receiptId: hex(v.receiptId),
    objectId: v.objectId as string | null, revision: v.revision as number | null, code: v.code as RejectionCode | null, retainUntil: until });
}
/** Pure recovery instruction only. A receipt never releases a bearer or authorizes business RPCs. */
export function recoveryAction(outcome: unknown): 'LOOKUP_ONLY' | 'RESOLVE_AUTHORITATIVE_STATE' | 'STOP_REJECTED' {
  if (outcome === 'OUTCOME_UNKNOWN') return 'LOOKUP_ONLY';
  if (outcome === 'COMMITTED') return 'RESOLVE_AUTHORITATIVE_STATE';
  if (outcome === 'REJECTED') return 'STOP_REJECTED'; return invalid();
}
