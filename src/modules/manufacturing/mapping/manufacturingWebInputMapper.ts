/**
 * ==========================================================
 * ERP КУБ
 * Module: Manufacturing
 * File: manufacturingWebInputMapper.ts
 * Path: src\modules\manufacturing\mapping\manufacturingWebInputMapper.ts
 *
 * Перетворює дані Web UI у внутрішній ManufacturingInput.
 * ==========================================================
 */

import { ManufacturingInput } from '../types/manufacturing-input';
import { ManufacturingWebInput } from '../types/manufacturing-web-input';

export class ManufacturingWebInputMapper {
  public static mapToInput(
    input: Readonly<ManufacturingWebInput>,
  ): ManufacturingInput {
    return {
      date: this.mapDate(input.date),
      shift: input.shift.trim(),
      houseCode: input.houseCode.trim(),
      productCode: input.productCode.trim(),
      quantity: this.mapQuantity(input.quantity),
      placementId: this.mapPlacementId(input.placementId),
      master: input.master.trim(),
      comment: input.comment.trim(),
    };
  }

  private static mapDate(value: string): Date | undefined {
    if (!value) {
      return undefined;
    }

    const date = new Date(`${value}T00:00:00`);

    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private static mapQuantity(value: number): number | undefined {
    return Number.isFinite(value) ? value : undefined;
  }

  private static mapPlacementId(value: number | undefined): number | undefined {
    if (value === undefined) {
      return undefined;
    }

    return Number.isInteger(value) && value > 0 ? value : undefined;
  }
}
