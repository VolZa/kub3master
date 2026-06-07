import { getProductionLog } from 'technology/production';

export function getProducedPlacementIds(): Set<number> {
  const log = getProductionLog();

  const accepted = log.filter((r) => r.Accepted).map((r) => r.PlacementId);

  return new Set(accepted);
}
