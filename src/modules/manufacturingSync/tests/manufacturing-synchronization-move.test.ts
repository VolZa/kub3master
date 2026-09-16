/**
 * ERP КУБ
 * Module: Manufacturing Synchronization
 * Layer: Test
 * File: manufacturing-synchronization-move.test.ts
 * Path: src/modules/manufacturingSync/tests/manufacturing-synchronization-move.test.ts
 *
 * Тест сценарію MOVE_PRODUCED:
 * Manufacturing змінює Placement 185 → 191.
 *
 * Перевіряємо:
 * 1. analyze() визначає MOVE_PRODUCED.
 * 2. execute() скидає старий Placement.
 * 3. execute() позначає новий Placement PRODUCED.
 * 4. SyncState переноситься з 185 на 191.
 * 5. повторний analyze() повертає NONE.
 */

import { Manufacturing } from '../../../domain/manufacturing/manufacturing.model';
import { Placement } from '../../../domain/placement/placement.model';
import { PlacementStatus } from '../../../domain/placement/placement.status';
import { ManufacturingSyncState } from '../../../domain/manufacturing-sync/manufacturing-sync-state.model';
import { IManufacturingSyncStateRepository } from '../../../domain/manufacturing-sync/manufacturing-sync-state.repository.interface';
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

  public getAll(): ManufacturingSyncState[] {
    return this.state ? [this.state] : [];
  }

  public replaceAll(states: ManufacturingSyncState[]): void {
    this.state = states[0] ?? null;
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
    return this.items.filter((item) => {
      if (item.scheduledDate?.getTime() !== date.getTime()) {
        return false;
      }

      // У поточній моделі Placement поле shift відсутнє.
      // Для цього тесту параметр shift не використовується.
      return shift === undefined;
    });
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

export function testManufacturingSynchronizationMove(): void {
  const manufacturing: Manufacturing = {
    id: 'М00000010',
    date: new Date('2026-06-17'),
    shift: '1',
    houseCode: 'H001',
    productCode: 'П-1',
    quantity: 1,
    placementId: 191,
    master: '',
    comment: 'площ',
    status: 'ACTIVE',
    createdAt: new Date('2026-09-07T00:00:00'),
    updatedAt: new Date('2026-09-08T00:00:00'),
  };

  const placement185: Placement = {
    id: 185,
    houseCode: 'H001',
    productCode: 'П-1',
    location: {
      section: '1',
      floor: 2,
      axis: 'Б-2',
    },
    priority: 0,
    status: PlacementStatus.PRODUCED,
  };

  const placement191: Placement = {
    id: 191,
    houseCode: 'H001',
    productCode: 'П-1',
    location: {
      section: '1',
      floor: 2,
      axis: 'Б-7',
    },
    priority: 0,
    status: PlacementStatus.NONE,
  };

  const initialSyncState: ManufacturingSyncState = {
    manufacturingId: 'М00000010',
    placementId: 185,
    status: 'SYNCED',
    sourceUpdatedAt: new Date('2026-09-08T00:00:00'),
    updatedAt: new Date('2026-09-08T00:00:00'),
  };

  const placementRepository = new TestPlacementRepository([
    placement185,
    placement191,
  ]);

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
    `BEFORE: status=${analysis.status}, action=${analysis.action.type}`,
  );

  if (analysis.status !== 'READY') {
    throw new Error(`Очікувався status READY, отримано ${analysis.status}.`);
  }

  if (analysis.action.type !== 'MOVE_PRODUCED') {
    throw new Error(
      `Очікувався MOVE_PRODUCED, отримано ${analysis.action.type}.`,
    );
  }

  if (analysis.action.from.id !== 185) {
    throw new Error(
      `Очікувався старий Placement 185, отримано ${analysis.action.from.id}.`,
    );
  }

  if (analysis.action.to.id !== 191) {
    throw new Error(
      `Очікувався новий Placement 191, отримано ${analysis.action.to.id}.`,
    );
  }

  console.log('ANALYZE PASSED: MOVE_PRODUCED 185 → 191.');

  // ------------------------------------------------------------
  // 2. EXECUTE
  // ------------------------------------------------------------

  const result = service.execute(analysis);

  console.log(`EXECUTE: status=${result.status}, action=${result.action.type}`);

  // ------------------------------------------------------------
  // 3. Перевіряємо Placement 185
  // ------------------------------------------------------------

  const updated185 = placementRepository.findById(185);

  if (!updated185) {
    throw new Error('Placement 185 не знайдено після execute.');
  }

  if (updated185.status !== PlacementStatus.NONE) {
    throw new Error(
      `Placement 185 повинен бути NONE, отримано ${updated185.status}.`,
    );
  }

  console.log('PLACEMENT 185 PASSED: PRODUCED → NONE.');

  // ------------------------------------------------------------
  // 4. Перевіряємо Placement 191
  // ------------------------------------------------------------

  const updated191 = placementRepository.findById(191);

  if (!updated191) {
    throw new Error('Placement 191 не знайдено після execute.');
  }

  if (updated191.status !== PlacementStatus.PRODUCED) {
    throw new Error(
      `Placement 191 повинен бути PRODUCED, отримано ${updated191.status}.`,
    );
  }

  console.log('PLACEMENT 191 PASSED: NONE → PRODUCED.');

  // ------------------------------------------------------------
  // 5. Перевіряємо SyncState
  // ------------------------------------------------------------

  const syncState = syncStateRepository.getState();

  if (!syncState) {
    throw new Error('SyncState відсутній після execute.');
  }

  if (syncState.manufacturingId !== 'М00000010') {
    throw new Error(
      `Неправильний ManufacturingId: ${syncState.manufacturingId}.`,
    );
  }

  if (syncState.placementId !== 191) {
    throw new Error(
      `SyncState повинен вказувати на Placement 191, ` +
        `отримано ${syncState.placementId}.`,
    );
  }

  if (syncState.status !== 'SYNCED') {
    throw new Error(
      `SyncState повинен мати статус SYNCED, ` +
        `отримано ${syncState.status}.`,
    );
  }

  console.log('SYNC STATE PASSED: М00000010 → Placement 191 / SYNCED.');

  // ------------------------------------------------------------
  // 6. Повторний ANALYZE — перевірка ідемпотентності
  // ------------------------------------------------------------

  const secondAnalysis = service.analyze(manufacturing);

  console.log(
    `AFTER: status=${secondAnalysis.status}, ` +
      `action=${secondAnalysis.action.type}`,
  );

  if (secondAnalysis.status !== 'READY') {
    throw new Error(
      `Після синхронізації очікувався READY, ` +
        `отримано ${secondAnalysis.status}.`,
    );
  }

  if (secondAnalysis.action.type !== 'NONE') {
    throw new Error(
      `Після синхронізації очікувався NONE, ` +
        `отримано ${secondAnalysis.action.type}.`,
    );
  }

  console.log('IDEMPOTENCY PASSED: повторна синхронізація не потрібна.');

  console.log('MOVE SYNCHRONIZATION TEST PASSED: 185 → 191.');
}
