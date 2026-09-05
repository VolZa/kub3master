// src\modules\manufacturing\mapping\manufacturingMapper.ts
import { ManufacturingRow } from '../../../infrastructure/sheets/manufacturing/manufacturing.row';
import { ManufacturingInput } from '../types/manufacturingInput';

export class ManufacturingMapper {
  public static mapRowToInput(row: ManufacturingRow): ManufacturingInput {
    return {
      date: row['Дата'],
      shift: String(row['Зміна'] ?? '').trim(),
      productCode: this.normalizeProductCode(row['Код виробу']),
      master: String(row['Майстер'] ?? '').trim(),
      comment: String(row['Примітка'] ?? '').trim(),
      houseCode: String(row['Будинок'] ?? '').trim(),
    };
  }

  public static mapRowsToInputs(
    rows: readonly ManufacturingRow[],
  ): ManufacturingInput[] {
    return rows.map((row) => this.mapRowToInput(row));
  }

  private static normalizeProductCode(value: string | undefined): string {
    return String(value ?? '').replace(/\s+/g, '');
  }
}
