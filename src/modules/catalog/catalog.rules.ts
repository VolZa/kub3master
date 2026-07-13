//src/modules/catalog/catalog.rules.ts
import { ELEMENT_TYPES, PRODUCTION_TYPES } from '../../config/config';
import { CatalogItem } from './catalog.model';

export function validateCatalogItem(
  item: CatalogItem,
  resolvedType: 'material' | 'part' | 'assembly' | 'product',
) {
  // -----------------------------
  // 🔴 1. BOM rules
  // -----------------------------

  if (item.type === ELEMENT_TYPES.PART && item.hasBOM) {
    throw new Error(`❌ Part cannot have BOM: ${item.typeCode}`);
  }

  if (item.type === ELEMENT_TYPES.MATERIAL && item.hasBOM) {
    throw new Error(`❌ Material cannot have BOM: ${item.typeCode}`);
  }

  if (item.productionType === PRODUCTION_TYPES.PURCHASED && item.hasBOM) {
    throw new Error(`❌ Purchased cannot have BOM: ${item.typeCode}`);
  }

  // -----------------------------
  // 🟡 2. Production rules
  // -----------------------------

  if (
    item.type === ELEMENT_TYPES.MATERIAL &&
    item.productionType !== PRODUCTION_TYPES.PURCHASED
  ) {
    throw new Error(`❌ Material must be purchased: ${item.typeCode}`);
  }

  if (
    item.type === ELEMENT_TYPES.PRODUCT &&
    item.productionType !== PRODUCTION_TYPES.PRODUCED
  ) {
    throw new Error(`❌ Product must be produced: ${item.typeCode}`);
  }

  // -----------------------------
  // 🟢 3. BOM expectation
  // -----------------------------

  if (
    item.type === ELEMENT_TYPES.ASSEMBLY &&
    item.productionType === PRODUCTION_TYPES.PRODUCED &&
    !item.hasBOM
  ) {
    throw new Error(`❌ Assembly should have BOM: ${item.typeCode}`);
  }

  // -----------------------------
  // 🔵 4. Category sanity (мінімально)
  // -----------------------------

  if (!item.category) {
    throw new Error(`❌ Category is required: ${item.typeCode}`);
  }
}

//import { ELEMENT_TYPES, PRODUCTION_TYPES } from '../../config/config';
// import { CatalogItem } from './catalog.model';

// export function validateCatalogConsistency(item: CatalogItem) {
//   if (item.type === ELEMENT_TYPES.PART && item.hasBOM) {
//     throw new Error('❌ Part cannot have BOM');
//   }

//   if (item.type === ELEMENT_TYPES.MATERIAL && item.hasBOM) {
//     throw new Error('❌ Material cannot have BOM');
//   }

//   if (item.productionType === PRODUCTION_TYPES.PURCHASED && item.hasBOM) {
//     throw new Error('❌ Purchased cannot have BOM');
//   }
// }
