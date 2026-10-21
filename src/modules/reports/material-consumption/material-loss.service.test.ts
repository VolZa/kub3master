import { describe, expect, it } from 'vitest';
import type { Material } from '../../../domain/materials/material.model';
import type { MaterialLossPercents } from '../../../domain/materials/material-loss.model';
import type { MaterialRequirement } from '../../bom/model/material-requirement.model';
import { MaterialLossService } from './material-loss.service';

const categories = ['rebar', 'plate', 'angle', 'pipe', 'concrete_mix', 'wire', 'cement', 'beam', 'channel'] as const;
const materials: Material[] = categories.map(category => ({
  id: category === 'concrete_mix' ? '3201' : category,
  code: category === 'concrete_mix' ? 'C20/25' : category,
  name: category, category, profileType: category === 'concrete_mix' ? 'concrete' : 'round',
  baseUnit: category === 'concrete_mix' ? 'м3' : 'кг', isActive: true,
}));
const service = new MaterialLossService({ findById: id => materials.find(m => m.id === id) ?? null });
const norms = { rebar: 7, rolled: 2.5, concrete: 0 };
const base = (materialId = 'rebar', qty = 100, unit = 'кг') => ({ materialId, qty, unit });

describe('report-level material loss norms', () => {
  it('uses independent groups from canonical categories and preserves kg/m3', () => {
    const result = service.apply([base(), base('plate'), base('angle'), base('pipe'), base('3201', 2, 'м3')], norms);
    expect(result.map(r => r.lossPercent)).toEqual([7, 2.5, 2.5, 2.5, 0]);
    expect(result.map(r => r.totalQty)).toEqual([107, 102.5, 102.5, 102.5, 2]);
    expect(result.map(r => r.group)).toEqual(['REBAR', 'ROLLED', 'ROLLED', 'ROLLED', 'CONCRETE']);
    expect(result[4]).toMatchObject({ materialId: '3201', unit: 'м3', baseQty: 2, lossQty: 0 });
  });

  it.each([0, 0.125, 100])('applies %s percent as an additive allowance', percent => {
    const [result] = service.apply([base('rebar', 8)], { ...norms, rebar: percent });
    expect(result.lossQty).toBeCloseTo(8 * percent / 100);
    expect(result.totalQty).toBeCloseTo(8 + 8 * percent / 100);
  });

  it.each(['rebar', 'rolled', 'concrete'] as const)('rejects missing or invalid %s norm', key => {
    for (const value of [undefined, null, '', '7', -1, 101, NaN, Infinity]) {
      expect(() => service.apply([base()], { ...norms, [key]: value } as unknown as MaterialLossPercents))
        .toThrow(/MISSING_LOSS_NORM|INVALID_LOSS_NORM/);
    }
  });

  it.each(['wire', 'cement', 'beam', 'channel'])('does not infer a loss group for %s', id => {
    expect(() => service.apply([base(id)], norms)).toThrow('UNDEFINED_LOSS_GROUP');
  });

  it('rejects missing material and invalid clean requirements', () => {
    expect(() => service.apply([base('missing')], norms)).toThrow('MATERIAL_NOT_FOUND');
    for (const qty of [-1, NaN, Infinity]) expect(() => service.apply([base('rebar', qty)], norms)).toThrow('INVALID_BASE_REQUIREMENT');
    expect(() => service.apply([base('rebar', 1, '')], norms)).toThrow('INVALID_BASE_REQUIREMENT');
    expect(() => service.apply([base('rebar', Number.MAX_VALUE)], { ...norms, rebar: 100 })).toThrow('LOSS_QUANTITY_OVERFLOW');
  });

  it('leaves clean requirements, norms and material catalog unchanged on repeated reporting', () => {
    const row = Object.freeze(base());
    const input = Object.freeze([row]);
    const percentages = Object.freeze({ ...norms });
    const before = JSON.stringify(materials);
    const first = service.apply(input, percentages);
    expect(service.apply(input, percentages)).toEqual(first);
    expect(row).toEqual(base());
    expect(JSON.stringify(materials)).toBe(before);
    expect(first[0]).not.toHaveProperty('qty');
    expect(() => service.apply(first as unknown as MaterialRequirement[], norms)).toThrow('LOSSES_ALREADY_APPLIED');
    expect(() => service.apply(JSON.parse(JSON.stringify(first)), norms)).toThrow('LOSSES_ALREADY_APPLIED');
  });
});
