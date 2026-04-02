// modules/bom/bom.parser.ts

import { normalizeLine } from '../../../utils/normalize';
import { parseRebar } from './parseRebar';
// import { parseAngle } from './parsers/angle.parser';
import { parsePlate } from './parsePlate';
// import { ParsedSpec } from './model/parsed-spec.model';

import { ParsedSpec } from '../model/parsed-spec.model';
import { parseAngle } from './parseAngle';
// import { parseRebar } ...
// import { parsePipe } ...

export function parseSpec(input: string): ParsedSpec {
  const normalized = input.toLowerCase();

  // 1. арматура
  if (normalized.includes('a500') || normalized.includes('ø')) {
    return parseRebar(input);
  }

  // 2. кутник
  if (normalized.includes('кутник') || normalized.includes('l')) {
    return parseAngle(input);
  }

  // 3. полоса / пластина
  if (
    normalized.includes('пластина') ||
    normalized.includes('полоса') ||
    normalized.includes('лист')
  ) {
    return parsePlate(input);
  }

  // 4. труба
  if (normalized.includes('труба')) {
    // return parsePipe(input);
  }

  return { kind: 'unknown' };
}

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
