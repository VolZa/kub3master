// src/technology/shiftPlan/shiftPlan.utils.ts
import { getCrabInventory } from 'technology/crab';
export function getBusyForms(
  plan: any[],
  date: string,
  shift: number,
): Set<number> {
  return new Set(
    plan
      .filter((p) => p.Date === date && p.Shift === shift)
      .map((p) => p.FormId),
  );
}

export function getBusyCombs(
  plan: any[],
  date: string,
  shift: number,
): Set<number> {
  const set = new Set<number>();

  plan
    .filter((p) => p.Date === date && p.Shift === shift)
    .forEach((p) => {
      if (!p.CombSet) return;

      p.CombSet.split('+').forEach((id: string) => {
        set.add(Number(id));
      });
    });

  return set;
}

export function reserveCombs(busy: Set<number>, combSet: string) {
  combSet.split('+').forEach((id) => busy.add(Number(id)));
}

export function getUsedCrabs(
  plan: any[],
  date: string,
  shift: number,
): Map<string, number> {
  const map = new Map<string, number>();

  plan
    .filter((p) => p.Date === date && p.Shift === shift)
    .forEach((p) => {
      map.set(p.CrabId, (map.get(p.CrabId) || 0) + 1);
    });

  return map;
}

export function reserveCrab(map: Map<string, number>, crabId: string) {
  map.set(crabId, (map.get(crabId) || 0) + 1);
}

export function isCrabAvailable(
  crabId: string,
  used: Map<string, number>,
): boolean {
  const inventory = getCrabInventory();
  const total = inventory.find((c) => c.CrabId === crabId)?.Qty || 0;
  const usedQty = used.get(crabId) || 0;

  return usedQty < total;
}
