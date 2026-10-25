import { verifySignedAssertion, type ProfileSignatureVerificationPort } from '../identity-contracts/signed-assertion-profile';
import { type LoginTransaction } from '../identity-contracts/contracts';
import { type SigningKeyPolicy } from '../identity-contracts/signing-key-policy';
import { type ApplicationTrustPorts, type TrustedVerificationPort } from './ports';
import { ApplicationTrustBoundary, denied } from './trust-boundaries';

/** No synthetic/default verifier exists in runtime code. An absent real adapter denies.
 * Deployment wiring is intentionally absent; supplying this class does not enable a GAS RPC. */
export class SignedAssertionVerificationService implements TrustedVerificationPort {
  private readonly trust: ApplicationTrustBoundary;
  constructor(ports: ApplicationTrustPorts, private readonly policy: () => SigningKeyPolicy,
    private readonly signature?: ProfileSignatureVerificationPort) { this.trust = new ApplicationTrustBoundary(ports); }
  assertConfigured(): void { if (!this.signature) return denied(); }
  verify(message: unknown, transaction: Readonly<LoginTransaction>) {
    this.assertConfigured();
    this.trust.check();
    const proof = verifySignedAssertion(message, this.trust.context, this.policy(), transaction, () => this.trust.check(), this.signature!);
    this.trust.check(); return proof;
  }
}
