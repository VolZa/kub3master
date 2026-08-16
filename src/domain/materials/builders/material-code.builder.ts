/**
 * ==========================================================
 * ERP КУБ
 * Module: Materials
 * File: material-code.builder.ts
 * Path: src/domain/materials/builders/material-code.builder.ts
 *
 * Єдина точка входу для формування канонічного Code матеріалу.
 * ==========================================================
 */

import { BuiltElement } from '../../elements/built-element.model';
import { MaterialCategory } from '../../../config/config';

import { getMaterialCodeBuilder } from './get-material-code-builder';

export function buildMaterialCode(element: BuiltElement): string {
  if (!element.category) {
    throw new Error('Material category is required.');
  }

  return getMaterialCodeBuilder(element.category)(element);
}
