export function parseLength(input: string): number | undefined {
  const match = input.match(/l\s*=\s*(\d+)/i);

  return match ? Number(match[1]) : undefined;
}
