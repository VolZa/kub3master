export interface PlacementRow {
  PlacementId: number;
  HouseId: string;
  Section: string;
  Floor: number;
  Axis: string;
  ProductCode: string;
  Status: string;
  Priority: number;
  ScheduledDate?: Date;
  ScheduledShift?: number;
  ProducedDate?: Date;
  ProducedShift?: number;
  ShippedDate?: Date;
  Comment?: string;
}
