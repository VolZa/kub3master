//src/modules/catalog/ProductionRules.ts
// 🔥 ProductionRules.ts

import { ElementType } from '../../config/config';
import { CatalogItem } from './catalog.model';

// --------------------------------------------------
// 🔹 1. Детектор бетону (MVP)
// --------------------------------------------------

export function hasConcreteInInput(lines: string[]): boolean {
  return lines.some(
    (line) => line.toLowerCase().includes('бетон') || line.includes('С '),
  );
}

// --------------------------------------------------
// 🔹 2. Перевірка: чи це бетон (через Catalog)
// --------------------------------------------------

export function isConcrete(item: CatalogItem): boolean {
  return item.type === 'material' && item.profileType === 'concrete';
}

// --------------------------------------------------
// 🔹 3. Забезпечити Parent в Catalog
// --------------------------------------------------

export function ensureParentCatalog(
  code: string,
  name: string,
  lines: string[],
  catalogRepo: any, // твій CatalogRepository
  createCatalogItem: (data: Partial<CatalogItem>) => CatalogItem,
): CatalogItem {
  let catalog = catalogRepo.getByCode(code);

  if (catalog) return catalog;

  const isProduct = hasConcreteInInput(lines);

  const type: ElementType = isProduct ? 'product' : 'assembly';

  console.log(`🆕 Auto-create ${type.toUpperCase()}: ${code}`);

  catalog = createCatalogItem({
    typeCode: code,
    name,
    type,
    // baseUnit: 'шт',
    hasBOM: true,
    productionType: 'produced',
  });

  return catalog;
}

// --------------------------------------------------
// 🔹 4. Валідація технології
// --------------------------------------------------

export function validateConcreteRule(parent: CatalogItem, child: CatalogItem) {
  if (isConcrete(child) && parent.type !== 'product') {
    throw new Error(
      `❌ Бетон може входити тільки у виріб. Parent: ${parent.typeCode}`,
    );
  }
}

// --------------------------------------------------
// 🔹 5. Інші базові інваріанти (рекомендую одразу)
// --------------------------------------------------

export function validateCatalogConsistency(item: CatalogItem) {
  if (item.type === 'part' && item.hasBOM) {
    throw new Error(`❌ Part не може мати BOM: ${item.typeCode}`);
  }

  if (item.productionType === 'purchased' && item.hasBOM) {
    throw new Error(`❌ Purchased не може мати BOM: ${item.typeCode}`);
  }
}
