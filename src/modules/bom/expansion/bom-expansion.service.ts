/**
 * src/modules/bom/expansion/bom-expansion.service.ts
 *
 * Модуль: BOM
 * Layer: Application
 *
 * Відповідальність:
 * - рекурсивно розгортає BOM конкретного Product;
 * - розраховує кількість кожного вузла відносно Product;
 * - зберігає шлях проходження BOM;
 * - виявляє циклічні BOM-зв'язки;
 * - розрізняє Element та Material;
 * - не виконує агрегацію елементів.
 */

import { BOMRepository } from '../bom.repository.interface';
import { BOMRow } from '../model/bom-row.model';

import { ElementRepository } from '../../elements/element.repository';
import { ElementFull } from '../../elements/element.model';

import { MaterialRepository } from '../../../domain/materials/material.repository';
import { Material } from '../../../domain/materials/material.model';

import { BOMExpansionRow } from './bom-expansion.row';

interface ExpansionContext {
  level: number;
  parentId: string;
  parentCode: string;
  parentTotalQty: number;
  path: readonly string[];
}

interface BOMNode {
  id: string;
  code: string;
  name: string;
  type: string;
  isMaterial: boolean;
}

export class BOMExpansionService {
  private readonly elementsById: Map<string, ElementFull>;
  private readonly materialsById: Map<string, Material>;

  constructor(
    private readonly bomRepository: BOMRepository,
    elementRepository: ElementRepository,
    materialRepository: MaterialRepository,
  ) {
    this.elementsById = new Map();

    const elementTypes = ['product', 'assembly', 'part', 'material'] as const;

    for (const type of elementTypes) {
      const elements = elementRepository.findByType(type);

      for (const element of elements) {
        this.elementsById.set(String(element.id), element);
      }
    }

    this.materialsById = new Map();

    for (const material of materialRepository.getAll()) {
      this.materialsById.set(String(material.id), material);
    }
  }

  /**
   * Повністю розгортає BOM одного Product.
   */
  public expandProduct(productId: string): BOMExpansionRow[] {
    const product = this.getElement(productId);

    if (product.type !== 'product') {
      throw new Error(
        `Element ${productId} is not a Product. ` +
          `Actual type: ${product.type}`,
      );
    }

    const result: BOMExpansionRow[] = [];

    const children = this.bomRepository.getChildrenRows(productId);

    for (const bomRow of children) {
      this.expandChild(
        bomRow,
        {
          level: 1,
          parentId: productId,
          parentCode: String(product.code),
          parentTotalQty: 1,
          path: [productId],
        },
        result,
      );
    }

    return result;
  }

  /**
   * Рекурсивно розгортає один BOM-зв'язок.
   */
  private expandChild(
    bomRow: BOMRow,
    context: ExpansionContext,
    result: BOMExpansionRow[],
  ): void {
    const childId = String(bomRow.childId);

    // Перевіряємо цикл ДО додавання childId у path.
    if (context.path.includes(childId)) {
      const cyclePath = [...context.path, childId].join(' → ');

      throw new Error(`BOM cycle detected: ${cyclePath}`);
    }

    const node = this.getNode(childId);

    const totalQty = context.parentTotalQty * Number(bomRow.qty);

    const currentPath = [...context.path, childId];

    result.push({
      level: context.level,

      parentId: context.parentId,
      parentCode: context.parentCode,

      elementId: childId,
      elementCode: node.code,
      elementName: node.name,
      elementType: node.type,

      directQty: Number(bomRow.qty),
      totalQty,
      unit: String(bomRow.unit),

      path: currentPath,
    });

    // Material — кінцевий вузол.
    if (node.isMaterial) {
      return;
    }

    const children = this.bomRepository.getChildrenRows(childId);

    // Немає дочірніх BOM-записів.
    if (children.length === 0) {
      return;
    }

    for (const childRow of children) {
      this.expandChild(
        childRow,
        {
          level: context.level + 1,
          parentId: childId,
          parentCode: node.code,
          parentTotalQty: totalQty,
          path: currentPath,
        },
        result,
      );
    }
  }

  /**
   * Шукає вузол спочатку серед Element,
   * потім серед Material.
   */
  private getNode(id: string): BOMNode {
    const element = this.elementsById.get(id);

    if (element) {
      return {
        id,
        code: String(element.code),
        name: String(element.name),
        type: String(element.type),
        isMaterial: false,
      };
    }

    const material = this.materialsById.get(id);

    if (material) {
      return {
        id,
        code: material.code,
        name: material.name,
        type: 'material',
        isMaterial: true,
      };
    }

    throw new Error(`BOM expansion: Element or Material not found: ${id}`);
  }

  /**
   * Повертає Element.
   *
   * Використовується для кореневого Product.
   */
  private getElement(id: string): ElementFull {
    const element = this.elementsById.get(String(id));

    if (!element) {
      throw new Error(`BOM expansion: Product Element not found: ${id}`);
    }

    return element;
  }
}
