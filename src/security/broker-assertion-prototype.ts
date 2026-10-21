import { verifiedIdentity, type IdentityVerifier, type UserIdentity } from './permission-service';
export interface AssertionSignatureVerifier { verify(assertion: string): Record<string, unknown> }
export interface BrokerTransactionContext { id: string; nonce: string; proofHash: string; expiresAt: number }
/** Trusted server store, never a transaction context deserialized directly from the browser. */
/** Atomically consume BOTH assertion jti and the pending login transaction; reject either replay. */
export interface AssertionReplayStore { consume(jti: string, transactionId: string, expiresAt: number): boolean }
const hex = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
/** Isolated consumer for the signed-assertion alternative to the AC-002B.3 server-only token port.
 * PermissionService/UserRepository must still run after this verifier. No production composition.
 */
export class BrokerAssertionPrototype implements IdentityVerifier {
  constructor(private readonly signature: AssertionSignatureVerifier, private readonly issuer: string,
    private readonly audience: string, private readonly context: () => BrokerTransactionContext | undefined,
    private readonly replay: AssertionReplayStore, private readonly now: () => number = Date.now) {}
  verify(credential: unknown): UserIdentity {
    try {
      if (!this.issuer.startsWith('https://') || !this.audience || typeof credential !== 'string' || credential.length > 8192) throw Error();
      const c = this.signature.verify(credential), tx = this.context(), time = this.now();
      if (!tx || !Number.isFinite(tx.expiresAt) || tx.expiresAt <= time ||
        c.iss !== this.issuer || c.aud !== this.audience || c.googleIssuer !== 'https://accounts.google.com' ||
        typeof c.sub !== 'string' || !c.sub || !hex(c.jti) ||
        !hex(c.transactionId) || !hex(c.nonce) || !hex(c.proofHash) ||
        c.transactionId !== tx.id || c.nonce !== tx.nonce || c.proofHash !== tx.proofHash ||
        typeof c.exp !== 'number' || !Number.isFinite(c.exp) || c.exp * 1000 <= time ||
        typeof c.iat !== 'number' || !Number.isFinite(c.iat) || c.iat * 1000 > time + 1000 ||
        c.exp <= c.iat || c.exp - c.iat > 20 || time - c.iat * 1000 > 20000 ||
        !this.replay.consume(c.jti, tx.id, c.exp * 1000)) throw Error();
      return verifiedIdentity('https://accounts.google.com', c.sub, Math.min(c.exp * 1000, tx.expiresAt));
    } catch { throw new Error('ACCESS_DENIED'); }
  }
}
