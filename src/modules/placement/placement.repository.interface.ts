import { Placement } from './placement.model';
import { PlacementStatus } from './placement.status';

export interface IPlacementRepository {
  getAll(): Placement[];

  save(): void;

  // saveAll(items: Placement[]): void;

  findById(id: number): Placement | null;

  findByStatus(status: PlacementStatus): Placement[];

  findByHouseId(houseId: string): Placement[];

  findByProductCode(productCode: string): Placement[];

  findScheduled(date: Date, shift?: number): Placement[];

  update(item: Placement): void;
}
