# AC-002B — approved role refinement

This supersedes the AC-001/initial AC-002A use of TECHNOLOGIST as the full-privilege role.
Changes are local contracts/tests only; no real user assignment, permission grant or deployment.

| Permission | ERP_OWNER | WORKSHOP_MANAGER | TECHNOLOGIST (future) |
| --- | --- | --- | --- |
| REPORT_GENERATE / VIEW / SAVE / LIST / RENAME / DELETE | Allow | Allow | Deny pending specification |
| BOM_EDIT | Allow | Deny | Deny pending specification |
| TECHNOLOGY_EDIT | Allow | Deny | Deny pending specification |
| USER_MANAGE | Allow | Deny | Deny pending specification |

ERP_OWNER is the application system-owner role: full approved administration, technology and reporting
permissions. It is assigned explicitly by the protected server-side UserRepository after verified identity.
It is NOT Google Drive file owner, Session.getEffectiveUser, GAS USER_DEPLOYING, or a browser claim.
There is no automatic migration of a real user's TECHNOLOGIST assignment to ERP_OWNER.
Existing TECHNOLOGIST assignments must not retain full rights through a compatibility alias.

WORKSHOP_MANAGER is approved for reporting and operational production management. The latter is an
approved role responsibility, not an invented catch-all permission. AC-002B must enumerate the current
operations and approve their specific matrix before enabling them: Manufacturing creation, buffer intake,
placement/synchronization actions, operational edit handlers and their read dependencies. BOM and
technology-reference editing remain denied. Planning currently has no implemented permission matrix.

ERP_OWNER's operational rights must also be represented explicitly when that matrix is approved; no
unknown permission string is accepted merely because the caller has ERP_OWNER.

TECHNOLOGIST remains a distinct reserved role with zero grants in the current PermissionService and
archive policy. Its future limited matrix requires a separate decision; it never inherits ERP_OWNER.
Multiple roles use their explicitly granted permissions; TECHNOLOGIST itself grants nothing.

AC-002B integration plan remains: trusted identity/session adapter, protected UserRepository, permission
checks at every server handler, user/role revocation, approved operational matrix and verified sharing.
New B4.2 handlers stay fail-closed until that integration. Tests cover both report-enabled roles,
WORKSHOP_MANAGER administrative denial, reserved TECHNOLOGIST denial, and no Drive/GAS-owner inference.
