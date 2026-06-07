// src/domain/materials/material.mapper.ts

import { Material } from './material.model';

function normalizeBoolean(v: any): boolean {
  return v === true || v === 'TRUE' || v === 1;
}

export function mapRowsToMaterials(rows: any[][]): Material[] {
  const headers = rows[0];
  const data = rows.slice(1);

  const col = (name: string) => {
    const i = headers.indexOf(name);
    if (i === -1) throw new Error(`Column not found: ${name}`);
    return i;
  };

  const idx = {
    id: col('MaterialID'),
    code: col('Code'),
    name: col('Name'),
    category: col('Category'),
    profileType: col('ProfileType'),
    diameter: col('Diameter'),
    class: col('Class'),
    width: col('Width'),
    height: col('Height'),
    thickness: col('Thickness'),
    density: col('Density'),
    baseUnit: col('BaseUnit'),
    isActive: col('IsActive'),
    comment: col('Comment'),
  };

  return data.map((row) => ({
    id: String(row[0]),
    materialId: String(row[0]),
    code: String(row[idx.code]).trim(),
    name: String(row[idx.name] || '').trim(),

    category: row[idx.category],
    profileType: row[idx.profileType],

    diameter: row[idx.diameter] ? Number(row[idx.diameter]) : undefined,
    class: row[idx.class] || undefined,

    width: row[idx.width] ? Number(row[idx.width]) : undefined,
    height: row[idx.height] ? Number(row[idx.height]) : undefined,
    thickness: row[idx.thickness] ? Number(row[idx.thickness]) : undefined,
    density: row[idx.density] ? Number(row[idx.density]) : undefined,

    baseUnit: row[idx.baseUnit] || 'кг',
    isActive: normalizeBoolean(row[idx.isActive]),

    comment: row[idx.comment] || undefined,
  }));
}
