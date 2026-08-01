// src/domain/materials/material.model.ts

import { ProfileType } from '../../config/config';
import { MaterialCategory } from '../../config/config';

export interface Material {
  id: string;
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

  weightPerMeter?: number; // 🔥 НОВЕ
  baseUnit: string;
  isActive: boolean;

  comment?: string;
}
