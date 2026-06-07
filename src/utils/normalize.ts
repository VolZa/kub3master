import {
  normalizeNumeric,
  normalizeSpec,
} from 'modules/bom/parsers/utils/spec.utils';

export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/×/g, 'x') // unicode ×
    .replace(/\*/g, 'x') // *
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeToLatin(value: string): string {
  return value
    .toUpperCase()
    .trim()
    .replace(/А/g, 'A')
    .replace(/В/g, 'B')
    .replace(/С/g, 'C')
    .replace(/Р/g, 'P')
    .replace(/О/g, 'O')
    .replace(/І/g, 'I')
    .replace(/[–—−]/g, '-');
}

export function normalizeCode(code: string): string {
  return normalizeToLatin(code).replace(/\s+/g, '').replace(/,/g, '');
}

export function normalizeLine(line: string): string {
  return normalizeToLatin(line)
    .replace(/Ø/g, '')
    .replace(/АРМАТУРА/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/,/g, '')
    .replace(/L\s*=\s*/g, ' ')
    .replace(/А-І\b/g, 'A1')
    .replace(/А-ІІ\b/g, 'A2')
    .replace(/А-ІІІ\b/g, 'A3')
    .replace(/ВР-?1/g, 'BP1')
    .replace(/\s+/g, ' ')
    .trim();
}

// 🔹 Boolean нормалізація
export function normalizeBoolean(value: any): boolean {
  if (value === true) return true;
  if (value === false) return false;

  if (typeof value === 'string') {
    const v = value.toLowerCase().trim();

    return v === 'true' || v === '1' || v === 'yes' || v === 'y' || v === 'так';
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  return false;
}
// 🔹 Number нормалізація
export function normalizeNumberString(str: string): number {
  const normalized = str
    .replace(/\s+/g, '') // 3 390 → 3390
    .replace(',', '.'); // 0,505 → 0.505

  const num = Number(normalized);

  if (isNaN(num)) {
    throw new Error('Invalid number: ' + str);
  }

  return num;
}

export function isNumericString(str: string): boolean {
  const normalized = str.replace(/\s+/g, '').replace(',', '.');

  return normalized !== '' && !isNaN(Number(normalized));
}

// 🔹 Date нормалізація
export function parseDate(value: any): Date {
  if (!value) return new Date();

  // GAS часто вже дає Date
  if (value instanceof Date) {
    return value;
  }

  // якщо це timestamp
  if (typeof value === 'number') {
    return new Date(value);
  }

  // якщо це string
  if (typeof value === 'string') {
    const parsed = new Date(value);

    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  // fallback
  return new Date();
}

export function normalizeClassName(value: string): string {
  return normalizeToLatin(value).replace(/ВР/g, 'BP'); // специфіка сталі
}
