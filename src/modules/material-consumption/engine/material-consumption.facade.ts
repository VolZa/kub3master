// src/modules/material-consumption/engine/material-consumption.facade.ts

import { BOMTreeNode } from '../../bom/model/bom-tree-node.model';
import { MaterialFlow } from '../models/material-flow';
import {
  MaterialFlowEventBuilder,
  MaterialFlowEventBuilderContext,
} from './material-flow-event.builder';
import { BOMTraverser } from './bom-traverser';
import { MaterialConsumptionValidator } from './material-consumption.validator';
import { MaterialFlowEventVisitor } from './material-flow-event.visitor';

export class MaterialConsumptionFacade {
  constructor(
    private readonly validator: MaterialConsumptionValidator,
    private readonly traverser: BOMTraverser,
    private readonly eventBuilder: MaterialFlowEventBuilder,
  ) {}

  calculate(
    root: BOMTreeNode,
    context: MaterialFlowEventBuilderContext,
  ): MaterialFlow {
    this.validator.validate(root);

    const visitor = new MaterialFlowEventVisitor(this.eventBuilder, context);

    this.traverser.traverse(root, visitor);

    return visitor.getEvents();
  }
}
