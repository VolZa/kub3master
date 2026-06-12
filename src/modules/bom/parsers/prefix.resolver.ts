// src/modules/bom/parsers/prefix.resolver.ts

import { ParsedSpec } from '../model/parsed-spec.model';

export function extractPrefixFromSpec(parsed: ParsedSpec): string {
  switch (parsed.kind) {
    case 'rebar':
      return 'арматура';

    case 'plate':
      return 'полоса';

    case 'angle':
      return 'кутник';

    case 'pipe_round':
      return 'труба кругла';

    case 'pipe_square':
      return 'труба квадратна';

    case 'beam':
      return 'двутавр';

    case 'channel':
      return 'швелер';

    case 'assembly':
      return parsed.name.toLowerCase();

    default:
      throw new Error(`Cannot extract prefix for kind: ${parsed.kind}`);
  }
}
