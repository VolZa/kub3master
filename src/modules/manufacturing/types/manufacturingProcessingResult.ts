import { ResolvedManufacturing } from './resolvedManufacturing';
import { ManufacturingProcessingError } from './manufacturingProcessingError';

export interface ManufacturingProcessingResult {
  items: readonly ResolvedManufacturing[];
  errors: readonly ManufacturingProcessingError[];
}
