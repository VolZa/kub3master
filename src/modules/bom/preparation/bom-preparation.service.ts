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
import { isNumericString, normalizeCode, normalizeClassName } from '../../../utils/normalize';
import { normalizeIntegerId } from '../../../utils/id.logic';
import type { ElementType } from '../../../config/config';
import type { TableRowInput } from '../model/table-row-input.model';
import type { BOMPreparationInput, BOMPreparationResult, BOMPreparationError,
  PendingBOMElement, PreparedElementRef, PreparedComponentRef, PreparedBOMComponent, PlannedBOMEdge } from './bom-preparation.model';

export interface BOMPreparationDependencies {
  elements: Pick<ElementRepository, 'findByType'>;
  materials: Pick<MaterialRepository, 'findByCode' | 'findById' | 'findBySpec' | 'getAll'>;
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
  let rootType: ElementType = 'product';
  let elementSnapshot: ElementFull[] = [];
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
    elementSnapshot = (['product', 'assembly', 'part', 'material'] as const).flatMap(type => deps.elements.findByType(type));
    searchDocuments = [...deps.documents.resolve(documentID)];
  } catch (error) {
    errors.push({ sourceRowIndex: -1, code: 'CONTEXT_INVALID', message: message(error) });
  }
  const projectElement = (code: string, type: ElementType, documents: readonly string[]): ElementFull | undefined => {
    const byCode = elementSnapshot.filter(element => element.code === code);
    let candidates: ElementFull[] = [];
    for (const doc of documents) {
      candidates = byCode.filter(element => (element.projectDocumentID ?? '') === doc);
      if (candidates.length) break;
    }
    if (!candidates.length) candidates = byCode.filter(element => !element.projectDocumentID);
    if (candidates.length > 1) throw new Error(`Ambiguous Element identity: ${code}`);
    const found = candidates[0];
    if (found && (found.type !== type || (type === 'part' && found.parentMaterialID))) {
      throw new Error(`Conflicting project Element identity: ${code}`);
    }
    return found;
  };
  try {
    const parsed = parseParent(input.parentInput);
    const template = deps.catalog.resolveTemplate(parsed.prefix);
    const type = resolveElementType(template);
    if (!['product', 'assembly', 'part'].includes(type)) throw new Error('Invalid parent Catalog type');
    rootType = type;
    const existing = projectElement(parsed.code, type, [documentID]);
    if (existing) {
      if (!['product', 'assembly', 'part'].includes(existing.type)) throw new Error('Invalid parent Element type');
      parent = existingRef(existing);
      documentID = existing.projectDocumentID;
    } else {
      if (!['product', 'assembly', 'part'].includes(type)) throw new Error('Invalid parent Catalog type');
      requireText(template.category, 'Parent category');
      parent = planElement(['identity', input.projectDocumentID ?? '', type, parsed.code], {
        Code: parsed.code, PrefixName: parsed.prefix, Name: buildElementName(parsed.prefix, parsed.name),
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
      const template = deps.catalog.resolveTemplate(row.prefix);
      if (!['product', 'assembly', 'part', 'material'].includes(template.type)) throw new Error('Invalid Catalog type');
      let ref: PreparedComponentRef;
      let unit: string;
      let materialEdge: { material: Material; qty: number } | undefined;
      let identity: PreparedBOMComponent['identity'];
      if (template.type !== 'material') {
        const existing = projectElement(row.code, template.type, searchDocuments);
        if (existing) {
          ref = existingRef(existing);
          unit = existing.baseUnit;
          identity = { kind: 'project-element', code: existing.code, projectDocumentID: existing.projectDocumentID };
        } else {
          if (rootType === 'product') throw new Error(`Project Element not found: ${row.code}`);
          const parsed = parseSpec(row.spec, row.prefix);
          if (parsed.kind === 'assembly' || parsed.kind === 'unknown') throw new Error(`Project Element not found: ${row.code}`);
          const built = buildByKind(parsed);
          const type = resolveElementType(template, built.length);
          // Preserve the existing restriction on creating project Parts as children without material.
          if (type === 'part') throw new Error(`Material not found for element: ${built.code}`);
          const reused = projectElement(built.code, type, [documentID ?? '']);
          if (reused) ref = existingRef(reused);
          else {
            requireText(template.category, 'Component category');
            for (const field of ['length', 'diameter', 'width', 'height', 'thickness'] as const) {
              if (built[field] !== undefined) positive(built[field], field);
            }
            ref = planElement(['identity', documentID, type, built.code], {
              Code: built.code, PrefixName: row.prefix, Name: built.name, Type: type,
              ProjectDocumentID: documentID, Category: template.category, BaseUnit: 'шт',
              ProfileType: template.profileType ?? '', Diameter: built.diameter, Class: built.className,
              Width: built.width, Height: built.height, Length: built.length, Thickness: built.thickness, IsActive: true, Comment: '',
            });
          }
          unit = reused?.baseUnit ?? 'шт';
          identity = { kind: 'project-element', code: built.code, projectDocumentID: documentID };
        }
      } else {
        const parsed = parseSpec(row.spec, row.prefix);
        const direct = deps.materials.findByCode(row.code);
        if (direct && (parsed.kind === 'assembly' || parsed.kind === 'unknown')) {
          ref = materialRef(direct); unit = direct.baseUnit;
          identity = { kind: 'direct-material', code: direct.code, materialID: direct.id };
        } else {
          if (parsed.kind === 'assembly' || parsed.kind === 'unknown') throw new Error(`Element not found: ${row.code}`);
          const built = buildByKind(parsed);
          if (built.length === undefined && /(?:_L|L\s*=)/i.test(row.spec)) throw new Error('Invalid length');
          for (const field of ['length', 'diameter', 'width', 'height', 'thickness'] as const) {
            if (built[field] !== undefined) positive(built[field], field);
          }
          const type = resolveElementType(template, built.length);
          if (type === 'material') {
            const material = direct ?? deps.materials.findByCode(built.code);
            if (!material) throw new Error(`Material not found in 05_Materials: ${built.code}`);
            ref = materialRef(material); unit = material.baseUnit;
            identity = { kind: 'direct-material', code: material.code, materialID: material.id };
          } else {
            if (type !== 'part') throw new Error('Invalid material Part type');
            const material = new MaterialResolver(deps.materials).resolve(built);
            materialRef(material);
            const materialMatches = deps.materials.getAll().filter(candidate => {
              if (candidate.profileType !== material.profileType) return false;
              const fields = material.profileType === 'round' ? ['diameter'] as const
                : material.profileType === 'plate' ? ['width', 'thickness'] as const
                : material.profileType === 'angle' ? ['width', 'height', 'thickness'] as const
                : ['diameter', 'thickness'] as const;
              return fields.every(field => candidate[field] === material[field]) &&
                (material.profileType !== 'round' || (candidate.category === material.category &&
                  normalizeClassName(candidate.class ?? '') === normalizeClassName(material.class ?? '')));
            });
            if (materialMatches.length !== 1) throw new Error(`Ambiguous canonical Material: ${built.code}`);
            const candidates = elementSnapshot.filter(element => normalizeCode(element.code) === normalizeCode(built.code));
            if (candidates.length > 1) throw new Error(`Ambiguous material Part identity: ${built.code}`);
            const reused = candidates[0];
            if (reused) {
              const materialID = reused.parentMaterialID ? String(normalizeIntegerId(reused.parentMaterialID, 'ParentMaterialID')) : '';
              if (reused.type !== 'part' || materialID !== String(normalizeIntegerId(material.id, 'MaterialID'))) {
                throw new Error(`Conflicting material Part identity: ${built.code}`);
              }
              for (const field of ['length', 'diameter', 'width', 'height', 'thickness'] as const) {
                if (built[field] !== undefined && Number(reused[field]) !== built[field]) throw new Error(`Conflicting Part geometry: ${field}`);
              }
              if (built.className && normalizeClassName(reused.className ?? '') !== normalizeClassName(built.className)) {
                throw new Error('Conflicting Part class');
              }
              if (reused.profileType !== built.profileType) throw new Error('Conflicting Part profile');
              ref = existingRef(reused);
            } else {
              requireText(template.category, 'Component category');
              ref = planElement(['material-part', material.id, normalizeCode(built.code)], {
                Code: built.code, PrefixName: row.prefix, Name: built.name, Type: 'part',
                ProjectDocumentID: '', ParentMaterialID: material.id,
                Category: template.category, ProfileType: template.profileType ?? '', BaseUnit: 'шт',
                Diameter: built.diameter, Class: built.className, Width: built.width, Height: built.height,
                Length: built.length, Thickness: built.thickness, IsActive: true, Comment: '',
              });
              positive(material.weightPerMeter, 'weightPerMeter');
              const qty = Math.round((built.length !== undefined ? built.length / 1000 * material.weightPerMeter : 1) * 100) / 100;
              positive(qty, 'Part material quantity');
              materialEdge = { material, qty };
            }
            unit = reused?.baseUnit ?? 'шт';
            identity = { kind: 'material-part', code: built.code, materialID: material.id,
              geometry: { length: built.length, diameter: built.diameter, width: built.width, height: built.height,
                thickness: built.thickness, className: built.className, profileType: built.profileType } };
          }
        }
      }
      validateUnit(unit);
      components.push({ sourceRowIndex, input: { ...row }, ref, identity });
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
  return { ok: true, prepared: { rootType, writeScope: { root: parent, initializeMaterialBOMFor: [...plannedMaterialParents] }, parent, components, pendingElements: [...pending.values()], plannedEdges: [...aggregated.values()],
    sourceContext: { ...input, searchProjectDocumentIDs: searchDocuments } } };
}
