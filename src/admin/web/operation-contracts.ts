import { CHANNEL, type ChannelExpectation, type OperationBinding, type OperationKind, type BodyDigestPort } from './channel-contracts/contracts';
import { object, expectation, time, hex } from './channel-contracts/channel-policy';
import { frame, utf8, invalid } from './channel-contracts/encoding';

export const OPERATION_PROFILE = 'KUB_ADMIN_CHANNEL_COMMAND_V1' as const;
export interface SemanticMetadata extends ChannelExpectation {
  readonly protocolVersion: 1;
  readonly operationKind: OperationKind;
  readonly operationId: string;
  readonly commandCreatedAt: number;
}
export type BusinessBody = { readonly expectedRevision: number; readonly assertion: string } |
  { readonly expectedRevision: number; readonly grantId: string; readonly credentialDigest: string; readonly expectedAuthorizationVersion: number };
export interface OperationDescriptor extends SemanticMetadata {
  /** Ephemeral exact JWS-containing text. NEVER persist in receipts or recovery descriptors. */
  readonly body: string;
  readonly originalBodyDigest: string;
  readonly commandDigest: string;
}
export interface RecoveryDescriptor extends OperationBinding {
  readonly protocolVersion: 1;
  readonly backendOrigin: string;
  readonly originalBodyDigest: string;
  readonly expectedRevision: number;
  readonly expectedObjectId: string;
}
export function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) return invalid(); return value as number;
}
export function semanticMetadata(value: unknown): Readonly<SemanticMetadata> {
  const v = object(value, ['protocolVersion', 'backendOrigin', 'environment', 'applicationAudience', 'expectedScriptId',
    'operationKind', 'operationId', 'commandCreatedAt']);
  const target = expectation({ backendOrigin: v.backendOrigin, environment: v.environment,
    applicationAudience: v.applicationAudience, expectedScriptId: v.expectedScriptId });
  if (v.protocolVersion !== 1 || (v.operationKind !== 'ACCEPT_ASSERTION' && v.operationKind !== 'ISSUE_SESSION')) return invalid();
  return Object.freeze({ ...target, protocolVersion: 1, operationKind: v.operationKind,
    operationId: hex(v.operationId), commandCreatedAt: time(v.commandCreatedAt) });
}
/** Byte-for-byte existing COMMAND_V1 format. No transport header or synthetic request fields. */
export function canonicalSemanticBytes(metadata: SemanticMetadata, originalBodyDigest: string): readonly number[] {
  const m = semanticMetadata(metadata);
  return frame(OPERATION_PROFILE, [m.protocolVersion, m.backendOrigin, m.environment, m.applicationAudience, m.expectedScriptId,
    m.operationKind, m.operationId, m.commandCreatedAt, hex(originalBodyDigest)]);
}
export function encodeBusinessBody(kind: OperationKind, value: unknown): string {
  let result: string;
  if (kind === 'ACCEPT_ASSERTION') {
    const v = object(value, ['expectedRevision', 'assertion']);
    if (typeof v.assertion !== 'string' || v.assertion.length > 8192 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v.assertion)) return invalid();
    result = JSON.stringify({ expectedRevision: revision(v.expectedRevision), assertion: v.assertion });
  } else if (kind === 'ISSUE_SESSION') {
    const v = object(value, ['expectedRevision', 'grantId', 'credentialDigest', 'expectedAuthorizationVersion']);
    result = JSON.stringify({ expectedRevision: revision(v.expectedRevision), grantId: hex(v.grantId),
      credentialDigest: hex(v.credentialDigest), expectedAuthorizationVersion: revision(v.expectedAuthorizationVersion) });
  } else return invalid();
  if (utf8(result).length > CHANNEL.maxBodyBytes) return invalid(); return result;
}
export function operationDescriptor(metadata: SemanticMetadata, body: unknown, digest: BodyDigestPort): Readonly<OperationDescriptor> {
  const m = semanticMetadata(metadata), text = encodeBusinessBody(m.operationKind, body), originalBodyDigest = hex(digest.digest(utf8(text)));
  return Object.freeze({ ...m, body: text, originalBodyDigest, commandDigest: hex(digest.digest(canonicalSemanticBytes(m, originalBodyDigest))) });
}
export function recoveryDescriptor(operation: OperationDescriptor, expectedRevision: number, expectedObjectId: string): Readonly<RecoveryDescriptor> {
  const v = object(operation, ['protocolVersion', 'backendOrigin', 'environment', 'applicationAudience', 'expectedScriptId',
    'operationKind', 'operationId', 'commandCreatedAt', 'body', 'originalBodyDigest', 'commandDigest']);
  const metadata = semanticMetadata({ protocolVersion: v.protocolVersion, backendOrigin: v.backendOrigin, environment: v.environment,
    applicationAudience: v.applicationAudience, expectedScriptId: v.expectedScriptId, operationKind: v.operationKind,
    operationId: v.operationId, commandCreatedAt: v.commandCreatedAt });
  return Object.freeze({ ...metadata, originalBodyDigest: hex(v.originalBodyDigest), commandDigest: hex(v.commandDigest),
    expectedRevision: revision(expectedRevision), expectedObjectId: hex(expectedObjectId) });
}
/** Structural descriptor only. Persisted coordination is a trusted-port assumption. */
export function inspectRecoveryDescriptor(value: unknown, target: ChannelExpectation, digest: BodyDigestPort): Readonly<RecoveryDescriptor> {
  const v = object(value, ['protocolVersion', 'backendOrigin', 'environment', 'applicationAudience', 'expectedScriptId', 'operationKind',
    'operationId', 'commandCreatedAt', 'originalBodyDigest', 'commandDigest', 'expectedRevision', 'expectedObjectId']);
  const m = semanticMetadata({ protocolVersion: v.protocolVersion, backendOrigin: v.backendOrigin, environment: v.environment,
    applicationAudience: v.applicationAudience, expectedScriptId: v.expectedScriptId, operationKind: v.operationKind,
    operationId: v.operationId, commandCreatedAt: v.commandCreatedAt }), expected = expectation(target);
  if (m.environment !== expected.environment || m.applicationAudience !== expected.applicationAudience ||
    m.expectedScriptId !== expected.expectedScriptId || m.backendOrigin !== expected.backendOrigin ||
    hex(digest.digest(canonicalSemanticBytes(m, hex(v.originalBodyDigest)))) !== hex(v.commandDigest)) return invalid();
  return Object.freeze({ ...m, originalBodyDigest: hex(v.originalBodyDigest), commandDigest: hex(v.commandDigest),
    expectedRevision: revision(v.expectedRevision), expectedObjectId: hex(v.expectedObjectId) });
}
/** Interface only. Immutable create-if-absent in the full context/origin + operationId namespace;
 * repeat save must match ALL original fields, otherwise fail. Retain through recovery window.
 * Save metadata before dispatch; failed/unknown save forbids dispatch. No bearer/body storage.
 * Load is server-owned and read-only. No runtime coordinator implementation is supplied. */
export interface RecoveryCoordinatorPort {
  save(descriptor: Readonly<RecoveryDescriptor>): Promise<void>;
  load(query: Readonly<ChannelExpectation> & { readonly operationId: string; readonly commandDigest: string }): Promise<Readonly<RecoveryDescriptor> | undefined>;
}

/** DATA ONLY. These pairs describe proposed semantics, never an approved runtime policy.
 * No approval verifier/factory, admission evidence, clock or activation path is supplied. */
export type TemporalAdmissionPolicy =
  Readonly<{ operation: 'ACCEPT_ASSERTION'; mode: 'STRICT_COMMIT_TIME' }> |
  Readonly<{ operation: 'ISSUE_SESSION'; mode: 'STRICT_COMMIT_TIME' }> |
  Readonly<{ operation: 'ISSUE_SESSION'; mode: 'STRICT_BACKEND_ADMISSION' }>;
export const TEMPORAL_METADATA_PROFILE = 'KUB_ADMIN_TEMPORAL_METADATA_V1' as const;
export interface TemporalPolicyBinding {
  readonly profile: typeof TEMPORAL_METADATA_PROFILE;
  /** Temporal metadata schema version, NOT Wire v1 or evidence of policy approval. */
  readonly version: 1;
  readonly policy: TemporalAdmissionPolicy;
  /** Claimed immutable reference only; parsing does not verify approval existence/validity. */
  readonly approvalId: string;
  readonly approvalRevision: number;
}
/** Detached sidecar DATA, not an OperationDescriptor/Wire body or a trusted capability.
 * Durable ownership, save-before-dispatch and restoration remain unimplemented obligations. */
export interface TemporalMetadataDescriptor {
  readonly recovery: Readonly<RecoveryDescriptor>;
  readonly binding: Readonly<TemporalPolicyBinding>;
}
export type TemporalContractValidation<T> =
  Readonly<{ status: 'VALID_DATA'; value: Readonly<T> }> |
  Readonly<{ status: 'INVALID_DATA'; reason: 'INVALID_INPUT' | 'BINDING_MISMATCH' }>;

function temporalPolicyData(value: unknown): TemporalAdmissionPolicy {
  const v = object(value, ['operation', 'mode']);
  if (v.operation === 'ACCEPT_ASSERTION' && v.mode === 'STRICT_COMMIT_TIME')
    return Object.freeze({ operation: 'ACCEPT_ASSERTION', mode: 'STRICT_COMMIT_TIME' });
  if (v.operation === 'ISSUE_SESSION' && v.mode === 'STRICT_COMMIT_TIME')
    return Object.freeze({ operation: 'ISSUE_SESSION', mode: 'STRICT_COMMIT_TIME' });
  if (v.operation === 'ISSUE_SESSION' && v.mode === 'STRICT_BACKEND_ADMISSION')
    return Object.freeze({ operation: 'ISSUE_SESSION', mode: 'STRICT_BACKEND_ADMISSION' });
  return invalid();
}
function temporalBindingData(value: unknown): Readonly<TemporalPolicyBinding> {
  const v = object(value, ['profile', 'version', 'policy', 'approvalId', 'approvalRevision']);
  if (v.profile !== TEMPORAL_METADATA_PROFILE || v.version !== 1) return invalid();
  return Object.freeze({ profile: TEMPORAL_METADATA_PROFILE, version: 1, policy: temporalPolicyData(v.policy),
    approvalId: hex(v.approvalId), approvalRevision: revision(v.approvalRevision) });
}
const invalidTemporalData = (reason: 'INVALID_INPUT' | 'BINDING_MISMATCH' = 'INVALID_INPUT') =>
  Object.freeze({ status: 'INVALID_DATA' as const, reason });
/** Exact structural validation only. Browser JSON can be valid data, never approval evidence. */
export function validateTemporalAdmissionPolicy(value: unknown): TemporalContractValidation<TemporalAdmissionPolicy> {
  try { return Object.freeze({ status: 'VALID_DATA', value: temporalPolicyData(value) }); }
  catch { return invalidTemporalData(); }
}
export function validateTemporalPolicyBinding(value: unknown): TemporalContractValidation<TemporalPolicyBinding> {
  try { return Object.freeze({ status: 'VALID_DATA', value: temporalBindingData(value) }); }
  catch { return invalidTemporalData(); }
}
const temporalRecoveryKeys = Object.freeze(['protocolVersion', 'backendOrigin', 'environment', 'applicationAudience',
  'expectedScriptId', 'operationKind', 'operationId', 'commandDigest', 'commandCreatedAt', 'originalBodyDigest',
  'expectedRevision', 'expectedObjectId'] as const);
function temporalDataSnapshot(value: unknown) {
  const v = object(value, ['recovery', 'binding']);
  return Object.freeze({ recovery: Object.freeze({ ...object(v.recovery, temporalRecoveryKeys) }),
    binding: temporalBindingData(v.binding) });
}
/** Compare with independent server-owned original metadata and pinned target, never candidate-echo
 * browser expectations. Even VALID_DATA authenticates neither that owner nor its claimed approval.
 * Recovery requires the original binding: missing/changed policy never gets a current default.
 * All inputs are detached before the digest port runs. No state, I/O or Wire v1 mutation occurs. */
export function validateTemporalMetadataDescriptor(value: unknown, expectedValue: unknown,
  targetValue: ChannelExpectation, digest: BodyDigestPort): TemporalContractValidation<TemporalMetadataDescriptor> {
  try {
    const candidate = temporalDataSnapshot(value), expected = temporalDataSnapshot(expectedValue), target = expectation(targetValue);
    const recovery = inspectRecoveryDescriptor(candidate.recovery, target, digest);
    const original = inspectRecoveryDescriptor(expected.recovery, target, digest);
    const binding = candidate.binding, pinned = expected.binding;
    if (temporalRecoveryKeys.some(field => recovery[field] !== original[field]) ||
      binding.policy.operation !== recovery.operationKind || pinned.policy.operation !== original.operationKind ||
      binding.profile !== pinned.profile || binding.version !== pinned.version ||
      binding.policy.operation !== pinned.policy.operation || binding.policy.mode !== pinned.policy.mode ||
      binding.approvalId !== pinned.approvalId || binding.approvalRevision !== pinned.approvalRevision)
      return invalidTemporalData('BINDING_MISMATCH');
    return Object.freeze({ status: 'VALID_DATA', value: Object.freeze({ recovery, binding }) });
  } catch { return invalidTemporalData(); }
}
