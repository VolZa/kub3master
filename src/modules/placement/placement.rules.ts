// src/modules/placement/placement.rules.ts

import { Placement } from './placement.model';
import { PlacementStatus } from './placement.status';

export function canBeScheduled(placement: Placement): boolean {
  return (
    placement.status === PlacementStatus.NONE ||
    placement.status === PlacementStatus.REJECTED
  );
}
