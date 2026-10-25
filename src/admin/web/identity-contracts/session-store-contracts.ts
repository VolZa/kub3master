import type { AdminSessionRecord, BrowserSessionCredential, IdentityApplicationContext } from './contracts';

/** Browser bearer is opaque, memory/RPC-body only. Stores receive ONLY its digest.
 * Real CSPRNG and digest adapters are intentionally absent. */
export type OpaqueSessionCredential = BrowserSessionCredential;
export interface SigningKeyProvenance {
  readonly protocolVersion: 1;
  readonly brokerIssuer: string;
  readonly keyId: string;
  readonly algorithm: 'RS256';
  readonly assertionId: string;
  readonly assertionIssuedAt: number;
}
export interface StoredSession extends AdminSessionRecord {
  readonly revision: number;
  readonly grantId: string;
  readonly signingKey: Readonly<SigningKeyProvenance>;
}
declare const storedProof: unique symbol;
/** Only an authoritative store adapter may return this capability; JSON shape is insufficient. */
export interface TrustedStoredSession { readonly record: Readonly<StoredSession>; readonly [storedProof]: true }
export interface SessionCapacityPolicy {
  readonly maxTransactions: number;
  readonly maxGrants: number;
  readonly maxSessions: number;
  readonly maxReceipts: number;
  readonly maxSessionsPerSubject: number;
  readonly receiptRetentionMs: number;
  readonly cleanupBatchSize: number;
}
export interface CurrentDirectoryUser {
  readonly issuer: string;
  readonly subject: string;
  readonly active: boolean;
  readonly authorizationVersion: number;
}
export interface SessionLookup {
  readonly context: IdentityApplicationContext;
  readonly credentialDigest: string;
  readonly decisionTime: number;
}
export type SessionLookupOutcome = { readonly status: 'FOUND'; readonly session: TrustedStoredSession } |
  { readonly status: 'BLOCKED' | 'UNAVAILABLE' };
export interface RevokeSessionCommand extends SessionLookup { readonly expectedRevision: number }
export interface SessionStorePort {
  readSession(command: SessionLookup): SessionLookupOutcome;
  revokeSession(command: RevokeSessionCommand): 'REVOKED' | 'CONFLICT' | 'BLOCKED' | 'UNAVAILABLE';
  /** Never return expired state as valid while waiting for cleanup. Never delete live receipts.
   * Real implementations need durable revocation/provenance indexes, not an authoritative cache. */
  cleanup(decisionTime: number): number;
}
