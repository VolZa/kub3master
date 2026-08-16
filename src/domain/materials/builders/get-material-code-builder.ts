/**
 * ==========================================================
 * ERP КУБ
 * Module: Materials
 * File: get-material-code-builder.ts
 * Path: src/domain/materials/builders/get-material-code-builder.ts
 *
 * Повертає Builder для формування канонічного коду матеріалу.
 * ==========================================================
 */

import { MaterialCategory, ProfileType } from '../../../config/config';

import { MaterialCodeBuilder } from './material-code-builder.type';

import { buildRebarMaterialCode } from './rebar-code.builder';
import { buildFlatBarMaterialCode } from './flatbar-code.builder';
import { buildAngleMaterialCode } from './angle-code.builder';
import { buildPipeMaterialCode } from './pipe-code.builder';
import { buildConcreteMixMaterialCode } from './concrete-mix-code.builder';
import { buildWireMaterialCode } from './wire-code.builder';

const builders = new Map<MaterialCategory, MaterialCodeBuilder>([
  ['wire', buildWireMaterialCode],
  ['rebar', buildRebarMaterialCode],
  ['plate', buildFlatBarMaterialCode],
  ['angle', buildAngleMaterialCode],
  ['pipe', buildPipeMaterialCode],
  //   ['cement', buildCementMaterialCode],
  ['concrete_mix', buildConcreteMixMaterialCode],
]);

export function getMaterialCodeBuilder(
  category: MaterialCategory,
): MaterialCodeBuilder {
  const builder = builders.get(category);

  if (!builder) {
    throw new Error(
      `MaterialCodeBuilder not found for ProfileType: ${category}`,
    );
  }

  return builder;
}
