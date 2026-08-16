// src\domain\elements\built-element.model.ts

import { MaterialCategory } from 'config/config';
import { ParsedSpec } from '../../modules/bom/model/parsed-spec.model';

export type BuiltElement = {
  code: string;
  prefixName: string;
  name: string;
  // 🔥 ДОДАТИ
  category?: MaterialCategory; // rebar, plate, angle...
  // 🔹 геометрія (опційно)
  diameter?: number;
  length?: number;
  className?: string;

  width?: number;
  height?: number;
  thickness?: number;

  profileType?: string; // 🔥 ДОДАТИ
};

export type BuiltElementExtended = BuiltElement & {
  projectDocumentID?: string; // 🔥 ДОДАВ
  parentMaterialId?: string;
};

// export function buildElementCode(parsed: ParsedSpec): string {
//   throw new Error('❌ DO NOT USE buildElementCode(parsed)');
// }

//Після рефакторингу, функція buildElementCodeFromParsed має зникнути.
// Його місце займуть

// MaterialCodeBuilder

// PartCodeBuilder
// export function buildElementCodeFromParsed(parsed: ParsedSpec): string {
//   if (parsed.kind === 'rebar') {
//     const base = `R_${parsed.diameter}_${parsed.className}`;

//     return parsed.length ? `${base}, L=${parsed.length}` : base;
//   }

//   return parsed.kind;
// }

// ===== Name =====

export function buildElementName(parsed: ParsedSpec): string {
  if (parsed.kind === 'rebar') {
    return `Арматура Ø${parsed.diameter} ${parsed.className} L=${parsed.length}`;
  }

  if (parsed.kind === 'pipe_square') {
    return `Труба ${parsed.width}x${parsed.height}x${parsed.thickness}`;
  }

  if (parsed.kind === 'pipe_round') {
    return `Труба Ø${parsed.diameter}x${parsed.thickness}`;
  }

  if (parsed.kind === 'angle') {
    return `Кутник ${parsed.width}x${parsed.width}x${parsed.thickness}`;
  }

  if (parsed.kind === 'channel') {
    return `Швелер ${parsed.height}`;
  }

  if (parsed.kind === 'beam') {
    return `Двутавр ${parsed.height}`;
  }

  return 'Невідомий елемент';
}
