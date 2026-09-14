/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturing.repository.interface.ts
 * Path: src/modules/manufacturing/manufacturing.repository.interface.ts
 *
 * Призначення:
 * Контракт репозиторію Manufacturing.
 * ==========================================================
 */

import { Manufacturing } from '../../domain/manufacturing/manufacturing.model';

export interface IManufacturingRepository {
  getAll(): Manufacturing[];
  findById(id: string): Manufacturing | null;
  create(item: Manufacturing): void;
  update(item: Manufacturing): void;
  save(): void;
}
