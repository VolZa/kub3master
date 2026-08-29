import { GoogleSheetsElementRepository } from '../../elements/element.repository';
import { BOMTreeNode } from '../model/bom-tree-node.model';
import { GoogleSheetsBOMRepository } from '../repositories/google-sheets-bom.repository';
import { BOMExplorerService } from '../services/bom-explorer.service';
export function testBOMTree() {
  const elementRepo = new GoogleSheetsElementRepository();
  const bomRepo = new GoogleSheetsBOMRepository();

  const service = new BOMExplorerService(elementRepo, bomRepo);

  const product = elementRepo.findByCode('П-1.1', '6'); // Specify the projectDocumentID if needed

  if (!product) {
    throw new Error('П-1.1  6  not found');
  }

  const tree = service.getTree(product.id);

  //   console.log(JSON.stringify(tree, null, 2));
  printTree(tree);
  function printTree(node: BOMTreeNode, level = 0) {
    const indent = ' '.repeat(level * 2);

    console.log(
      `${indent}${node.element.code} qty=${node.qty} total=${node.totalQty}`,
    );

    node.children.forEach((child) => printTree(child, level + 1));
  }
}
