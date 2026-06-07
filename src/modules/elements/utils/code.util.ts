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
