/**
 * Path: C:/www/26/03/kub3master-ts/src/utils/id.logic.ts
 * Module: ID generation
 * Layer: Domain
 * Responsibility: validate integer IDs and calculate the next unreserved ID without GAS.
 */
import { ElementType, ID_RANGES, ID_MIGRATION_LAST } from '../config/config';

export function normalizeIntegerId(value: unknown, context: string): number {
  if (typeof value !== 'number' &&
      !(typeof value === 'string' && /^\d+$/.test(value.trim()))) {
    throw new Error(`Некоректний ${context}`);
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 0) throw new Error(`Некоректний ${context}`);
  return id;
}

export function calculateNextId(type: ElementType, lastId: unknown, occupied: ReadonlySet<number>): number {
  if (!Object.prototype.hasOwnProperty.call(ID_RANGES, type)) throw new Error(`Невідомий тип ID: ${type}`);
  const [min, max] = ID_RANGES[type];
  const counter = normalizeIntegerId(lastId, `LastID для ${type}`);
  let greatest = Math.max(counter, min - 1, ID_MIGRATION_LAST[type] ?? min - 1);
  occupied.forEach((id) => {
    if (id >= min && id <= max) greatest = Math.max(greatest, id);
  });
  let candidate = greatest + 1;
  while (candidate <= max && occupied.has(candidate)) candidate++;
  if (candidate > max) throw new Error(`Перевищено діапазон ID для типу ${type}`);
  return candidate;
}
