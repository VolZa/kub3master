/**
 * ==========================================================
 * ERP КУБ
 * Module: Material
 * File: material.row.ts
 * Path src\modules\material\material.row.ts
 *
 * Таблиця Google Sheets: 05_Materials
 * ==========================================================
 */
import { ProfileType, MaterialCategory } from '../../config/config';
export interface MaterialRow {
  MaterialID: string;
  Code: string;
  Name: string;
  Category: MaterialCategory;
  ProfileType: ProfileType;
  Diameter: number;
  Class: string;
  Width: number;
  Height: number;
  Thickness: number;
  Density: number;
  WeightPerMeter: number;
  BaseUnit: string;
  IsActive: boolean;
  Comment: string;
}
