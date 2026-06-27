export interface BOMRow {
  parentId: string;
  childId: string;
  qty: number;
  unit: string;

  parentCode?: string;
  childCode?: string;
}
