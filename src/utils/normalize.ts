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
