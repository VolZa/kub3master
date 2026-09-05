import { getHouseRepository } from '../../../app/factories/house.factory';
import { getProjectDocumentRepository } from '../../../app/factories/project-document.factory';
import { getElementRepository } from '../../../app/factories/element.factory';
import { sheetProvider } from '../../../app/factories/infrastructure.factory';

import { GoogleSheetsManufacturingDataSource } from '../../../infrastructure/sheets/manufacturing/GoogleSheetsManufacturingDataSource';

import { ManufacturingResolver } from '../services/manufacturingResolver';
import { ManufacturingProcessor } from '../services/manufacturingProcessor';

export function testManufacturingProcessor(): void {
  // -------------------------------------------------------
  // Repositories
  // -------------------------------------------------------

  const houseRepository = getHouseRepository();

  const projectDocumentRepository = getProjectDocumentRepository();

  const elementRepository = getElementRepository();

  // -------------------------------------------------------
  // DataSource
  // -------------------------------------------------------

  const dataSource = new GoogleSheetsManufacturingDataSource(sheetProvider);

  const rows = dataSource.getRows();

  // -------------------------------------------------------
  // Resolver
  // -------------------------------------------------------

  const resolver = new ManufacturingResolver(
    houseRepository,
    projectDocumentRepository,
    elementRepository,
  );

  // -------------------------------------------------------
  // Processor
  // -------------------------------------------------------

  const processor = new ManufacturingProcessor(resolver);

  const result = processor.process(rows);

  // -------------------------------------------------------
  // Result
  // -------------------------------------------------------

  Logger.log('========================================');
  Logger.log('MANUFACTURING PROCESSOR');
  Logger.log('========================================');

  Logger.log(`📋 Прочитано рядків: ${rows.length}`);

  Logger.log(`✅ Успішно оброблено: ${result.items.length}`);

  Logger.log(`⚠️ Помилок: ${result.errors.length}`);

  // -------------------------------------------------------
  // Errors
  // -------------------------------------------------------

  if (result.errors.length > 0) {
    Logger.log('========================================');
    Logger.log('⚠️ ПРОПУЩЕНІ РЯДКИ');
    Logger.log('========================================');

    result.errors.forEach((error) => {
      Logger.log(
        `Рядок ${error.rowNumber}: ` +
          `Код=${error.productCode}; ` +
          `Будинок=${error.houseCode}; ` +
          `Причина=${error.reason}`,
      );
    });
  }

  // -------------------------------------------------------
  // Successfully resolved records
  // -------------------------------------------------------

  Logger.log('========================================');
  Logger.log("✅ УСПІШНО РОЗВ'ЯЗАНІ");
  Logger.log('========================================');

  result.items.forEach((item, index) => {
    Logger.log(
      `${index + 1}: ` +
        `Дата=${item.input.date}; ` +
        `Код=${item.input.productCode}; ` +
        `Будинок=${item.house.code}; ` +
        `ProjectID=${item.projectId}; ` +
        `ProjectDocumentID=${item.projectDocumentId}; ` +
        `ProductID=${item.productId}`,
    );
  });
}
