import { getValue } from '../../utils/getValue';
import { BuiltElement } from './element.builder';
import { ElementRow, ElementFull, ElementShort } from './element.model';
// import { ElementFull, ElementShort } from './element.model';

//
// 🔹 1. Sheet → ElementRow
//
export function mapSheetRowToElementRow(
  row: any[],
  map: Record<string, number>,
): ElementRow {
  return {
    ID: getValue(row, map, 'ID')!,
    Code: getValue(row, map, 'Code')!,
    Name: getValue(row, map, 'Name')!,
    Type: getValue(row, map, 'Type')!,
    Category: getValue(row, map, 'Category')!,
    BaseUnit: getValue(row, map, 'BaseUnit')!,
    ProfileType: getValue(row, map, 'ProfileType'),
    ParentMaterialID: getValue(row, map, 'ParentMaterialID'),
    Diameter: getValue(row, map, 'Diameter'),
    Class: getValue(row, map, 'Class'),
    Width: getValue(row, map, 'Width'),
    Length: getValue(row, map, 'Length'),
    Thickness: getValue(row, map, 'Thickness'),
    IsActive: getValue(row, map, 'IsActive'),
    ParentType: getValue(row, map, 'ParentType'),
    WeightPerUnit: getValue(row, map, 'WeightPerUnit'),
    Density: getValue(row, map, 'Density'),
    Comment: getValue(row, map, 'Comment'),
    CreatedAt: getValue(row, map, 'CreatedAt')!,
  };
}

//
// 🔹 2. ElementRow → Domain
//
export function mapElementRowToDomain(row: ElementRow): ElementFull {
  return {
    id: row.ID,
    code: row.Code,
    name: row.Name,
    type: row.Type as any,
    category: row.Category,
    baseUnit: row.BaseUnit,
  };
}

//
// 🔹 3. Domain → Row
//
export function mapElementToRow(el: ElementFull): ElementRow {
  return {
    ID: el.id,
    Code: el.code,
    Name: el.name,
    Type: el.type,
    Category: el.category || '',
    BaseUnit: el.baseUnit,
    CreatedAt: new Date(),
  };
}

//
// 🔹 4. Builder → Row
//
export function buildElementRow(built: BuiltElement, id: string): ElementRow {
  return {
    ID: id,
    Code: built.code,
    Name: built.name,
    Type: built.type,
    Category: built.category,
    BaseUnit: built.baseUnit,
    CreatedAt: new Date(),
  };
}

//
// 🔹 5. Assembly helper
//
export function buildAssemblyRow(id: string, code: string): ElementRow {
  return {
    ID: id,
    Code: code,
    Name: `Вузол ${code}`,
    Type: 'assembly',
    Category: 'assembly',
    BaseUnit: 'шт',
    CreatedAt: new Date(),
  };
}

export function toShort(el: ElementFull): ElementShort {
  return {
    id: el.id,
    code: el.code,
    baseUnit: el.baseUnit,
  };
}
// 👉 це:
// прибере дублювання
// уніфікує роботу з таблицею
// export function mapElementToRow(...)
// export function mapRowToElement(...)
