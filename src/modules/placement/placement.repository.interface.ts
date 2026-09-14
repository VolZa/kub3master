/**
 * ==========================================================
 * ERP КУБ
 * Module: Placement
 * Layer: Application / Repository Contract
 * File: placement.repository.interface.ts
 * Path: src/modules/placement/placement.repository.interface.ts
 *
 * Контракт репозиторію Placement.
 * Визначає операції, доступні application-рівню.
 * ==========================================================
 */

import { Placement, PlacementStatus } from '../../domain/placement/';

export interface IPlacementRepository {
  getAll(): Placement[];

  save(): void;

  findById(id: number): Placement | null;

  findByStatus(status: PlacementStatus): Placement[];

  findByHouseCode(houseCode: string): Placement[];

  findByProductCode(productCode: string): Placement[];

  findScheduled(date: Date, shift?: number): Placement[];

  update(item: Placement): void;
}
