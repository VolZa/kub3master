export function generateCodeFromSpec(prefixName: string, spec: string): string {
  const normalizedSpec = spec
    .trim()
    .toUpperCase()
    .replace(/Ø/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const prefix = prefixName.toUpperCase().replace(/\s+/g, '_');

  return `${prefix}_${normalizedSpec}`;
}

export function normalizeMaterialCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/BP1/g, 'BP-1') // 🔥 ключ
    .replace(/А/g, 'A')
    .replace(/ВР/g, 'BP')
    .replace(/І/g, '1')
    .replace(/-/g, '-') // на майбутнє
    .trim();
}
