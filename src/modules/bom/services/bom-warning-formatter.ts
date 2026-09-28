/**
 * src/modules/bom/services/bom-warning-formatter.ts
 *
 * Модуль: BOM
 * Layer: Application / Presentation Support
 *
 * Відповідальність:
 * - перетворення BOMWarning[] у зрозуміле повідомлення для оператора;
 * - визначення рівня повідомлення;
 * - форматування шляху BOM.
 *
 * Сервіс не змінює дані.
 */

import { BOMWarning } from './bom-completeness-checker';

export type BOMWarningSeverity = 'WARNING' | 'ERROR' | 'INFO';

export interface BOMOperatorMessage {
  severity: BOMWarningSeverity;
  title: string;
  text: string;
}

export class BOMWarningFormatter {
  public format(
    warnings: readonly BOMWarning[],
    rootCode?: string,
  ): BOMOperatorMessage | null {
    if (warnings.length === 0) {
      return null;
    }

    const lines: string[] = [];

    if (rootCode) {
      lines.push(`Виріб: ${rootCode}`);
      lines.push('');
    }

    for (let index = 0; index < warnings.length; index += 1) {
      const warning = warnings[index];

      lines.push(`${index + 1}. ${this.formatWarning(warning)}`);

      if (warning.path.length > 0) {
        lines.push(`   Шлях: ${warning.path.join(' → ')}`);
      }

      lines.push('');
    }

    return {
      severity: 'WARNING',
      title: '⚠️ BOM має зауваження',
      text: lines.join('\n').trim(),
    };
  }

  private formatWarning(warning: BOMWarning): string {
    switch (warning.type) {
      case 'ELEMENT_BOM_MISSING':
        return (
          `Елемент "${warning.elementCode}" ` +
          `очікує BOM, але дочірні записи відсутні.`
        );

      case 'PART_MATERIAL_MISSING':
        return (
          `Для деталі "${warning.elementCode}" ` +
          `відсутній зв'язок з матеріалом.`
        );

      case 'ELEMENT_NOT_FOUND':
        return (
          `Елемент "${warning.elementCode}" ` + `не знайдено в довідниках.`
        );

      case 'CATALOG_TEMPLATE_MISSING':
        return (
          `Для елемента "${warning.elementCode}" ` +
          `не знайдено шаблон у Catalog.`
        );

      default:
        return warning.message;
    }
  }
}
