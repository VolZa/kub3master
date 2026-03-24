export const ELEMENT_FIELDS = {
  ID: 'ID',
  CODE: 'Code',
  BASE_UNIT: 'BaseUnit', // 🔥 правильно
} as const;

export const BOM_FIELDS = {
  PARENT_ID: 'ParentID',
  CHILD_ID: 'ChildID',
  QTY: 'Qty',
  UNIT: 'Unit',
} as const;
