/**
 * ==========================================================
 * ERP КУБ
 * Module: Materials
 * File: concrete-mix-code.builder.ts
 * Path: src/domain/materials/builders/concrete-mix-code.builder.ts
 *
 * Формує канонічний Code бетонної суміші.
 * ==========================================================
 */

import { BuiltElement } from '../../elements/built-element.model';

export function buildConcreteMixMaterialCode(element: BuiltElement): string {
  if (!element.className) {
    throw new Error('Concrete mix class is required.');
  }

  return normalizeConcreteClass(element.className);
}

/**
 * C20/25
 * C 20/25
 * c20/25
 * 20/25
 *
 * →
 *
 * C_20_25
 */
function normalizeConcreteClass(value: string): string {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^C?/, 'C')
    .replace('/', '_');

  return normalized.replace(/^C/, 'C_');
}
