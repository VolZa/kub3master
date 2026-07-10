import { Placement } from './placement.model';
import { PlacementStatus } from './placement.status';
import { IPlacementRepository } from './placement.repository.interface';
import { mapPlacementToSheetRow } from './placement.mapper';
import { IPlacementDataSource } from 'infrastructure/sheets/placement/placement-data-source.interface';

export class PlacementInMemoryRepository implements IPlacementRepository {
  private readonly items: Placement[];

  constructor(
    items: Placement[],
    private readonly dataSource: IPlacementDataSource,
  ) {
    this.items = [...items];
  }

  getAll(): Placement[] {
    return [...this.items];
  }

  findById(id: number): Placement | null {
    return this.items.find((p) => p.id === id) ?? null;
  }

  update(item: Placement): void {
    const index = this.items.findIndex((p) => p.id === item.id);

    if (index === -1) {
      throw new Error(`Placement ${item.id} not found.`);
    }

    this.items[index] = item;
  }

  save(): void {
    const rows = this.items.map(mapPlacementToSheetRow);

    this.dataSource.saveRows(rows);
  }

  // saveAll(items: Placement[]): void {
  //   this.items.length = 0;
  //   this.items.push(...items);
  // }

  findNextForProduction(productCode: string): Placement | null {
    return (
      this.items
        .filter(
          (p) =>
            p.productCode === productCode && p.status === PlacementStatus.NONE,
        )
        .sort((a, b) => {
          // більший пріоритет — першим
          if (b.priority !== a.priority) {
            return b.priority - a.priority;
          }

          // нижчий поверх — першим
          if (a.location.floor !== b.location.floor) {
            return a.location.floor - b.location.floor;
          }

          // стабільне сортування
          return a.id - b.id;
        })[0] ?? null
    );
  }

  findProduced(): Placement[] {
    return this.items.filter((p) => p.status === PlacementStatus.PRODUCED);
  }

  findShipped(): Placement[] {
    return this.items.filter((p) => p.status === PlacementStatus.SHIPPED);
  }

  findScheduled(date: Date, shift?: number): Placement[] {
    return this.items
      .filter((p) => {
        if (p.status !== PlacementStatus.SCHEDULED) {
          return false;
        }

        if (!p.scheduledDate) {
          return false;
        }

        if (!isSameDay(p.scheduledDate, date)) {
          return false;
        }

        if (shift !== undefined && p.scheduledShift !== shift) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }

        if (a.location.floor !== b.location.floor) {
          return a.location.floor - b.location.floor;
        }

        return a.id - b.id;
      });
  }

  findByStatus(status: PlacementStatus): Placement[] {
    return this.items.filter((p) => p.status === status);
  }

  findByProductCode(productCode: string): Placement[] {
    return this.items.filter((p) => p.productCode === productCode);
  }

  findByHouseId(houseId: string): Placement[] {
    return this.items.filter((p) => p.houseId === houseId);
  }
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
