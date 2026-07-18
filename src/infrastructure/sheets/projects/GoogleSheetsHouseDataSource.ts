/**
 * ==========================================================
 * ERP КУБ
 * Module: Projects
 * File: GoogleSheetsHouseDataSource.ts
 * Path: src/infrastructure/sheets/projects/GoogleSheetsHouseDataSource.ts
 *
 * DataSource таблиці 20_Houses.
 * ==========================================================
 */

import { HouseRow } from 'domain/houses/house.model';
import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

export class GoogleSheetsHouseDataSource extends GoogleSheetsDataSource<HouseRow> {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.HOUSES);
  }
}
