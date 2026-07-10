export interface IPlacementDataSource {
  getRows(): unknown[][];

  saveRows(rows: unknown[][]): void;
}
