export interface ProductionRecord {
  /**
   * Дата виготовлення.
   */
  date: Date;

  /**
   * Номер зміни.
   */
  shift?: number;

  /**
   * Код виробу після нормалізації.
   */
  productCode: string;

  /**
   * Майстер зміни.
   */
  master?: string;

  /**
   * Примітка.
   */
  comment?: string;
}
// export interface ProductionRecord {
//   date: Date;

//   shift?: number;

//   productCode: string;

//   master?: string;

//   comment?: string;
// }
