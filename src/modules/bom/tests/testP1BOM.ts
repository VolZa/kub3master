import { GoogleSheetsElementRepository } from '../../elements/element.repository';
import { BOMTreeNode } from '../model/bom-tree-node.model';
import { GoogleSheetsBOMRepository } from '../repositories/google-sheets-bom.repository';
import { BOMExplorerService } from '../services/bom-explorer.service';

export function testP1BOM() {
  const elementRepo = new GoogleSheetsElementRepository();
  const bomRepo = new GoogleSheetsBOMRepository();

  const explorer = new BOMExplorerService(elementRepo, bomRepo);

  const product = elementRepo.findByCode('П-1', '6');

  if (!product) {
    throw new Error('П-1 not found');
  }

  const tree = explorer.getTree(product.id);

  //   console.log(JSON.stringify(tree, null, 2));
  printTree(tree);
  return tree;
}

function printTree(node: BOMTreeNode, level = 0): void {
  const indent = '  '.repeat(level);

  console.log(
    `${indent}${node.element.code} | ` +
      `qty=${node.qty} ${node.unit} | ` +
      `total=${node.totalQty}`,
  );

  node.children.forEach((child) => {
    printTree(child, level + 1);
  });
}
