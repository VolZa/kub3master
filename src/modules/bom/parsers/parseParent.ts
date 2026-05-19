export function parseParent(input: string): {
  code: string;
  prefix: string;
  name: string;
} {
  const parts = input.split(';').map((p) => p.trim());

  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`Invalid parent row: ${input}`);
  }

  const prefix = parts[0];
  const code = parts[1];
  const suffix = parts[2];

  if (!prefix || !code) {
    throw new Error(`Invalid parent row: ${input}`);
  }

  return {
    code,
    prefix,
    name: [code, suffix].filter(Boolean).join(' '),
  };
}
