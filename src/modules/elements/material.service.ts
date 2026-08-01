// src\modules\elements\material.service.ts

import { ELEMENT_TYPES } from '../../config/config';
import { generateIdByType } from '../../utils/id';
import { ElementRepository } from './element.repository';
import { ElementFull } from './element.model';
import { buildName } from './builders/name.builder';

type MaterialRepository = Pick<ElementRepository, 'findByCode' | 'insert'>;

export function getOrCreateMaterialFromCode(
  code: string,
  // projectDocumentID: string,
  repo: MaterialRepository,
): ElementFull {
  const materialCode = code.split('_L')[0].trim().toUpperCase();

  console.log('Looking for material with code:', materialCode);
  const existing = repo.findByCode(materialCode);

  if (existing) {
    return existing;
  }

  const match = materialCode.match(/^R_(\d+)_([A-Z0-9]+)/);
  console.log('Regex match result:', match);

  if (!match) {
    throw new Error(`Invalid material code: ${code}`);
  }

  const diameter = Number(match[1]);
  const className = match[2];
  const name = buildName('Арматура', `Ø${diameter} ${className}`);
  const id = generateIdByType(ELEMENT_TYPES.MATERIAL);

  repo.insert({
    ID: id,
    PrefixName: '', // 🔥 для Catalog тимчасово
    Code: materialCode,
    //PrefixName: 'арматура', // 🔥 для Catalog
    Name: name,
    Type: ELEMENT_TYPES.MATERIAL,
    Category: 'rebar',
    BaseUnit: 'кг',
    ProfileType: 'round',
    // ProjectDocumentID: projectDocumentID,
    ParentMaterialID: '',
    Diameter: diameter,
    Class: className,
    Width: undefined,
    Length: undefined,
    Thickness: undefined,
    IsActive: true,
    Comment: '',
    CreatedAt: new Date(),
  });

  const material = repo.findByCode(materialCode);

  if (!material) {
    throw new Error(`Failed to create material: ${materialCode}`);
  }

  return material;
}
