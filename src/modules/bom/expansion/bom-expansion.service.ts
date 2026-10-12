/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/expansion/bom-expansion.service.ts
 * Module: BOM
 * Layer: Domain Service
 * Responsibility: recursively expand one Product from prepared snapshots; no geometry or material aggregation.
 */
import type { CatalogHelper } from '../../catalog/catalog.helper';
import type { BOMRow } from '../model/bom-row.model';
import { BOMReferenceResolver, normalizeReferenceId } from '../reference/bom-reference-resolver';
import type { BOMDiagnostic } from '../reference/bom-reference.model';
import { componentId } from './bom-expansion.model';
import type {
  BOMElementRef, BOMExpansionDiagnostic, BOMExpansionInput, BOMExpansionResult, ExpandedBOMLine,
} from './bom-expansion.model';

interface IndexedRow { readonly row: Readonly<BOMRow>; readonly sourceRowIndex: number }
interface ExpansionContext {
  readonly parent: BOMElementRef;
  readonly parentOccurrenceIndex: number | null;
  readonly level: number;
  readonly parentTotalQty: number;
  readonly path: ExpandedBOMLine['path'];
}

export class BOMExpansionService {
  private readonly resolver: BOMReferenceResolver;
  private readonly childrenByParent = new Map<string, IndexedRow[]>();

  constructor(input: BOMExpansionInput, private readonly catalog: Pick<CatalogHelper, 'resolveTemplate'>) {
    this.resolver = new BOMReferenceResolver(input.elements, input.materials);
    input.rows.forEach((row, sourceRowIndex) => {
      const parentId = normalizeReferenceId(row.parentId);
      if (parentId === null) return; // An unreachable edge cannot affect this Product.
      const children = this.childrenByParent.get(parentId) ?? [];
      children.push({ row: { ...row }, sourceRowIndex });
      this.childrenByParent.set(parentId, children);
    });
  }

  get indexingDiagnostics(): readonly BOMDiagnostic[] { return this.resolver.indexingDiagnostics; }

  public expandProduct(productId: unknown): BOMExpansionResult {
    const resolution = this.resolver.resolve(productId, { path: [] });
    if (!resolution.ok) return this.failure(resolution.diagnostics);
    const root = resolution.ref;
    if (root.kind !== 'ELEMENT' || root.element.type !== 'product') {
      return this.failure([{ code: 'INVALID_ROOT', referenceId: componentId(root),
        path: [componentId(root)], message: 'BOM expansion root must be a Product Element.' }]);
    }
    const children = this.childrenByParent.get(root.elementId) ?? [];
    if (children.length === 0) {
      let hasBOM: boolean;
      try {
        hasBOM = this.catalog.resolveTemplate(root.element.prefixName).hasBOM;
        if (typeof hasBOM !== 'boolean') throw new Error('Catalog HasBOM must be boolean.');
      } catch (error) {
        return this.failure([{ code: 'CATALOG_RULE_UNAVAILABLE', referenceId: root.elementId,
          path: [root.elementId], message: error instanceof Error ? error.message : String(error) }]);
      }
      if (hasBOM) return this.failure([{ code: 'EMPTY_BOM', referenceId: root.elementId,
        path: [root.elementId], message: `Product "${root.element.code}" requires a non-empty BOM according to Catalog.HasBOM.` }]);
    }
    const lines: ExpandedBOMLine[] = [];
    for (const child of children) {
      const errors = this.expandChild(child, {
        parent: root, parentOccurrenceIndex: null, level: 1, parentTotalQty: 1, path: [root],
      }, lines);
      if (errors) return this.failure(errors);
    }
    return { ok: true, root, lines, indexingDiagnostics: this.indexingDiagnostics };
  }

  private failure(diagnostics: readonly BOMExpansionDiagnostic[]): BOMExpansionResult {
    return { ok: false, diagnostics, indexingDiagnostics: this.indexingDiagnostics };
  }

  /** Existing depth-first recursion, with typed resolution replacing getNode(). */
  private expandChild(
    indexed: IndexedRow, context: ExpansionContext, result: ExpandedBOMLine[],
  ): readonly BOMExpansionDiagnostic[] | null {
    const { row, sourceRowIndex } = indexed;
    const parentPath = context.path.map(componentId);
    const resolved = this.resolver.resolve(row.childId, {
      path: parentPath, sourceRowIndex, childCode: row.childCode,
    });
    if (!resolved.ok) return resolved.diagnostics;
    const child = resolved.ref;
    const childId = componentId(child);
    const path = [...context.path, child];
    const idPath = [...parentPath, childId];
    const error = (code: BOMExpansionDiagnostic['code'], message: string): BOMExpansionDiagnostic[] =>
      [{ code, message, referenceId: childId, path: idPath, sourceRowIndex }];
    if (context.path.some((ref) => ref.kind === child.kind && componentId(ref) === childId)) {
      return error('CYCLE', `BOM cycle detected: ${idPath.join(' -> ')}`);
    }
    const totalQty = context.parentTotalQty * row.qty;
    if (typeof row.qty !== 'number' || !Number.isFinite(row.qty) || row.qty <= 0 ||
        !Number.isFinite(totalQty) || totalQty <= 0) {
      return error('INVALID_QUANTITY', `Invalid BOM quantity or product of quantities for "${childId}".`);
    }
    const occurrenceIndex = result.length;
    result.push({ occurrenceIndex, parentOccurrenceIndex: context.parentOccurrenceIndex,
      level: context.level, edge: { sourceRowIndex, parent: context.parent, child,
        directQty: row.qty, unit: row.unit }, totalQty, path });
    const children = this.childrenByParent.get(childId) ?? [];
    if (child.kind === 'MATERIAL') {
      return children.length > 0
        ? error('MATERIAL_HAS_CHILDREN', `Material "${childId}" must be a BOM leaf.`) : null;
    }
    for (const next of children) {
      const errors = this.expandChild(next, {
        parent: child, parentOccurrenceIndex: occurrenceIndex, level: context.level + 1,
        parentTotalQty: totalQty, path,
      }, result);
      if (errors) return errors;
    }
    return null;
  }
}
