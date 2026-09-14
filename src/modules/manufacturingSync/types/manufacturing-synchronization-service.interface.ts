/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * Layer: Application / Types
 * File: manufacturing-synchronization-service.interface.ts
 * Path: src/modules/manufacturingSync/types/manufacturing-synchronization-service.interface.ts
 *
 * Контракт сервісу аналізу та виконання синхронізації
 * Manufacturing → Placement.
 * ==========================================================
 */

import { Manufacturing } from '../../../domain/manufacturing/manufacturing.model';
import { ManufacturingSynchronizationAnalysis } from './manufacturing-synchronization-analysis';
import { ManufacturingSynchronizationResult } from './manufacturing-synchronization-result';

export interface IManufacturingSynchronizationService {
  analyze(
    manufacturing: Readonly<Manufacturing>,
  ): ManufacturingSynchronizationAnalysis;
  execute(
    analysis: Readonly<ManufacturingSynchronizationAnalysis>,
  ): ManufacturingSynchronizationResult;
}
