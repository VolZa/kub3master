/**
 * ==========================================================
 * ERP КУБ
 * Module: Houses
 * File: house.model.ts
 * Path: src/domain/houses/house.model.ts
 *
 * Доменна модель будинку.
 * Відповідає таблиці Google Sheets: 20_Houses.
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
}

export interface House {
  id: string;
  code: string;
  name: string;
  projectID: string;
  status: string;
  customer: string;
  address: string;
  comment: string;
  createdAt: Date;
}
