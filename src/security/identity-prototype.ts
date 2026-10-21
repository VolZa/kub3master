import { verifiedIdentity, type UserIdentity } from './permission-service';
export interface LoginChallenge { id: string; nonce: string; binding: string; expiresAt: number }
export interface ChallengeStore {
  issue(binding: string): LoginChallenge;
  read(id: string): LoginChallenge | undefined;
  /** Atomic compare/consume under a lock or transaction. Never just read then delete. */
  consume(id: string, binding: string, nonce: string, now: number): boolean;
}
export interface VerifiedGoogleClaims { iss: string; sub: string; aud: string; exp: number; nonce: string }
export interface GoogleTokenVerifier { verify(token: string): VerifiedGoogleClaims }
/** Isolated POC controller. No GAS registration, session endpoint or configured production verifier. */
export class IdentityPrototype {
  constructor(private readonly challenges: ChallengeStore, private readonly verifier: GoogleTokenVerifier,
    private readonly audience: string, private readonly now: () => number = Date.now) {}
  begin(binding: string) {
    if (!/^[a-f0-9]{64}$/.test(binding)) throw new Error('ACCESS_DENIED');
    const challenge = this.challenges.issue(binding);
    return { challengeId: challenge.id, nonce: challenge.nonce };
  }
  complete(id: string, binding: string, token: string): UserIdentity {
    const challenge = this.challenges.read(id), now = this.now();
    if (!this.audience || !challenge || challenge.binding !== binding || challenge.expiresAt <= now) throw new Error('ACCESS_DENIED');
    let claims: VerifiedGoogleClaims;
    try { claims = this.verifier.verify(token); } catch { throw new Error('ACCESS_DENIED'); }
    if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) || !claims.sub || claims.aud !== this.audience ||
      !Number.isFinite(claims.exp) || claims.exp * 1000 <= now || claims.nonce !== challenge.nonce ||
      !this.challenges.consume(id, binding, claims.nonce, now)) throw new Error('ACCESS_DENIED');
    return verifiedIdentity('https://accounts.google.com', claims.sub, claims.exp * 1000);
  }
}
