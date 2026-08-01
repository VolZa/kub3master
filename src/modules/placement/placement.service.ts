import { IPlacementRepository } from './placement.repository.interface';
import { Placement } from '../../domain/placement';
import { PlacementStatus } from '../../domain/placement/placement.status';
export class PlacementService {
  constructor(private readonly repository: IPlacementRepository) {}

  schedule(placement: Placement, date: Date, shift: number): void {
    placement.status = PlacementStatus.SCHEDULED;
    placement.scheduledDate = date;
    placement.scheduledShift = shift;

    this.repository.update(placement);
  }

  markProduced(placement: Placement, date: Date, shift: number): void {
    placement.status = PlacementStatus.PRODUCED;
    placement.producedDate = date;
    placement.producedShift = shift;

    this.repository.update(placement);
  }

  markShipped(placement: Placement, date: Date): void {
    placement.status = PlacementStatus.SHIPPED;
    placement.shippedDate = date;

    this.repository.update(placement);
  }

  reset(placement: Placement): void {
    placement.status = PlacementStatus.NONE;

    placement.scheduledDate = undefined;
    placement.scheduledShift = undefined;

    placement.producedDate = undefined;
    placement.producedShift = undefined;

    placement.shippedDate = undefined;

    this.repository.update(placement);
  }

  getProductionPlan(date: Date, shift?: number): Placement[] {
    return this.repository.findScheduled(date, shift);
  }
}
// export class PlacementService {
//   constructor(private readonly repository: IPlacementRepository) {}

//   schedule(placementId: number, date: Date, shift: number): void;

//   markProduced(placement: Placement, date: Date, shift: number): void;

//   markShipped(placementId: number, date: Date): void;

//   reset(placementId: number): void;

//   getProductionPlan(date: Date, shift?: number): Placement[];
// }
