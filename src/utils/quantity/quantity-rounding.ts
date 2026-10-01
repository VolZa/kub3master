/**
 * src/utils/quantity/quantity-rounding.ts
 *
 * Модуль: Utils
 *
 * Відповідальність:
 * - нормалізація числових кількостей;
 * - усунення похибок floating point;
 * - округлення до заданої кількості десяткових знаків.
 */

/**
 * Округлює кількість до заданої точності.
 *
 * Приклади:
 *   31.240000000000002 → 31.24
 *   8.139999999999999  → 8.14
 *   1.563             → 1.563
 */
export function roundQuantity(value: number, decimals = 3): number {
  if (!Number.isFinite(value)) {
    throw new Error(
      `roundQuantity: value must be a finite number. Got: ${value}`,
    );
  }

  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error(
      `roundQuantity: decimals must be a non-negative integer. Got: ${decimals}`,
    );
  }

  const factor = 10 ** decimals;

  return Math.round((value + Number.EPSILON) * factor) / factor;
}
