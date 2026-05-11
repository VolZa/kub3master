export function normalizePrefix(prefix: string): string {
  return (
    prefix
      .toLowerCase()
      .replace(/['’]/g, '') // 🔥 прибрати апострофи

      // замінюємо різні тире на пробіл
      .replace(/[-–—]/g, ' ')

      // прибираємо все крім букв/цифр/пробілів
      .replace(/[^\p{L}\p{N}\s]/gu, '')

      // схлопуємо пробіли
      .replace(/\s+/g, ' ')

      // trim
      .trim()
  );
}
