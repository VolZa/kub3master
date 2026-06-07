// src/technology/combs/resolveCombTemplate.ts

export function resolveCombTemplate(
  template: string | null,
  busy: Set<number>,
): string | null {
  if (!template) return null;

  const groups = template.split('+').map((g) => g.split('/').map(Number));

  const result: number[] = [];

  for (const group of groups) {
    const found = group.find((id) => !busy.has(id));

    if (!found) return null;

    result.push(found);
  }

  return result.join('+');
}
