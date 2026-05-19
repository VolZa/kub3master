// src/domain/materials/material.repository.ts

import { mapRowsToMaterials } from './material.mapper';
import { Material } from './material.model';

export class MaterialRepository {
  private materials: Material[] = [];

  constructor(rows: any[][]) {
    this.materials = rows.length ? mapRowsToMaterials(rows) : [];
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
    return (
      this.materials.find(
        (m) =>
          m.profileType === 'rebar' &&
          m.diameter === diameter &&
          m.class === rebarClass,
      ) || null
    );
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

  // -----------------------------
  // 🔥 UNIVERSAL
  // -----------------------------
  findBySpec(spec: {
    profileType?: string;
    diameter?: number;
    class?: string;
    width?: number;
    height?: number;
    thickness?: number;
  }): Material | null {
    switch (spec.profileType) {
      case 'rebar':
        return this.findRebar(spec.diameter!, spec.class!);

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
  findByCode(code: string): Material | null {
    return this.materials.find((m) => m.code === code) || null;
  }
}
