import { ParsedSpec } from '../../bom/model/parsed-spec.model';
import { BuiltElement } from '../element.builder';

import { buildRebar } from './rebar.builder';
import { buildAngle } from './angle.builder';
import { buildPlate } from './plate.builder';
import { buildPipeRound } from './pipeRound.builder';
import { buildPipeSquare } from './pipeSquare.builder';
import { buildBeam } from './beam.builder';
import { buildChannel } from './channel.builder';
import { buildConcrete } from './concrete.builder';

export function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
}

export function buildByKind(parsed: ParsedSpec): BuiltElement {
  switch (parsed.kind) {
    case 'rebar':
      return buildRebar(parsed);

    case 'angle':
      return buildAngle(parsed);

    case 'plate':
      return buildPlate(parsed);

    case 'pipe_round':
      return buildPipeRound(parsed);

    case 'pipe_square':
      return buildPipeSquare(parsed);

    case 'beam':
      return buildBeam(parsed);

    case 'channel':
      return buildChannel(parsed);
    // 🔥 ДОДАТИ ОЦЕ
    case 'assembly':
      return {
        type: 'assembly',
        code: parsed.name,
        prefixName: 'що передати сюди',
        name: parsed.name,
        baseUnit: 'шт',
        category: 'steel component',
      };
    case 'concrete':
      return buildConcrete(parsed);

    case 'unknown':
      throw new Error('Spec not recognized');

    default:
      return assertNever(parsed);
  }
}
