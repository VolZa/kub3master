import { ElementType } from '../../services/moove.element';

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
  thickness?: number;
}

export function buildElementCode(parsed: ParsedSpec): string {
  return `${parsed.diameter}_${parsed.class}_${parsed.length}`;
}

export function buildElementName(parsed: ParsedSpec): string {
  return `Арматура Ø${parsed.diameter} ${parsed.class} L=${parsed.length}`;
}
