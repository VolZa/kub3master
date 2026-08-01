// src/domain/materials/material.repository.ts

import { normalizeClassName, normalizeCode } from 'utils/normalize';
import { mapRowsToMaterials } from './material.mapper';
import { Material } from './material.model';
import { MaterialRow } from '../../modules/material/material.row';
export class MaterialRepository {
  private materials: Material[] = [];

  constructor(rows: readonly MaterialRow[]) {
    this.materials = mapRowsToMaterials(rows);
  }

  setData(materials: Material[]) {
    this.materials = materials.filter((m) => m.isActive);
  }

  getAll(): Material[] {
    return this.materials;
  }

  // -----------------------------
  // 🔩 REBAR
  // -----------------------------
  findRebar(diameter: number, rebarClass: string): Material | null {
    const m = this.materials.find(
      (m) =>
        m.profileType === 'round' &&
        m.diameter === diameter &&
        m.class === rebarClass,
    );

    if (m && !m.weightPerMeter) {
      throw new Error(`❌ No weightPerMeter for ${m.code}`);
    }

    return m || null;
  }

  // -----------------------------
  // 🪵 PLATE
  // -----------------------------
  findPlate(width: number, thickness: number): Material | null {
    return (
      this.materials.find(
        (m) =>
          m.profileType === 'plate' &&
          m.width === width &&
          m.thickness === thickness,
      ) || null
    );
  }

  // -----------------------------
  // 🔧 ANGLE
  // -----------------------------
  findAngle(width: number, height: number, thickness: number): Material | null {
    return (
      this.materials.find(
        (m) =>
          m.profileType === 'angle' &&
          m.width === width &&
          m.height === height &&
          m.thickness === thickness,
      ) || null
    );
  }

  // -----------------------------
  // 🧱 PIPE
  // -----------------------------
  findPipe(diameter: number, thickness: number): Material | null {
    return (
      this.materials.find(
        (m) =>
          m.profileType === 'pipe_round' &&
          m.diameter === diameter &&
          m.thickness === thickness,
      ) || null
    );
  }

  findBySpec(spec: {
    category?: string;
    profileType?: string;
    diameter?: number;
    class?: string;
    width?: number;
    height?: number;
    thickness?: number;
  }): Material | null {
    // console.log('findBySpec:', JSON.stringify(spec));
    switch (spec.category) {
      case 'rebar': {
        if (spec.diameter == null || spec.class == null) {
          return null;
        }

        const targetClass = normalizeClassName(spec.class);

        return (
          this.materials.find((m) => {
            if (m.class == null) return false;

            return (
              m.category === 'rebar' &&
              m.diameter === spec.diameter &&
              normalizeClassName(m.class) === targetClass
            );
          }) || null
        );
      }
      case 'steel': {
        switch (spec.profileType) {
          case 'plate':
            return this.findPlate(spec.width!, spec.thickness!);
          case 'angle':
            return this.findAngle(spec.width!, spec.height!, spec.thickness!);
          case 'pipe_round':
            return this.findPipe(spec.diameter!, spec.thickness!);
          default:
            return null;
        }
      }

      default:
        return null;
    }
  }

  findByCode(code: string): Material | null {
    const normalizedInput = normalizeCode(code);

    return (
      this.materials.find((m) => normalizeCode(m.code) === normalizedInput) ||
      null
    );
  }

  findById(id: string): Material | null {
    const material = this.materials.find((m) => m.id === id) || null;

    if (!material) {
      console.warn(`⚠️ Material not found by id: ${id}`);
    }

    return material;
  }
}
