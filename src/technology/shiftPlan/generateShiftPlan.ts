// src/technology/shiftPlan/generateShiftPlan.ts

import { getPlacement } from 'domain/placement';
import { getProductConfigs } from 'technology/productConfig';
import { resolveCombTemplate } from 'technology/combs';
import { getShiftPlan, saveShiftPlan } from 'technology/shiftPlan';
import { getProducedPlacementIds } from 'technology/production';
import { getCrabInventory } from 'technology/crab';

import {
  getBusyForms,
  getBusyCombs,
  getUsedCrabs,
  reserveCombs,
  reserveCrab,
  isCrabAvailable,
} from './shiftPlan.utils';

/**
 * Генерація змінного плану
 */
export function generateShiftPlan(
  date: string,
  shift: number,
  limit: number = 20,
) {
  const placement = getPlacement();
  const existingPlan = getShiftPlan();

  const busyForms = getBusyForms(existingPlan, date, shift);
  const busyCombs = getBusyCombs(existingPlan, date, shift);
  const usedCrabs = getUsedCrabs(existingPlan, date, shift);

  const result: any[] = [];
  const produced = getProducedPlacementIds();

  for (const p of placement) {
    if (produced.has(p.Id)) continue; // 🔥 головна логіка
    // if (p.Status === 'done') continue; // 🔥 головна логіка

    if (result.length >= limit) break;

    const configs = getProductConfigs(p.ProductCode);

    for (const config of configs) {
      // 1. перевірка форми
      if (busyForms.has(config.FormId)) continue;

      // 2. перевірка краба
      if (!isCrabAvailable(config.CrabId, usedCrabs)) continue;

      // 3. підбір гребінок
      const combSet = resolveCombTemplate(config.CombSetTemplate, busyCombs);

      if (!combSet) continue;

      // ✔ створюємо запис
      const record = {
        Id: generateId(),
        Date: date,
        Shift: shift,
        PlacementId: p.Id,
        FormId: config.FormId,
        CombSet: combSet,
        CrabId: config.CrabId,
      };

      result.push(record);

      // резерв ресурсів
      busyForms.add(config.FormId);
      reserveCombs(busyCombs, combSet);
      reserveCrab(usedCrabs, config.CrabId);

      break;
    }
  }

  saveShiftPlan(result);
}

// простий генератор ID (поки)
function generateId(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}
