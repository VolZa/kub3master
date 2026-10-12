/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/tests/bom-reference-resolver.test.ts
 * Module: BOM
 * Layer: Automated Domain Test
 * Responsibility: test canonical ID resolution, catalog diagnostics, and snapshot isolation.
 */
import { describe, expect, it } from 'vitest';
import { BOMReferenceResolver } from '../reference/bom-reference-resolver';
import type { ElementFull } from '../../elements/element.model';
import type { Material } from '../../../domain/materials/material.model';

function element(overrides: Partial<ElementFull> = {}): ElementFull {
  return { id: '4185', code: 'R_14_A500C_L800', name: 'Part', prefixName: 'rebar',
    type: 'part', category: 'rebar', baseUnit: 'шт', length: 800, diameter: 14,
    parentMaterialID: '3015', isActive: true, createdAt: new Date('2026-10-12'), ...overrides };
}
function material(overrides: Partial<Material> = {}): Material {
  return { id: '3201', code: 'C_20_25', name: 'Concrete', category: 'concrete_mix',
    profileType: 'concrete', baseUnit: 'м3', isActive: true, ...overrides };
}
function codes(resolver: BOMReferenceResolver, id: unknown) {
  const result = resolver.resolve(id);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.diagnostics.map((d) => d.code);
}

describe('BOMReferenceResolver', () => {
  it('resolves direct concrete by canonical MaterialID', () => {
    expect(new BOMReferenceResolver([], [material()]).resolve('3201')).toEqual({
      ok: true, ref: { kind: 'MATERIAL', materialId: '3201', material: material() },
    });
  });
  it.each(['product', 'assembly', 'part'] as const)('resolves canonical %s Elements', (type) => {
    const value = element({ type });
    expect(new BOMReferenceResolver([value], []).resolve('4185')).toEqual({
      ok: true, ref: { kind: 'ELEMENT', elementId: '4185', element: value },
    });
  });
  it('rejects legacy Element without replacing it by matching Material code', () => {
    const resolver = new BOMReferenceResolver([element({ id: '3403', type: 'material', code: 'C_20_25' })], [material()]);
    expect(codes(resolver, '3403')).toEqual(['LEGACY_MATERIAL_ELEMENT']);
  });
  it.each(['part', 'material'] as const)('rejects cross-catalog collision with %s', (type) => {
    expect(codes(new BOMReferenceResolver([element({ id: '3201', type })], [material()]), '3201'))
      .toEqual(['AMBIGUOUS_REFERENCE']);
  });
  it.each(['ELEMENTS', 'MATERIALS'] as const)('reports duplicates while indexing %s', (source) => {
    const resolver = source === 'ELEMENTS'
      ? new BOMReferenceResolver([element(), element({ id: ' 4185 ' })], [])
      : new BOMReferenceResolver([], [material(), material({ id: ' 3201 ' })]);
    expect(resolver.indexingDiagnostics).toMatchObject([
      { code: 'DUPLICATE_ID', source, catalogIndexes: [0, 1] },
    ]);
    expect(codes(resolver, source === 'ELEMENTS' ? '4185' : '3201')).toEqual(['DUPLICATE_ID']);
  });
  it('reports ambiguity before duplicate diagnostics', () => {
    const resolver = new BOMReferenceResolver([element({ id: '3201', type: 'material' })], [material(), material()]);
    expect(codes(resolver, '3201')).toEqual(['AMBIGUOUS_REFERENCE', 'DUPLICATE_ID']);
  });
  it.each(['', '  ', null, undefined, false, {}, [], NaN, Infinity])('rejects invalid ChildID %s', (id) => {
    expect(codes(new BOMReferenceResolver([], []), id)).toEqual(['INVALID_REFERENCE']);
  });
  it('reports missing ID even when ChildCode exists in Materials', () => {
    const result = new BOMReferenceResolver([], [material()]).resolve('9999', { childCode: 'C_20_25' });
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'REFERENCE_NOT_FOUND', referenceId: '9999' }] });
  });
  it('normalizes whitespace and finite numeric IDs without stripping leading zeroes', () => {
    const resolver = new BOMReferenceResolver([], [material({ id: ' 3201 ' }), material({ id: '003201' })]);
    expect(resolver.resolve(' 3201 ')).toMatchObject({ ok: true, ref: { materialId: '3201', material: { id: '3201' } } });
    expect(resolver.resolve(3201)).toEqual(resolver.resolve('3201'));
    expect(resolver.resolve('003201')).toMatchObject({ ok: true, ref: { materialId: '003201' } });
  });
  it.each(['ELEMENT', 'MATERIAL'])('resolves inactive %s', (kind) => {
    const resolver = new BOMReferenceResolver([element({ isActive: false })], [material({ isActive: false })]);
    expect(resolver.resolve(kind === 'ELEMENT' ? '4185' : '3201')).toMatchObject({ ok: true, ref: { kind } });
  });
  it('preserves PART geometry and Material link', () => {
    const value = element({ width: 40, height: 63, thickness: 5 });
    expect(new BOMReferenceResolver([value], []).resolve('4185')).toMatchObject({
      ok: true, ref: { element: { length: 800, diameter: 14, width: 40, height: 63, thickness: 5, parentMaterialID: '3015' } },
    });
  });
  it('does not mutate frozen inputs and returns stable detached snapshots', () => {
    const value = Object.freeze(element());
    const m = Object.freeze(material());
    const resolver = new BOMReferenceResolver(Object.freeze([value]), Object.freeze([m]));
    const first = resolver.resolve('4185');
    expect(resolver.resolve('4185')).toEqual(first);
    if (first.ok && first.ref.kind === 'ELEMENT') first.ref.element.createdAt.setFullYear(2000);
    expect(resolver.resolve('4185')).toMatchObject({ ok: true, ref: { element: { createdAt: new Date('2026-10-12') } } });
    expect(value.createdAt).toEqual(new Date('2026-10-12'));
  });
  it('isolates indexes from later input changes', () => {
    const value = element(); const m = material();
    const resolver = new BOMReferenceResolver([value], [m]);
    value.length = 999; value.createdAt.setFullYear(2000); m.code = 'CHANGED';
    expect(resolver.resolve('4185')).toMatchObject({ ok: true, ref: { element: { length: 800, createdAt: new Date('2026-10-12') } } });
    expect(resolver.resolve('3201')).toMatchObject({ ok: true, ref: { material: { code: 'C_20_25' } } });
  });
  it('returns global invalid-ID diagnostics and leaves unrelated IDs resolvable', () => {
    const resolver = new BOMReferenceResolver([element({ id: '' })], [material(), material({ id: '  ' })]);
    expect(resolver.indexingDiagnostics.map((d) => d.code)).toEqual(['INVALID_REFERENCE', 'INVALID_REFERENCE']);
    expect(resolver.resolve('3201').ok).toBe(true);
  });
  it('copies error context and indexes and remains stable on repeated failures', () => {
    const resolver = new BOMReferenceResolver([], [material(), material()]);
    const path = ['1012', '3201'];
    const result = resolver.resolve('3201', { path, sourceRowIndex: 0 });
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: 'DUPLICATE_ID', referenceId: '3201', path, sourceRowIndex: 0 }] });
    path.push('CHANGED');
    expect(result).toMatchObject({ diagnostics: [{ path: ['1012', '3201'] }] });
    const diagnostics = resolver.indexingDiagnostics;
    (diagnostics[0].catalogIndexes as number[]).push(99);
    expect(resolver.indexingDiagnostics[0].catalogIndexes).toEqual([0, 1]);
    expect(resolver.resolve('3201')).toEqual(resolver.resolve('3201'));
  });
  it('uses existing code normalization only as an ID check', () => {
    const resolver = new BOMReferenceResolver([element()], [material()]);
    expect(resolver.resolve('4185', { childCode: ' r_14_А500С_L800 ' }).ok).toBe(true);
    expect(resolver.resolve('3201', { childCode: '' }).ok).toBe(true);
    expect(resolver.resolve('3201', { childCode: 'C_30_35', path: ['1012'], sourceRowIndex: 4 }))
      .toMatchObject({ ok: false, diagnostics: [{ code: 'CODE_MISMATCH', referenceId: '3201', expectedCode: 'C_20_25', actualCode: 'C_30_35', sourceRowIndex: 4 }] });
  });
});
