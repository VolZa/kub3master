/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/commit/commit-operation.model.ts
 * Module: BOM
 * Layer: Contracts
 * Responsibility: versioned pre-creation operation states and durable identity evidence.
 */
import type { PreparedBOM, BOMPreparationInput } from '../preparation/bom-preparation.model';
import type { ElementRow } from '../../elements/element.model';
import type { SafeBOMPlan } from './safe-bom-writer';
export type OperationEventType = 'INITIALIZED' | 'READY' | 'RESERVING' | 'INSERT_INTENT' | 'CREATED' | 'REUSED' | 'BOM_READY' | 'BOM_PLANNED' | 'COMPLETED' | 'CONFLICT';
export interface OperationEvent { eventID: string; type: OperationEventType; data: Record<string, unknown> }
export interface OperationManifest {
  version: 1; operationID: string; writerOperationID: string; requestDigest: string;
  input: BOMPreparationInput; prepared: PreparedBOM;
  validationContext?: { materialsDigest: string; catalogDigest: string; documents: string[] };
}
export interface InsertIntent { localKey: string; reservedID: string; row: ElementRow }
export interface CreationVerifier {
  /** Must be implemented by trusted 1H.3C code using fresh physical readback, never the repository cache. */
  readCreatedElement(intent: InsertIntent, context: {
    operationID: string; writerOperationID: string; requestDigest: string;
    insertIntentEventID: string; insertIntentDigest: string;
  }): ElementRow;
}
export interface OperationState {
  manifest: OperationManifest; status: 'PREPARING' | 'READY' | 'CREATING' | 'BOM_READY' | 'COMPLETED' | 'CONFLICT';
  events: OperationEvent[];
  bomPlan?: SafeBOMPlan;
  bomSnapshotDigest?: string;
  elements: Record<string, { status: 'RESERVING' | 'INSERT_INTENT' | 'CREATED' | 'REUSED'; intent?: InsertIntent; id?: string }>;
}
export type JournalResult = { status: 'APPLIED' | 'ALREADY_APPLIED'; state: OperationState } | { status: 'CONFLICT'; error: string };
