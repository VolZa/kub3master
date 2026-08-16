/**
 * ==========================================================
 * ERP КУБ
 * Module: Materials
 * File: pipe-code.builder.ts
 * Path: src/domain/materials/builders/pipe-code.builder.ts
 *
 * Формує канонічний Code матеріалу для труби круглої.
 * ==========================================================
 */

import { formatNumberForCode } from 'utils/formatNumberForCode';
import { BuiltElement } from '../../elements/built-element.model';

export function buildPipeMaterialCode(element: BuiltElement): string {
  if (element.diameter === undefined) {
    throw new Error('Pipe diameter is required.');
  }

  if (element.thickness === undefined) {
    throw new Error('Pipe thickness is required.');
  }

  return `PIPE_${formatNumberForCode(element.diameter)}_${formatNumberForCode(element.thickness)}`;
}
