import { ElementType } from '../../config/config';

// як зберігається в таблиці
export interface ElementRow {
  ID: string;
  Code: string;
  Name: string;
  Type: ElementType;
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

// повна модель (для repository)
export type ElementFull = {
  id: string;
  code: string;
  name: string;
  type: ElementType;
  category?: string;
  baseUnit: string;
};

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

export interface ParsedPart {
  code: string;
  name: string;
  category?: string;
  baseUnit?: string;
  profileType?: string;
  diameter: number;
  class: string;
  length: number;
  weightPerUnit?: number;
}
