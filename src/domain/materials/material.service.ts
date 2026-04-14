import { ElementShort } from '../../modules/elements/element.model';
import { ElementRepository } from '../../modules/elements/element.repository';
import { ELEMENT_TYPES } from '../../config/config';
import {
  addElementToCache,
  getElementFromCache,
} from '../../services/cache.service';
import { generateIdByType } from '../../utils/id';
import { BuiltElement } from '../../modules/elements/element.builder';
import { calcRebarWeightPerMeter } from '../../utils/rebar';

export function getOrCreateMaterialFromPart(
  part: BuiltElement,
  repo: ElementRepository,
): ElementShort {
  // 🔥 тільки для арматури поки
  if (part.category !== 'rebar') {
    throw new Error('Material builder not implemented for: ' + part.category);
  }

  const code = ['R', part.diameter, part.className].filter(Boolean).join('_');

  const cached = getElementFromCache(code);
  if (cached) return cached;

  const existing = repo.findByCode(code);
  if (existing) {
    const short: ElementShort = {
      id: existing.id,
      code: existing.code,
      baseUnit: existing.baseUnit,
    };

    addElementToCache(short);
    return short;
  }

  const id = generateIdByType(ELEMENT_TYPES.MATERIAL);

  // repo.insert({
  //   ID: id,
  //   Code: code,
  //   Name: `Арматура Ø${part.diameter} ${part.className ?? ''}`,
  //   Type: ELEMENT_TYPES.MATERIAL,
  //   Category: 'rebar',
  //   BaseUnit: 'кг',
  //   CreatedAt: new Date(),
  // });

  repo.insert({
    ID: id,
    Code: code,
    Name: `Арматура Ø${part.diameter} ${part.className ?? ''}`,
    Type: ELEMENT_TYPES.MATERIAL,
    Category: 'rebar',
    BaseUnit: 'кг',

    // 🔥 ДОДАТИ
    Diameter: part.diameter,
    Class: part.className,
    WeightPerUnit: calcRebarWeightPerMeter(part.diameter!),
    Density: 7850, // стандарт для сталі

    CreatedAt: new Date(),
  });

  const short: ElementShort = {
    id,
    code,
    baseUnit: 'кг',
  };

  addElementToCache(short);

  return short;
}

// export function getOrCreateMaterialFromPart(
//   part: {
//     code: string;
//     diameter?: number;
//     className?: string;
//   },
//   repo: ElementRepository,
// ): ElementShort {
//   // 🔥 формуємо код матеріалу (без length)
//   const code = ['R', part.diameter, part.className].filter(Boolean).join('_');

//   // 🔥 cache
//   const cached = getElementFromCache(code);
//   if (cached) return cached;

//   // 🔍 repo
//   const existing = repo.findByCode(code);
//   if (existing) {
//     const short = {
//       id: existing.id,
//       code: existing.code,
//       baseUnit: existing.baseUnit,
//     };

//     addElementToCache(short);
//     return short;
//   }

//   // 🆕 create
//   const id = generateIdByType(ELEMENT_TYPES.MATERIAL);

//   repo.insert({
//     ID: id,
//     Code: code,
//     Name: `Арматура Ø${part.diameter} ${part.className ?? ''}`,
//     Type: ELEMENT_TYPES.MATERIAL,
//     Category: 'rebar',
//     BaseUnit: 'кг',
//     CreatedAt: new Date(),
//   });

//   const short: ElementShort = {
//     id,
//     code,
//     baseUnit: 'кг',
//   };

//   addElementToCache(short);

//   return short;
// }
