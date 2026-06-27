import { MaterialRequirement } from './material-requirement.model';

export interface ProductReport {
  productId: string;
  productCode: string;
  productName: string;

  materials: MaterialRequirement[];
  // на майбутнє розширення
  //   assemblies: AssemblyRequirement[];
  //   parts: PartRequirement[];
  //   operations: OperationRequirement[];
}
