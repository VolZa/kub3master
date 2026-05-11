import { ElementRepository } from '../elements/element.repository';

export class ProductDetector {
  constructor(private repo: ElementRepository) {}

  isConcreteMaterial(elementId: string): boolean {
    const el = this.repo.findById(elementId);
    return el?.category === 'concrete';
  }

  hasConcreteInBOM(rows: any[][]): boolean {
    for (const row of rows) {
      const childId = row[1];

      if (this.isConcreteMaterial(childId)) {
        return true;
      }
    }

    return false;
  }

  detectAndUpdate(parentId: string, rows: any[][]) {
    const hasConcrete = this.hasConcreteInBOM(rows);

    if (!hasConcrete) return;

    const parent = this.repo.findById(parentId);
    if (!parent) return;

    if (parent.type === 'product') return;

    this.repo.updateType(parentId, 'product');

    console.log(`✅ Element ${parent.code} marked as PRODUCT`);
  }
}
