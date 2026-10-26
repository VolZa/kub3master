import type { IdentityApplicationContext, LoginTransaction, UnverifiedBrokerAssertion } from '../identity-contracts/contracts';
import type { AtomicLoginStorePort, AtomicStatus, TextDigestPort, OperationReceiptReaderPort, VersionedLoginTransaction } from '../identity-contracts/atomic-store-contracts';
import type { BodyDigestPort } from '../channel-contracts/contracts';
import type { RecoveryCoordinatorPort } from '../operation-contracts';
import type { SessionStorePort, StoredSession } from '../identity-contracts/session-store-contracts';
import type { SigningKeyPolicy } from '../identity-contracts/signing-key-policy';
import type { VerifiedSignedAssertion } from '../identity-contracts/signed-assertion-profile';
import type { UserRepository } from '../../../security/permission-service';

/** Server injection only. No browser-defined context, clock, identity, permissions or adapters. */
export interface ApplicationTrustPorts {
  readonly expectedContext: IdentityApplicationContext;
  readonly currentContext: () => unknown;
  readonly clock: () => number;
}
export interface LoginTransactionPort {
  /** Unique create-if-absent. VERIFYING here means waiting for proof + assertion, not authenticated.
   * No browser state transitions. Atomic acceptance remains the sole one-time admission boundary. */
  create(record: Readonly<LoginTransaction>): Promise<VersionedLoginTransaction | undefined>;
  read(transactionId: string, context: IdentityApplicationContext): Promise<VersionedLoginTransaction | undefined>;
}
export interface BrokerAssertionSourcePort {
  receive(transaction: Readonly<LoginTransaction>): Promise<UnverifiedBrokerAssertion | undefined>;
}
export interface TrustedVerificationPort {
  /** Fail closed if the trusted signature adapter is absent; not a live broker health check. */
  assertConfigured(): void;
  verify(message: unknown, transaction: Readonly<LoginTransaction>): VerifiedSignedAssertion;
}
/** Must authenticate store ownership/provenance and recheck its current authoritative record.
 * Plain record validation/casting/JSON.parse is NOT an implementation of this port.
 * This interface cannot authenticate an arbitrary injected adapter: trusted server composition
 * must supply the reviewed, context-bound reader paired with its authoritative store. */
export interface TrustedSessionReaderPort {
  read(capability: unknown): Readonly<StoredSession>;
}
export interface SecretGenerationPort {
  /** Real adapter requires >=256 CSPRNG bits per independent secret; no UUID/Math.random fallback. */
  secret(): string;
}
export interface LocalAuthenticationPorts extends ApplicationTrustPorts {
  readonly backendOrigin: string;
  readonly commandDigests: BodyDigestPort;
  readonly receipts: OperationReceiptReaderPort;
  readonly recovery?: RecoveryCoordinatorPort;
  readonly transactions: LoginTransactionPort;
  readonly broker: BrokerAssertionSourcePort;
  readonly verifier?: TrustedVerificationPort;
  readonly atomic: AtomicLoginStorePort;
  readonly sessions: SessionStorePort;
  readonly trustedSessions: TrustedSessionReaderPort;
  readonly users: UserRepository;
  readonly digest: TextDigestPort;
  readonly secrets: SecretGenerationPort;
  readonly keyPolicy: () => SigningKeyPolicy;
}
export type AuthenticationFailure = Exclude<AtomicStatus, 'COMMITTED'> | 'ACCESS_DENIED' | 'NOT_CONFIGURED';
export type LoginStartResult = { readonly status: 'STARTED'; readonly transactionId: string; readonly expiresAt: number } |
  { readonly status: 'BLOCKED'; readonly code: AuthenticationFailure };
export type LoginResult = { readonly status: 'AUTHENTICATED'; readonly sessionCredential: string; readonly expiresAt: number } |
  { readonly status: 'BLOCKED'; readonly code: AuthenticationFailure };
export type RecoveryResult = { readonly status: 'RECOVERED'; readonly outcome: 'COMMITTED' | 'REJECTED' } |
  { readonly status: 'BLOCKED'; readonly code: AuthenticationFailure };
