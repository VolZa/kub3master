import { ElementRepository } from './element.repository';
import { generateIdByType } from '../../services/id.service';
import { buildElementRow } from './element.mapper';

export function getOrCreateRebarMaterial(
  diameter: number,
  rebarClass: string,
  repo: ElementRepository,
): string {
  const code = `Ø${diameter}${rebarClass}`;

  // 🔍 1. пошук
  const existing = repo.findByCode(code);
  if (existing) {
    return existing.id;
  }

  // 🆕 2. створення
  const id = generateIdByType('material');

  const weightPerM = Number(((diameter * diameter) / 162).toFixed(3));

  const row = buildElementRow(
    {
      code,
      name: `Арматура ${rebarClass} Ø${diameter}`,
      type: 'material',
      category: 'Арматура',
      baseUnit: 'м',
      profileType: 'rebar',
      diameter,
      className: rebarClass,
      weightPerUnit: weightPerM,
      density: 7850,
    },
    id,
  );

  repo.insert(row);

  return id;
}
