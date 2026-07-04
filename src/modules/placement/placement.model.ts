import { PlacementStatus } from './placement.status';

export interface PlacementLocation {
  section: string;

  floor: number;

  axis: string;
}

export interface Placement {
  id: number;

  houseId: string;

  productCode: string;

  location: PlacementLocation;

  status: PlacementStatus;

  priority: number;

  scheduledDate?: Date;
  scheduledShift?: number;

  producedDate?: Date;
  producedShift?: number;

  shippedDate?: Date;

  comment?: string;
}
