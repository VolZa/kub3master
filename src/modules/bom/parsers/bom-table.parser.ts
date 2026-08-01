// import { ElementRepository } from '../../elements/element.repository';
// import {
//   getOrCreateAssemblyWithName,
// } from '../../elements/assembly.service';
// import { insertBOMRows } from '../bom.repository';
// import { TableRowInput } from '../model/table-row-input.model';
// import { aggregateBOMRows, buildBOMRow } from '../bom.service';

// import { deleteBOMTree } from '../bom.repository';
// import { mapTableRowToStructured } from './mappers/table-row.mapper';

// import { CatalogService } from '../../catalog/catalog.service';

//debug
import { debug } from '../../../utils/debug';
// import { calcRebarWeight } from '../../../utils/rebar';
// import { getOrCreateRebarPart } from '../../services/part.service';
// import { addMissingElement } from '../missing/missing.repository';
// import { ICatalogRepository } from '../catalog/catalog.repository.interface';
// import { mapTableRowToStructured } from './parsers/mappers/table-row.mapper';
// // import { parseStructuredLine } from './parsers/parseStucturedLine';
// import { CatalogService } from '../catalog/catalog.service';
// import { MaterialBatchRepository } from '../../domain/materials/material-batch.repository';
// // import { buildBOMFromTable } from './parsers/bom-table.parser';

type CreateBOMInput = {
  parentCode: string;
  specification: string;
};

function _createBOM(data: CreateBOMInput): string {
  console.log('RAW SPEC:\n' + data.specification);

  const lines = data.specification.split('\n');

  const parsed = lines.map((line) => {
    const parts = line.trim().split(' ');
    return {
      name: parts.slice(0, -1).join(' '),
      qty: Number(parts[parts.length - 1]),
    };
  });

  console.log('PARSED:', JSON.stringify(parsed, null, 2));

  return `Parsed ${parsed.length} items`;
}

export const createBOM = debug('createBOM', _createBOM);
