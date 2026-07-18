/**
 * ==========================================================
 * ERP КУБ
 * Module: Houses
 * File: house.repository.ts
 * Path: src\domain\houses\house.repository.ts
 *
 * Контракт репозиторію будинків.
 * ==========================================================
 */

import { House } from './house.model';

export interface IHouseRepository {
  /**
   * Повернути всі будинки.
   */
  findAll(): readonly Readonly<House>[];

  /**
   * Знайти будинок за ID.
   */
  findById(id: string): Readonly<House> | undefined;

  /**
   * Знайти будинок за кодом.
   */
  findByCode(code: string): Readonly<House> | undefined;
}
