// src/modules/shiftPlan/shift-plan.row.ts

export interface ShiftPlanRow {
  ShiftPlanId: number;

  Date: Date;

  Shift: number;

  Status: string;

  Revision: number;

  CreatedAt: Date;
  CreatedBy?: string;

  ApprovedAt?: Date;
  ApprovedBy?: string;

  PublishedAt?: Date;
  PublishedBy?: string;

  ClosedAt?: Date;
  ClosedBy?: string;

  Comment?: string;
}
