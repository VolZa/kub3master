// src/domain/materials/material.mapper.ts

import { Material } from './material.model';
import { MaterialRow } from '../../modules/material/material.row';

function normalizeBoolean(v: unknown): boolean {
  return v === true || v === 'TRUE' || v === 1;
}

export function mapRowsToMaterials(rows: readonly MaterialRow[]): Material[] {
  // console.log('HEADERS:', JSON.stringify(rows[0]));

  return rows.map((row) => ({
    id: String(row.MaterialID).trim(), //Чи без .trim()
    code: String(row.Code).trim(),
    name: String(row.Name).trim(),

    category: row.Category,
    profileType: row.ProfileType,

    diameter: row.Diameter ? Number(row.Diameter) : undefined,
    class: row.Class || undefined,

    width: row.Width ? Number(row.Width) : undefined,
    height: row.Height ? Number(row.Height) : undefined,
    thickness: row.Thickness ? Number(row.Thickness) : undefined,
    density: row.Density ? Number(row.Density) : undefined,
    weightPerMeter: row.WeightPerMeter ? Number(row.WeightPerMeter) : undefined,

    baseUnit: row.BaseUnit || 'кг',
    isActive: normalizeBoolean(row.IsActive),

    comment: row.Comment || undefined,
  }));
}
