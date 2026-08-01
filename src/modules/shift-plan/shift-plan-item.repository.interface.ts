import { ShiftPlanItem } from './shift-plan-item.model';

export interface IShiftPlanItemRepository {
  /**
   * Повертає всі рядки змінного завдання.
   */
  findByPlanId(shiftPlanId: number): ShiftPlanItem[];

  /**
   * Повертає рядок документа за ID.
   */
  getById(id: number): ShiftPlanItem | null;

  /**
   * Додає новий рядок документа.
   */
  create(item: ShiftPlanItem): void;

  /**
   * Оновлює рядок документа.
   */
  update(item: ShiftPlanItem): void;

  /**
   * Видаляє рядок документа.
   */
  delete(id: number): void;

  /**
   * Видаляє всі рядки документа.
   */
  deleteByPlanId(shiftPlanId: number): void;

  //Чи не додали ми вже цю плиту в це змінне завдання?
  // containsPlacement(shiftPlanId: number, placementId: number): boolean;
}

// import { ShiftPlanItem } from './shift-plan-item.model';

// export interface IShiftPlanItemRepository {
//   /**
//    * Усі рядки документа.
//    */
//   findByPlanId(shiftPlanId: number): ShiftPlanItem[];

//   /**
//    * Додати рядок.
//    */
//   create(item: ShiftPlanItem): void;

//   /**
//    * Оновити рядок.
//    */
//   update(item: ShiftPlanItem): void;

//   /**
//    * Видалити рядок.
//    */
//   delete(shiftPlanId: number, placementId: number): void;

//   /**
//    * Видалити всі рядки документа.
//    */
//   deleteByPlanId(shiftPlanId: number): void;
// }
