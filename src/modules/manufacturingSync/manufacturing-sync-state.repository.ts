/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * File: manufacturing-sync-state.repository.ts
 * Path: src/modules/manufacturingSync/manufacturing-sync-state.repository.ts
 *
 * Repository для роботи зі станом синхронізації Manufacturing.
 * ==========================================================
 */

import { ManufacturingSyncState } from '../../domain/manufacturing-sync/manufacturing-sync-state.model';
import { IManufacturingSyncStateRepository } from '../../domain/manufacturing-sync/manufacturing-sync-state.repository.interface';

import { ManufacturingSyncStateRow } from '../../infrastructure/sheets/manufacturingSyncState/manufacturingSyncState.row';
import { ManufacturingSyncStateMapper } from '../../infrastructure/sheets/manufacturingSyncState/manufacturingSyncState.mapper';
import { IManufacturingSyncStateDataSource } from '../../infrastructure/sheets/manufacturingSyncState/manufacturing-sync-state-data-source.interface';

export class ManufacturingSyncStateRepository implements IManufacturingSyncStateRepository {
  private readonly entities: ManufacturingSyncState[];

  constructor(
    rows: readonly ManufacturingSyncStateRow[],
    private readonly dataSource: IManufacturingSyncStateDataSource,
  ) {
    this.entities = rows.map((row) =>
      ManufacturingSyncStateMapper.mapRowToState(row),
    );
  }

  public getAll(): ManufacturingSyncState[] {
    return [...this.entities];
  }

  public findByManufacturingId(
    manufacturingId: string,
  ): ManufacturingSyncState | null {
    return (
      this.entities.find(
        (state) => state.manufacturingId === manufacturingId,
      ) ?? null
    );
  }

  public upsert(state: ManufacturingSyncState): void {
    const index = this.entities.findIndex(
      (item) => item.manufacturingId === state.manufacturingId,
    );

    if (index === -1) {
      this.entities.push(state);
      return;
    }

    this.entities[index] = state;
  }

  public replaceAll(states: ManufacturingSyncState[]): void {
    this.entities.length = 0;
    this.entities.push(...states);
  }

  public save(): void {
    const rows = this.entities.map(ManufacturingSyncStateMapper.mapStateToRow);

    this.dataSource.saveRows(rows);
  }
}
