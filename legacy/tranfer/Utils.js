import { ID_RANGES } from '../config/config';
import { getSheetByNameSafe } from '../services/sheets.service';

//Створення карти заголовків
//експортовано в src/utils/sheets.ts
function getHeaderMap(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => (map[h] = i));
  return map;
}

function normalizeCode(input) {
  Logger.log('input= ' + input);
  if (!input) return '';

  let upper = input.toUpperCase().trim();

  // нормалізація дефісів
  upper = upper.replace(/[–—−]/g, '-');

  // латиниця → кирилиця
  upper = upper.replace(/C/g, 'С');
  upper = upper.replace(/A/g, 'А');
  upper = upper.replace(/O/g, 'О');
  upper = upper.replace(/P/g, 'Р');
  upper = upper.replace(/X/g, 'Х');
  upper = upper.replace(/I/g, 'І');
  Logger.log('upper= ' + upper);
  return upper;
}

//Форматування певних колонок таблиці 00_Elements
//запустити вручну в разі збою форматування
function setupElementSheetFormats() {
  const sheet = getSheetByNameSafe('00_Elements');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const map = {};
  headers.forEach((h, i) => (map[h] = i));

  const lastRow = sheet.getMaxRows();

  const intFields = ['Diameter', 'Length', 'Width', 'Thickness', 'Density'];
  const decimalFields = ['WeightPerUnit'];

  intFields.forEach((field) => {
    if (map[field] !== undefined) {
      sheet.getRange(2, map[field] + 1, lastRow - 1).setNumberFormat('0');
    }
  });

  decimalFields.forEach((field) => {
    if (map[field] !== undefined) {
      sheet.getRange(2, map[field] + 1, lastRow - 1).setNumberFormat('0.000');
    }
  });
}

//Створення ID для елемента
function generateIdByType(type) {
  const configSheet = getSheetByNameSafe('_Config_ID_Counters');
  if (!configSheet) throw new Error('Лист _Config_ID_Counters не знайдено');

  const data = configSheet
    .getRange(2, 1, configSheet.getLastRow() - 1, 2)
    .getValues();

  const ranges = ID_RANGES;

  if (!ranges[type]) {
    throw new Error('Невідомий тип: ' + type);
  }

  const [min, max] = ranges[type];

  for (let i = 0; i < data.length; i++) {
    if (data[i][0] === type) {
      let lastId = Number(data[i][1]);
      let newId = lastId + 1;

      if (newId > max) {
        throw new Error('Перевищено діапазон ID для типу ' + type);
      }

      // оновлюємо Last_ID
      configSheet.getRange(i + 2, 2).setValue(newId);

      return newId;
    }
  }

  throw new Error('Тип не знайдено в _Config_ID_Counters');
}

// function testNormalize() {
//   normalizeCode("Арматура Ø 8А-І (А-240), L=240
// Арматура Ø8А-I,L=240");
// }
