import type { MaterialLossGroup, MaterialLossNorm } from './material-loss.model';

/** Proposed read-only port for future 22_MaterialLossNorms (Group, LossPercent).
 * Adapter must reject duplicate groups and invalid percentages.
 * No adapter, sheet creation or manual/catalog precedence is implemented here.
 */
export interface IMaterialLossNormRepository {
  findByGroup(group: MaterialLossGroup['code']): MaterialLossNorm | null;
}
