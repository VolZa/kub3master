// src/domain/materials/material.model.ts

import { ProfileType } from '../../config/config';

export type MaterialCategory = 'rebar' | 'concrete' | 'steel' | 'other';

export interface Material {
  materialId: string;
  code: string;
  name: string;

  category: MaterialCategory;
  profileType: ProfileType;

  diameter?: number;
  class?: string;

  width?: number;
  height?: number;
  thickness?: number;
  density?: number;

  baseUnit: string;
  isActive: boolean;

  comment?: string;
}
