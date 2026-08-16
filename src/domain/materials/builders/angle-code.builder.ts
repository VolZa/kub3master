/**
 * ==========================================================
 * ERP КУБ
 * Module: Materials
 * File: angle-code.builder.ts
 * Path: src/domain/materials/builders/angle-code.builder.ts
 *
 * Формує канонічний Code матеріалу для кутника.
 * ==========================================================
 */

import { formatNumberForCode } from 'utils/formatNumberForCode';
import { BuiltElement } from '../../elements/built-element.model';

export function buildAngleMaterialCode(element: BuiltElement): string {
  if (element.width === undefined) {
    throw new Error('Angle width is required.');
  }
  if (element.height === undefined) {
    throw new Error('Angle height is required.');
  }
  if (element.thickness === undefined) {
    throw new Error('Angle thickness is required.');
  }

  return `ANGLE_${formatNumberForCode(element.width)}_${formatNumberForCode(element.height)}_${formatNumberForCode(element.thickness)}`;
}
