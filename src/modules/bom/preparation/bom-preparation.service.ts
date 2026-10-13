/**
 * Path: C:/www/26/03/kub3master-ts/src/modules/bom/preparation/bom-preparation.service.ts
 * Module: BOM
 * Layer: Application
 * Responsibility: validate every input line and build a plan without reserving IDs or writing repositories.
 */
import type { ElementRepository } from '../../elements/element.repository';
import type { ElementFull } from '../../elements/element.model';
import type { CatalogHelper } from '../../catalog/catalog.helper';
import type { MaterialRepository } from '../../../domain/materials/material.repository';
import type { Material } from '../../../domain/materials/material.model';
import type { ProjectDocumentResolver } from '../../../domain/project-document-dependencies/project-document.resolver';
import { MaterialResolver } from '../../../domain/materials/material.resolver';
import { parseParent } from '../parsers/parseParent';
import { parseStructuredLine } from '../parsers/parseStucturedLine';
import { parseSpec } from '../parsers/parseSpec';
import { buildByKind } from '../../elements/builders/builder.dispatcher';
import { buildElementName } from '../../elements/builders/name.builder';
import { resolveElementType } from '../../elements/element-type.resolver';
import { isNumericString } from '../../../utils/normalize';
import type { TableRowInput } from '../model/table-row-input.model';
import type { BOMPreparationInput, BOMPreparationResult, BOMPreparationError,
  PendingBOMElement, PreparedElementRef, PreparedComponentRef, PreparedBOMComponent, PlannedBOMEdge } from './bom-preparation.model';

export interface BOMPreparationDependencies {
  elements: Pick<ElementRepository, 'findByCode' | 'findByCodeInDocuments' | 'findByIdentity' | 'findPartByMaterial'>;
  materials: Pick<MaterialRepository, 'findByCode' | 'findById' | 'findBySpec'>;
  catalog: Pick<CatalogHelper, 'resolveTemplate'>;
  documents: Pick<ProjectDocumentResolver, 'resolve'>;
}
function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
}
function positive(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${label}`);
}
function existingRef(element: ElementFull): PreparedElementRef {
  return { kind: 'existing-element', element: { ...element, createdAt: new Date(element.createdAt) } };
}
function materialRef(material: Material): PreparedComponentRef {
  requireText(material.id, 'MaterialID');
  requireText(material.baseUnit, 'Material unit');
  return { kind: 'material', material: { ...material } };
}
function refKey(ref: PreparedComponentRef): string {
  if (ref.kind === 'pending-element') return JSON.stringify([ref.kind, ref.localKey]);
  return JSON.stringify([ref.kind, ref.kind === 'material' ? ref.material.id : ref.element.id]);
}

export function prepareBOM(input: BOMPreparationInput, deps: BOMPreparationDependencies): BOMPreparationResult {
  const errors: BOMPreparationError[] = [];
  const pending = new Map<string, PendingBOMElement>();
  const components: PreparedBOMComponent[] = [];
  const edges: PlannedBOMEdge[] = [];
  const plannedMaterialParents = new Set<string>();
  let parent: PreparedElementRef | undefined;
  let documentID: string | undefined = input.projectDocumentID ?? '';
  let searchDocuments: readonly string[] = [];
  const message = (error: unknown) => error instanceof Error ? error.message : String(error);
  const planElement = (identity: readonly unknown[], row: PendingBOMElement['row']): PreparedElementRef => {
    const key = JSON.stringify(identity);
    let item = pending.get(key);
    if (!item) {
      item = { localKey: `pending:${pending.size + 1}`, row };
      pending.set(key, item);
    }
    return { kind: 'pending-element', localKey: item.localKey };
  };
  try {
    searchDocuments = [...deps.documents.resolve(documentID)];
  } catch (error) {
    errors.push({ sourceRowIndex: -1, code: 'CONTEXT_INVALID', message: message(error) });
  }
  try {
    const parsed = parseParent(input.parentInput);
    const existing = deps.elements.findByCode(parsed.code, documentID);
    if (existing) {
      if (!['product', 'assembly', 'part'].includes(existing.type)) throw new Error('Invalid parent Element type');
      parent = existingRef(existing);
      documentID = existing.projectDocumentID;
    } else {
      const template = deps.catalog.resolveTemplate(parsed.prefix);
      const type = resolveElementType(template);
      if (!['product', 'assembly', 'part'].includes(type)) throw new Error('Invalid parent Catalog type');
      requireText(template.category, 'Parent category');
      parent = planElement(['identity', input.projectDocumentID ?? '', type, parsed.code], {
        Code: parsed.code, PrefixName: parsed.prefix, Name: buildElementName(parsed.prefix, parsed.code),
        Type: type, ProjectDocumentID: input.projectDocumentID ?? '', Category: template.category,
        ProfileType: template.profileType ?? '', BaseUnit: 'шт', IsActive: true, Comment: '',
      });
    }
  } catch (error) {
    errors.push({ sourceRowIndex: -1, code: 'PARENT_INVALID', message: message(error), sourceText: input.parentInput });
  }
  const lines = typeof input.specification === 'string' ? input.specification.split(/\r?\n/) : [];
  if (!lines.some(line => line.trim())) {
    errors.push({ sourceRowIndex: -1, code: 'EMPTY_SPECIFICATION', message: 'Specification must not be empty; deletion is a separate operation' });
  }
  lines.forEach((sourceText, sourceRowIndex) => {
    if (!sourceText.trim()) return;
    let row: TableRowInput | undefined;
    try {
      row = parseStructuredLine(sourceText);
      const fields = sourceText.split(';').map(field => field.trim());
      if (fields.length >= 3 && !isNumericString(fields[fields.length - 1])) {
        throw new Error('Invalid explicit quantity');
      }
      requireText(row.prefix, 'Component prefix');
      requireText(row.code, 'Component code');
      requireText(row.spec, 'Component specification');
      positive(row.qty, 'quantity');
      // Explicit concrete units are present in the raw code field, not in parsed spec.
      const concreteUnit = row.prefix.toLowerCase() === 'бетон'
        ? sourceText.split(';')[1]?.match(/,\s*([^,]+)$/)?.[1]?.trim() : undefined;
      const validateUnit = (unit: string) => {
        requireText(unit, 'Component unit');
        if (concreteUnit !== undefined && concreteUnit !== unit) throw new Error(`Invalid unit: ${concreteUnit}; expected ${unit}`);
      };
      const existing = deps.elements.findByCodeInDocuments(row.code, searchDocuments);
      let ref: PreparedComponentRef;
      let unit: string;
      let materialEdge: { material: Material; qty: number } | undefined;
      if (existing && existing.type !== 'material') {
        if (!['product', 'assembly', 'part'].includes(existing.type)) throw new Error('Invalid Element type');
        ref = existingRef(existing);
        unit = existing.baseUnit;
      } else {
        const direct = deps.materials.findByCode(row.code);
        if (direct) {
          ref = materialRef(direct); unit = direct.baseUnit;
        } else {
          const parsed = parseSpec(row.spec, row.prefix);
          if (parsed.kind === 'assembly' || parsed.kind === 'unknown') throw new Error(`Element not found: ${row.code}`);
          const built = buildByKind(parsed);
          if (built.length === undefined && /(?:_L|L\s*=)/i.test(row.spec)) throw new Error('Invalid length');
          for (const field of ['length', 'diameter', 'width', 'height', 'thickness'] as const) {
            if (built[field] !== undefined) positive(built[field], field);
          }
          requireText(built.code, 'Built component code');
          requireText(built.name, 'Built component name');
          const template = deps.catalog.resolveTemplate(row.prefix);
          if (!['product', 'assembly', 'part', 'material'].includes(template.type)) throw new Error('Invalid Catalog type');
          const type = resolveElementType(template, built.length);
          if (!['product', 'assembly', 'part', 'material'].includes(type)) throw new Error('Invalid Catalog type');
          if (type === 'material') {
            const material = deps.materials.findByCode(built.code);
            if (!material) throw new Error(`Material not found in 05_Materials: ${built.code}`);
            ref = materialRef(material); unit = material.baseUnit;
          } else {
            const isMaterialPart = template.type === 'material' && type === 'part';
            const material = isMaterialPart ? new MaterialResolver(deps.materials).resolve(built) : undefined;
            // Current creation path requires a material for a new Part, including project Parts.
            const reused = material
              ? deps.elements.findPartByMaterial(material.id, built.code)
              : deps.elements.findByIdentity(documentID, type, built.code);
            if (reused) ref = existingRef(reused);
            else {
              if (type === 'part' && !material) throw new Error(`Material not found for element: ${built.code}`);
              requireText(template.category, 'Component category');
              ref = planElement(material ? ['material-part', material.id, built.code] : ['identity', documentID, type, built.code], {
                Code: built.code, PrefixName: row.prefix, Name: built.name, Type: type,
                ProjectDocumentID: material ? '' : documentID, ParentMaterialID: material?.id,
                Category: template.category, ProfileType: template.profileType ?? '', BaseUnit: 'шт',
                Diameter: built.diameter, Class: built.className, Width: built.width, Height: built.height,
                Length: built.length, Thickness: built.thickness, IsActive: true, Comment: '',
              });
            }
            unit = reused?.baseUnit ?? 'шт';
            // Existing Part BOM belongs to that Part and must not be rewritten by parent preparation.
            if (type === 'part' && !reused) {
              const linkedMaterial = material;
              if (!linkedMaterial) throw new Error(`Material not found for element: ${built.code}`);
              materialRef(linkedMaterial);
              positive(linkedMaterial.weightPerMeter, 'weightPerMeter');
              const qty = Math.round((built.length !== undefined ? built.length / 1000 * linkedMaterial.weightPerMeter : 1) * 100) / 100;
              positive(qty, 'Part material quantity');
              materialEdge = { material: linkedMaterial, qty };
            }
          }
        }
      }
      validateUnit(unit);
      components.push({ sourceRowIndex, input: { ...row }, ref });
      if (parent) edges.push({ parent, child: ref, qty: row.qty, unit });
      // Material consumption is per one new Part, independent of occurrences in the parent input.
      if (materialEdge && ref.kind === 'pending-element' && !plannedMaterialParents.has(ref.localKey)) {
        edges.push({ parent: ref, child: materialRef(materialEdge.material), qty: materialEdge.qty, unit: 'кг' });
        plannedMaterialParents.add(ref.localKey);
      }
    } catch (error) {
      errors.push({ sourceRowIndex, code: 'COMPONENT_INVALID', message: message(error), sourceText,
        ...(row ? { component: { ...row } } : {}) });
    }
  });
  if (errors.length || !parent) return { ok: false, errors };
  const aggregated = new Map<string, PlannedBOMEdge>();
  for (const edge of edges) {
    const key = JSON.stringify([refKey(edge.parent), refKey(edge.child), edge.unit]);
    const existing = aggregated.get(key);
    if (existing) {
      existing.qty += edge.qty;
      if (!Number.isFinite(existing.qty)) return { ok: false, errors: [{ sourceRowIndex: -1, code: 'COMPONENT_INVALID', message: 'Aggregated quantity overflow' }] };
    } else aggregated.set(key, { ...edge });
  }
  return { ok: true, prepared: { parent, components, pendingElements: [...pending.values()], plannedEdges: [...aggregated.values()],
    sourceContext: { ...input, searchProjectDocumentIDs: searchDocuments } } };
}
