/**
 * Path: C:/www/26/03/kub3master-ts/src/utils/id.ts
 * Module: ID generation
 * Layer: Infrastructure
 * Responsibility: reserve unique MASTER IDs under a script-wide lock.
 */
import { ElementType } from '../config/config';
import { SpreadsheetProvider } from '../infrastructure/spreadsheets/SpreadsheetProvider';
import { SpreadsheetKey } from '../infrastructure/spreadsheets/SpreadsheetKey';
import { calculateNextId, normalizeIntegerId } from './id.logic';

function requireSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, name: string) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Лист ${name} не знайдено в MASTER`);
  return sheet;
}

function readCounter(sheet: GoogleAppsScript.Spreadsheet.Sheet, type: ElementType) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('_Config_ID_Counters порожній');
  const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const matches = rows.map((row, index) => ({ row, index })).filter(({ row }) => row[0] === type);
  if (!matches.length) throw new Error(`Тип ${type} не знайдено в _Config_ID_Counters`);
  if (matches.length !== 1) throw new Error(`Дублікати типу ${type} в _Config_ID_Counters`);
  return { row: matches[0].index + 2, lastId: matches[0].row[1] };
}

function readOccupiedIds(sheet: GoogleAppsScript.Spreadsheet.Sheet): number[] {
  const [headers, ...rows] = sheet.getDataRange().getValues();
  const columns = headers?.reduce<number[]>((result, header, index) => {
    if (header === 'ID') result.push(index);
    return result;
  }, []) ?? [];
  if (columns.length !== 1) throw new Error(`Некоректна колонка ID в ${sheet.getName()}`);
  return rows.flatMap((row, index) => {
    const value = row[columns[0]];
    if (value === '' || value === null || value === undefined) return [];
    return [normalizeIntegerId(value, `${sheet.getName()}: ID рядка ${index + 2}`)];
  });
}

export function generateIdByType(type: ElementType): string {
  // Script lock also works outside a bound spreadsheet (e.g. web app execution).
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Не вдалося отримати lock для резервування ID');
  try {
    const ss = new SpreadsheetProvider().open(SpreadsheetKey.MASTER);
    const sheet = requireSheet(ss, '_Config_ID_Counters');
    const counter = readCounter(sheet, type);
    const occupied = new Set([
      ...readOccupiedIds(requireSheet(ss, '00_Elements')),
      ...readOccupiedIds(requireSheet(ss, '05_Materials')),
    ]);
    const id = calculateNextId(type, counter.lastId, occupied);
    sheet.getRange(counter.row, 2).setValue(id);
    SpreadsheetApp.flush();
    return String(id);
  } finally {
    lock.releaseLock();
  }
}
