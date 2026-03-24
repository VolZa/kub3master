export type ElementType = 'product' | 'assembly' | 'part' | 'material';

export interface ElementInput {
  code: string;
  name: string;
  type: ElementType;

  category?: string;
  baseUnit?: string;
  profileType?: string;

  diameter?: number;
  class?: string;

  length?: number;
  width?: number;
  thickness?: number;

  weightPerUnit?: number;
  density?: number;

  comment?: string;
}
