// src / debug / synchronization - report.ts;
import { ProductionSynchronizationResult } from '../../synchronization/operational/production-synchronization-result.model';
import { ProductionSynchronizationStatus } from '../../synchronization/operational/production-synchronization.status';

export class ProductionSynchronizationReport {
  static print(results: ProductionSynchronizationResult[]): void {
    Logger.log('');
    Logger.log('==========================================');
    Logger.log('ERP КУБ :: Production Synchronization');
    Logger.log('==========================================');

    let matched = 0;
    let errors = 0;

    for (const result of results) {
      switch (result.status) {
        case ProductionSynchronizationStatus.MATCHED:
          matched++;

          Logger.log(
            '✔ %s -> Placement #%s',
            result.record.productCode,
            result.placement?.id,
          );
          break;

        default:
          errors++;

          Logger.log(
            '✖ %s -> %s',
            result.record.productCode,
            result.message ?? result.status,
          );
      }
    }

    Logger.log('------------------------------------------');
    Logger.log('Matched : %s', matched);
    Logger.log('Errors  : %s', errors);
    Logger.log('Total   : %s', results.length);
    Logger.log('==========================================');
  }
}
