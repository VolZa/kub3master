/**
 * ==========================================================
 * ERP КУБ
 * Module: Houses
 * File: house-inmemory.repository.ts
 * Path: src\domain\houses\house-inmemory.repository.ts
 *
 * Репозиторій будинків у пам'яті.
 * ==========================================================
 */

import { IHouseRepository } from './house.repository';
import { House, HouseRow } from './house.model';
import { toHouse } from './house.mapper';

export class HouseInMemoryRepository implements IHouseRepository {
  private readonly houses: House[];

  constructor(rows: HouseRow[] = []) {
    this.houses = rows.map(toHouse);
  }

  findAll(): readonly Readonly<House>[] {
    return this.houses;
  }

  findById(id: string): Readonly<House> | undefined {
    return this.houses.find((house) => house.id === id);
  }

  findByCode(code: string): Readonly<House> | undefined {
    return this.houses.find((house) => house.code === code);
  }
}
