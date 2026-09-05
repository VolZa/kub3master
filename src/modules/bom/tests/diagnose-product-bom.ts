import { getElementRepository } from '../../../app/factories/element.factory';
import { getBOMRepository } from '../../../app/factories/bom.factory';
import { getMaterialRepository } from '../../../app/factories/material.factory';

import { BOMExplorerService } from '../services/bom-explorer.service';

export function diagnoseProductP1(): void {
  const productCode = 'П-1';
  const projectDocumentID = '6';

  const elementRepository = getElementRepository();
  const bomRepository = getBOMRepository();
  const materialRepository = getMaterialRepository();

  const product = elementRepository.findByCode(productCode, projectDocumentID);

  if (!product) {
    throw new Error(
      `Виріб "${productCode}" для ProjectDocumentID=${projectDocumentID} не знайдено.`,
    );
  }

  const bomExplorer = new BOMExplorerService(elementRepository, bomRepository);

  const tree = bomExplorer.getTree(product.id);

  console.log('========================================');
  console.log('🔎 DIAGNOSTIC PARTS — П-1');
  console.log('========================================');

  const rows: Array<{
    parentCode: string;
    partCode: string;
    qty: number;
    length: number;
    materialId: string;
    materialCode: string;
    weightPerMeter: number;
    kg: number;
  }> = [];

  collectParts(tree, '', rows, materialRepository);

  console.log(
    'ParentCode | PartCode | Qty | Length | MaterialID | MaterialCode | WPM | KG',
  );

  for (const row of rows) {
    console.log(
      `${row.parentCode} | ` +
        `${row.partCode} | ` +
        `${row.qty} | ` +
        `${row.length} | ` +
        `${row.materialId} | ` +
        `${row.materialCode} | ` +
        `${row.weightPerMeter} | ` +
        `${row.kg}`,
    );
  }

  console.log('========================================');
  console.log('🔎 R12 ONLY');
  console.log('========================================');

  const r12Rows = rows.filter((row) => row.materialId === '3014');

  let r12Total = 0;

  for (const row of r12Rows) {
    r12Total += row.kg;

    console.log(
      `${row.partCode} | ` +
        `qty=${row.qty} | ` +
        `L=${row.length} | ` +
        `kg=${row.kg}`,
    );
  }

  console.log(`R12 TOTAL = ${Number(r12Total.toFixed(3))} kg`);

  console.log('========================================');
}

function collectParts(
  node: any,
  parentCode: string,
  rows: Array<{
    parentCode: string;
    partCode: string;
    qty: number;
    length: number;
    materialId: string;
    materialCode: string;
    weightPerMeter: number;
    kg: number;
  }>,
  materialRepository: ReturnType<typeof getMaterialRepository>,
): void {
  const element = node.element;

  if (element.type === 'part') {
    const materialId = String(element.parentMaterialID ?? '').trim();

    const material = materialRepository.findById(materialId);

    const length = Number(element.length ?? 0);
    const qty = Number(node.totalQty ?? 0);
    const weightPerMeter = Number(material?.weightPerMeter ?? 0);

    const kg = Number((qty * (length / 1000) * weightPerMeter).toFixed(3));

    rows.push({
      parentCode,
      partCode: element.code,
      qty,
      length,
      materialId,
      materialCode: material?.code ?? '',
      weightPerMeter,
      kg,
    });
  }

  for (const child of node.children) {
    collectParts(child, element.code, rows, materialRepository);
  }
}
// import { getElementRepository } from '../../../app/factories/element.factory';
// import { getBOMRepository } from '../../../app/factories/bom.factory';
// import { getMaterialRepository } from '../../../app/factories/material.factory';

// import { BOMExplorerService } from '../services/bom-explorer.service';
// import { BOMMaterialsService } from '../services/bom-materials.service';

// export function diagnoseProductP1(): void {
//   const productCode = 'П-1';
//   const projectDocumentID = '6';

//   const elementRepository = getElementRepository();
//   const bomRepository = getBOMRepository();
//   const materialRepository = getMaterialRepository();

//   const product = elementRepository.findByCode(productCode, projectDocumentID);

//   if (!product) {
//     throw new Error(
//       `Виріб "${productCode}" для ProjectDocumentID=${projectDocumentID} не знайдено.`,
//     );
//   }

//   console.log('========================================');
//   console.log('🔎 DIAGNOSTIC BOM');
//   console.log('Product:', product);
//   console.log('========================================');

//   const bomExplorer = new BOMExplorerService(elementRepository, bomRepository);

//   const bomMaterialsService = new BOMMaterialsService(
//     bomExplorer,
//     materialRepository,
//   );

//   const tree = bomExplorer.getTree(product.id);

//   console.log('BOM TREE:', JSON.stringify(tree));

//   const requirements = bomMaterialsService.getMaterialRequirements(product.id);

//   console.log('========================================');
//   console.log('📦 MATERIAL REQUIREMENTS');
//   console.log('========================================');

//   for (const requirement of requirements) {
//     const material = materialRepository.findById(requirement.materialId);

//     console.log(
//       JSON.stringify({
//         materialId: requirement.materialId,
//         materialCode: material?.code,
//         materialName: material?.name,
//         qty: requirement.qty,
//         unit: requirement.unit,
//       }),
//     );
//   }

//   console.log('========================================');
// }
