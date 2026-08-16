/**
 * ==========================================================
 * ERP КУБ
 * Module: Materials
 * File: wire-code.builder.ts
 * Path: src/domain/materials/builders/wire-code.builder.ts
 *
 * Формує канонічний Code матеріалу для дроту.
 * ==========================================================
 */

import { formatNumberForCode } from 'utils/formatNumberForCode';
import { BuiltElement } from '../../elements/built-element.model';

export function buildWireMaterialCode(element: BuiltElement): string {
  if (element.diameter === undefined) {
    throw new Error('Wire diameter is required.');
  }

  if (!element.className) {
    throw new Error('Wire class is required.');
  }

  return `WIRE_${formatNumberForCode(element.diameter)}_${element.className}`;
}
