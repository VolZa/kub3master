import { getValue } from '../../utils/getValue';
import { calcRebarWeight } from '../../utils/rebar';
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
    prefixName: row.PrefixName,
    name: row.Name,
    type: row.Type as any,
    category: row.Category,
    baseUnit: row.BaseUnit,
    parentMaterialID: row.ParentMaterialID, // 🔥 ДОДАТИ
    weightPerUnit: row.WeightPerUnit,
    isActive: row.IsActive ?? true, // 🔥 ОБОВʼЯЗКОВО
  };
}

//
// 🔹 3. Domain → Row
//
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

//
// 🔹 4. Builder → Row
//
// ❌ buildElementRow → зайва (deprecated)
// export function buildElementRow(
//   built: BuiltElement & { parentMaterialId?: string },
//   id: string,
// ): ElementRow {
//   return {
//     ID: id,
//     Code: built.code,
//     PrefixName: built.prefixName,
//     Name: built.name,
//     Type: built.type,
//     Category: built.category,
//     BaseUnit: built.baseUnit,

//     // 🔥 НОВЕ
//     ParentMaterialID: built.parentMaterialId,

//     Diameter: built.diameter,
//     Class: built.className,
//     Length: built.length,
//     Width: built.width,
//     Height: built.height,
//     Thickness: built.thickness,

//     WeightPerUnit:
//       built.category === 'rebar' && built.length && built.diameter
//         ? calcRebarWeight(built.length, built.diameter, 1)
//         : undefined,

//     CreatedAt: new Date(),
//   };
// }

//
// 🔹 5. Assembly helper
//
export function buildAssemblyRow(id: string, code: string): ElementRow {
  return {
    ID: id,
    Code: code,
    PrefixName: '', // 🔥 що задати для Catalog ?
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
    type: el.type, // 🔥
  };
}

export function mapRowToFull(row: any[], headers: string[]) {
  const get = (name: string) => {
    const idx = headers.indexOf(name);
    return idx !== -1 ? row[idx] : undefined;
  };
  const weightRaw = get('WeightPerUnit');

  let weightPerUnit: number | undefined;

  if (weightRaw !== undefined && weightRaw !== '') {
    const normalized = String(weightRaw)
      .replace(/\s+/g, '') // прибрати пробіли
      .replace(',', '.'); // кома → крапка

    const num = Number(normalized);

    weightPerUnit = isNaN(num) ? undefined : num;
  }
  return {
    id: String(get('ID')),
    code: get('Code'),
    prefixName: get('PrefixName'),
    name: get('Name'),
    type: get('Type'),
    category: get('Category'),
    baseUnit: get('BaseUnit'),

    parentMaterialID: get('ParentMaterialID'), // 🔥

    diameter: Number(get('Diameter')) || undefined,
    className: get('Class'),
    length: Number(get('Length')) || undefined,
    width: Number(get('Width')) || undefined,
    thickness: Number(get('Thickness')) || undefined,

    weightPerUnit: weightPerUnit,
    density: Number(get('Density')) || undefined,
  };
}
