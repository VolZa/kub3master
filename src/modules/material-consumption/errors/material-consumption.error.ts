// src/modules/material-consumption/errors/material-consumption.error.ts

/**
 * Базова Domain Error для Material Consumption.
 */
export class MaterialConsumptionError extends Error {
  constructor(message: string) {
    super(message);

    this.name = 'MaterialConsumptionError';
  }
}

/**
 * BOM містить циклічне посилання.
 */
export class CircularBOMError extends MaterialConsumptionError {
  constructor(elementId: string) {
    super(`Circular BOM detected at element: ${elementId}`);

    this.name = 'CircularBOMError';
  }
}

/**
 * Матеріал, необхідний для розрахунку, відсутній.
 */
export class MissingMaterialError extends MaterialConsumptionError {
  constructor(materialId: string) {
    super(`Material not found: ${materialId}`);

    this.name = 'MissingMaterialError';
  }
}

/**
 * Некоректна кількість у BOM.
 */
export class InvalidQuantityError extends MaterialConsumptionError {
  constructor(elementId: string, quantity: number) {
    super(`Invalid quantity for element ${elementId}: ${quantity}`);

    this.name = 'InvalidQuantityError';
  }
}

/**
 * Одиниця виміру не підтримується.
 */
export class UnsupportedUnitError extends MaterialConsumptionError {
  constructor(unit: string) {
    super(`Unsupported unit: ${unit}`);

    this.name = 'UnsupportedUnitError';
  }
}

/**
 * Виріб, для якого виконується розрахунок, відсутній.
 */
export class MissingProductError extends MaterialConsumptionError {
  constructor(productId: string) {
    super(`Product not found: ${productId}`);

    this.name = 'MissingProductError';
  }
}
