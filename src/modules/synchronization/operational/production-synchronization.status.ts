// src/modules/synchronization/operational/production-synchronization.status.ts

export enum ProductionSynchronizationStatus {
  /**
   * Запис успішно співставлено з Placement.
   */
  MATCHED = 'MATCHED',

  /**
   * Не знайдено відповідного Placement.
   */
  NOT_FOUND = 'NOT_FOUND',

  /**
   * Знайдено декілька можливих Placement.
   */
  MULTIPLE_MATCHES = 'MULTIPLE_MATCHES',

  /**
   * Виріб вже був виготовлений.
   */
  ALREADY_PRODUCED = 'ALREADY_PRODUCED',

  /**
   * Невірний код виробу.
   */
  INVALID_PRODUCT_CODE = 'INVALID_PRODUCT_CODE',
}
