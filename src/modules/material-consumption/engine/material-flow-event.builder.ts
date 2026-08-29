// src/modules/material-consumption/engine/material-flow-event.builder.ts

import { BOMTreeNode } from '../../bom/model/bom-tree-node.model';
import { MaterialFlowEvent } from '../models/material-flow-event';
import { CalculationContext } from '../models/calculation-context';
import { MaterialFlowOriginType } from '../models/material-flow-origin';
import { UnsupportedUnitError } from '../errors/material-consumption.error';
import { isMaterialUnit } from '../models/material-unit';

export interface MaterialFlowEventBuilderContext {
  context: CalculationContext;
  originType: MaterialFlowOriginType;
  originId: string;
  productId: string;
}

export class MaterialFlowEventBuilder {
  build(
    node: BOMTreeNode,
    context: MaterialFlowEventBuilderContext,
  ): MaterialFlowEvent | null {
    if (node.element.type !== 'material') {
      return null;
    }

    if (!node.element.id) {
      throw new Error('Material element ID is required.');
    }

    // const unit = node.element.baseUnit;
    const unit = node.unit;

    if (!isMaterialUnit(unit)) {
      throw new UnsupportedUnitError(unit);
    }

    return {
      context: context.context,

      originType: context.originType,
      originId: context.originId,

      productId: context.productId,
      materialId: node.element.id,

      quantity: node.totalQty,
      unit,
    };
  }
}
