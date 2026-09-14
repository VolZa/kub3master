/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * Layer: Test
 * File: manufacturing-synchronization-detach.test.ts
 * Path: src/modules/manufacturingSync/tests/manufacturing-synchronization-detach.test.ts
 *
 * Тест сценарію DETACH_PRODUCED:
 *
 * ACTIVE Manufacturing втрачає PlacementId,
 * але саме виробництво не скасовується.
 *
 * Перевіряємо:
 * 1. analyze() визначає DETACH_PRODUCED.
 * 2. execute() повертає Placement у NONE.
 * 3. SyncState переходить у NO_PLACEMENT.
 * 4. Manufacturing залишається ACTIVE.
 * 5. Повторний analyze() не створює нової дії.
 * ==========================================================
 */

import { Manufacturing } from '../../../domain/manufacturing/manufacturing.model';
import { ManufacturingSyncState } from '../../../domain/manufacturing-sync/manufacturing-sync-state.model';
import { IManufacturingSyncStateRepository } from '../../../domain/manufacturing-sync/manufacturing-sync-state.repository.interface';
import { Placement } from '../../../domain/placement/placement.model';
import { PlacementStatus } from '../../../domain/placement/placement.status';
import { IPlacementRepository } from '../../placement/placement.repository.interface';
import { ManufacturingSynchronizationService } from '../services/manufacturing-synchronization.service';

class TestSyncStateRepository implements IManufacturingSyncStateRepository {
  private state: ManufacturingSyncState | null;

  constructor(state: ManufacturingSyncState | null) {
    this.state = state;
  }

  findByManufacturingId(
    manufacturingId: string,
  ): ManufacturingSyncState | null {
    if (this.state?.manufacturingId === manufacturingId) {
      return this.state;
    }

    return null;
  }

  upsert(state: ManufacturingSyncState): void {
    this.state = state;
  }

  save(): void {
    // Для in-memory тесту нічого не записуємо.
  }

  getState(): ManufacturingSyncState | null {
    return this.state;
  }
}

class TestPlacementRepository implements IPlacementRepository {
  private readonly items: Placement[];

  constructor(items: Placement[]) {
    this.items = [...items];
  }

  getAll(): Placement[] {
    return [...this.items];
  }

  save(): void {
    // Для in-memory тесту нічого не записуємо.
  }

  findById(id: number): Placement | null {
    return this.items.find((item) => item.id === id) ?? null;
  }

  findByStatus(status: PlacementStatus): Placement[] {
    return this.items.filter((item) => item.status === status);
  }

  findByHouseCode(houseCode: string): Placement[] {
    return this.items.filter((item) => item.houseCode === houseCode);
  }

  findByProductCode(productCode: string): Placement[] {
    return this.items.filter((item) => item.productCode === productCode);
  }

  findScheduled(date: Date, shift?: number): Placement[] {
    // У цьому тесті метод не використовується.
    return [];
  }

  update(item: Placement): void {
    const index = this.items.findIndex(
      (existingItem) => existingItem.id === item.id,
    );

    if (index === -1) {
      throw new Error(`Placement ${item.id} not found.`);
    }

    this.items[index] = item;
  }
}

export function testManufacturingSynchronizationDetach(): void {
  const manufacturing: Manufacturing = {
    id: 'М00000010',
    date: new Date('2026-06-17'),
    shift: '1',
    houseCode: 'H001',
    productCode: 'П-1',
    quantity: 1,
    placementId: undefined,
    master: '',
    comment: 'площ',
    status: 'ACTIVE',
    createdAt: new Date('2026-09-07T00:00:00'),
    updatedAt: new Date('2026-09-09T00:00:00'),
  };

  const placement191: Placement = {
    id: 191,
    houseCode: 'H001',
    productCode: 'П-1',
    location: {
      section: '',
      floor: 0,
      axis: '',
    },
    priority: 0,
    status: PlacementStatus.PRODUCED,
  };

  const initialSyncState: ManufacturingSyncState = {
    manufacturingId: 'М00000010',
    placementId: 191,
    status: 'SYNCED',
    sourceUpdatedAt: new Date('2026-09-08T00:00:00'),
    updatedAt: new Date('2026-09-08T00:00:00'),
  };

  const placementRepository = new TestPlacementRepository([placement191]);

  const syncStateRepository = new TestSyncStateRepository(initialSyncState);

  const service = new ManufacturingSynchronizationService(
    syncStateRepository,
    placementRepository,
  );

  // ------------------------------------------------------------
  // 1. ANALYZE
  // ------------------------------------------------------------

  const analysis = service.analyze(manufacturing);

  console.log(
    `BEFORE: status=${analysis.status}, ` + `action=${analysis.action.type}`,
  );

  if (analysis.status !== 'READY') {
    throw new Error(`Очікувався status READY, отримано ${analysis.status}.`);
  }

  if (analysis.action.type !== 'DETACH_PRODUCED') {
    throw new Error(
      `Очікувався DETACH_PRODUCED, ` + `отримано ${analysis.action.type}.`,
    );
  }

  if (analysis.action.placement.id !== 191) {
    throw new Error(
      `Очікувався Placement 191, ` +
        `отримано ${analysis.action.placement.id}.`,
    );
  }

  console.log('ANALYZE PASSED: DETACH_PRODUCED для Placement 191.');

  // ------------------------------------------------------------
  // 2. EXECUTE
  // ------------------------------------------------------------

  const result = service.execute(analysis);

  console.log(
    `EXECUTE: status=${result.status}, ` + `action=${result.action.type}`,
  );

  // ------------------------------------------------------------
  // 3. Перевіряємо Placement
  // ------------------------------------------------------------

  const updatedPlacement = placementRepository.findById(191);

  if (!updatedPlacement) {
    throw new Error('Placement 191 не знайдено після execute.');
  }

  if (updatedPlacement.status !== PlacementStatus.NONE) {
    throw new Error(
      `Placement 191 повинен бути NONE, ` +
        `отримано ${updatedPlacement.status}.`,
    );
  }

  console.log('PLACEMENT PASSED: PRODUCED → NONE.');

  // ------------------------------------------------------------
  // 4. Перевіряємо SyncState
  // ------------------------------------------------------------

  const syncState = syncStateRepository.getState();

  if (!syncState) {
    throw new Error('SyncState відсутній після execute.');
  }

  if (syncState.manufacturingId !== 'М00000010') {
    throw new Error(
      `Неправильний ManufacturingId: ` + `${syncState.manufacturingId}.`,
    );
  }

  if (syncState.placementId !== 191) {
    throw new Error(
      `SyncState повинен зберігати PlacementId 191, ` +
        `отримано ${syncState.placementId}.`,
    );
  }

  if (syncState.status !== 'NO_PLACEMENT') {
    throw new Error(
      `SyncState повинен мати статус NO_PLACEMENT, ` +
        `отримано ${syncState.status}.`,
    );
  }

  console.log('SYNC STATE PASSED: 191 / NO_PLACEMENT.');

  // ------------------------------------------------------------
  // 5. Перевіряємо Manufacturing
  // ------------------------------------------------------------

  if (manufacturing.status !== 'ACTIVE') {
    throw new Error(
      `Manufacturing повинен залишитися ACTIVE, ` +
        `отримано ${manufacturing.status}.`,
    );
  }

  if (manufacturing.placementId !== undefined) {
    throw new Error('Manufacturing не повинен мати PlacementId.');
  }

  console.log('MANUFACTURING PASSED: ACTIVE + без PlacementId.');

  // ------------------------------------------------------------
  // 6. Повторний ANALYZE
  // ------------------------------------------------------------

  const secondAnalysis = service.analyze(manufacturing);

  console.log(
    `AFTER: status=${secondAnalysis.status}, ` +
      `action=${secondAnalysis.action.type}`,
  );

  if (secondAnalysis.status !== 'NO_PLACEMENT') {
    throw new Error(
      `Після detach очікувався NO_PLACEMENT, ` +
        `отримано ${secondAnalysis.status}.`,
    );
  }

  if (secondAnalysis.action.type !== 'NONE') {
    throw new Error(
      `Після detach очікувався NONE, ` +
        `отримано ${secondAnalysis.action.type}.`,
    );
  }

  console.log('IDEMPOTENCY PASSED: повторний detach не потрібен.');

  console.log('DETACH SYNCHRONIZATION TEST PASSED.');
}
