// src/modules/shiftPlan/shift-plan.model.ts

import { ShiftPlanStatus } from './shift-plan.status';

export interface ShiftPlan {
  id: number;

  revision: number;

  date: Date;

  shift: number;

  status: ShiftPlanStatus;

  createdAt: Date;

  createdBy?: string;

  approvedAt?: Date;

  approvedBy?: string;

  publishedAt?: Date;

  publishedBy?: string;

  closedAt?: Date;

  closedBy?: string;

  comment?: string;
}
