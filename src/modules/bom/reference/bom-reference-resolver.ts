/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/reference/bom-reference-resolver.ts
 * Module: BOM
 * Layer: Domain Service
 * Responsibility: resolve prepared catalog IDs without repositories, Sheets, or BOM traversal.
 */
import type { ElementFull } from '../../elements/element.model';
import type { Material } from '../../../domain/materials/material.model';
import { normalizeCode } from '../../../utils/normalize';
import type {
  BOMComponentRef, BOMDiagnostic, BOMResolution, BOMResolutionContext,
} from './bom-reference.model';

// IDs are text keys: do not coerce objects/booleans or parse numeric strings.
function normalizeReferenceId(value: unknown): string | null {
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) {
    return null;
  }
  return String(value).trim() || null;
}

function copyElement(element: Readonly<ElementFull>): ElementFull {
  return { ...element, createdAt: new Date(element.createdAt.getTime()) };
}

function copyDiagnostic(diagnostic: BOMDiagnostic): BOMDiagnostic {
  return {
    ...diagnostic,
    ...(diagnostic.path ? { path: [...diagnostic.path] } : {}),
    ...(diagnostic.catalogIndexes ? { catalogIndexes: [...diagnostic.catalogIndexes] } : {}),
  };
}

export class BOMReferenceResolver {
  private readonly elements = new Map<string, ElementFull[]>();
  private readonly materials = new Map<string, Material[]>();
  private readonly indexingErrors: BOMDiagnostic[] = [];

  constructor(elements: readonly Readonly<ElementFull>[], materials: readonly Readonly<Material>[]) {
    this.index(elements, this.elements, 'ELEMENTS', copyElement);
    this.index(materials, this.materials, 'MATERIALS', (material) => ({ ...material }));
  }

  /** Global catalog diagnostics. Unrelated valid IDs remain resolvable. */
  get indexingDiagnostics(): readonly BOMDiagnostic[] {
    return this.indexingErrors.map(copyDiagnostic);
  }

  private index<T extends { id: string }>(
    records: readonly Readonly<T>[], index: Map<string, T[]>,
    source: 'ELEMENTS' | 'MATERIALS', copy: (record: Readonly<T>) => T,
  ): void {
    const positions = new Map<string, number[]>();
    records.forEach((record, catalogIndex) => {
      const id = normalizeReferenceId(record.id);
      if (id === null) {
        this.indexingErrors.push({ code: 'INVALID_REFERENCE', referenceId: record.id, source,
          catalogIndexes: [catalogIndex], message: `Invalid ID in ${source} snapshot at index ${catalogIndex}.` });
        return;
      }
      const entries = index.get(id) ?? [];
      entries.push({ ...copy(record), id });
      index.set(id, entries);
      const indexes = positions.get(id) ?? [];
      indexes.push(catalogIndex);
      positions.set(id, indexes);
    });
    positions.forEach((catalogIndexes, id) => {
      if (catalogIndexes.length > 1) {
        this.indexingErrors.push({ code: 'DUPLICATE_ID', referenceId: id, source,
          catalogIndexes, message: `Duplicate ID "${id}" in ${source} snapshot at indexes ${catalogIndexes.join(', ')}.` });
      }
    });
  }

  resolve(childId: unknown, context: BOMResolutionContext = {}): BOMResolution {
    const id = normalizeReferenceId(childId);
    const failure = (diagnostics: readonly BOMDiagnostic[]): BOMResolution => ({
      ok: false,
      diagnostics: diagnostics.map((diagnostic) => copyDiagnostic({
        ...diagnostic,
        ...(context.path ? { path: context.path } : {}),
        ...(context.sourceRowIndex !== undefined ? { sourceRowIndex: context.sourceRowIndex } : {}),
      })),
    });
    if (id === null) {
      return failure([{ code: 'INVALID_REFERENCE', referenceId: childId,
        message: 'ChildID must be a non-empty string or finite number.' }]);
    }
    const elements = this.elements.get(id) ?? [];
    const materials = this.materials.get(id) ?? [];
    const duplicates = this.indexingErrors.filter((d) => d.code === 'DUPLICATE_ID' && d.referenceId === id);
    if (elements.length > 0 && materials.length > 0) {
      return failure([{ code: 'AMBIGUOUS_REFERENCE', referenceId: id,
        message: `ChildID "${id}" exists in both ELEMENTS and MATERIALS.` }, ...duplicates]);
    }
    if (duplicates.length > 0) return failure(duplicates);
    const element = elements[0];
    const material = materials[0];
    if (!element && !material) {
      return failure([{ code: 'REFERENCE_NOT_FOUND', referenceId: id,
        message: `ChildID "${id}" was not found in ELEMENTS or MATERIALS.` }]);
    }
    let ref: BOMComponentRef;
    if (element) {
      if (element.type === 'material') {
        return failure([{ code: 'LEGACY_MATERIAL_ELEMENT', referenceId: id,
          message: `ChildID "${id}" references a legacy material Element; no code-based replacement is allowed.` }]);
      }
      if (element.type !== 'product' && element.type !== 'assembly' && element.type !== 'part') {
        return failure([{ code: 'INVALID_REFERENCE', referenceId: id,
          message: `ChildID "${id}" has an unsupported Element type.` }]);
      }
      ref = { kind: 'ELEMENT', elementId: id, element: { ...copyElement(element), type: element.type } };
    } else {
      ref = { kind: 'MATERIAL', materialId: id, material: { ...material } };
    }
    const canonicalCode = ref.kind === 'ELEMENT' ? ref.element.code : ref.material.code;
    // Empty ChildCode is absent in existing BOM readers. Never look up by code.
    if (context.childCode !== undefined && context.childCode.trim() !== '' &&
        normalizeCode(context.childCode) !== normalizeCode(canonicalCode)) {
      return failure([{ code: 'CODE_MISMATCH', referenceId: id,
        expectedCode: canonicalCode, actualCode: context.childCode,
        message: `ChildCode "${context.childCode}" does not match "${canonicalCode}" for ChildID "${id}".` }]);
    }
    return { ok: true, ref };
  }
}
