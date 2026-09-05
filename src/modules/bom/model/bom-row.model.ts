// src\modules\bom\model\bom-row.model.ts
export interface BOMRow {
  parentId: string;
  childId: string;
  qty: number;
  unit: string;

  parentCode?: string;
  childCode?: string;
}
