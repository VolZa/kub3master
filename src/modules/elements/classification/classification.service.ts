import { Classification } from '../../elements/types/classification';
import { normalizePrefix } from '../../../utils/string.utils';

export function classifyByPrefix(prefix: string): Classification | null {
  const p = normalizePrefix(prefix);

  // 🔥 бетон
  if (p === 'бетон') {
    return {
      type: 'material',
      category: 'concrete',
      baseUnit: 'м3',
    };
  }

  // 🔥 закладна деталь
  if (p.includes('закладна деталь')) {
    return {
      type: 'part',
      category: 'steel',
      baseUnit: 'шт',
      profileType: 'plate',
    };
  }

  // 🔥 виріб з'єднувальний
  if (p.includes("виріб з'єднувальний")) {
    return {
      type: 'part',
      category: 'steel',
      baseUnit: 'шт',
      profileType: 'angle',
    };
  }

  // 🔹 part (арматура)
  if (p.includes('стержень') || p.includes('хомут') || p.includes('петля')) {
    return {
      type: 'part',
      category: 'rebar',
      baseUnit: 'шт',
    };
  }

  // 🔹 assembly
  if (p.includes('каркас') || p.includes('сітка')) {
    return {
      type: 'assembly',
      category: 'steel component',
      baseUnit: 'шт',
    };
  }

  return null;
}
