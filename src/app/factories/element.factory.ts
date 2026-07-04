import { GoogleSheetsElementRepository } from '../../modules/elements/element.repository';

let repository: GoogleSheetsElementRepository | null = null;

export function getElementRepository(): GoogleSheetsElementRepository {
  if (!repository) {
    repository = new GoogleSheetsElementRepository();
  }

  return repository;
}
