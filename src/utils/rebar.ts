export function calcRebarWeightPerMeter(diameter: number): number {
  return Number(((diameter * diameter) / 162).toFixed(3));
}

export function calcRebarWeight(
  lengthMm: number,
  diameter: number,
  qty: number,
): number {
  const lengthM = lengthMm / 1000;
  const wpm = calcRebarWeightPerMeter(diameter);

  return lengthM * wpm * qty;
}
