/**
 * src/modules/bom/services/bom-completeness-checker.ts
 *
 * Модуль: BOM
 * Layer: Application / Domain Service
 *
 * Відповідальність:
 * - рекурсивна перевірка повноти BOM;
 * - виявлення відсутніх Element;
 * - виявлення відсутнього BOM;
 * - перевірка зв'язку Part → Material;
 * - формування попереджень для оператора.
 *
 * Сервіс не змінює дані.
 */

import { ElementRepository } from '../../elements/element.repository';
import { ElementFull } from '../../elements/element.model';
import { CatalogHelper } from '../../catalog/catalog.helper';
import { BOMRepository } from '../../bom/bom.repository.interface';

export type BOMWarningType =
  | 'ELEMENT_NOT_FOUND'
  | 'ELEMENT_BOM_MISSING'
  | 'PART_MATERIAL_MISSING'
  | 'CATALOG_TEMPLATE_MISSING';

export interface BOMWarning {
  type: BOMWarningType;

  elementId: string;
  elementCode: string;

  message: string;

  path: readonly string[];
}

export class BOMCompletenessChecker {
  constructor(
    private readonly bomRepository: BOMRepository,
    private readonly elementRepository: ElementRepository,
    private readonly catalogHelper: CatalogHelper,
  ) {}

  /**
   * Перевіряє повноту BOM, починаючи з кореневого Element.
   */
  check(rootElementId: string): BOMWarning[] {
    const warnings: BOMWarning[] = [];
    const visited = new Set<string>();

    const root = this.elementRepository.findById(rootElementId);

    if (!root) {
      warnings.push({
        type: 'ELEMENT_NOT_FOUND',
        elementId: rootElementId,
        elementCode: rootElementId,
        message: `Element не знайдено: ${rootElementId}`,
        path: [rootElementId],
      });

      return warnings;
    }

    this.checkElement(root, [root.code], visited, warnings);

    return warnings;
  }

  private checkElement(
    element: ElementFull,
    path: readonly string[],
    visited: Set<string>,
    warnings: BOMWarning[],
  ): void {
    const children = this.bomRepository.getChildrenRows(element.id);
    if (element.id === '4009') {
      console.log(
        '🔎 CHECK 4009:',
        JSON.stringify(
          {
            id: element.id,
            code: element.code,
            type: element.type,
            parentMaterialID: element.parentMaterialID,
            visited: visited.has(element.id),
            children,
          },
          null,
          2,
        ),
      );
    }
    // ------------------------------------------------------------
    // Локальна перевірка Part → Material
    // ------------------------------------------------------------

    if (element.type === 'part' && element.parentMaterialID) {
      const materialLinkExists = children.some(
        (row) => String(row.childId) === String(element.parentMaterialID),
      );

      if (!materialLinkExists) {
        const material = this.elementRepository.findById(
          element.parentMaterialID,
        );

        const materialCode = material?.code ?? element.parentMaterialID;

        warnings.push({
          type: 'PART_MATERIAL_MISSING',
          elementId: element.id,
          elementCode: element.code,
          message:
            `Для деталі "${element.code}" відсутній BOM-зв'язок ` +
            `з матеріалом "${materialCode}".`,
          path: [...path, materialCode],
        });
      }
    }

    // ------------------------------------------------------------
    // Далі visited захищає від повторного обходу піддерева
    // ------------------------------------------------------------

    if (visited.has(element.id)) {
      return;
    }

    visited.add(element.id);

    // ------------------------------------------------------------
    // Перевірка Catalog / необхідності BOM
    // ------------------------------------------------------------

    const requiresBOM = this.elementRequiresBOM(element, path, warnings);

    // Якщо BOM очікується, але його немає — warning.
    if (requiresBOM && children.length === 0) {
      warnings.push({
        type: 'ELEMENT_BOM_MISSING',
        elementId: element.id,
        elementCode: element.code,
        message:
          `Для елемента "${element.code}" очікується BOM, ` +
          `але дочірні записи відсутні.`,
        path,
      });

      return;
    }

    // Якщо BOM існує — перевіряємо його незалежно від hasBOM.

    // ------------------------------------------------------------
    // Рекурсивна перевірка дочірніх елементів
    // ------------------------------------------------------------

    for (const childRow of children) {
      const child = this.elementRepository.findById(String(childRow.childId));

      if (!child) {
        const childCode = childRow.childCode ?? String(childRow.childId);

        warnings.push({
          type: 'ELEMENT_NOT_FOUND',
          elementId: String(childRow.childId),
          elementCode: childCode,
          message:
            `У BOM елемента "${element.code}" ` +
            `вказано дочірній елемент "${childCode}", ` +
            `але його немає в 00_Elements.`,
          path: [...path, childCode],
        });

        continue;
      }

      this.checkElement(child, [...path, child.code], visited, warnings);
    }
  }
  /**
   * Визначає, чи повинен Element мати власний BOM.
   *
   * Правило визначається CatalogHelper / Catalog,
   * а не типом Element, щоб не зашивати
   * технологічні правила в checker.
   */
  private elementRequiresBOM(
    element: ElementFull,
    path: readonly string[],
    warnings: BOMWarning[],
  ): boolean {
    try {
      const template = this.catalogHelper.resolveTemplate(element.prefixName);

      return template.hasBOM === true;
    } catch (error) {
      warnings.push({
        type: 'CATALOG_TEMPLATE_MISSING',
        elementId: element.id,
        elementCode: element.code,
        message:
          `Для елемента "${element.code}" ` +
          `не знайдено шаблон Catalog ` +
          `для PrefixName "${element.prefixName}".`,
        path,
      });

      return false;
    }
  }
}
