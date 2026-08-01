// src/modules/placement/placement.rules.ts

import { Placement, PlacementStatus } from '../../domain/placement';

export function canBeScheduled(placement: Placement): boolean {
  return (
    placement.status === PlacementStatus.NONE ||
    placement.status === PlacementStatus.REJECTED
  );
}
