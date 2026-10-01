/**
 * src/modules/bom/expansion/bom-expansion.row.ts
 *
 * Модуль: BOM
 * Layer: Application / DTO
 *
 * Відповідальність:
 * - описує один вузол розгорнутого BOM;
 * - зберігає локальну кількість BOM-зв'язку;
 * - зберігає розраховану кількість відносно Product;
 * - зберігає шлях проходження BOM для трасування.
 */

export interface BOMExpansionRow {
  /**
   * Рівень відносно Product.
   *
   * Product → child = 1
   * Product → child → child = 2
   */
  level: number;

  /**
   * Безпосередній батьківський елемент.
   */
  parentId: string;
  parentCode: string;

  /**
   * Поточний дочірній елемент.
   */
  elementId: string;
  elementCode: string;
  elementName: string;
  elementType: string;

  /**
   * Кількість у безпосередньому BOM-зв'язку.
   */
  directQty: number;

  /**
   * Кількість елемента в розрахунку на один Product.
   *
   * Наприклад:
   * 1 × 7 × 0.85 = 5.95 кг
   */
  totalQty: number;

  /**
   * Одиниця виміру BOM-зв'язку.
   */
  unit: string;

  /**
   * Повний шлях від Product до поточного елемента.
   *
   * Зберігаємо ID, а не Code, оскільки ID є стабільним ключем.
   */
  path: readonly string[];
}
