// src/core/bootstrap/bootstrap.ts

import { createRepositories } from './repositories';
import { createBOMServices } from './bom';
import { createReportServices } from './reports';

export function createServices() {
  const repositories = createRepositories();

  const bom = createBOMServices(repositories);

  const reports = createReportServices(repositories, bom);

  return {
    repositories,

    services: {
      bom,

      reports,
    },
  };
}
