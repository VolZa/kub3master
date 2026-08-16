export function buildName(
  prefix: string,
  rawCode: string,
  options?: {
    length?: number;
    sufix?: string;
  },
): string {
  return [
    prefix,
    rawCode,
    options?.length ? `L=${options.length}` : null,
    options?.sufix ?? null,
  ]
    .filter(Boolean)
    .join(' ');
}

// name.builder.ts

export function buildElementName(prefix?: string, code?: string): string {
  return [prefix?.trim(), code?.trim()].filter(Boolean).join(' ');
}
