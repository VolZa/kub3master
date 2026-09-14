/**
 * ==========================================================
 * ERP КУБ
 * Module: Web UI
 * File: webApp.ts
 * Path: src\ui\webApp.ts
 *
 * Entry point Web App.
 * ==========================================================
 */
import { ManufacturingWebInput } from '../modules/manufacturing/types/manufacturing-web-input';
import { ManufacturingWebInputMapper } from '../modules/manufacturing/mapping/manufacturingWebInputMapper';
import { getManufacturingCreationApplicationService } from '../app/factories/manufacturing-creation.factory';

import { getHouseRepository } from '../app/factories/house.factory';
import { getPlacementRepository } from '../app/factories/placement.factory';

import { ManufacturingHouseOptionsService } from '../modules/manufacturing/services/manufacturing-house-options.service';
import { ManufacturingProductOptionsService } from '../modules/manufacturing/services/manufacturing-product-options.service';
import { ManufacturingPlacementOptionsService } from '../modules/manufacturing/services/manufacturing-placement-options.service';

export function doGet(): GoogleAppsScript.HTML.HtmlOutput {
  return HtmlService.createHtmlOutputFromFile('Manufacturing').setTitle(
    'ERP КУБ — Виготовлення',
  );
}

export function testManufacturingWeb(
  date: string,
  shift: string,
  houseCode: string,
  productCode: string,
  quantity: number,
  placementId: number | undefined,
  master: string,
  comment: string,
): string {
  return [
    `Дата: ${date}`,
    `Зміна: ${shift}`,
    `Будинок: ${houseCode}`,
    `Виріб: ${productCode}`,
    `Кількість: ${quantity}`,
    `Позиція: ${placementId ?? ''}`,
    `Майстер: ${master}`,
    `Примітка: ${comment}`,
  ].join('\n');
}

export function createManufacturingFromWeb(
  webInput: Readonly<ManufacturingWebInput>,
): string {
  const input = ManufacturingWebInputMapper.mapToInput(webInput);

  const service = getManufacturingCreationApplicationService();

  const manufacturing = service.create(input);

  return manufacturing.id;
}

export function getManufacturingHouseOptions() {
  const service = new ManufacturingHouseOptionsService(getHouseRepository());

  return service.getOptions();
}

export function getManufacturingProductOptions(houseCode: string) {
  const service = new ManufacturingProductOptionsService(
    getPlacementRepository(),
  );

  return service.getOptions(houseCode);
}

export function getManufacturingPlacementOptions(
  houseCode: string,
  productCode: string,
) {
  const service = new ManufacturingPlacementOptionsService(
    getPlacementRepository(),
  );

  return service.getOptions(houseCode, productCode);
}
