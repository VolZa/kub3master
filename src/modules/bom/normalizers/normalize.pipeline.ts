import { normalize } from '../../../utils/normalize';
import { normalizeNumeric, normalizeSpec } from '../parsers/utils/spec.utils';

// export function normalizePipeline(input: string): string {
//   if (!input) return '';

//   return normalizeNumeric(
//     normalizeSpec(
//       normalize(input), // базова очистка
//     ),
//   );
// }
export function normalizePipeline(input: string): string {
  if (!input) return '';

  const step1 = normalize(input);

  const step2 = step1.toUpperCase().replace(/BP[-\s]?[IІ]/g, 'BP1'); // 🔥 ТУТ

  const step3 = normalizeSpec(step2);

  return normalizeNumeric(step3);
}
