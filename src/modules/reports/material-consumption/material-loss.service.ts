import type { MaterialRepository } from '../../../domain/materials/material.repository';
import type { MaterialLossGroup, MaterialLossPercents, MaterialLossResult } from '../../../domain/materials/material-loss.model';
import type { MaterialRequirement } from '../../bom/model/material-requirement.model';

const groups: readonly MaterialLossGroup[] = [
  { code: 'REBAR', categories: ['rebar'] },
  { code: 'ROLLED', categories: ['plate', 'angle', 'pipe'] },
  { code: 'CONCRETE', categories: ['concrete_mix'] },
];
const keys = { REBAR: 'rebar', ROLLED: 'rolled', CONCRETE: 'concrete' } as const;

/** Apply once, after clean BOM requirements have been aggregated for reporting.
 * No unit conversion, rounding, persistence or reference-norm fallback.
 */
export class MaterialLossService {
  constructor(private readonly materials: Pick<MaterialRepository, 'findById'>) {}

  apply(requirements: readonly Readonly<MaterialRequirement>[], lossPercents: MaterialLossPercents): MaterialLossResult[] {
    // Runtime boundary also protects JavaScript callers and deserialized results.
    for (const row of requirements) {
      if ('stage' in row || 'lossQty' in row || 'totalQty' in row) {
        throw new Error('LOSSES_ALREADY_APPLIED: expected clean MaterialRequirement');
      }
    }
    for (const key of Object.values(keys)) {
      const value = lossPercents?.[key];
      if (value === undefined || value === null) throw new Error(`MISSING_LOSS_NORM: ${key}`);
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
        throw new Error(`INVALID_LOSS_NORM: ${key}`);
      }
    }
    return requirements.map(row => {
      if (!Number.isFinite(row.qty) || row.qty < 0 || !row.unit?.trim()) throw new Error(`INVALID_BASE_REQUIREMENT: ${row.materialId}`);
      const material = this.materials.findById(row.materialId);
      if (!material) throw new Error(`MATERIAL_NOT_FOUND: ${row.materialId}`);
      const group = groups.find(g => g.categories.includes(material.category));
      if (!group) throw new Error(`UNDEFINED_LOSS_GROUP: ${row.materialId} (${material.category})`);
      const lossPercent = lossPercents[keys[group.code]];
      const lossQty = row.qty * (lossPercent / 100);
      const totalQty = row.qty + lossQty;
      if (!Number.isFinite(lossQty) || !Number.isFinite(totalQty)) throw new Error(`LOSS_QUANTITY_OVERFLOW: ${row.materialId}`);
      return { stage: 'LOSSES_APPLIED', materialId: row.materialId, unit: row.unit,
        group: group.code, baseQty: row.qty, lossPercent, lossQty, totalQty };
    });
  }
}
