import { normalize } from '../../../utils/normalize';
import { normalizeNumeric, normalizeSpec } from '../parsers/utils/spec.utils';

export function normalizePipeline(input: string): string {
  if (!input) return '';

  return normalizeNumeric(
    normalizeSpec(
      normalize(input), // базова очистка
    ),
  );
}
