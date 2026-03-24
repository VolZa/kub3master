import { ElementRow } from './element.model';

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

// 👉 це:
// прибере дублювання
// уніфікує роботу з таблицею
// export function mapElementToRow(...)
// export function mapRowToElement(...)
