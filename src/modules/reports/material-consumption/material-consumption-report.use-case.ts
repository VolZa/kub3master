import type { Manufacturing } from '../../../domain/manufacturing/manufacturing.model';
import type { IHouseRepository } from '../../../domain/houses/house.repository';
import type { IProjectDocumentRepository } from '../../../domain/project-documents/project-document.repository';
import type { ElementRepository } from '../../elements/element.repository';
import type { MaterialRepository } from '../../../domain/materials/material.repository';
import type { BOMExpansionService } from '../../bom/expansion/bom-expansion.service';
import type { MaterialRequirement } from '../../bom/model/material-requirement.model';
import { MaterialLossService } from './material-loss.service';
import { ReportFilterService } from '../report-filter.service';
import type { MaterialConsumptionReportDataset, MaterialConsumptionReportRequest } from './material-consumption-report.dto';

export interface MaterialReportSources {
  manufacturing: { getAll(): readonly Manufacturing[] };
  houses: Pick<IHouseRepository, 'findByCode'>;
  documents: Pick<IProjectDocumentRepository, 'findByProjectID'>;
  elements: Pick<ElementRepository, 'findByTypeInDocuments'>;
  materials: Pick<MaterialRepository, 'findById'>;
  expansion: Pick<BOMExpansionService, 'expandProduct'>;
}

export function kyivDate(date: Date): string {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('INVALID_MANUFACTURING_DATE');
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const value = (type: string) => parts.find(p => p.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export class MaterialConsumptionReportUseCase {
  constructor(private readonly sources: MaterialReportSources) {}

  execute(request: MaterialConsumptionReportRequest): MaterialConsumptionReportDataset {
    for (const date of [request.dateFrom, request.dateTo]) {
      if (date !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error('INVALID_REPORT_DATE');
    }
    if (request.dateFrom && request.dateTo && request.dateFrom > request.dateTo) throw new Error('INVALID_REPORT_PERIOD');
    const losses = new MaterialLossService(this.sources.materials);
    losses.apply([], request.lossPercents); // Validate all three even for an empty dataset.
    const facts = this.sources.manufacturing.getAll();
    const ids = new Set<string>();
    for (const fact of facts) {
      if (!fact.id || ids.has(fact.id)) throw new Error(`DUPLICATE_MANUFACTURING_ID: ${fact.id}`);
      ids.add(fact.id);
      if (fact.status !== 'ACTIVE' && fact.status !== 'CANCELLED') throw new Error('INVALID_MANUFACTURING_STATUS');
    }
    const filtered = new ReportFilterService().filterManufacturing(facts.filter(f => f.status === 'ACTIVE'), {
      houseCode: request.houseCode, productCode: request.productCode,
    }).filter(f => {
      const date = kyivDate(f.date);
      return (!request.dateFrom || date >= request.dateFrom) && (!request.dateTo || date <= request.dateTo);
    });
    const products = new Map<string, { product: ReturnType<MaterialReportSources['elements']['findByTypeInDocuments']>[number]; qty: number; ids: string[] }>();
    for (const fact of filtered) {
      if (!Number.isFinite(fact.quantity) || fact.quantity <= 0) throw new Error(`INVALID_MANUFACTURING_QUANTITY: ${fact.id}`);
      const house = this.sources.houses.findByCode(fact.houseCode);
      if (!house) throw new Error(`HOUSE_NOT_FOUND: ${fact.id}`);
      const docs = this.sources.documents.findByProjectID(house.projectID).map(d => d.id);
      const matches = this.sources.elements.findByTypeInDocuments('product', docs).filter(p => p.code === fact.productCode);
      if (matches.length !== 1) throw new Error(`${matches.length ? 'AMBIGUOUS_PRODUCT_CODE' : 'PRODUCT_NOT_FOUND'}: ${fact.id}`);
      const product = matches[0];
      const group = products.get(product.id) ?? { product, qty: 0, ids: [] };
      group.qty += fact.quantity; group.ids.push(fact.id);
      if (!Number.isFinite(group.qty)) throw new Error('PRODUCT_QUANTITY_OVERFLOW');
      products.set(product.id, group);
    }
    return { timeZone: 'Europe/Kyiv', bomBasis: 'CURRENT_BOM',
      period: { dateFrom: request.dateFrom, dateTo: request.dateTo },
      products: [...products.values()].map(({ product, qty, ids: manufacturingIds }) => {
        const expansion = this.sources.expansion.expandProduct(product.id);
        if (!expansion.ok) throw new Error(`INCOMPLETE_BOM: ${product.id}: ${expansion.diagnostics.map(d => d.code).join(',')}`);
        // A terminal Element has no explicit canonical Material consumption. Do not invent it.
        const parents = new Set(expansion.lines.map(l => l.parentOccurrenceIndex));
        if (!expansion.lines.length || expansion.lines.some(l => l.edge.child.kind === 'ELEMENT' && !parents.has(l.occurrenceIndex))) {
          throw new Error(`INCOMPLETE_BOM: ${product.id}: terminal Element without Material`);
        }
        const clean = new Map<string, MaterialRequirement>();
        for (const line of expansion.lines) {
          if (line.edge.child.kind !== 'MATERIAL') continue;
          const materialId = line.edge.child.materialId, unit = line.edge.unit;
          const key = JSON.stringify([materialId, unit]);
          const row = clean.get(key) ?? { materialId, unit, qty: 0 };
          row.qty += line.totalQty * qty;
          clean.set(key, row);
        }
        const materials = losses.apply([...clean.values()], request.lossPercents).map(result => {
          const material = this.sources.materials.findById(result.materialId);
          if (!material) throw new Error(`MATERIAL_NOT_FOUND: ${result.materialId}`);
          return { ...result, code: material.code, name: material.name };
        });
        return { productId: product.id, productCode: product.code, productName: product.name,
          productQty: qty, manufacturingIds, materials };
      }) };
  }
}
