import { ElementType } from '../../config/config';
import { ParsedSpec } from '../bom/model/parsed-spec.model';

export interface BuiltElement {
  code: string;
  name: string;
  type: ElementType;
  category: string;
  baseUnit: string;

  // optional
  diameter?: number;
  length?: number;
  width?: number;
  height?: number;
  thickness?: number;
}

// ===== Code =====

export function buildElementCode(parsed: ParsedSpec): string {
  if (parsed.kind === 'rebar') {
    return `${parsed.diameter}_${parsed.className}_${parsed.length}`;
  }

  return parsed.kind; // fallback
}

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
