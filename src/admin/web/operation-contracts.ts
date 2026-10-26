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
