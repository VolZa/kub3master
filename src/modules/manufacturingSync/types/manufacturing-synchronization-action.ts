/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * File: manufacturing-synchronization-action.ts
 * Path: src/modules/manufacturingSync/types/manufacturing-synchronization-action.ts
 *
 * Дія, яку необхідно виконати для синхронізації Manufacturing.
 * ==========================================================
 */

import { Placement } from '../../../domain/placement/placement.model';

export type ManufacturingSynchronizationAction =
  | {
      type: 'NONE';
    }
  | {
      type: 'MARK_PRODUCED';
      placement: Readonly<Placement>;
    }
  | {
      type: 'UNMARK_PRODUCED';
      placement: Readonly<Placement>;
    }
  | {
      type: 'MOVE_PRODUCED';
      from: Readonly<Placement>;
      to: Readonly<Placement>;
    }
  | {
      type: 'DETACH_PRODUCED';
      placement: Readonly<Placement>;
    };
