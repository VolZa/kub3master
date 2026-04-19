import { generateIdByType } from '../../src/utils/id';
import {
  ElementType,
  ELEMENT_TYPES,
  STEEL_DENSITY,
} from '../../src/config/config';
import { calcRebarWeightPerMeter } from '../../src/utils/rebar';
import { getHeaderMap } from '../../src/utils/sheets';
import { ParsedPart } from '../../src/modules/elements/element.model';

// ================= TYPES =================

export interface ElementInput {
  type: ElementType;
  code: string;
  name: string;
  category?: string;
  baseUnit?: string;
  profileType?: string;
  diameter?: number;
  class?: string;
  width?: number;
  length?: number;
  thickness?: number;
  weightPerUnit?: number;
  density?: number;
  comment?: string;
}

export interface ElementResult {
  id: string;
  code: string;
}

// ================= HELPERS =================

function getSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName('00_Elements');

  if (!sheet) throw new Error('Sheet 00_Elements not found');

  return sheet;
}

// ================= FIND =================

export function findElementByCode(code: string): ElementResult | null {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const map = getHeaderMap(sheet);

  for (let i = 1; i < data.length; i++) {
    if (data[i][map['Code']] === code) {
      return {
        id: data[i][map['ID']],
        code: data[i][map['Code']],
      };
    }
  }

  return null;
}

// ================= CREATE =================

export function createElement(data: ElementInput): string {
  const sheet = getSheet();
  const map = getHeaderMap(sheet);

  const id = generateIdByType(data.type);

  const row = new Array(Object.keys(map).length).fill('');

  row[map['ID']] = id;
  row[map['Code']] = data.code;
  row[map['Name']] = data.name;
  row[map['Type']] = data.type;
  row[map['Category']] = data.category || '';
  row[map['BaseUnit']] = data.baseUnit || 'шт';
  row[map['ProfileType']] = data.profileType || '';

  row[map['Diameter']] = data.diameter || '';
  row[map['Class']] = data.class || '';
  row[map['Width']] = data.width || '';
  row[map['Length']] = data.length || '';
  row[map['Thickness']] = data.thickness || '';

  row[map['IsActive']] = true;
  row[map['WeightPerUnit']] = data.weightPerUnit || '';
  row[map['Density']] = data.density || '';
  row[map['Comment']] = data.comment || '';
  row[map['CreatedAt']] = new Date();

  sheet.appendRow(row);

  return id;
}

// ================= MATERIAL =================

export function getOrCreateRebarMaterial(
  diameter: number,
  rebarClass: string,
): string {
  const code = `Ø${diameter}${rebarClass}`;

  const existing = findElementByCode(code);
  if (existing) return existing.id;

  //   const weight = Number(((diameter * diameter) / 162).toFixed(3));
  const weight = calcRebarWeightPerMeter(diameter);

  return createElement({
    type: ELEMENT_TYPES.MATERIAL,
    code,
    name: `Арматура ${rebarClass} Ø${diameter}`,
    category: 'Арматура',
    baseUnit: 'м',
    profileType: 'rebar',
    diameter,
    class: rebarClass,
    weightPerUnit: weight,
    density: STEEL_DENSITY,
  });
}

function normalizeNumber(value: any): number | null {
  if (value === '' || value === null || value === undefined) return null;
  return Number(value);
}

function isSamePart(
  row: any[],
  map: Record<string, number>,
  part: ParsedPart,
): boolean {
  return (
    row[map['Type']] === ELEMENT_TYPES.PART &&
    normalizeNumber(row[map['Diameter']]) === part.diameter &&
    row[map['Class']] === part.class &&
    normalizeNumber(row[map['Length']]) === part.length
  );
}

export function getOrCreatePart(parsed: ParsedPart): ElementResult {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const map = getHeaderMap(sheet);

  // 🔍 SEARCH
  for (let i = 1; i < data.length; i++) {
    if (isSamePart(data[i], map, parsed)) {
      return {
        id: data[i][map['ID']],
        code: data[i][map['Code']],
      };
    }
  }

  // ➕ CREATE
  const id = createElement({
    type: ELEMENT_TYPES.PART,
    code: parsed.code,
    name: parsed.name,
    category: parsed.category,
    baseUnit: parsed.baseUnit,
    profileType: parsed.profileType,
    diameter: parsed.diameter,
    class: parsed.class,
    length: parsed.length,
    weightPerUnit: parsed.weightPerUnit,
  });

  return { id, code: parsed.code };
}

// ================= ASSEMBLY =================

export function getOrCreateAssembly(code: string): string {
  const existing = findElementByCode(code);
  if (existing) return existing.id;

  return createElement({
    type: 'assembly',
    code,
    name: 'Виріб ' + code,
    category: 'Виріб',
    baseUnit: 'шт',
  });
}

// function getHeaderMap(
//     sheet: GoogleAppsScript.Spreadsheet.Sheet) {
//     const headers = sheet
//         .getRange(1, 1, 1, sheet.getLastColumn())
//         .getValues()[0];

//   const map: Record<string, number> = {};
//   headers.forEach((h, i) => (map[h] = i));

//   return map;
// }

// ================= PART =================

// export function getOrCreatePart(parsed: any): ElementResult {
//   const sheet = getSheet();
//   const data = sheet.getDataRange().getValues();
//   const map = getHeaderMap(sheet);

//   for (let i = 1; i < data.length; i++) {
//     if (
//       data[i][map['Type']] === 'part' &&
//       data[i][map['Diameter']] == parsed.diameter &&
//       data[i][map['Class']] == parsed.class &&
//       data[i][map['Length']] == parsed.length
//     ) {
//       return {
//         id: data[i][map['ID']],
//         code: data[i][map['Code']],
//       };
//     }
//   }

//   const id = createElement({
//     type: 'part',
//     code: parsed.code,
//     name: parsed.name,
//     category: parsed.category,
//     baseUnit: parsed.baseUnit,
//     profileType: parsed.profileType,
//     diameter: parsed.diameter,
//     class: parsed.class,
//     length: parsed.length,
//     weightPerUnit: parsed.weightPerUnit,
//   });

//   return { id, code: parsed.code };
// }
