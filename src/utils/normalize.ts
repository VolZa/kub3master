export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/,/g, '')
    .replace(/×/g, 'x') // unicode ×
    .replace(/\*/g, 'x') // *
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCode(input: string): string {
  Logger.log('input= ' + input);
  if (!input) return '';

  let upper = input.toUpperCase().trim();

  // нормалізація дефісів
  upper = upper.replace(/[–—−]/g, '-');

  // латиниця → кирилиця
  upper = upper.replace(/C/g, 'С');
  upper = upper.replace(/A/g, 'А');
  upper = upper.replace(/O/g, 'О');
  upper = upper.replace(/P/g, 'Р');
  upper = upper.replace(/X/g, 'Х');
  upper = upper.replace(/I/g, 'І');
  Logger.log('upper= ' + upper);
  return upper;
}

export function normalizeLine(line: string): string {
  return line
    .trim()
    .toUpperCase()
    .replace(/Ø/g, '')
    .replace(/АРМАТУРА/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/,/g, '')
    .replace(/L\s*=\s*/g, ' ')
    .replace(/І/g, '1') // 🔥 ДОДАТИ
    .replace(/А-І\b/g, 'А1')
    .replace(/А-ІІ\b/g, 'А2')
    .replace(/А-ІІІ\b/g, 'А3')
    .replace(/ВР-?1/g, 'ВР1')
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
