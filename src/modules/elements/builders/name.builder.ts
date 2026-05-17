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
