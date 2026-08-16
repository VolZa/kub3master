/**
 * ==========================================================
 * ERP КУБ
 * Module: Materials
 * File: rebar-code.builder.ts
 * Path: src/domain/materials/builders/rebar-code.builder.ts
 *
 * Формує канонічний Code матеріалу для арматури.
 * ==========================================================
 */

import { formatNumberForCode } from 'utils/formatNumberForCode';
import { BuiltElement } from '../../elements/built-element.model';

export function buildRebarMaterialCode(element: BuiltElement): string {
  if (element.diameter === undefined) {
    throw new Error('Rebar diameter is required.');
  }

  if (!element.className) {
    throw new Error('Rebar class is required.');
  }

  return `R_${formatNumberForCode(element.diameter)}_${element.className}`;
}
