function normalizeRebarClass(input: string): string {
  return input
    .replace(/І/g, '1')
    .replace(/ВР-?1/i, 'A240') // або твоя логіка
    .replace(/А500С/i, 'A500C');
}
