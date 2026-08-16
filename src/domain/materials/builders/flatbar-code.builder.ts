/**
 * ==========================================================
 * ERP КУБ
 * Module: Materials
 * File: flatbar-code.builder.ts
 * Path: src/domain/materials/builders/flatbar-code.builder.ts
 *
 * Формує канонічний Code матеріалу для полоси.
 * ==========================================================
 */

import { formatNumberForCode } from 'utils/formatNumberForCode';
import { BuiltElement } from '../../elements/built-element.model';

export function buildFlatBarMaterialCode(element: BuiltElement): string {
  if (element.width === undefined) {
    throw new Error('FlatBar width is required.');
  }

  if (element.thickness === undefined) {
    throw new Error('FlatBar thickness is required.');
  }

  return `P_${formatNumberForCode(element.width)}_${formatNumberForCode(element.thickness)}`;
}
