import { Placement } from './placement.model';
import { PlacementStatus } from './placement.status';

export interface IPlacementRepository {
  getAll(): Placement[];

  saveAll(items: Placement[]): void;

  findById(id: number): Placement | null;

  findByStatus(status: PlacementStatus): Placement[];

  findByHouseId(houseId: string): Placement[];

  findByProductCode(productCode: string): Placement[];

  findScheduled(date: Date, shift?: number): Placement[];

  update(item: Placement): void;
}
// export interface IPlacementRepository {
//   getAll(): Placement[];

//   saveAll(items: Placement[]): void;

//   findById(id: number): Placement | null;

//   findNextForProduction(productCode: string): Placement | null;

//   update(item: Placement): void;
// }
