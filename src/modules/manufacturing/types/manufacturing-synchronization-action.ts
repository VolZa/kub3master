/**
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * Layer: Application / Types
 * File: manufacturing-synchronization-action.ts
 * Path: src/modules/manufacturingSync/types/manufacturing-synchronization-action.ts
 *
 * Дії, які можуть бути виконані під час синхронізації
 * Manufacturing з Placement.
 */

import { Placement } from '../../../domain/placement/placement.model';

export type ManufacturingSynchronizationAction =
  | { type: 'NONE' }
  | { type: 'MARK_PRODUCED'; placement: Readonly<Placement> }
  | { type: 'UNMARK_PRODUCED'; placement: Readonly<Placement> }
  | {
      type: 'MOVE_PRODUCED';
      from: Readonly<Placement>;
      to: Readonly<Placement>;
    }
  | {
      type: 'DETACH_PRODUCED';
      placement: Readonly<Placement>;
    };
