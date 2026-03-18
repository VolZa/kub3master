function normalizeCode(input: string): string {
  Logger.log('input= ' + input);
  if (!input) return '';

  let upper = input.toUpperCase().trim();

  // нормалізація дефісів
  upper = upper.replace(/[–—−]/g, '-');

  // латиниця → кирилиця
  upper = upper.replace(/C/g, 'С');
  upper = upper.replace(/A/g, 'А');
  upper = upper.replace(/O/g, 'О');
  upper = upper.replace(/P/g, 'Р');
  upper = upper.replace(/X/g, 'Х');
  upper = upper.replace(/I/g, 'І');
  Logger.log('upper= ' + upper);
  return upper;
}
