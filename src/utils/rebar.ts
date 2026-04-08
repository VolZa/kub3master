export function calcRebarWeightPerMeter(diameter: number): number {
  return Number(((diameter * diameter) / 162).toFixed(3));
}
