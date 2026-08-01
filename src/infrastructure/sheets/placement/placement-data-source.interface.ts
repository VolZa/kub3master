import { PlacementRow } from '../../../modules/placement/placement.row';

export interface IPlacementDataSource {
  getRows(): readonly PlacementRow[];

  saveRows(rows: readonly PlacementRow[]): void;
}
