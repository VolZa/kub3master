import { ParsedSpec } from '../model/parsed-spec.model';

import { parseRebar } from './parseRebar';
import { parseAngle } from './parseAngle';
import { parsePlate } from './parsePlate';
import { parsePipe } from './parsePipe';
import { parseBeam } from './parseBeam';
import { parseChannel } from './parseChannel';
import { normalizePipeline } from '../normalizers/normalize.pipeline';

export function parseSpec(input: string): ParsedSpec {
  // 🔥 якщо це вже code → не чіпаємо
  if (/^[A-Z]+_\d+/.test(input)) {
    return parseFromCode(input);
  }
  // const normalized = normalize(input);
  const normalized = normalizePipeline(input);

  console.log('🧩 parseSpec input:', JSON.stringify(input));
  console.log('🧩 parseSpec normalized:', JSON.stringify(normalized));

  let parsed: ParsedSpec | null = null;

  // 🔍 пробуємо parseRebar
  parsed = parseRebar(normalized);
  if (parsed) {
    console.log('✅ matched: parseRebar', parsed);
    return parsed;
  }

  // 🔍 parseAngle
  parsed = parseAngle(normalized);
  if (parsed) {
    console.log('⚠️ matched: parseAngle', parsed);
    return parsed;
  }

  // 🔍 parsePlate
  parsed = parsePlate(normalized);
  if (parsed) {
    console.log('⚠️ matched: parsePlate', parsed);
    return parsed;
  }

  // 🔍 parsePipe
  parsed = parsePipe(normalized);
  if (parsed) {
    console.log('⚠️ matched: parsePipe', parsed);
    return parsed;
  }

  // 🔍 parseBeam
  parsed = parseBeam(normalized);
  if (parsed) {
    console.log('⚠️ matched: parseBeam', parsed);
    return parsed;
  }

  // 🔍 parseChannel
  parsed = parseChannel(normalized);
  if (parsed) {
    console.log('⚠️ matched: parseChannel', parsed);
    return parsed;
  }

  // ❌ нічого не підійшло
  console.log('❌ no parser matched');

  return {
    kind: 'assembly',
    name: input.trim(),
  };
}

export function parseFromCode(code: string): ParsedSpec {
  // 🔹 REBAR
  const rebarMatch = code.match(/^R_(\d+)_([A-Z0-9]+)(?:_L(\d+))?/);
  if (rebarMatch) {
    return {
      kind: 'rebar',
      diameter: Number(rebarMatch[1]),
      className: rebarMatch[2],
      length: rebarMatch[3] ? Number(rebarMatch[3]) : undefined,
    };
  }

  // 🔹 PLATE (мінімально)
  const plateMatch = code.match(/^P_(\d+)_([0-9]+)(?:_L(\d+))?/);
  if (plateMatch) {
    return {
      kind: 'plate',
      thickness: Number(plateMatch[1]),
      width: Number(plateMatch[2]),
      length: plateMatch[3] ? Number(plateMatch[3]) : undefined,
    };
  }

  // 🔹 FALLBACK → НЕ unknown!
  return {
    kind: 'assembly',
    name: code,
  };
}

// export function parseFromCode(code: string): ParsedSpec {
//   const rebarMatch = code.match(/^R_(\d+)_([A-Z0-9]+)(?:_L(\d+))?/);

//   if (rebarMatch) {
//     return {
//       kind: 'rebar',
//       diameter: Number(rebarMatch[1]),
//       className: rebarMatch[2],
//       length: rebarMatch[3] ? Number(rebarMatch[3]) : undefined,
//     };
//   }

//   // fallback
//   return { kind: 'unknown' };
// }
// export function parseSpec(input: string): ParsedSpec {
//   const normalized = normalize(input);
//   console.log('🧩 parseSpec input:', JSON.stringify(input));
//   console.log('🧩 parseSpec normalized:', JSON.stringify(normalized));
//   if (!parsedSuccessfully) {
//     return {
//       kind: 'assembly',
//       name: input.trim(),
//     };
//   }
//   return (
//     parseRebar(normalized) ||
//     parseAngle(normalized) ||
//     parsePlate(normalized) ||
//     parsePipe(normalized) ||
//     parseBeam(normalized) ||
//     parseChannel(normalized) || {
//       kind: 'unknown',
//     }
//   );
// }
// // modules/bom/bom.parser.ts

// import { normalizeLine } from '../../../utils/normalize';
// import { parseRebar } from './parseRebar';
// // import { parseAngle } from './parsers/angle.parser';
// import { parsePlate } from './parsePlate';
// // import { ParsedSpec } from './model/parsed-spec.model';

// import { ParsedSpec } from '../model/parsed-spec.model';
// import { parseAngle } from './parseAngle';
// // import { parseRebar } ...
// // import { parsePipe } ...

// export function parseSpec(input: string): ParsedSpec {
//   const normalized = input.toLowerCase();

//   // 1. арматура
//   if (normalized.includes('a500') || normalized.includes('ø')) {
//     return parseRebar(input);
//   }

//   // 2. кутник
//   if (normalized.includes('кутник') || normalized.includes('l')) {
//     return parseAngle(input);
//   }

//   // 3. полоса / пластина
//   if (
//     normalized.includes('пластина') ||
//     normalized.includes('полоса') ||
//     normalized.includes('лист')
//   ) {
//     return parsePlate(input);
//   }

//   // 4. труба
//   if (normalized.includes('труба')) {
//     // return parsePipe(input);
//   }

//   return { kind: 'unknown' };
// }
//=================
// export function parseSpec(raw: string): ParsedSpec {
//   const line = normalizeLine(raw);

//   // 🔥 порядок важливий

//   const rebar = parseRebar(line); // Арматура
//   if (rebar) return rebar;

//   const angle = parseAngle(line); // Кутник
//   if (angle) return angle;

//   const plate = parsePlate(line); // Пластина
//   if (plate) return plate;

//   return {
//     // detected: false,
//     kind: 'unknown',
//   };
// }
//Елементи для парсингу, які поки не потрібні, закоментував, щоб не відволікали увагу від основного

// | 'pipe'
// | 'channelBar'
// | 'lBeam'

// const pipe = parsePipe(line); // Труба
// if (pipe) return pipe;

// const channelBar = parseChannelBar(line); // Швелер
// if (channelBar) return channelBar;

// const lBeam = parseLBeam(line); // Двутавр
// if (lBeam) return lBeam;
//===================

// export function parseSpec(input: string): ParsedSpec {
//   const normalized = normalize(input);

//   console.log('🧩 parseSpec input:', JSON.stringify(input));
//   console.log('🧩 parseSpec normalized:', JSON.stringify(normalized));

//   const parsed =
//     parseRebar(normalized) ||
//     parseAngle(normalized) ||
//     parsePlate(normalized) ||
//     parsePipe(normalized) ||
//     parseBeam(normalized) ||
//     parseChannel(normalized);

//   if (!parsed) {
//     return {
//       kind: 'assembly',
//       name: input.trim(),
//     };
//   }

//   return parsed;
// }
