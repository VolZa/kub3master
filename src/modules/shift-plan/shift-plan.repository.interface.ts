import { ShiftPlan } from './shift-plan.model';
import { ShiftPlanStatus } from './shift-plan.status';

export interface IShiftPlanRepository extends IDocumentRepository<ShiftPlan> {
  //   getAll(): ShiftPlan[];
  //   getById(id: number): ShiftPlan | null;

  /**
   * Повертає документи за статусом.
   */
  findByStatus(status: ShiftPlanStatus): ShiftPlan[];

  /**
   * Повертає документи за датою.
   */
  findByDate(date: Date): ShiftPlan[];

  //   create(plan: ShiftPlan): void;
  //   update(plan: ShiftPlan): void;
  //   delete(id: number): void;
}

export interface IDocumentRepository<T> {
  /**
   * Повертає всі документи.
   */
  getAll(): T[];

  /**
   * Повертає документ за ID.
   */
  findById(id: number): T | null;

  /**
   * Створити новий документ.
   */
  create(item: T): void;

  /**
   * Оновити документ.
   */
  update(item: T): void;

  /**
   * Видалити документ.
   */

  delete(id: number): void;
}
