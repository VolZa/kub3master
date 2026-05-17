import { ELEMENT_TYPES } from '../../config/config';
import { generateIdByType } from '../../utils/id';
import { ElementRepository } from './element.repository';
import { ElementFull } from './element.model';
import { buildName } from './builders/name.builder';

type MaterialRepository = Pick<ElementRepository, 'findByCode' | 'insert'>;

export function getOrCreateMaterialFromCode(
  code: string,
  repo: MaterialRepository,
): ElementFull {
  const materialCode = code
    .split('_L')[0] // 🔥 відкидаємо довжину
    .trim()
    .toUpperCase();
  console.log('Looking for material with code:', materialCode);
  const existing = repo.findByCode(materialCode);

  if (existing) {
    return existing;
  }

  const match = materialCode.match(/^R_(\d+)_([A-Z0-9]+)/);
  //   const match = materialCode.match(/^R_(\d+)_([A-Z0-9]+)(?:_L(\d+))?/);
  console.log('Regex match result:', match);
  if (!match) {
    throw new Error(`Invalid material code: ${code}`);
  }

  const diameter = Number(match[1]);
  const className = match[2];
  const length = match[3] ? Number(match[3]) : undefined;
  const name = buildName('Арматура', `Ø${diameter} ${className}`, {
    length,
  });
  const id = generateIdByType(ELEMENT_TYPES.MATERIAL);

  repo.insert({
    ID: id,
    Code: materialCode,
    Name: name,
    Type: ELEMENT_TYPES.MATERIAL,
    Category: 'rebar',
    BaseUnit: 'кг',
    ProfileType: 'round',
    ParentMaterialID: '',
    Diameter: diameter,
    Class: className,
    Width: undefined,
    Length: length,
    Thickness: undefined,
    IsActive: true,
    ParentType: '',
    WeightPerUnit: undefined,
    Density: 7850,
    Comment: '',
    CreatedAt: new Date(),
  });

  const material = repo.findByCode(materialCode);

  if (!material) {
    throw new Error(`Failed to create material: ${materialCode}`);
  }

  return material;
}
