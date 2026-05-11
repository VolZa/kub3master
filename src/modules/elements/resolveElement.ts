import { ElementRepository } from './element.repository';
import { ElementShort } from './element.model';
import { getOrCreatePart } from '../../domain/parts/part.service';
import { getOrCreateMaterialFromPart } from '../../domain/materials/material.service';
import { getOrCreateAssembly } from './assembly.service';
import { buildByKind } from './builders/builder.dispatcher';
import { ParsedSpec } from '../bom/model/parsed-spec.model';

export function resolveElement(
  parsed: ParsedSpec,
  repo: ElementRepository,
): ElementShort {
  const built = buildByKind(parsed);

  if (built.type === 'part') {
    return getOrCreatePart(built, repo);
  }

  if (built.type === 'material') {
    return getOrCreateMaterialFromPart(built, repo);
  }

  if (built.type === 'assembly') {
    return getOrCreateAssembly(built.code, repo);
  }

  throw new Error('Unsupported type: ' + built.type);
}
