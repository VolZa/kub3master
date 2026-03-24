import { ElementType } from '../../services/moove.element';

// export interface Element {
//   id: string;
//   code: string;
//   type: string;
//   category: string;
//   baseUnit: string;
// }

// як зберігається в таблиці
export interface ElementRow {
  ID: string;
  Code: string;
  Name: string;
  Type: string;
  Category: string;
  BaseUnit: string;
  ProfileType?: string;
  ParentMaterialID?: string;
  Diameter?: number;
  Class?: string;
  Width?: number;
  Length?: number;
  Thickness?: number;
  IsActive?: boolean;
  ParentType?: string;
  WeightPerUnit?: number;
  Density?: number;
  Comment?: string;
  CreatedAt: Date;
}

// коротке представлення (cache)
export interface ElementShort {
  id: string;
  code: string;
  baseUnit: string;
}

//  що потрібно для створення CreateElementDto
export interface CreateElementDto {
  code: string;
  name: string;
  type: ElementType;
  category: string;
  baseUnit: string;

  // optional
  diameter?: number;
  length?: number;
  width?: number;
  thickness?: number;
}
