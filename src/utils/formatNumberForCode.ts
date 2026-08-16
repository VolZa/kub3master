/**
 * ==========================================================
 * ERP КУБ
 * Module: Utils
 * File: formatNumberForCode.ts
 * Path: src/utils/formatNumberForCode.ts
 *
 * Форматує число для використання у канонічному Code ERP.
 *
 * Правила:
 *  - десятковий роздільник завжди "."
 *  - локаль користувача не враховується
 *  - зайві нулі після коми видаляються
 * ==========================================================
 */

export function formatNumberForCode(value: number): string {
  return value.toString();
}
