import { ElementRepository } from './element.repository';
import { Element } from './element.model';
import { ElementShort } from '../../modules/elements/element.model';

export function getOrCreateMaterialFromCode(
  code: string,
  repo: ElementRepository,
): Element {
  // 🔹 1. нормалізуємо
  const normalizedCode = code.trim().toUpperCase();

  // 🔹 2. шукаємо
  const existing = repo.findByCode(normalizedCode);

  if (existing) {
    return existing;
  }

  // 🔹 3. парсимо код (R_12_A500C)
  const match = normalizedCode.match(/^R_(\d+)_([A-Z0-9]+)/);

  if (!match) {
    throw new Error(`❌ Invalid material code: ${code}`);
  }

  const diameter = Number(match[1]);
  const className = match[2];

  // 🔹 4. формуємо назву
  const name = `Арматура Ø${diameter} ${className}`;

  // 🔹 5. створюємо material
  const material = repo.create({
    code: normalizedCode,
    name,

    type: 'material',
    category: 'rebar',
    profileType: 'rebar',

    baseUnit: 'кг',

    diameter,
    class: className,

    isActive: true,
  });

  return material;
}
