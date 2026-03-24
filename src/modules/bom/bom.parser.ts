// modules/bom/bom.parser.ts

import { normalizeLine } from '../../utils/normalize';
import { parseRebar } from './parsers/rebar.parser';
import { parseAngle } from './parsers/angle.parser';
import { parsePlate } from './parsers/plate.parser';

export interface ParsedSpec {
  detected: boolean;
  kind: 'rebar' | 'angle' | 'plate' | 'unknown';

  diameter?: number;
  class?: string;
  length?: number;

  width?: number;
  thickness?: number;
}

export function parseSpec(raw: string): ParsedSpec {
  const line = normalizeLine(raw);

  // 🔥 порядок важливий

  const rebar = parseRebar(line); // Арматура
  if (rebar) return rebar;

  const angle = parseAngle(line); // Кутник
  if (angle) return angle;

  const plate = parsePlate(line); // Пластина
  if (plate) return plate;

  return {
    detected: false,
    kind: 'unknown',
  };
}
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
