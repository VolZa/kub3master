/**
 * ==========================================================
 * ERP КУБ
 * Module: house
 * File: house.row.ts
 *
 * Path: src\modules\house\house.row.ts
 *
 * таблиці 20_Houses.
 * ==========================================================
 */

export interface HouseRow {
  ID: string;
  Code: string;
  Name: string;
  ProjectID: string;
  Status: string;
  Customer: string;
  Address: string;
  Comment: string;
  CreatedAt: string | Date;
  // CreatedAt: unknown;
}
