import { ElementRow } from './element.model';
import { getValue } from '../../utils/getValue';

export function buildElementRow(
  built: any, // поки можна any, потім уточнимо
  id: string,
): ElementRow {
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

export function mapRowToElement(
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
// 👉 це:
// прибере дублювання
// уніфікує роботу з таблицею
// export function mapElementToRow(...)
// export function mapRowToElement(...)
