/**
 * ==========================================================
 * ERP КУБ
 * Module: House
 * File: GoogleSheetsHouseDataSource.ts
 *
 * Path: src\infrastructure\sheets\house\GoogleSheetsHouseDataSource.ts
 *
 * DataSource таблиці 20_Houses.
 * ==========================================================
 */

import { GoogleSheetsDataSource } from '../GoogleSheetsDataSource';
import { SheetKey } from '../SheetKey';
import { SheetProvider } from '../SheetProvider';

import { HouseRow } from '../../../modules/house/house.row';
import { HOUSE_HEADERS } from '../../../modules/house/house.headers';

export class GoogleSheetsHouseDataSource extends GoogleSheetsDataSource<HouseRow> {
  constructor(sheetProvider: SheetProvider) {
    super(sheetProvider, SheetKey.HOUSES, HOUSE_HEADERS);
  }
}
