/**
 * ==========================================================
 * ERP КУБ
 * Module: Houses
 * File: house.mapper.ts
 * Path: src/domain/houses/house.mapper.ts
 *
 * Mapper між HouseRow та House.
 * ==========================================================
 */

import { House } from './house.model';
import { HouseRow } from '../../modules/house/house.row';

export function toHouse(row: HouseRow): House {
  let createdAt: Date;
  Logger.log('=== HouseRow ===');
  Logger.log(JSON.stringify(row));

  Logger.log(`CreatedAt value: ${JSON.stringify(row.CreatedAt)}`);
  Logger.log(`typeof: ${typeof row.CreatedAt}`);
  Logger.log(`instanceof Date: ${row.CreatedAt instanceof Date}`);

  if (row.CreatedAt instanceof Date) {
    createdAt = row.CreatedAt;
  } else if (typeof row.CreatedAt === 'string') {
    createdAt = new Date(row.CreatedAt);
  } else if (typeof row.CreatedAt === 'number') {
    createdAt = new Date(row.CreatedAt);
  } else {
    throw new Error('Invalid CreatedAt value');
  }
  return {
    id: row.ID,
    code: row.Code,
    name: row.Name,
    projectID: row.ProjectID,
    status: row.Status,
    customer: row.Customer,
    address: row.Address,
    comment: row.Comment,
    createdAt: createdAt,
    //   row.CreatedAt instanceof Date ? row.CreatedAt : new Date(row.CreatedAt),
  };
}
