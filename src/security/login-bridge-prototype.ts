import { IdentityPrototype, type ChallengeStore } from './identity-prototype';
import { SessionPrototype } from './session-prototype';

/** Trusted, authenticated server-to-server port. No browser claims or configurable request URLs.
 * Broker must bind OAuth state/nonce/browser cookie AND the proof to this transaction before login.
 */
export interface LoginBroker {
  begin(transaction: { id: string; nonce: string; proofHash: string }): void;
  /** Atomically redeem once, enforcing proofHash/TTL. Google ID token travels server-to-server only.
   * Undefined means pending; errors fail closed. Raw credential is never returned to the browser.
   */
  redeem(id: string, browserProof: string): string | undefined;
}
const hex = (s: unknown): s is string => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const deny = (): never => { throw new Error('ACCESS_DENIED'); };

/** Isolated orchestrator; reuses existing nonce controller and session issuer, no production imports. */
export class LoginBridgePrototype {
  constructor(private readonly challenges: ChallengeStore, private readonly identity: IdentityPrototype,
    private readonly sessions: SessionPrototype, private readonly broker: LoginBroker,
    private readonly sha256: (value: string) => string, private readonly now: () => number = Date.now) {}
  begin(proofHash: string): { transactionId: string } {
    if (!hex(proofHash)) return deny();
    const challenge = this.identity.begin(proofHash);
    this.broker.begin({ id: challenge.challengeId, nonce: challenge.nonce, proofHash });
    return { transactionId: challenge.challengeId };
  }
  complete(id: string, browserProof: string) {
    if (!hex(browserProof)) return deny();
    const challenge = this.challenges.read(id), hash = this.sha256(browserProof);
    if (!hex(hash) || !challenge || challenge.binding !== hash || challenge.expiresAt <= this.now()) return deny();
    const credential = this.broker.redeem(id, browserProof);
    if (credential === undefined) return { status: 'PENDING' as const };
    if (typeof credential !== 'string' || !credential || credential.length > 32768) return deny();
    const session = this.sessions.login(this.identity, id, hash, credential);
    return { status: 'OK' as const, ...session };
  }
}

/** Browser adapter guard, not proof of Google identity. Only gates initial proof handoff to login popup.
 * Caller pins actual popup WindowProxy and exact configured HTTPS bridge origin; no '*' targetOrigin.
 */
export function bridgeReadyMessage(event: { origin: string; source: unknown; data: unknown },
  expectedOrigin: string, popup: unknown, transactionId: string): boolean {
  if (!/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/.test(expectedOrigin) || !popup || !transactionId ||
    event.origin !== expectedOrigin || event.source !== popup || !event.data || typeof event.data !== 'object') return false;
  const data = event.data as Record<string, unknown>;
  return data.type === 'KUB_BRIDGE_READY' && data.transactionId === transactionId &&
    Object.keys(data).length === 2;
}
