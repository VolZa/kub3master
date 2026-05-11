import { BuiltElement } from './element.builder';
import { MaterialRepository } from './material.repository';
import { MaterialRow } from './material.model';

export function findMaterialForPart(
  part: BuiltElement,
  materialRepo: MaterialRepository,
): MaterialRow {
  if (part.category !== 'rebar') {
    throw new Error('Material lookup not implemented for: ' + part.category);
  }

  const material = materialRepo.findRebar(part.diameter!, part.className!);

  if (!material) {
    throw new Error(
      `❌ Material not found: Ø${part.diameter} ${part.className}`,
    );
  }

  return material;
}
