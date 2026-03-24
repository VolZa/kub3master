import { ElementRow } from './element.model';

/**
 * Порядок колонок у таблиці 00_Elements
 * Це єдине джерело правди для запису
 */
export const ELEMENT_HEADERS = [
  'ID',
  'Code',
  'Name',
  'Type',
  'Category',
  'BaseUnit',
  'ProfileType',
  'ParentMaterialID',
  'Diameter',
  'Class',
  'Width',
  'Length',
  'Thickness',
  'IsActive',
  'ParentType',
  'WeightPerUnit',
  'Density',
  'Comment',
  'CreatedAt',
] as const;
