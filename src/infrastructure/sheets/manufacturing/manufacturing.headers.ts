// src/infrastructure/sheets/manufacturing/manufacturing.headers.ts
// Module: Manufacturing
// Layer: Infrastructure / Sheets
// Responsibility: Header schema for the 01_Виготовлення sheet

export const MANUFACTURING_HEADERS = [
  'ID',
  'Дата',
  'Зміна',
  'Будинок',
  'Код виробу',
  'Кількість',
  'Позиція',
  'Майстер',
  'Примітка',
  'Статус',
  'Створено',
  'Змінено',
] as const;

// export const MANUFACTURING_HEADERS = [
//   'Дата',
//   'Зміна',
//   'Код виробу',
//   'Майстер',
//   'Примітка',
//   'Будинок',
// ] as const;
