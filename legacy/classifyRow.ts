//        src\modules\bom\classification\classifyRow.ts
import {
  ElementType,
  MATERIAL_CATEGORIES,
  PROFILE_TYPES,
  ProfileType,
} from '../src/config/config';
import { TableRowInput } from '../src/modules/bom/model/table-row-input.model';

export function classifyRow(row: TableRowInput): {
  type: ElementType;
  category: string;
  profileType?: ProfileType;
  baseUnit: string;
} {
  const prefix = (row.prefix || '').toLowerCase();

  // 🔥 бетон
  if (prefix.includes('бетон')) {
    return {
      type: 'material',
      category: 'concrete',
      profileType: PROFILE_TYPES.CONCRETE,
      baseUnit: 'м3',
    };
  }

  // 🔥 арматура
  if (prefix.includes('арматура')) {
    return {
      type: 'part',
      category: 'R_part',
      // profileType: PROFILE_TYPES.REBAR,
      profileType: PROFILE_TYPES.ROUND,
      baseUnit: 'шт',
    };
  }

  // 🔥 стержень
  if (prefix.includes('стержень')) {
    return {
      type: 'part',
      category: 'R_part',
      // profileType: PROFILE_TYPES.REBAR,
      profileType: PROFILE_TYPES.ROUND,
      baseUnit: 'шт',
    };
  }

  // 🔥 хомут
  if (prefix.includes('хомут')) {
    return {
      type: 'part',
      category: 'R_part',
      // profileType: PROFILE_TYPES.REBAR,
      profileType: PROFILE_TYPES.ROUND,
      baseUnit: 'шт',
    };
  }

  // 🔥 сітка
  if (prefix.includes('сітка')) {
    return {
      type: 'assembly',
      category: 'R_assembly',
      // profileType: PROFILE_TYPES.REBAR,
      profileType: PROFILE_TYPES.ROUND,
      baseUnit: 'шт',
    };
  }

  // 🔥 закладна
  if (prefix.includes('закладна')) {
    return {
      type: 'assembly',
      category: 'embedded',
      profileType: PROFILE_TYPES.PLATE,
      baseUnit: 'шт',
    };
  }

  // 🔥 default
  return {
    type: 'assembly',
    category: 'assembly',
    baseUnit: 'шт',
  };
}
