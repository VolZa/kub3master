// src/infrastructure/sheets/manufacturing/manufacturing.row.ts
// Module: Manufacturing
// Layer: Infrastructure / Sheets
// Responsibility: Physical row model for the 01_Виготовлення sheet

export interface ManufacturingRow {
  ID: string;
  Дата: Date;
  Зміна: string;
  Будинок: string;
  'Код виробу': string;
  Кількість: number;
  Позиція: number | undefined;
  Майстер: string;
  Примітка: string;
  Статус: string;
  Створено: Date;
  Змінено: Date;
}
