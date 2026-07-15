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

import { House, HouseRow } from './house.model';

export function toHouse(row: HouseRow): House {
  return {
    id: row.ID,
    code: row.Code,
    name: row.Name,
    projectID: row.ProjectID,
    status: row.Status,
    customer: row.Customer,
    address: row.Address,
    comment: row.Comment,
    createdAt:
      row.CreatedAt instanceof Date ? row.CreatedAt : new Date(row.CreatedAt),
  };
}
