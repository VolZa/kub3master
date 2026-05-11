export function parseParent(input: string): { code: string; name: string } {
  const parts = input
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);

  // 🔹 1. тільки code
  if (parts.length === 1) {
    const code = parts[0];

    return {
      code,
      name: code,
    };
  }

  // 🔹 2. prefix + code
  if (parts.length === 2) {
    const [prefix, code] = parts;

    return {
      code,
      name: `${prefix} ${code}`,
    };
  }

  // 🔹 3. prefix + code + suffix
  const [prefix, code, ...rest] = parts;
  const suffix = rest.join(' ');

  return {
    code,
    name: `${prefix} ${code} ${suffix}`.trim(),
  };
}
