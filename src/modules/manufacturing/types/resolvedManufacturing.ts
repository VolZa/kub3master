import { ManufacturingInput } from './manufacturingInput';
import { House } from '../../../domain/houses/house.model';

export interface ResolvedManufacturing {
  input: ManufacturingInput;
  house: Readonly<House>;
  projectId: string;
  projectDocumentId: string;
  productId: string;
}
