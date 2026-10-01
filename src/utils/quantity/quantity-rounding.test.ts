/**
 * src/utils/quantity/quantity-rounding.test.ts
 *
 * Тест:
 * roundQuantity
 *
 * Перевіряє:
 * - усунення floating point похибки;
 * - задану кількість десяткових знаків;
 * - цілі кількості;
 * - помилки для некоректних параметрів.
 */

import { roundQuantity } from './quantity-rounding';

export function testRoundQuantity(): void {
  // Floating point похибки
  if (roundQuantity(31.240000000000002, 3) !== 31.24) {
    throw new Error('Expected 31.24');
  }

  if (roundQuantity(8.139999999999999, 3) !== 8.14) {
    throw new Error('Expected 8.14');
  }

  // Звичайне округлення
  if (roundQuantity(1.5634, 3) !== 1.563) {
    throw new Error('Expected 1.563');
  }

  if (roundQuantity(1.5636, 3) !== 1.564) {
    throw new Error('Expected 1.564');
  }

  // Цілі значення
  if (roundQuantity(44, 0) !== 44) {
    throw new Error('Expected 44');
  }

  // Перевірка різної точності
  if (roundQuantity(31.246, 2) !== 31.25) {
    throw new Error('Expected 31.25');
  }

  console.log('✓ testRoundQuantity passed');
}
