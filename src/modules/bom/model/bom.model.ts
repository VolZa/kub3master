import { ParsedSpec } from './parsed-spec.model';
export type BOMInput = {
  elements: string[];
};

export type BOMItem = {
  element: string;
  material: string;
  quantity: number;
  spec?: ParsedSpec;
};

export type BOMResult = {
  items: BOMItem[];
  totalItems?: number;
};
