import type { IdentityApplicationContext, LoginTransaction } from './contracts';
import type { VerifiedSignedAssertion } from './signed-assertion-profile';
import type { SigningKeyProvenance } from './session-store-contracts';

/** Server-only commands. These are NOT browser DTOs or GAS RPCs. Context, digest, revision,
 * identity evidence and time must come from trusted orchestration/adapters. */
export interface AtomicCommand {
  readonly context: IdentityApplicationContext;
  readonly operationId: string;
  readonly commandDigest: string;
  readonly expectedRevision: number;
  readonly decisionTime: number;
}
export interface AcceptAssertionCommand extends AtomicCommand { readonly assertion: VerifiedSignedAssertion }
export interface ConsumeGrantCommand extends AtomicCommand {
  readonly grantId: string;
  readonly credentialDigest: string;
  readonly expectedAuthorizationVersion: number;
}
export interface OperationLookup extends Omit<AtomicCommand, 'expectedRevision'> { readonly expectedRevision: null }
export interface OperationReceipt extends IdentityApplicationContext {
  readonly operationId: string;
  readonly commandDigest: string;
  readonly kind: 'ACCEPT_ASSERTION' | 'ISSUE_SESSION';
  readonly objectId: string;
  readonly committedAt: number;
  readonly revision: number;
  readonly retainUntil: number;
}
export type AtomicStatus = 'COMMITTED' | 'REPLAY' | 'EXPIRED' | 'CONFLICT' | 'CONTEXT_MISMATCH' |
  'UNAVAILABLE' | 'OUTCOME_UNKNOWN' | 'INVALID' | 'CAPACITY_EXCEEDED';
export type AtomicOutcome = { readonly status: 'COMMITTED'; readonly receipt: Readonly<OperationReceipt>; readonly recovered: boolean } |
  { readonly status: Exclude<AtomicStatus, 'COMMITTED'> };
export interface GrantRecord extends IdentityApplicationContext {
  readonly grantId: string;
  readonly transactionId: string;
  readonly assertionId: string;
  readonly revision: number;
  readonly status: 'AVAILABLE' | 'CONSUMED';
  readonly consumedAt: number | null;
  readonly issuedAt: number;
  readonly expiresAt: number;
  readonly signingKey: Readonly<SigningKeyProvenance>;
}
export interface VersionedLoginTransaction { readonly record: Readonly<LoginTransaction>; readonly revision: number }
export interface AtomicLoginStorePort {
  /** One transaction: consume tx + unique assertion marker + create grant + receipt, all or none. */
  acceptAssertionAndCreateGrant(command: AcceptAssertionCommand): Promise<AtomicOutcome>;
  /** One transaction: consume grant + unique digest-only session + receipt, all or none. */
  consumeGrantAndCreateSession(command: ConsumeGrantCommand): Promise<AtomicOutcome>;
  /** Missing receipt is OUTCOME_UNKNOWN, never evidence that an in-flight commit rolled back. */
  getOperationOutcome(command: OperationLookup): AtomicOutcome;
}
/** Trusted digest port. Must hash this exact canonical material with SHA-256 in a real adapter.
 * No implementation is included; tests supply a local adapter. No client-selected digest function. */
export interface CommandDigestPort { digest(canonicalMaterial: string): string }
export function atomicCommandMaterial(command: AcceptAssertionCommand | ConsumeGrantCommand): string {
  const c = command.context;
  const fields = [c.environment, c.applicationAudience, c.expectedScriptId, command.operationId, command.expectedRevision, command.decisionTime];
  if ('assertion' in command) {
    const a = command.assertion.data, p = a.claims;
    return JSON.stringify(['ACCEPT_ASSERTION', ...fields, a.keyId, p.protocolVersion, p.purpose, p.issuer, p.assertionId,
      p.transactionId, p.identityIssuer, p.subject, p.nonce, p.browserProofBinding, p.authenticatedAt,
      p.authenticationExpiresAt, p.issuedAt, p.expiresAt]);
  }
  return JSON.stringify(['ISSUE_SESSION', ...fields, command.grantId, command.credentialDigest, command.expectedAuthorizationVersion]);
}
