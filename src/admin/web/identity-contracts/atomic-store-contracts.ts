import type { IdentityApplicationContext, LoginTransaction } from './contracts';
import { readSignedAssertion, type VerifiedSignedAssertion } from './signed-assertion-profile';
import type { SigningKeyProvenance } from './session-store-contracts';
import type { BodyDigestPort, OperationReceipt as WireReceipt } from '../channel-contracts/contracts';
import { operationDescriptor, type OperationDescriptor, type RecoveryDescriptor } from '../operation-contracts';

/** Server-only command, not a browser DTO. Profile has no legacy digest fallback. */
export interface AtomicCommand {
  readonly context: IdentityApplicationContext;
  readonly protocolVersion: 1;
  readonly backendOrigin: string;
  readonly operationId: string;
  readonly commandDigest: string;
  readonly expectedRevision: number;
  readonly commandCreatedAt: number;
}
export interface AcceptAssertionCommand extends AtomicCommand { readonly assertion: VerifiedSignedAssertion }
export interface ConsumeGrantCommand extends AtomicCommand {
  readonly grantId: string;
  readonly credentialDigest: string;
  readonly expectedAuthorizationVersion: number;
}
export type OperationLookup = RecoveryDescriptor;
export type OperationReceipt = WireReceipt;
declare const receiptProof: unique symbol;
/** A type cannot establish runtime provenance. Only a paired authoritative reader can inspect it. */
export interface VerifiedOperationReceipt { readonly record: Readonly<OperationReceipt>; readonly [receiptProof]: true }
export interface OperationReceiptReaderPort {
  read(evidence: unknown, expected: Readonly<RecoveryDescriptor>): Promise<Readonly<OperationReceipt>>;
}
export type AtomicStatus = 'COMMITTED' | 'REJECTED' | 'REPLAY' | 'EXPIRED' | 'CONFLICT' | 'CONTEXT_MISMATCH' |
  'UNAVAILABLE' | 'OUTCOME_UNKNOWN' | 'INVALID' | 'CAPACITY_EXCEEDED';
export type AtomicOutcome = { readonly status: 'COMMITTED' | 'REJECTED'; readonly receipt: VerifiedOperationReceipt; readonly recovered: boolean } |
  { readonly status: Exclude<AtomicStatus, 'COMMITTED' | 'REJECTED'> };
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
  /** Consume tx + unique assertion marker + grant + receipt, all or none. */
  acceptAssertionAndCreateGrant(command: AcceptAssertionCommand): Promise<AtomicOutcome>;
  /** Consume grant + digest-only session + receipt, all or none. */
  consumeGrantAndCreateSession(command: ConsumeGrantCommand): Promise<AtomicOutcome>;
  /** Read-only. Missing receipt is UNKNOWN, never proof of rollback. */
  getOperationOutcome(command: OperationLookup): Promise<AtomicOutcome>;
}
/** Unchanged UTF-8 text hashing for session credentials/browser proofs. Not a command-byte port. */
export interface TextDigestPort { digest(text: string): string }
export function atomicOperationDescriptor(command: AcceptAssertionCommand | ConsumeGrantCommand, digest: BodyDigestPort): Readonly<OperationDescriptor> {
  const accepting = 'assertion' in command;
  return operationDescriptor({ ...command.context, protocolVersion: command.protocolVersion, backendOrigin: command.backendOrigin,
    operationKind: accepting ? 'ACCEPT_ASSERTION' : 'ISSUE_SESSION', operationId: command.operationId, commandCreatedAt: command.commandCreatedAt },
  accepting ? { expectedRevision: command.expectedRevision, assertion: readSignedAssertion(command.assertion, command.context).assertion } :
    { expectedRevision: command.expectedRevision, grantId: command.grantId, credentialDigest: command.credentialDigest,
      expectedAuthorizationVersion: command.expectedAuthorizationVersion }, digest);
}
