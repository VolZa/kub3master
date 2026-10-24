# Canonical role matrix ? ADMIN / MANAGER

Updated 2026-10-23. Supersedes earlier AC-002A/B role naming. Local implementation only.
Roles are system capabilities, not job titles. There are exactly two roles.

| Permissions | ADMIN | MANAGER in PRODUCTION | MANAGER in TEST |
|---|---|---|---|
| REPORT_GENERATE / VIEW / SAVE / LIST / RENAME / DELETE | Allow | Allow | Deny |
| MANUFACTURING_VIEW | Allow | Allow | Deny |
| MANUFACTURING_CREATE | Allow | Allow | Deny |
| MANUFACTURING_SYNC_ANALYZE | Allow | Allow | Deny |
| MANUFACTURING_SYNC_EXECUTE | Allow | Allow | Deny |
| PLANNING_VIEW | Allow | Allow | Deny |
| PLANNING_CREATE_DRAFT | Allow | Allow | Deny |
| PLANNING_ADD_PLACEMENT | Allow | Allow | Deny |
| PLANNING_REMOVE_PLACEMENT | Allow | Allow | Deny |
| PLANNING_APPROVE | Allow | Allow | Deny |
| PLANNING_REOPEN | Allow | Allow | Deny |
| PLANNING_SCHEDULE_PLACEMENT | Allow | Allow | Deny |
| BOM_EDIT / TECHNOLOGY_EDIT / USER_MANAGE | Allow | Deny | Deny |
| Unknown permissions | Deny | Deny | Deny |

ADMIN must still have a verified, unexpired identity, matching active enrolled User, valid environment
and operation-specific guards. USER_MANAGE does not bypass TEST installation marker, Script ID,
safety evidence, locks or generation preconditions. Google Drive owner/GAS deployer is not a role.

MANAGER covers director and workshop manager positions. Both use this same role. Manufacturing,
planning and reporting grants are explicit; no wildcard permission and no browser-supplied role.
The environment is trusted server composition, never a browser argument. TEST-admin explicitly uses
PermissionService(..., 'TEST'). Future TEST runtime must also pin TEST; default PRODUCTION exists
for backward-compatible production composition, not as TEST fallback.

## Existing operations mapped to explicit permissions

| Existing operation | Permission | Integration status |
|---|---|---|
| getManufacturingHouseOptions / ProductOptions / PlacementOptions | MANUFACTURING_VIEW | Existing three read wrappers mapped; identity default-deny remains |
| ManufacturingCreationApplicationService.create, buffer createFromBuffer | MANUFACTURING_CREATE | Definition/grant only; createManufacturingFromWeb remains null policy hold |
| ManufacturingSynchronizationApplicationService.analyze, batch analyze | MANUFACTURING_SYNC_ANALYZE | Internal service; no public RPC added |
| synchronize, synchronization execute, batch execute | MANUFACTURING_SYNC_EXECUTE | Internal service; includes existing analyzed MOVE/DETACH/cancel-state handling, not arbitrary dispatch |
| ProductionPlanningService getters/countAvailable; ShiftPlanService.getItems; PlacementService.getProductionPlan | PLANNING_VIEW | Internal services; no new public RPC |
| ShiftPlanService.createDraft | PLANNING_CREATE_DRAFT | Internal service; no new public RPC |
| ShiftPlanService.addPlacement | PLANNING_ADD_PLACEMENT | Internal service; no new public RPC |
| ShiftPlanService.removePlacement | PLANNING_REMOVE_PLACEMENT | Internal service; no new public RPC |
| ShiftPlanService.approve | PLANNING_APPROVE | Internal service; no new public RPC |
| ShiftPlanService.reopen | PLANNING_REOPEN | Internal service; no new public RPC |
| PlacementService.schedule | PLANNING_SCHEDULE_PLACEMENT | Internal service; no new public RPC |

Permission definitions are NOT handler authorization integration. Existing business/internal services
are not newly published or treated as security entrypoints. Independent logistics/reset/rebuild or
unlisted actions gain no implicit MANAGER permission. Future RPCs must enforce fixed permissions
before effects. No second BOM/production traversal or new business operation is implemented.

createManufacturingFromWeb and onEdit remain null holds for ADMIN as well as MANAGER.
The public registry remains exactly 20 functions. Production IdentityProvider remains unconfigured:
all actual production handler calls deny until separately approved identity integration.

## Migration and revocation

ERP_OWNER, WORKSHOP_MANAGER and TECHNOLOGIST are rejected, not aliases/reserved roles. Mixed
arrays such as ADMIN + ERP_OWNER are rejected as well. Empty/duplicate/invalid role records fail closed.
Local fixtures now use canonical names; actual UserRepository/ScriptProperties records were not changed.
Explicit per-subject enrollment, authorizationVersion increment and session revocation require separate
approval and coordinated code/directory rollout. Old sessions are not restored on rollback.

Historical audit reports/results retain the previous role vocabulary as historical evidence; this file
is the current matrix. TEST_RESET v1.1 remains read-only diagnostics in its admin build, with the same
UNKNOWN dependency blockers, canonical KUB_TEST_ENV_V1 and RESET_NO-GO.
