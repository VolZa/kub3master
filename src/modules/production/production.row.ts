/**
 * ==========================================================
 * ERP КУБ
 * Module: Production
 * File: production.row.ts
 *
 * Path: src\modules\production\production.row.ts
 *
 * таблиці 01_Виготовлення. (OPERATIONAL)
 * ==========================================================
 */

export interface ProductionRow {
  Date: Date; //Дата
  Shift: number; //Зміна
  Code: string; // Код виробу
  Master: string; // Майстер
  Note: string; // Примітка
}
