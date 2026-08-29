// src/modules/material-consumption/engine/material-flow-event.visitor.ts

import { BOMTreeNode } from '../../bom/model/bom-tree-node.model';
import { MaterialFlowEvent } from '../models/material-flow-event';
import {
  MaterialFlowEventBuilder,
  MaterialFlowEventBuilderContext,
} from './material-flow-event.builder';
import { BOMTraversalVisitor } from './bom-traverser';

export class MaterialFlowEventVisitor implements BOMTraversalVisitor {
  private readonly events: MaterialFlowEvent[] = [];

  constructor(
    private readonly eventBuilder: MaterialFlowEventBuilder,
    private readonly context: MaterialFlowEventBuilderContext,
  ) {}

  visit(node: BOMTreeNode): void {
    const event = this.eventBuilder.build(node, this.context);

    if (event) {
      this.events.push(event);
    }
  }

  getEvents(): MaterialFlowEvent[] {
    return [...this.events];
  }
}
