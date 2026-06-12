import { getValue } from '../../utils/getValue';
import { ElementRow, ElementFull, ElementShort } from './element.model';

export function mapSheetRowToElementRow(
  row: any[],
  map: Record<string, number>,
): ElementRow {
  return {
    ID: getValue(row, map, 'ID')!,
    Code: getValue(row, map, 'Code')!,
    PrefixName: getValue(row, map, 'PrefixName')!,
    Name: getValue(row, map, 'Name')!,
    Type: getValue(row, map, 'Type')!,
    Category: getValue(row, map, 'Category')!,
    BaseUnit: getValue(row, map, 'BaseUnit')!,
    ProfileType: getValue(row, map, 'ProfileType'),
    ParentMaterialID: getValue(row, map, 'ParentMaterialID'),
    Diameter: getValue(row, map, 'Diameter'),
    Class: getValue(row, map, 'Class'),
    Width: getValue(row, map, 'Width'),
    Height: getValue(row, map, 'Height'),
    Length: getValue(row, map, 'Length'),
    Thickness: getValue(row, map, 'Thickness'),
    IsActive: getValue(row, map, 'IsActive'),
    Comment: getValue(row, map, 'Comment'),
    CreatedAt: getValue(row, map, 'CreatedAt')!,
  };
}

export function mapElementRowToDomain(row: ElementRow): ElementFull {
  return {
    id: row.ID,
    code: row.Code,
    prefixName: row.PrefixName,
    name: row.Name,
    type: row.Type as any,
    category: row.Category,
    baseUnit: row.BaseUnit,
    parentMaterialID: row.ParentMaterialID,
    isActive: row.IsActive ?? true,
  };
}

export function mapElementToRow(el: ElementFull): ElementRow {
  return {
    ID: el.id,
    Code: el.code,
    PrefixName: el.prefixName,
    Name: el.name,
    Type: el.type,
    Category: el.category || '',
    BaseUnit: el.baseUnit,
    CreatedAt: new Date(),
  };
}

export function buildAssemblyRow(id: string, code: string): ElementRow {
  return {
    ID: id,
    Code: code,
    PrefixName: '',
    Name: `Вузол ${code}`,
    Type: 'assembly',
    Category: 'steel',
    BaseUnit: 'шт',
    CreatedAt: new Date(),
  };
}

export function toShort(el: ElementFull): ElementShort {
  return {
    id: el.id,
    code: el.code,
    baseUnit: el.baseUnit,
    type: el.type,
  };
}

export function mapRowToFull(row: any[], headers: string[]) {
  const get = (name: string) => {
    const idx = headers.indexOf(name);
    return idx !== -1 ? row[idx] : undefined;
  };

  return {
    id: String(get('ID')),
    code: get('Code'),
    prefixName: get('PrefixName'),
    name: get('Name'),
    type: get('Type'),
    category: get('Category'),
    baseUnit: get('BaseUnit'),

    parentMaterialID: get('ParentMaterialID'),

    diameter: Number(get('Diameter')) || undefined,
    className: get('Class'),
    length: Number(get('Length')) || undefined,
    width: Number(get('Width')) || undefined,
    thickness: Number(get('Thickness')) || undefined,
  };
}
