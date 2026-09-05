// src/app/factories/bom.factory.ts

import { GoogleSheetsBOMRepository } from '../../modules/bom/repositories/google-sheets-bom.repository';

let repository: GoogleSheetsBOMRepository | null = null;

export function getBOMRepository(): GoogleSheetsBOMRepository {
  if (!repository) {
    repository = new GoogleSheetsBOMRepository();
  }

  return repository;
}
