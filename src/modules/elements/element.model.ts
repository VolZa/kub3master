import { ElementType } from '../../config/config';

export interface ElementRow {
  ID: string;
  Code: string;
  PrefixName: string;
  Name: string;
  Type: ElementType;
  Category: string;
  BaseUnit: string;
  ProfileType?: string;
  ParentMaterialID?: string;
  Diameter?: number;
  Class?: string;
  Width?: number;
  Height?: number;
  Length?: number;
  Thickness?: number;
  IsActive?: boolean;
  Comment?: string;
  CreatedAt: Date;
}

export interface ElementShort {
  id: string;
  code: string;
  baseUnit: string;
  type: ElementType;
}

export interface ElementFull {
  id: string;
  code: string;
  prefixName: string;
  name: string;

  type: ElementType;
  category: string;
  profileType?: string;

  baseUnit: string;

  parentMaterialID?: string;

  diameter?: number;
  className?: string;
  width?: number;
  length?: number;

  isActive: boolean;
}

export interface CreateElementDto {
  code: string;
  name: string;
  type: ElementType;
  category: string;
  baseUnit: string;

  diameter?: number;
  length?: number;
  width?: number;
  thickness?: number;
}

export interface ParsedPart {
  code: string;
  prefixName: string;
  name: string;

  category: string;
  baseUnit?: string;
  profileType?: string;
  diameter: number;
  class: string;
  length: number;
}
