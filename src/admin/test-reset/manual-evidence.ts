import type { PropertiesPort, SafetyEvidence, SpreadsheetPort } from './test-reset';
export const MANUAL_EVIDENCE_KEY = 'KUB_TEST_REVIEW_EVIDENCE_V1';
export interface ManualEvidenceInput {
  fileId: string; fingerprint: string; evidenceId: string; artifactCommitment: string; reference: string;
  externalConnections: 'SAFE' | 'UNSAFE' | 'UNKNOWN'; boundScripts: 'SAFE' | 'UNSAFE' | 'UNKNOWN'; triggers: 'SAFE' | 'UNSAFE' | 'UNKNOWN';
}
export interface ManualReceipt extends ManualEvidenceInput { reviewerSubject: string; reviewedAt: number; expiresAt: number; commitment: string }
const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
/** Explicit admin attestation, not an automatic code/trigger audit. Records are trusted editor data,
 * tied to scanned workbook state + an independently collected dependency artifact commitment.
 */
export class ManualEvidenceStore {
  constructor(private readonly p: PropertiesPort, private readonly books: SpreadsheetPort, private readonly hash: (s: string) => string,
    private readonly now: () => number, private readonly reviewerActive: (subject: string) => boolean) {}
  private read(): ManualReceipt[] {
    const raw = this.p.getProperty(MANUAL_EVIDENCE_KEY); if (!raw) return [];
    try { const doc = JSON.parse(raw); if (doc.version !== 1 || !Array.isArray(doc.receipts) || doc.receipts.length > 12) throw Error(); return doc.receipts; }
    catch { throw Error('MANUAL_EVIDENCE_INVALID'); }
  }
  private commitment(r: Omit<ManualReceipt, 'commitment'>) {
    return this.hash(JSON.stringify([r.fileId, r.fingerprint, r.evidenceId, r.artifactCommitment, r.reference,
      r.externalConnections, r.boundScripts, r.triggers, r.reviewerSubject, r.reviewedAt, r.expiresAt]));
  }
  record(input: ManualEvidenceInput, subject: string, allowedIds: string[], utf8Bytes: (s: string) => number) {
    if (!allowedIds.includes(input.fileId) || !digest(input.fingerprint) || !digest(input.artifactCommitment) ||
      typeof input.evidenceId !== 'string' || !input.evidenceId.trim() || input.evidenceId.length > 100 ||
      typeof input.reference !== 'string' || !input.reference.trim() || input.reference.length > 200 ||
      ![input.externalConnections, input.boundScripts, input.triggers].every(s => ['SAFE', 'UNSAFE', 'UNKNOWN'].includes(s)) || !this.reviewerActive(subject)) throw Error('MANUAL_EVIDENCE_INVALID');
    const snapshot = this.books.inspect(input.fileId, []);
    if (snapshot.id !== input.fileId || snapshot.fingerprint !== input.fingerprint) throw Error('EVIDENCE_STATE_CHANGED');
    const fields = { ...input, reviewerSubject: subject, reviewedAt: this.now(), expiresAt: this.now() + 15 * 60000 };
    const receipt: ManualReceipt = { ...fields, commitment: this.commitment(fields) };
    const rows = this.read().filter(r => r.fileId !== input.fileId); rows.push(receipt);
    const raw = JSON.stringify({ version: 1, receipts: rows });
    if (rows.length > 12 || utf8Bytes(raw) > 8500) throw Error('EVIDENCE_SIZE_LIMIT');
    try { this.p.setProperty(MANUAL_EVIDENCE_KEY, raw); if (this.p.getProperty(MANUAL_EVIDENCE_KEY) !== raw) throw Error(); }
    catch { throw Error('EVIDENCE_COMMIT_UNCONFIRMED'); }
    return receipt.commitment;
  }
  inspect(fileId: string): SafetyEvidence {
    const unknown: SafetyEvidence = { fileId, evidenceId: '', externalConnections: 'UNKNOWN', boundScripts: 'UNKNOWN', triggers: 'UNKNOWN' };
    try {
      const rows = this.read().filter(r => r.fileId === fileId); if (rows.length !== 1) return unknown;
      const r = rows[0], snapshot = this.books.inspect(fileId, []);
      if (!digest(r.commitment) || this.commitment(r) !== r.commitment || snapshot.id !== fileId || r.fingerprint !== snapshot.fingerprint ||
        !Number.isFinite(r.reviewedAt) || r.reviewedAt > this.now() || !Number.isFinite(r.expiresAt) || r.expiresAt <= this.now() ||
        r.expiresAt - r.reviewedAt > 15 * 60000 || !this.reviewerActive(r.reviewerSubject)) return unknown;
      return { fileId, evidenceId: r.evidenceId, fingerprint: r.fingerprint, commitment: r.commitment, expiresAt: r.expiresAt,
        externalConnections: r.externalConnections, boundScripts: r.boundScripts, triggers: r.triggers };
    } catch { return unknown; }
  }
}
